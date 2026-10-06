/* THE VARIABLES A CATALOG DEFINES, AND THE FACTS A DESK KNOWS AT COPY TIME. A variable is a list of
   rules read in order: the first whose conditions hold writes its words, and the last, Otherwise,
   always holds. IMPORTS NOTHING: Studio's Variables page reads this same file for what a rule writes,
   so the program that sets a rule and the one that carries it out cannot disagree. */

const VAR_NAME_RE=/^[A-Z][A-Z0-9]*$/;
/* What a condition can ask about, and how: the kind decides the comparisons and the shape of a value. */
const VAR_FACTS={
  time:"time", weekday:"weekday", date:"date", daypart:"daypart",
  lang:"lang",
  name:"text", first:"text", gender:"gender",
  intent:"intent", intents:"count", topic:"text",
  agent:"text", role:"text"
};
const VAR_FACT_GROUPS=[["clock",["time","weekday","date","daypart"]],["card",["lang"]],
  ["customer",["name","first","gender"]],["chat",["intent","intents","topic"]],["desk",["agent","role"]]];
const VAR_OPS={
  time:["before","after"],
  weekday:["is","isnot","oneof"],
  date:["is","isnot","before","after"],
  daypart:["is","isnot","oneof"],
  lang:["is","isnot","oneof"],
  text:["is","isnot","oneof","set","unset"],
  gender:["is","isnot","oneof"],
  intent:["is","isnot","oneof","set","unset"],
  count:["is","isnot","more","less"]
};
const VAR_DAYPARTS=["morning","afternoon","evening"];
const VAR_GENDERS=["m","f","n"];
/* The words a desk supplies inside a rule's text, written {@key}; the value is the facts' field. */
const VAR_WORD_FACT={"first-voc":"firstVoc", first:"first", surname:"surnameOr", name:"name",
  intent:"intentWords", intents:"intentsWords", topic:"topic", agent:"agentDisplay", role:"role",
  init:"init", action:"action"};
const VAR_WORD_RE=/\{@([a-z][a-z-]*)\}/g;
/* The built-in greeting, one phrase per part of the day; Polish covers morning and afternoon with one. */
const VAR_GREETINGS={
  en:["Good morning","Good afternoon","Good evening"],
  pl:["Dzień dobry","Dzień dobry","Dobry wieczór"]
};
/* The hours the parts of the day begin at, in minutes. A catalog may move them, and the greeting and
   {DAYPART} read the same three. */
const VAR_HOURS={morning:240, afternoon:720, evening:1080};

function varText(v){ return String(v==null?"":v); }
function varFold(v){ return varText(v).trim().toLowerCase(); }
function varMinutes(s){
  const m=/^(\d{1,2}):(\d{2})$/.exec(varText(s).trim());
  if(!m || +m[1]>23 || +m[2]>59) return NaN;
  return (+m[1])*60+(+m[2]);
}
function varClock(min){
  const h=Math.floor(min/60), m=min%60;
  return (h<10?"0":"")+h+":"+(m<10?"0":"")+m;
}

/* ---- THE ACTIVE CATALOG'S DEFINITIONS, set when a catalog is applied and nothing otherwise. */
let VAR_CATALOG=null;
function setCatalogVariables(v){
  VAR_CATALOG=(v&&typeof v==="object"&&!Array.isArray(v)) ? JSON.parse(JSON.stringify(v)) : null;
}
function catalogVariables(){ return VAR_CATALOG; }
function varListOf(vars){ return (vars&&Array.isArray(vars.list)) ? vars.list : []; }
function catalogVariable(name,vars){
  const list=varListOf(vars===undefined?VAR_CATALOG:vars);
  for(let i=0;i<list.length;i++) if(list[i]&&list[i].name===name) return list[i];
  return null;
}
function varHours(vars){
  const h=((vars===undefined?VAR_CATALOG:vars)||{}).hours, out=Object.assign({},VAR_HOURS);
  if(h&&typeof h==="object") VAR_DAYPARTS.forEach(k=>{ const n=varMinutes(h[k]); if(Number.isFinite(n)) out[k]=n; });
  return out;
}
/* 0 morning, 1 afternoon, 2 evening; the evening runs on past midnight to the morning's start. */
function varDayPart(min,vars){
  const h=varHours(vars);
  if(min>=h.evening || min<h.morning) return 2;
  return min<h.afternoon ? 0 : 1;
}

/* ---- READING A GENDER FROM A FIRST NAME. Polish female names end in -a and male ones mostly in a
   consonant, -y, -i or -o; the lists are the names those endings get wrong, and a name no rule can
   settle reads nonbinary, which the agent corrects with the glyph beside the name. */
const VAR_NAMES_M="kuba barnaba bonawentura kosma jarema zawisza juda ilja ilia misza wania kostia "
  +"mike joe george steve pierre jose josé jorge andre andré rene rené giuseppe dante felipe bruce "
  +"wayne kyle dave jake luke philippe";
const VAR_NAMES_F="noemi naomi heidi beatrycze abigail ingrid carmen miriam ruth rut rachel agnes "
  +"karin kirsten elizabeth judith edith megan karen ellen helen lily emily mary kelly ashley sally "
  +"molly holly nancy lucy betty judy wendy amy cathy kathy daisy ivy dolores mercedes nicole "
  +"michelle jane anne alice sophie chloe zoe catherine caroline charlotte claire marie julie "
  +"josephine christine simone yvonne irene louise elise rose grace kate jade natalie stephanie "
  +"valerie denise diane elaine doris iris gladys";
const VAR_NAMES_N="kim alex aleks sasha sasza andrea nikola nicola jean robin sam chris charlie "
  +"jordan taylor morgan ariel dominique claude camille maxime luca nikita dana eden noa kai yuki "
  +"michele leslie";
const VAR_NAME_TABLE={};
[["m",VAR_NAMES_M],["f",VAR_NAMES_F],["n",VAR_NAMES_N]].forEach(p=>{
  p[1].split(/\s+/).forEach(w=>{ if(w) VAR_NAME_TABLE[w]=p[0]; });
});
/* The first word of the name, and its last hyphened part: Mary-Jane is read by Jane. */
function varFirstKey(first){
  const w=varText(first).trim().split(/\s+/)[0]||"";
  const parts=w.split("-").filter(Boolean);
  return varFold((parts[parts.length-1]||"").replace(/^[^\p{L}]+|[^\p{L}]+$/gu,""));
}
function nameGender(first){
  const k=varFirstKey(first);
  if(!k) return "n";
  if(Object.prototype.hasOwnProperty.call(VAR_NAME_TABLE,k)) return VAR_NAME_TABLE[k];
  const end=k.charAt(k.length-1);
  if(k.length<2) return "n";
  if(end==="a") return "f";
  if("yio".indexOf(end)>-1) return "m";
  if(/\p{L}/u.test(end) && "aąeęioóuy".indexOf(end)<0) return "m";
  return "n";
}

/* ---- CONDITIONS AND RULES. An unknown fact or comparison never holds, so a rule written by a newer
   Studio falls through to the next one on an older desk rather than writing on a guess. */
function condHolds(c,F){
  if(!c || typeof c!=="object") return false;
  const kind=VAR_FACTS[c.fact], op=c.op, val=c.value;
  if(!kind || VAR_OPS[kind].indexOf(op)<0) return false;
  const list=Array.isArray(val)?val:[val];
  const among=(have,want)=>want.some(x=>varFold(x)===have);
  switch(kind){
    case "time":{
      const at=varMinutes(val);
      if(!Number.isFinite(at)) return false;
      return op==="before" ? F.minutes<at : F.minutes>=at;
    }
    case "date":{
      const at=varText(val).trim(), d=varText(F.date);
      if(!/^\d{2}-\d{2}$/.test(at)) return false;
      if(op==="is") return d===at;
      if(op==="isnot") return d!==at;
      return op==="before" ? d<at : d>at;
    }
    case "count":{
      const n=+val;
      if(!Number.isFinite(n)) return false;
      const have=+F.intents||0;
      return op==="is" ? have===n : op==="isnot" ? have!==n : op==="more" ? have>n : have<n;
    }
    case "intent":{
      const ids=(Array.isArray(F.intentIds)?F.intentIds:[]).map(varFold);
      if(op==="set") return !!F.intentSet;
      if(op==="unset") return !F.intentSet;
      const hit=list.some(x=>ids.indexOf(varFold(x))>-1);
      return op==="isnot" ? !hit : hit;
    }
    default:{
      const have=varFold(kind==="weekday" ? F.weekday : F[c.fact]);
      if(op==="set") return have!=="";
      if(op==="unset") return have==="";
      if(op==="isnot") return !among(have,[val]);
      return among(have, op==="oneof" ? list : [val]);
    }
  }
}
function ruleHolds(r,F){
  const cs=(r&&Array.isArray(r.when)) ? r.when : [];
  if(!cs.length) return true;
  return r.join==="or" ? cs.some(c=>condHolds(c,F)) : cs.every(c=>condHolds(c,F));
}
/* The index of the rule that writes, or -1 where none holds (a definition without its Otherwise). */
function varRuleAt(def,F){
  const rs=(def&&Array.isArray(def.rules)) ? def.rules : [];
  for(let i=0;i<rs.length;i++) if(ruleHolds(rs[i],F)) return i;
  return -1;
}
/* A rule's words in a language, else the catalog's primary's, else English's. A language present and
   empty is a deliberate blank and stays one. */
function varWordsOf(rule,L,primary){
  const w=rule&&rule.write;
  if(!w || typeof w!=="object") return "";
  const own=k=>Object.prototype.hasOwnProperty.call(w,k) && typeof w[k]==="string";
  if(own(L)) return w[L];
  if(primary && own(primary)) return w[primary];
  return own("en") ? w.en : "";
}
function varFillWords(s,F){
  return varText(s).replace(VAR_WORD_RE,(raw,k)=>{
    const f=Object.prototype.hasOwnProperty.call(VAR_WORD_FACT,k) ? VAR_WORD_FACT[k] : null;
    return f ? varText(F[f]) : raw;
  });
}
/* What a variable writes for these facts, its desk words filled in; tokens of other variables are
   left in place for the caller, which fills them as it fills a card. */
function varResolve(def,F,L,primary){
  const i=varRuleAt(def,F);
  if(i<0) return {rule:-1, text:""};
  return {rule:i, text:varFillWords(varWordsOf(def.rules[i],L,primary),F)};
}
/* The card's own words for the rule that holds, {VAR:a|b|c}. A rule given no words takes the first,
   except a nonbinary customer under {GENDER}, whose place is left to the agent. */
function varInlinePick(name,def,parts,F){
  const i=varRuleAt(def,F);
  const own=i>-1 && i<parts.length ? parts[i] : null;
  if(own!=null) return own;
  if(name==="GENDER" && i===2) return "";
  return parts[0]==null ? "" : parts[0];
}

/* ---- ETIUDA'S OWN, as rules. The desk fills a built-in by its own code until a catalog sets rules
   for it; these are what Studio shows as Etiuda's own and starts a change from, and the index an
   inline form reads. VAR_BUILTIN_EDITABLE are the ones a catalog may set rules for. */
const VAR_BUILTIN_NAMES=["GREET","PAX","NAME","GENDER","DAYPART","INTENT","TOPIC","AGENT","INIT","ROLE","ACTION"];
const VAR_BUILTIN_EDITABLE=["GREET","PAX","NAME","INTENT","TOPIC","AGENT","ROLE"];
const VAR_INLINE_ONLY=["GENDER","DAYPART"];
function varIs(fact,op,value){ return value===undefined ? {fact,op} : {fact,op,value}; }
function varBuiltin(name,greet){
  const g=(greet&&typeof greet==="object") ? Object.assign({},VAR_GREETINGS,greet) : VAR_GREETINGS;
  const byPart=i=>{ const w={}; Object.keys(g).forEach(k=>{ if(Array.isArray(g[k])) w[k]=varText(g[k][i]); }); return w; };
  const parts=(write)=>[
    {key:"morning", when:[varIs("daypart","is","morning")], write:write(0)},
    {key:"afternoon", when:[varIs("daypart","is","afternoon")], write:write(1)},
    {key:"evening", when:[], write:write(2)}];
  const one=w=>[{when:[], write:w}];
  switch(name){
    case "GREET": return {name, rules:parts(byPart)};
    case "DAYPART": return {name, rules:parts(()=>({}))};
    case "PAX": return {name, rules:one({en:"{@first}", pl:"{@first-voc}"})};
    case "NAME": return {name, rules:one({en:"{@name}", pl:"{@name}"})};
    case "GENDER": return {name, rules:[
      {key:"male", when:[varIs("gender","is","m")], write:{}},
      {key:"female", when:[varIs("gender","is","f")], write:{}},
      {key:"nonbinary", when:[], write:{}}]};
    case "INTENT": return {name, rules:[
      {key:"one", when:[varIs("intents","less",2), varIs("intent","set")], write:{en:"{@intent}", pl:"{@intent}"}},
      {key:"several", when:[varIs("intents","more",1)], write:{en:"{@intents}", pl:"{@intents}"}},
      {when:[], write:{en:"", pl:""}}]};
    case "TOPIC": return {name, rules:[
      {when:[varIs("topic","set")], write:{en:"{@topic}", pl:"{@topic}"}},
      {when:[], write:{en:"", pl:""}}]};
    case "AGENT": return {name, rules:one({en:"{@agent}", pl:"{@agent}"})};
    case "INIT": return {name, rules:one({en:"{@init}", pl:"{@init}"})};
    case "ROLE": return {name, rules:one({en:"{@role}", pl:"{@role}"})};
    case "ACTION": return {name, rules:one({en:"{@action}", pl:"{@action}"})};
  }
  return null;
}
/* The team's address for {PAX}, the four Polish choices and the two English, as the rules they write.
   Ungendered on both sides is one rule; otherwise male, female, and Otherwise for nonbinary. */
const VAR_ADDRESS_PL=["first","titleFirst","titleSurname","none"];
const VAR_ADDRESS_EN=["first","titleSurname"];
function varAddressWords(choice,lang,g){
  if(lang==="pl"){
    if(choice==="none") return "";
    if(choice==="first") return "{@first-voc}";
    const who=g==="m"?"Panie ":g==="f"?"Pani ":"";
    if(!who) return "Państwo";
    return who+(choice==="titleSurname"?"{@surname}":"{@first-voc}");
  }
  if(choice==="titleSurname") return (g==="m"?"Mr ":g==="f"?"Ms ":"Mx ")+"{@surname}";
  return "{@first}";
}
function varAddressRules(pl,en){
  const gendered=(pl!=="first"&&pl!=="none") || en==="titleSurname";
  const write=g=>({en:varAddressWords(en,"en",g), pl:varAddressWords(pl,"pl",g)});
  if(!gendered) return [{when:[], write:write("n")}];
  return [{key:"male", when:[varIs("gender","is","m")], write:write("m")},
          {key:"female", when:[varIs("gender","is","f")], write:write("f")},
          {key:"nonbinary", when:[], write:write("n")}];
}
/* Which of the choices a {PAX} definition is, or null where its rules were written by hand. */
function varAddressOf(def){
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const rs=(def&&Array.isArray(def.rules)) ? def.rules.map(r=>({key:r.key, when:r.when||[], write:r.write||{}})) : null;
  if(!rs) return {pl:"first", en:"first"};
  for(const pl of VAR_ADDRESS_PL) for(const en of VAR_ADDRESS_EN){
    const want=varAddressRules(pl,en).map(r=>({key:r.key, when:r.when, write:r.write}));
    if(same(rs,want)) return {pl, en};
  }
  return null;
}

/* ---- WHAT A CARD ASKS FOR. Every token in a text, bare or inline, in order of first use. */
const VAR_TOKEN_RE=/\{([A-Z][A-Z0-9]*)(?::([^{}]*))?\}/g;
function varTokensIn(text){
  const out=[], seen={};
  varText(text).replace(VAR_TOKEN_RE,(raw,name,arg)=>{
    if(!seen[raw]){ seen[raw]=1; out.push({raw, name, parts:arg==null?null:arg.split("|")}); }
    return raw;
  });
  return out;
}

export {
  VAR_NAME_RE, VAR_FACTS, VAR_FACT_GROUPS, VAR_OPS, VAR_DAYPARTS, VAR_GENDERS, VAR_WORD_FACT,
  VAR_GREETINGS, VAR_HOURS, VAR_BUILTIN_NAMES, VAR_BUILTIN_EDITABLE, VAR_INLINE_ONLY,
  VAR_ADDRESS_PL, VAR_ADDRESS_EN, VAR_TOKEN_RE,
  varMinutes, varClock, setCatalogVariables, catalogVariables, catalogVariable, varHours, varDayPart,
  nameGender, condHolds, ruleHolds, varRuleAt, varWordsOf, varFillWords, varResolve, varInlinePick,
  varBuiltin, varAddressRules, varAddressOf, varTokensIn
};
