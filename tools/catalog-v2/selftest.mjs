// The converter is proved by watching it refuse, not by reading it. Every catalog it will ever
// be pointed at is somebody's content, so the cases here are invented from nothing: a trimmed
// real one is a real one with fewer rows.
//
// The case that matters most is the last pair. A round trip that cannot report a difference is
// a round trip that says nothing, so one case corrupts the format 2 file between the two legs
// and requires the comparison to name the path.
//
//   node tools/catalog-v2/selftest.mjs
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { toV2 } from './v1-to-v2.mjs';
import { toV1, markersToBody } from './v2-to-v1.mjs';
import { roundTrip, walk, classify as classifyOf } from './roundtrip.mjs';
import { idOk, contentHash } from './format.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const HERE = dirname(fileURLToPath(import.meta.url));
const NL = String.fromCharCode(10);

// A plausible small shop, invented. Two of the three category keys are two characters long,
// which is the shape that makes the id prefix load-bearing rather than decorative.
const SHOP = () => ({
  format: 1, kind: 'playbook-catalog', name: 'Lamp Shop', version: '2026-01-09',
  who: ['customer'],
  categories: { op: 'Openers', rt: 'Returns', delivery: 'Delivery' },
  categoriesPl: { op: 'Powitania', rt: 'Zwroty', delivery: 'Dostawa' },
  icons: { op: 'card', rt: 'box' }, colors: { op: 3, rt: 7 },
  roles: { always: ['op'] },
  intents: {
    en: ['a refund', 'a delivery date'],
    pl: ['zwrotem', 'terminem dostawy'],
    cmt: ['refunded the order', 'gave the delivery date'],
    topic: ['the refund', 'the delivery date'],
    topicPl: ['zwrotu', 'terminu dostawy'],
    cat: ['rt', 'delivery']
  },
  facts: 'Free returns within 30 days.',
  cards: [
    { c: 'op', t: 'Warm opening', tPl: 'Cieple powitanie', k: 'hello hi',
      en: 'Good {DAYPART}.' + NL + NL + 'How may I help?', pl: 'Dzien dobry.' },
    { c: 'rt', t: 'Refund steps', tPl: 'Kroki zwrotu', alt: 1, seq: 1, intents: [0],
      en: 'Ask for the order number.' + NL + NL + 'Raise the refund.',
      pl: 'Poproc o numer zamowienia.' + NL + NL + 'Zloz wniosek.', note: 'Check the 30 day window.' },
    { c: 'delivery', t: 'Where is it', alt: 1, intents: [1], firstOnly: 1,
      en: 'It is on the way.' + NL + NL + 'It is with the courier.', lockLang: 'en' }
  ]
});

{
  const { catalog: v2, problems } = toV2(SHOP());
  const shelves = v2.tags.filter(t => t.kind === 'shelf');
  const requests = v2.tags.filter(t => t.kind === 'request');
  check('1 a sound catalog converts with nothing to report', problems.length === 0, problems.join('; '));
  check('2 the envelope declares format 2 and the new kind',
    v2.format === 2 && v2.kind === 'etiuda-catalog' && v2.rev === 1, v2.format + ' ' + v2.kind);
  check('3 the id is synthesised from the name alone', v2.id === 'lamp-shop', v2.id);
  check('4 a category becomes a shelf tag, an intent becomes a request tag',
    shelves.length === 3 && requests.length === 2, shelves.length + ' shelves, ' + requests.length + ' requests');
  check('5 every id is 3 to 64 of [a-z0-9-], which a two-character key needs the prefix for',
    v2.tags.every(t => idOk(t.id)) && v2.cards.every(c => idOk(c.id)) && shelves[0].id === 't-op',
    shelves.map(t => t.id.length).join(','));
  check('6 roles.always becomes the supporting flag on the shelf, and only there',
    shelves[0].supporting === true && shelves[1].supporting === undefined, JSON.stringify(shelves.map(t => !!t.supporting)));
  check('7 the icon and the hue travel with the shelf that had them',
    shelves[0].icon === 'card' && shelves[1].hue === 7 && shelves[2].icon === undefined, String(shelves[1].hue));
  check('8 a request carries clause, action and topic as language maps',
    requests[0].clause.en === 'a refund' && requests[0].clause.pl === 'zwrotem'
    && requests[0].action.en === 'refunded the order' && requests[0].topic.pl === 'zwrotu',
    Object.keys(requests[0]).join(','));
  check('9 a request carries no label, because what it shows is its clause',
    requests.every(t => t.label === undefined));
  check('10 a card names exactly one shelf and links requests by id',
    v2.cards[1].shelf === 't-rt' && v2.cards[1].requests.length === 1
    && v2.cards[1].requests[0] === requests[0].id, v2.cards[1].requests.join(','));
  check('11 title, body and note become language maps, and an absent translation stays absent',
    v2.cards[0].title.en === 'Warm opening' && v2.cards[0].title.pl === 'Cieple powitanie'
    && v2.cards[2].title.pl === undefined && v2.cards[1].note.en.length > 0,
    Object.keys(v2.cards[2].title).join(','));
  check('12 alt and seq become bodyShape, three ways',
    v2.cards[0].bodyShape === 'plain' && v2.cards[1].bodyShape === 'steps' && v2.cards[2].bodyShape === 'alts',
    v2.cards.map(c => c.bodyShape).join(','));
  check('13 a plain body keeps its blank line, which format 1 could not give it',
    v2.cards[0].body.en.indexOf(NL + NL) > -1 && v2.cards[0].body.en.indexOf('[') < 0);
  check('14 every block of a shaped body opens with its own marker, the first one included',
    v2.cards[1].body.en.split(NL)[0] === '[step]'
    && (v2.cards[1].body.en.match(/^\[step\]$/gm) || []).length === 2
    && (v2.cards[2].body.en.match(/^\[alt\]$/gm) || []).length === 2,
    JSON.stringify(v2.cards[1].body.en.split(NL)[0]));
  check('15 the card flags format 2 does not rename travel unchanged',
    v2.cards[2].firstOnly === true && v2.cards[2].lockLang === 'en' && v2.cards[0].firstOnly === undefined);
  check('16 who becomes role, and facts is carried',
    JSON.stringify(v2.role) === '["customer"]' && v2.facts.length > 0);
  check('16b the sample marks itself in both directions, because the engine reads that mark',
    toV2(Object.assign(SHOP(), { sample: 1 })).catalog.sample === true
    && toV1(toV2(Object.assign(SHOP(), { sample: 1 })).catalog).catalog.sample === 1
    && v2.sample === undefined);
  check('16c the opener role is a declared loss, not a silent one', (() => {
    const withOpener = SHOP();
    withOpener.roles = { always: ['op'], opener: ['rt'] };
    const rr = roundTrip(withOpener);
    return rr.unexpected.length === 0 && rr.declared['roles.opener dropped, that role no longer exists'] === 1;
  })());
  check('17 a date-like version travels into date, and minEngine is stamped',
    v2.date === '2026-01-09' && v2.minEngine === '2.0.0', String(v2.date));
  check('17b an edition letter after the date travels with it, since that is the label a desk reads',
    toV2(Object.assign(SHOP(), { version: '2026-01-09b' })).catalog.date === '2026-01-09b',
    String(toV2(Object.assign(SHOP(), { version: '2026-01-09b' })).catalog.date));
  check('18 the hash is over content, so it changes when a word does', (() => {
    const other = toV2(Object.assign(SHOP(), { facts: 'Free returns within 60 days.' })).catalog;
    return v2.hash.startsWith('djb2:') && other.hash !== v2.hash;
  })(), v2.hash);
}

{
  const noPl = SHOP();
  noPl.categoriesPl = {}; delete noPl.intents.pl; delete noPl.intents.topicPl;
  noPl.cards.forEach(c => { delete c.pl; delete c.tPl; delete c.notePl; });
  noPl.cards[2].lockLang = 'pl';
  const { catalog: v2, problems } = toV2(noPl);
  check('19 a language is declared only where the file actually speaks it',
    JSON.stringify(v2.langs.map(l => l.code)) === '["en"]', v2.langs.map(l => l.code).join('+'));
  check('20 and a card pinning a language nobody declares is a problem, not a silent pin',
    problems.length === 1 && /pins a language/.test(problems[0]) && v2.cards[2].lockLang === undefined,
    problems.join('; '));
  check('21 commentLang defaults to the primary side of the format 1 comment fields',
    toV2(SHOP()).catalog.commentLang === 'en');
}

{
  const clash = SHOP();
  clash.categories['returns'] = 'Returns, again';
  clash.intents.en[0] = 'returns';
  const { problems } = toV2(clash);
  check('22 two things claiming one id is reported rather than merged',
    problems.some(p => /id collision/.test(p)), problems.join('; '));
  const dangling = SHOP();
  dangling.cards[1].intents = [0, 9];
  check('23 a card link naming no request is reported, with a count',
    toV2(dangling).problems.some(p => /^1 card-to-request link/.test(p)));
  const headless = SHOP();
  headless.cards[0].t = '';
  check('24 a card with no title in the primary language is reported',
    toV2(headless).problems.some(p => /has no title/.test(p)));
}

{
  const r = roundTrip(SHOP());
  check('25 the sound catalog goes forward and back with nothing unexpected',
    r.unexpected.length === 0, r.unexpected.map(d => d.path).join(' '));
  check('26 and the loss it does have is the one the format chose, counted once for the key',
    r.declared['intents.cat dropped, it decided nothing after 1.6.0'] === 1
    && r.declared['card id resynthesised, format 2 ids replace them'] === 0,
    JSON.stringify(r.declared));
  const back = toV1(r.v2).catalog;
  check('27 a plain body comes back byte for byte', back.cards[0].en === SHOP().cards[0].en);
  check('28 a shaped body comes back with its markers gone and its blocks rejoined',
    back.cards[1].en === SHOP().cards[1].en && back.cards[2].en === SHOP().cards[2].en,
    JSON.stringify(back.cards[1].en.slice(0, 12)));
  check('29 the shelf id gives the category key back, prefix and all',
    JSON.stringify(Object.keys(back.categories)) === JSON.stringify(Object.keys(SHOP().categories)),
    Object.keys(back.categories).join(','));
  check('30 markersToBody drops a labelled marker as readily as a bare one',
    markersToBody('[alt: by post]' + NL + 'One.' + NL + NL + '[alt]' + NL + 'Two.') === 'One.' + NL + NL + 'Two.');
}

{
  const messy = SHOP();
  messy.cards[1].en = 'Ask.' + NL + NL + NL + '   Raise.   ';
  messy.cards[0].id = 'b:op:Warm opening';
  messy.version = 'spring edition';
  const r = roundTrip(messy);
  check('31 block whitespace, a resynthesised id and a version that is not a date are declared',
    r.unexpected.length === 0
    && r.declared['block whitespace inside a body with alternatives'] === 1
    && r.declared['card id resynthesised, format 2 ids replace them'] === 1
    && r.declared['version label not a date, so it did not travel into date'] === 1,
    JSON.stringify(r.declared) + ' ' + r.unexpected.map(d => d.path).join(' '));
}

// The canary. Three sabotages, each in a different limb, and the comparison must name the path
// of each: a round trip that cannot report a difference is reporting nothing when it is green.
{
  const v1 = SHOP();
  const bent = toV2(v1).catalog;
  bent.cards[1].title.pl = bent.cards[1].title.pl + ' x';
  const d1 = [];
  walk(v1, toV1(bent).catalog, '', d1);
  check('32 a changed word comes back as a path and a value difference',
    d1.some(d => d.path === 'cards[1].tPl' && d.kind === 'value'), d1.map(d => d.path).join(' '));
  const bent2 = toV2(v1).catalog;
  bent2.cards[2].requests = [];
  const d2 = [];
  walk(v1, toV1(bent2).catalog, '', d2);
  check('33 a dropped request link comes back as a difference too',
    d2.some(d => /^cards\[2\]\.intents/.test(d.path)), d2.map(d => d.path).join(' '));
  const bent3 = toV2(v1).catalog;
  bent3.tags = bent3.tags.filter(t => t.id !== 't-rt');
  const d3 = [];
  walk(v1, toV1(bent3).catalog, '', d3);
  check('34 and so does a lost shelf', d3.some(d => /^categories\./.test(d.path)), d3.map(d => d.path).join(' '));
  check('35 the hash refuses to match a catalog that was bent after it was stamped',
    contentHash(bent) !== bent.hash);
}

// The two refusals that protect the only copy of a catalog, driven as commands.
{
  const dir = mkdtempSync(join(tmpdir(), 'catalog-v2-'));
  const src = join(dir, 'in.js');
  writeFileSync(src, 'window.PB_CATALOG = ' + JSON.stringify(SHOP()) + ';' + NL, 'utf8');
  const cli = join(HERE, 'convert.mjs');
  const out = join(dir, 'shop.ec');
  const first = spawnSync(process.execPath, [cli, src, '--out', out], { encoding: 'utf8' });
  check('36 the command converts a wrapped format 1 file and says what it wrote',
    first.status === 0 && existsSync(out) && /3 cards, 3 shelves, 2 requests/.test(first.stdout),
    'exit ' + first.status + ' ' + JSON.stringify(first.stdout.trim().split(NL)[0]));
  const again = spawnSync(process.execPath, [cli, src, '--out', out], { encoding: 'utf8' });
  check('37 and refuses to write over a file that exists, which is where a catalog is lost',
    again.status === 1 && /refusing to write over/.test(again.stderr), 'exit ' + again.status);
  const inside = spawnSync(process.execPath, [cli, src, '--out', join(HERE, 'shop.ec')], { encoding: 'utf8' });
  check('38 and refuses to write anywhere inside this repository, which is public',
    inside.status === 1 && /refusing to write inside this repository/.test(inside.stderr)
    && !existsSync(join(HERE, 'shop.ec')), 'exit ' + inside.status);
  const bad = join(dir, 'bad.js');
  writeFileSync(bad, 'window.PB_CATALOG = {not json;', 'utf8');
  const broken = spawnSync(process.execPath, [cli, bad, '--out', join(dir, 'x.ec')], { encoding: 'utf8' });
  check('39 a file that is not a catalog is refused before anything is written',
    broken.status === 1 && /not a format 1 catalog/.test(broken.stderr), 'exit ' + broken.status);
  const bare = join(dir, 'bare.js');
  writeFileSync(bare, 'window.PB_SAMPLE={' + NL + '  format:1, kind:"playbook-catalog", name:"Bare Shop",' + NL
    + '  categories:{op:"Openers"}, cards:[{c:"op", t:"Hi", en:"Hello."}]};' + NL, 'utf8');
  const refused = spawnSync(process.execPath, [cli, bare, '--out', join(dir, 'b1.ec')], { encoding: 'utf8' });
  check('39b a hand-written file with bare keys is refused until --eval is asked for',
    refused.status === 1 && /needs --eval/.test(refused.stderr), 'exit ' + refused.status);
  const evald = spawnSync(process.execPath, [cli, bare, '--out', join(dir, 'b2.ec'), '--eval'], { encoding: 'utf8' });
  check('39c and converts with it, since the tool is run offline over the owner is own file',
    evald.status === 0 && JSON.parse(readFileSync(join(dir, 'b2.ec'), 'utf8')).cards.length === 1,
    'exit ' + evald.status);
  const js = join(dir, 'sibling.js');
  const both = spawnSync(process.execPath, [cli, src, '--out', join(dir, 'two.ec'), '--js', js], { encoding: 'utf8' });
  const wrapped = both.status === 0 && existsSync(js);
  check('40 --js writes the same catalog behind window.E_CATALOG, for a page on file://',
    wrapped && /window\.E_CATALOG = /.test(readFileSync(js, 'utf8')), 'exit ' + both.status);
  const samp = join(dir, 'in-sample.js');
  writeFileSync(samp, 'window.PB_SAMPLE = ' + JSON.stringify(SHOP()) + ';' + NL, 'utf8');
  const sj = join(dir, 'sample.js');
  const s = spawnSync(process.execPath, [cli, samp, '--out', join(dir, 'sample.ec'), '--js', sj,
    '--global', 'E_SAMPLE'], { encoding: 'utf8' });
  check('40b the sample arrived under its own global and leaves under its own global',
    s.status === 0 && /window\.E_SAMPLE = /.test(readFileSync(sj, 'utf8')), 'exit ' + s.status);
  const rev = spawnSync(process.execPath, [cli, src, '--out', join(dir, 'r.ec'), '--rev', '4'], { encoding: 'utf8' });
  check('40c --rev is how a second edition stops claiming to be the first',
    rev.status === 0 && JSON.parse(readFileSync(join(dir, 'r.ec'), 'utf8')).rev === 4, 'exit ' + rev.status);
  rmSync(dir, { recursive: true, force: true });
}

// Two shapes a hand-edited catalog has that an exported one does not, both met on the first
// real file this tool was pointed at.
{
  const hand = SHOP();
  hand.cards[1].alt = true; hand.cards[1].seq = true;
  hand.roles.always = ['delivery', 'op'];
  const r = roundTrip(hand);
  check('41 a flag written true rather than 1 is the same flag, not a difference',
    !r.unexpected.some(d => /^cards\[1\]\.(alt|seq)$/.test(d.path)), r.unexpected.map(d => d.path).join(' '));
  check('42 roles.always in another order is declared, since the engine reads it as a set',
    r.unexpected.length === 0 && r.declared['roles.always came back in the shelf order, same members'] > 0,
    JSON.stringify(r.declared) + ' ' + r.unexpected.map(d => d.path).join(' '));
  const lost = SHOP();
  lost.roles.always = ['op', 'rt'];
  const bent = toV2(lost).catalog;
  bent.tags.find(t => t.id === 't-rt').supporting = undefined;
  const d = [];
  walk(lost, toV1(bent).catalog, '', d);
  const v = classifyOf(d, lost, toV1(bent).catalog);
  check('43 but a role that did not come back at all is still unexpected',
    v.unexpected.some(x => /^roles\.always/.test(x.path)), v.unexpected.map(x => x.path).join(' '));
}

console.log('  ' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? '  - ' + fail + ' FAILED' : ''));
process.exitCode = fail;
