/* Etiuda i18n scanner, beside test.js.
 *
 * WHAT IT READS: src/, through E.sourceDoc(). Every rule here is a text rule over JS as written,
 * and the tables are parsed by their spelling. Measured on a two-file tree: a table written
 * `UI_STRINGS.pl={` in the source is reprinted `UI_STRINGS.pl = {` by esbuild the moment its
 * region moves into a module, the old parser matched neither the head nor the language list, and
 * the scan printed "No UI_STRINGS tables found" and exited 0. An i18n gate that goes green
 * because it can no longer find the strings is the worst shape a check can take, so two things
 * changed with the subject: the spelling is matched loosely, and finding no table at all is now a
 * failure rather than a shrug. tests/text-scan-selftest.js holds both cases.
 *
 * WHAT IT IS FOR. The engine translates at SINKS, keyed by the ENGLISH SOURCE STRING: t(),
 * toast(), ask(), the DOM sweep over a dialog or the chrome. Adding a language is therefore
 * filling in a column - but only if you can see the column. This prints it: every translatable
 * string the engine contains, which ones a language covers, and which are missing.
 *
 * HOW IT FINDS THEM - six rules, because UI copy lives in six shapes:
 *   1. title / aria-label / placeholder written into markup
 *   2. every string literal handed to t(), ask() or toast() - found with a paren stack, so a
 *      ternary, a concatenation or a nested t() inside a toast() all count, while an argument
 *      to a nested call (a class name, a selector) does not
 *   3. the visible text of a control: button, label, h2/h3, option, summary, legend
 *   4. UI copy stored as DATA - label/hint/sub/tip/title/body in an object literal, which is
 *      how the shortcut table and the guided tour are written
 *   5. prose in the STATIC html - the sentences around those controls
*   6. text the chrome sweep translates that rule 5 cannot see: runs between inline tags,
*      keyed as translateTree keys them, with data-i18n-skip subtrees left out
 *   7. (the report) ORPHANS: table entries no rule found. Advisory, not a delete list - a
 *      string composed at its call site legitimately shows up here.
 *
 * TWO RULES THE ENGINE KEEPS, and this depends on:
 *   - a key never carries a leading or trailing space; the space lives in the concatenation
 *   - a sentence the app BUILDS takes a placeholder key ("{N} cards shown again"), never a
 *     fragment. Fragments cannot be reordered, and every other language reorders.
 *
 *   node i18n-scan.js            coverage for every language in UI_STRINGS
 *   node i18n-scan.js pl         list what Polish is still missing
 *   node i18n-scan.js uk --stub  print a ready-to-paste table for a NEW language
 *
 * ADDING UKRAINIAN, start to finish:
 *   1. node i18n-scan.js uk --stub > uk.txt      (every string, English on both sides)
 *   2. translate the right-hand side of uk.txt
 *   3. paste it into UI_STRINGS.uk in engine/etiuda.html, and add {code:"uk",label:"Українська"}
 *      to UI_LANGS
 *   4. node i18n-scan.js uk                      until it reports nothing missing
 * No engine code changes at any point - that is the whole design.
 */
const SRC=require("./engine.js").sourceDoc().text;
/* The same source with every UI_STRINGS table cut out. Rules that read SHAPES - markup, object
   properties - must not read the tables, or a translation that contains a <b> comes back as an
   untranslated English string. Sinks are unaffected: nothing calls t() inside a table. */
/* The close is matched as loosely as the head, and for the same reason: a printer indents it.
   esbuild puts a module's table inside the iife and closes it `  };`, so a literal "\n};" both
   failed to cut the table out here and failed to find its end in table() below. */
const TABLE_END=/\n\s*\};/;
const SRC_NT=(function(){
  let out=SRC, i;
  while((i=out.indexOf("UI_STRINGS."))>-1){
    const e=TABLE_END.exec(out.slice(i));
    if(!e) break;
    out=out.slice(0,i)+out.slice(i+e.index+e[0].length);
  }
  return out;
})();
/* Markup rules read only the STATIC html - what is outside <script>. Markup built inside JS is
   already the sinks' business, and reading it twice is worse than not reading it: a <b> inside a
   tour paragraph came back as its own "untranslated string", when the paragraph around it is the
   string and is translated whole. */
/* JS escapes are source text; the table keys hold the real characters. Built from
   character codes so no literal backslash appears in this file. */
const BS=String.fromCharCode(92), NL=String.fromCharCode(10);
const SRC_HTML=(function(){
  const parts=[]; let i=0;
  for(;;){
    const a=SRC_NT.indexOf("<script", i);
    if(a<0){ parts.push(SRC_NT.slice(i)); break; }
    parts.push(SRC_NT.slice(i, a));
    const b=SRC_NT.indexOf("</script>", a);
    if(b<0) break;
    i=b+9;
  }
  return parts.join(String.fromCharCode(10));
})();

/* The three sinks, extracted the way the engine reads them. Deliberately conservative: a string
 * that cannot be proved translatable is left out rather than guessed at, because a false entry
 * costs a translator real time. */
function strings(){
  const out=new Set();
  /* &amp; in source is & on screen, and the table holds what the DOM will compare against. */
  const unent=x=>x.split("&amp;").join("&").split("&lt;").join("<").split("&gt;").join(">");
  /* Rules 5 and 6 read shapes, not meaning, so a comparison or a selector can land in one.
     Anything carrying operators, braces or a leading # is code, not a sentence. */
  const CODEY=/&&|\|\||\+"|"\+|[=;]\s*[a-z$_]|^[#.]|^\/\/|^[a-z]+\.[a-z]+$/;
  const push=v=>{ v=unent((v||"").trim());
    if(v.length>1 && !/^[\s\d.,:;·|/-]+$/.test(v) && !CODEY.test(v)) out.add(v); };
  /* Rule 7 reads a container that is prose BY CONSTRUCTION, so the code heuristic must not
     filter it: a semicolon followed by a word is ordinary English and CODEY calls it code. */
  const pushProse=v=>{ v=unent((v||"").trim());
    if(v.length>1 && !/^[\s\d.,:;·|/-]+$/.test(v)) out.add(v); };
  // 1. static attributes in markup (no template concatenation)
  const attr=/(?:title|aria-label|placeholder)="([^"]{2,})"/g;
  let m; while((m=attr.exec(SRC_NT))) if(!/'\+|\+'|esc\(/.test(m[1])) push(m[1]);
  // 2. every sink - toast(), ask() and t() itself
  /* ONE COLLECTOR FOR EVERY SINK, in one pass over the source.
     A literal counts when the paren it sits DIRECTLY inside was opened by t(, ask( or toast(.
     Not "how deep is it" - depth is the wrong question, because toast(t("Moved to")+x) nests a
     translatable string one paren further in, while
       t(el.classList.contains("glass-off")?"Turn glass on":"Turn glass off")
     nests a class name that nobody translates at exactly the same depth. The stack answers
     what depth cannot: whose argument is this? Ternaries, concatenations, single quotes and
     nested sinks all fall out of it for free. */
  const IDENT=/[\w$.]/;
  const stack=[]; let inSink=false;
  for(let i=0;i<SRC.length;i++){
    const c=SRC[i];
    if(c==="("){
      let j=i-1; while(j>=0 && /\s/.test(SRC[j])) j--;
      let name=""; while(j>=0 && IDENT.test(SRC[j])){ name=SRC[j]+name; j--; }
      stack.push(inSink);
      inSink = (name==="t"||name==="ask"||name==="toast");
      continue;
    }
    if(c===")"){ if(stack.length) inSink=stack.pop(); else inSink=false; continue; }
    if(c===String.fromCharCode(47) && (SRC[i+1]===String.fromCharCode(47))){        // line comment
      while(i<SRC.length && SRC[i]!==NL) i++;
      continue;
    }
    if(c===String.fromCharCode(34) || c===String.fromCharCode(39)){
      const quote=c; let j=i+1, lit="", ok=false;
      while(j<SRC.length){
        if(SRC[j]===String.fromCharCode(92)){ lit+=SRC[j]+SRC[j+1]; j+=2; continue; }
        if(SRC[j]===quote){ ok=true; break; }
        if(SRC[j]===NL) break;                       // unterminated: not a literal
        lit+=SRC[j]; j++;
      }
      /* A LITERAL COMPARED IS NOT A LITERAL SHOWN. The stack cannot tell a ternary's branch
         from its test, so toast(v==="auto"?t("..."):...) offered "auto" as UI copy and the
         report demanded a translation for a stored value. Either side of the operator. */
      let k=i-1; while(k>=0 && /\s/.test(SRC[k])) k--;
      const cmpL = k>=1 && SRC[k]==="=" && (SRC[k-1]==="=" || SRC[k-1]==="!");
      let n=j+1; while(n<SRC.length && /\s/.test(SRC[n])) n++;
      const cmpR = (SRC[n]==="=" || SRC[n]==="!") && SRC[n+1]==="=";
      if(ok && inSink && !cmpL && !cmpR) push(unesc(lit));
      i=ok?j:i;
      continue;
    }
  }
  /* 3b. tc("context","english") - a context-qualified key. Emitted joined by U+241F, the
        same shape the table holds, so a context key is neither missing nor an orphan. */
  const SEP=String.fromCharCode(0x241f);
  const ctxCall=/\btc\(\s*"([^"]{2,40})"\s*,\s*"([^"]{2,200})"\s*\)/g;
  while((m=ctxCall.exec(SRC))){ push(m[1]+SEP+m[2]); push(m[2]); }
  /* 3c. counted(n,"one","many") - a noun agreeing with its number. Both English forms are
        keys, and the plural also carries the two context forms a three-form language needs. */
  const countCall=/\bcounted\([^)"]*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;
  while((m=countCall.exec(SRC))){
    push(m[1]); push(m[2]);
    push("few"+SEP+m[2]); push("many"+SEP+m[2]);
  }
  // 4. visible text of chrome elements: buttons, labels, headings, options, summaries
  const el=/<(button|label|h2|h3|option|summary|legend)\b[^>]*>([^<>{}]{2,})</g;
  while((m=el.exec(SRC_NT))) if(!/'\+|\+'|esc\(/.test(m[2])) push(m[2]);
  /* 5. UI copy stored as data: label/hint/sub/tip/title/body in an object literal. The shortcut
        table is twenty of these, and a sink never sees them - they are translated where they
        are RENDERED, so the string itself is only ever a property value. */
  const prop=/\b(?:label|hint|hintHtml|sub|tip|title|body):\s*"((?:[^"\\\\]|\\\\.){3,})"|\b(?:label|hint|hintHtml|sub|tip|title|body):\s*'((?:[^'\\\\]|\\\\.){3,})'/g;
  while((m=prop.exec(SRC_NT))){
    const v=m[1]!=null?m[1]:m[2];
    if(!/'\+|\+'|esc\(|^</.test(v)) push(unesc(v));
  }
  /* 6. prose in static markup: the sentences around the controls rule 4 already reads. */
  const prose=/<(p|b|small|li)\b[^>]*>([^<>{}]{4,})</g;
  while((m=prose.exec(SRC_HTML))) if(!/'\+|\+'|esc\(/.test(m[2])) push(m[2]);
  /* 7. TEXT THE CHROME SWEEP TRANSLATES that no rule above can see. Rule 6 reads what sits
        directly inside a p/b/small/li; About's prose is bare text between <code> tokens inside a
        div, so every sentence of it was invisible and a whole paragraph reached a Polish reader
        in English. translateTree keys on a text node TRIMMED, so this splits on tags and trims,
        nothing else, and an element carrying data-i18n-skip takes its subtree out exactly as the
        sweep does. A run that spans two source lines carries the newline and the indent into the
        key, which nobody would ever type by hand: those are reported rather than collected. */
  const brittle=[];
  ["aboutInfo"].forEach(function(id){
    const at=SRC_HTML.indexOf('id="'+id+'"');
    if(at<0) return;
    const from=SRC_HTML.indexOf(">", at)+1, to=SRC_HTML.indexOf("</div>", from);
    if(from<1 || to<0) return;
    const body=SRC_HTML.slice(from, to);
    const VOID={br:1, hr:1, img:1, input:1, meta:1, link:1};
    const stack=[]; let skip=0, i=0;
    for(;;){
      const lt=body.indexOf("<", i);
      const run=(lt<0 ? body.slice(i) : body.slice(i, lt));
      if(!skip && run.trim()){
        if(run.trim().indexOf(NL)>-1) brittle.push(run.trim());
        else pushProse(run);
      }
      if(lt<0) break;
      const gt=body.indexOf(">", lt);
      if(gt<0) break;
      const tag=body.slice(lt+1, gt);
      const name=(tag.match(/^\/?\s*([a-zA-Z][\w-]*)/)||[])[1];
      if(tag.charAt(0)==="/"){
        if(stack.length && stack.pop()) skip--;
      }else if(name && !VOID[name.toLowerCase()] && tag.charAt(tag.length-1)!=="/"){
        const isSkip=/\bdata-i18n-skip\b/.test(tag);
        stack.push(isSkip);
        if(isSkip) skip++;
      }
      i=gt+1;
    }
  });
  if(brittle.length){
    console.log("BRITTLE KEYS - a swept run split across two source lines, so its key carries a");
    console.log("newline and an indent. Join the source line; the key becomes typeable.");
    brittle.forEach(function(x){ console.log("    " + JSON.stringify(x.slice(0,90))); });
  }
  return [...out].sort((a,b)=>a.localeCompare(b));
}

const unesc=x=>x.split(BS+"n").join(NL).split(BS+String.fromCharCode(34))
                .join(String.fromCharCode(34)).split(BS+String.fromCharCode(39))
                .join(String.fromCharCode(39));

/* Reads UI_STRINGS.<lang>={...} out of the engine without executing it: the tables are plain
 * "source":"translation" pairs, one per line, which is the shape this expects. */
function table(lang){
  /* Loose about the spacing on purpose. `UI_STRINGS.pl={` was an undeclared formatting contract
     on the source: run any printer over the file - esbuild's, or a person's - and the table stops
     being found, silently. Matching `.pl` followed by optional space, `=`, optional space, `{`
     costs nothing and removes the trap. */
  var head=new RegExp('UI_STRINGS\\.'+lang+'\\s*=\\s*\\{').exec(SRC);
  if(!head) return null;
  var i=head.index;
  var e=TABLE_END.exec(SRC.slice(i));
  if(!e) return null;
  var m=[null, SRC.slice(i+head[0].length, i+e.index)];
  const out={};
  /* Line-oriented on purpose: the tables are one "source":"translation" pair per line, and a
     line parser needs no escape gymnastics in a regex that itself lives inside a heredoc. */
  var LF=String.fromCharCode(10), QU=String.fromCharCode(34), BS=String.fromCharCode(92);
  m[1].split(LF).forEach(function(line){
    line=line.trim();
    if(line.charAt(0)!==QU) return;
    var q=[];
    for(var i=0;i<line.length;i++){ if(line.charAt(i)===QU && line.charAt(i-1)!==BS) q.push(i); }
    if(q.length<4) return;
    var k=line.slice(q[0]+1,q[1]), v=line.slice(q[2]+1,q[3]);
    if(k) out[unesc(k)]=v;
  });
  return out;
}
function langs(){
  const out=[]; const re=/UI_STRINGS\.([a-z]{2})\s*=\s*\{/g; let m;
  while((m=re.exec(SRC))) out.push(m[1]);
  return out;
}

const all=strings();
const arg=process.argv[2], stub=process.argv.includes("--stub");

if(stub){
  console.log("UI_STRINGS."+(arg||"xx")+"={");
  all.forEach((s,i)=>console.log('  "'+s.replace(/"/g,'\\"')+'":"'+s.replace(/"/g,'\\"')+'"'+(i<all.length-1?",":"")));
  console.log("};");
  process.exit(0);
}
const targets=arg?[arg]:langs();
/* NOT a shrug. The only reasons this scan finds no table at all are that the engine has lost its
   translations or that the scan has lost the engine, and both are failures. It exited 0 here
   until 2026-09-13, which is how reading the built artefact turned an extraction into a green
   run: see the header. */
if(!targets.length){
  console.log("FAIL no UI_STRINGS.<lang> table found in " + require("./engine.js").sourceDoc().files.join(", "));
  console.log("     either the engine has no translations left, or this scan can no longer see them.");
  process.exit(1);
}
let bad=0;
targets.forEach(l=>{
  const tab=table(l);
  if(!tab){ console.log(l+": no UI_STRINGS."+l+" table"); bad++; return; }
  const missing=all.filter(s=>tab[s]==null);
  const orphan=Object.keys(tab).filter(k=>all.indexOf(k)<0);
  const pct=Math.round((all.length-missing.length)/all.length*100);
  console.log("\n"+l.toUpperCase()+": "+(all.length-missing.length)+"/"+all.length+" ("+pct+"%)");
  if(orphan.length){
    console.log("  ORPHANS - in the table, not found in the source. Usually a string the scanner\n  cannot see (composed at its call site), sometimes an English line that was edited.\n  Advisory: check the source before deleting one.");
    orphan.forEach(o=>console.log("    - "+o.slice(0,80)));
  }
  if(missing.length){
    bad++;
    console.log("  MISSING "+missing.length+":");
    missing.forEach(x=>console.log('    "'+x.replace(/"/g,'\\"')+'":"",'));
  } else console.log("  complete");
});
/* THE GATE'S OWN COUNTS, board item 529. The record read this as 202 `lines`, which is one per
   orphan and one per missing string, so a scan that found nothing and a scan that found two
   hundred faults were told apart by nobody. Declared before the exit, and the numbers are the
   scan's own: the strings the source has, the tables checked, and the tables that came back
   short. `ok` and `fail` are tools/gate-run.mjs's reserved words and are not used here. */
console.log("#counts strings=" + all.length + " tables=" + targets.length + " short=" + bad);
process.exit(bad?1:0);
