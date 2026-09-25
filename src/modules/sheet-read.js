/* Reading the replies a person already keeps: a sheet (CSV, or an Excel workbook), a Word
   document, or text pasted in. Nothing here touches the page: every function takes bytes or text
   and hands back replies, so the harness runs it in bare node. It never writes a word of a reply:
   a title nobody wrote is the reply's own first words, and text is kept exactly as it came. */

// ---- the replies a text holds ------------------------------------------------------------------
const TITLE_MAX=60, FIRST_WORDS=6, FIRST_WORDS_MAX=48;
const sheetClean=s=>String(s==null?"":s).replace(/\r\n?/g,"\n").replace(/^\uFEFF/,"");
/* A heading is a short line that does not end a sentence. A leading "1." or "2)" is a list's
   number, not part of the title, and a trailing colon introduces what follows. */
function titleLike(line){
  const s=String(line||"").trim();
  return !!s && s.length<=TITLE_MAX && !/[.?!,;]$/.test(s) && s.indexOf("\n")<0;
}
function titleText(line){
  return String(line||"").trim().replace(/^[0-9]{1,3}[.)]\s+/,"").replace(/:$/,"").trim();
}
/* The first words of the reply, cut at a word, with the sentence's own punctuation off the end. */
function firstWords(text){
  const words=String(text||"").replace(/\s+/g," ").trim().split(" ");
  let out="";
  for(const w of words.slice(0,FIRST_WORDS)){
    if(out && (out+" "+w).length>FIRST_WORDS_MAX) break;
    out=out?out+" "+w:w;
  }
  return out.replace(/[.,;:?!]+$/,"");
}
/** {replies:[{title,text,named}], split} from text. An empty line parts two replies; a block
 *  opening on a heading line takes it as its title, and a heading standing alone titles the
 *  block after it. `split` is true where one block came of several lines, which is the text of
 *  somebody whose replies are parted by nothing an eye can find. */
function repliesFromText(text){
  const blocks=sheetClean(text).split(/\n[ \t]*\n/).map(b=>b.replace(/^\n+|\s+$/g,"")).filter(b=>b.trim());
  const out=[];
  let held="";
  blocks.forEach((b,i)=>{
    const lines=b.split("\n");
    if(lines.length===1 && titleLike(lines[0]) && i<blocks.length-1 && !held){ held=titleText(lines[0]); return; }
    if(!held && lines.length>1 && titleLike(lines[0])){
      out.push({ title:titleText(lines[0]), text:lines.slice(1).join("\n").trim(), named:true });
      return;
    }
    out.push(held ? { title:held, text:b.trim(), named:true } : { title:firstWords(b), text:b.trim(), named:false });
    held="";
  });
  if(held) out.push({ title:firstWords(held), text:held, named:false });
  const split=out.length===1 && out[0].text.split("\n").length>2;
  return { replies:out.filter(r=>r.text), split };
}

// ---- CSV and TSV -------------------------------------------------------------------------------
/* The delimiter is the one of comma, semicolon and tab found most often outside quotes in the
   first line: a Polish Excel writes semicolons, because the comma is its decimal point. */
function csvDelimiter(text){
  const first=[]; let q=false;
  for(const ch of text){ if(ch==='"') q=!q; else if(ch==="\n" && !q) break; else if(!q) first.push(ch); }
  const n=c=>first.filter(x=>x===c).length;
  return [",",";","\t"].reduce((a,c)=>n(c)>n(a)?c:a,",");
}
function csvRows(text){
  const s=sheetClean(text), d=csvDelimiter(s), rows=[];
  let row=[], cell="", q=false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(q){
      if(ch==='"'){ if(s[i+1]==='"'){ cell+='"'; i++; } else q=false; }
      else cell+=ch;
    }
    else if(ch==='"') q=true;
    else if(ch===d){ row.push(cell); cell=""; }
    else if(ch==="\n"){ row.push(cell); rows.push(row); row=[]; cell=""; }
    else cell+=ch;
  }
  if(cell || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r=>r.some(c=>String(c).trim()));
}
/* Bytes to text, UTF-8 first. A file that does not read as UTF-8 is the older Windows code page a
   Polish Excel saves CSV in, and reading it as UTF-8 would turn every diacritic into a question. */
function sheetText(bytes){
  const u8=bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try{ return new TextDecoder("utf-8",{fatal:true}).decode(u8); }
  catch(e){ try{ return new TextDecoder("windows-1250").decode(u8); }catch(_){ return new TextDecoder("utf-8").decode(u8); } }
}

// ---- the zip inside a workbook and a Word document ----------------------------------------------
const u16=(b,o)=>b[o]|(b[o+1]<<8);
const u32=(b,o)=>(b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0;
/** {name: Uint8Array} for the named entries of a zip, stored or deflated. Promise; null for
 *  bytes that are not a zip. */
function unzip(bytes,want){
  const b=bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let eocd=-1;
  for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--){ if(u32(b,i)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) return Promise.resolve(null);
  const count=u16(b,eocd+10);
  let p=u32(b,eocd+16);
  const jobs=[], out={};
  for(let n=0;n<count && p+46<=b.length;n++){
    if(u32(b,p)!==0x02014b50) break;
    const method=u16(b,p+10), size=u32(b,p+20), nameLen=u16(b,p+28), extra=u16(b,p+30), note=u16(b,p+32);
    const local=u32(b,p+42);
    const name=new TextDecoder().decode(b.subarray(p+46,p+46+nameLen));
    p+=46+nameLen+extra+note;
    if(!want(name)) continue;
    const start=local+30+u16(b,local+26)+u16(b,local+28);
    const raw=b.subarray(start,start+size);
    if(method===0){ out[name]=raw; continue; }
    if(method!==8) continue;
    jobs.push(new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw")))
      .arrayBuffer().then(ab=>{ out[name]=new Uint8Array(ab); }).catch(()=>{}));
  }
  return Promise.all(jobs).then(()=>out);
}
function xmlText(s){
  return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi,(m,e)=>{
    const k=e.toLowerCase();
    if(k==="amp") return "&"; if(k==="lt") return "<"; if(k==="gt") return ">";
    if(k==="quot") return '"'; if(k==="apos") return "'";
    const n=k.charAt(1)==="x" ? parseInt(k.slice(2),16) : parseInt(k.slice(1),10);
    try{ return String.fromCodePoint(n); }catch(_){ return ""; }
  });
}
const runsOf=(xml,tag)=>{
  const re=new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+tag+">","g");
  let m, s="";
  while((m=re.exec(xml))) s+=xmlText(m[1]);
  return s;
};
/* The column of a cell reference: A is 0, Z 25, AA 26. */
function colOf(ref){
  const letters=String(ref||"").replace(/[0-9]/g,"").toUpperCase();
  let n=0;
  for(const ch of letters) n=n*26+(ch.charCodeAt(0)-64);
  return n-1;
}
/** Rows of the workbook's first sheet, as text. Promise; null when it is not a workbook. */
function workbookRows(bytes){
  return unzip(bytes,n=>n==="xl/sharedStrings.xml"||/^xl\/worksheets\/sheet[0-9]*\.xml$/.test(n)).then(z=>{
    if(!z) return null;
    const sheets=Object.keys(z).filter(n=>n.indexOf("worksheets/")>-1)
      .sort((a,b)=>(parseInt(a.replace(/[^0-9]/g,""),10)||0)-(parseInt(b.replace(/[^0-9]/g,""),10)||0));
    if(!sheets.length) return null;
    const dec=u=>new TextDecoder().decode(u);
    const shared=[];
    if(z["xl/sharedStrings.xml"]){
      const re=/<si>([\s\S]*?)<\/si>/g; let m;
      const xml=dec(z["xl/sharedStrings.xml"]);
      while((m=re.exec(xml))) shared.push(runsOf(m[1],"t"));
    }
    const xml=dec(z[sheets[0]]), rows=[];
    const rowRe=/<row\b[^>]*>([\s\S]*?)<\/row>/g; let r;
    while((r=rowRe.exec(xml))){
      const row=[];
      const cellRe=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c;
      while((c=cellRe.exec(r[1]))){
        const attrs=c[1], body=c[2]||"";
        const ref=(/\br="([A-Z]+[0-9]+)"/.exec(attrs)||[])[1];
        const type=(/\bt="([a-zA-Z]+)"/.exec(attrs)||[])[1]||"";
        const v=(/<v>([\s\S]*?)<\/v>/.exec(body)||[])[1];
        let val="";
        if(type==="s") val=shared[+v]||"";
        else if(type==="inlineStr") val=runsOf(body,"t");
        else if(v!=null) val=xmlText(v);
        const at=ref?colOf(ref):row.length;
        while(row.length<at) row.push("");
        row[at]=val;
      }
      if(row.some(x=>String(x).trim())) rows.push(row);
    }
    return rows;
  });
}
/** The text of a Word document, one line per paragraph, an empty paragraph as an empty line and a
 *  heading as a heading line; the replies are then read from that text by the same rule as a
 *  paste. A document with no empty paragraph and no heading keeps one reply per paragraph, which
 *  is how Word shows them. Promise; null when it is not a Word document. */
function docxText(bytes){
  return unzip(bytes,n=>n==="word/document.xml").then(z=>{
    if(!z || !z["word/document.xml"]) return null;
    const xml=new TextDecoder().decode(z["word/document.xml"]);
    const paras=[];
    const pRe=/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g; let p;
    while((p=pRe.exec(xml))){
      const body=(p[1]||"").replace(/<w:tab\/>/g,"<w:t>\t</w:t>").replace(/<w:br\/>/g,"<w:t>\n</w:t>");
      const style=(/<w:pStyle w:val="([^"]*)"/.exec(body)||[])[1]||"";
      paras.push({ text:runsOf(body,"w:t"), heading:/^(heading|nag|title|tytu)/i.test(style) });
    }
    const hasGap=paras.some(x=>!x.text.trim()), hasHead=paras.some(x=>x.heading && x.text.trim());
    const out=[];
    paras.forEach(x=>{
      if(x.heading && x.text.trim()){ out.push("", titleText(x.text).replace(/[.?!,;]+$/,"")); return; }
      out.push(x.text);
      if(!hasGap && !hasHead) out.push("");
    });
    return out.join("\n");
  });
}

// ---- a sheet's columns -------------------------------------------------------------------------
const fold=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ł/g,"l").trim();
const HEAD_TITLE=/^(tytu[lł]|title|nazwa|name|temat|subject|nag[lł][oó]wek|heading|skr[oó]t|shortcut)\b/;
const HEAD_BODY=/(odpowiedz|reply|answer|tre[sś][cć]|text|tekst|body|message|wiadomosc|makro|macro|content|szablon|template|response)/;
const HEAD_CAT=/^(kategoria|category|grupa|group|folder|dzial|section|typ\b|type\b|tag\b)/;
const HEAD_LANG=l=>l==="pl" ? /(^|[^a-z])(pl|polski|polish|polsku)([^a-z]|$)/ : /(^|[^a-z])(en|eng|english|angielski|angielsku)([^a-z]|$)/;
/** {replies:[{title,text:{code:body},cat,named}], langs} from sheet rows. The header row is the
 *  first; where none of its cells names a column, it is data, and the longest text column is the
 *  reply with the next text column, if short, as its title. */
function repliesFromRows(rows){
  const all=(rows||[]).filter(r=>r&&r.some(c=>String(c).trim()));
  if(!all.length) return { replies:[], langs:[] };
  const width=Math.max(...all.map(r=>r.length));
  const head=all[0].map(fold);
  let title=head.findIndex(h=>HEAD_TITLE.test(h));
  let cat=head.findIndex(h=>HEAD_CAT.test(h));
  const bodyCols=head.map((h,i)=>i).filter(i=>i!==title && i!==cat && (HEAD_BODY.test(head[i]) || head[i]==="pl" || head[i]==="en"));
  const byLang={};
  bodyCols.forEach(i=>{ ["pl","en"].forEach(l=>{ if(byLang[l]==null && HEAD_LANG(l).test(head[i])) byLang[l]=i; }); });
  let data=all.slice(1), body=-1;
  if(!Object.keys(byLang).length) body=bodyCols.length ? bodyCols[0] : -1;
  if(body<0 && !Object.keys(byLang).length){
    /* No header this build recognises: every row is data, and the columns speak by their length. */
    data=all; title=-1; cat=-1;
    const avg=i=>data.reduce((n,r)=>n+String(r[i]||"").length,0)/data.length;
    const cols=[...Array(width).keys()].sort((a,b)=>avg(b)-avg(a));
    body=cols[0];
    const t2=cols.slice(1).find(i=>avg(i)>0 && avg(i)<=TITLE_MAX);
    if(t2!=null) title=t2;
  }
  const replies=[];
  data.forEach(r=>{
    const text={};
    if(body>=0){ const v=String(r[body]||"").trim(); if(v) text[""]=v; }
    Object.keys(byLang).forEach(l=>{ const v=String(r[byLang[l]]||"").trim(); if(v) text[l]=v; });
    const any=Object.keys(text);
    if(!any.length) return;
    const t=title>=0 ? String(r[title]||"").trim() : "";
    replies.push({ title:t||firstWords(text[any[0]]), text, cat:cat>=0?String(r[cat]||"").trim():"", named:!!t });
  });
  return { replies, langs:Object.keys(byLang) };
}

// ---- which language, when nothing says ---------------------------------------------------------
const PL_MARK=/[ąćęłńóśźż]|\b(się|nie|jest|dziękuj|dzień dobry|pozdrawiam|proszę|oczywiście|zamówieni)/i;
const EN_MARK=/\b(the|and|you|your|is|thank|regards|please|order|hello)\b/i;
/** "pl" or "en" for a body of text, and `fallback` where it says neither. */
function textLang(s,fallback){
  const t=String(s||"");
  const pl=PL_MARK.test(t), en=EN_MARK.test(t);
  if(pl && !en) return "pl";
  if(en && !pl) return "en";
  if(pl && en) return (t.match(/[ąćęłńóśźż]/gi)||[]).length>2 ? "pl" : (fallback||"en");
  return fallback||"en";
}

export {
  repliesFromText,
  repliesFromRows,
  csvRows,
  sheetText,
  unzip,
  workbookRows,
  docxText,
  textLang,
  firstWords
};
