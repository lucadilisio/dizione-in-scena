// Motore di dizione: dizionario + regole.
import { REGOLE, DIFFICILI, ATONE, OMOGRAFI, OMOGRAFI_DESC } from './rules.js';

const ACC_E_O = 'èéòó';
const ACC_TONICO = 'àìù';
const BASE = { 'à': 'a', 'è': 'e', 'é': 'e', 'ì': 'i', 'í': 'i', 'ò': 'o', 'ó': 'o', 'ù': 'u', 'ú': 'u', 'ṡ': 's', 'ż': 'z' };
const VOC = 'aeiouàèéìíòóùú';
const isVoc = c => VOC.includes(c);

export const stripAll = w => [...w].map(c => BASE[c] || c).join('');
// toglie i segni di dizione ma lascia l'accento finale ortografico (città, però)
export const stripDizione = w => {
  const a = [...w];
  return a.map((c, i) => (i === a.length - 1 && 'àèéìíòóùú'.includes(c)) ? c : (BASE[c] || c)).join('');
};

// ---------- caricamento dizionario ----------
const LEX = new Map();
const LEX_NOACC = new Map();   // "perche" -> voci di "perché" (accento finale dimenticato)
const DIFF = new Map(DIFFICILI.map(w => [stripAll(w.toLowerCase()), w.toLowerCase()]));
let loaded = null;

export function loadLexicon(url = 'data/lessico.txt', onProgress) {
  if (loaded) return loaded;
  loaded = (async () => {
    const [res, omo] = await Promise.all([fetch(url), fetch(url.replace('lessico.txt', 'omografi.txt')).catch(() => null)]);
    const text = await res.text();
    if (omo && omo.ok) parseOmografi(await omo.text());
    if (onProgress) onProgress(0.6);
    parseLexicon(text);
    if (onProgress) onProgress(1);
    return LEX.size;
  })();
  return loaded;
}

export function parseLexicon(text) {
  for (const line of text.split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    const body = tab >= 0 ? line.slice(tab + 1) : line;
    const derived = body.endsWith('!');
    const clean = derived ? body.slice(0, -1) : body;
    const [main, ...homs] = clean.split(';');
    let [prim, ...rawVars] = main.split('~');
    const vars = rawVars.map(v => v.split('@')[0]);
    const vcodes = rawVars.map(v => v.split('@')[1] || 'V');
    let key = tab >= 0 ? line.slice(0, tab) : stripAll(prim);
    // É8: i composti di che e di tre sono sempre chiusi (perché, poiché, ventitré)
    const fixCT = x => x.replace(/(ch|tr)è$/, '$1é');
    prim = fixCT(prim); key = fixCT(key);
    const e = { prim, vars, vcodes, homs, derived };
    const list = LEX.get(key);
    if (list) list.push(e); else LEX.set(key, [e]);
    if (tab >= 0) { const k2 = stripAll(key); if (!LEX_NOACC.has(k2)) LEX_NOACC.set(k2, [e]); }
  }
}

export const lexiconSize = () => LEX.size;

// descrizioni automatiche degli omografi (da Wiktionary): chiave -> { forma senza ṡż: descrizione }
const OMO_AUTO = new Map();
const noSZ = f => f.replace(/ṡ/g, 's').replace(/ż/g, 'z');
export function parseOmografi(text) {
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t'); if (tab < 0) continue;
    const m = {};
    for (const part of line.slice(tab + 1).split('|')) { const eq = part.indexOf('='); if (eq > 0) m[noSZ(part.slice(0, eq))] = part.slice(eq + 1); }
    OMO_AUTO.set(line.slice(0, tab), m);
  }
}

// ---------- utilità fonologiche ----------
function sGroups(w) {        // inizio dei gruppi di s pronunciati s/z (esclude sc+e/i)
  const g = [];
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== 's') continue;
    let j = i; while (j < w.length && w[j] === 's') j++;
    if (j - i === 1 && w[j] === 'c' && 'eièéì'.includes(w[j + 1] || '')) { i = j; continue; }
    g.push(i); i = j - 1;
  }
  return g;
}
function zGroups(w) {
  const g = [];
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== 'z') continue;
    g.push(i); while (w[i + 1] === 'z') i++;
  }
  return g;
}
// nuclei vocalici (gruppi di vocali; per ciascuno l'indice della vocale "forte")
function nuclei(w) {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    if (!isVoc(w[i])) continue;
    let j = i; while (j + 1 < w.length && isVoc(w[j + 1])) j++;
    let grp = w.slice(i, j + 1);
    // i muta dopo c, g, sc, gl: ciao, giallo, scienza, figlio
    let start = i;
    if (grp.length > 1 && grp[0] === 'i' && /(c|g|gl)$/.test(w.slice(0, i))) { start = i + 1; grp = grp.slice(1); }
    // u dopo q/g: quando, guerra
    if (grp.length > 1 && grp[0] === 'u' && /[qg]$/.test(w.slice(0, start))) { start += 1; grp = grp.slice(1); }
    let k = start;
    for (let t = 0; t < grp.length; t++) if ('aeoàèéòó'.includes(grp[t])) { k = start + t; break; }
    if (grp.length && !/[aeoàèéòó]/.test(grp)) k = start + grp.length - 1;  // es. "fui" -> i
    out.push(k);
    i = j;
  }
  return out;
}
const stressIndex = m => { for (let i = 0; i < m.length; i++) if ('àèéìòóùí'.includes(m[i])) return i; return -1; };

const RE_CACHE = new Map();
function matchIndex(re, w, groupNames) {
  let r = RE_CACHE.get(re);
  if (!r) { r = new RegExp(re.source, re.flags.includes('d') ? re.flags : re.flags + 'd'); RE_CACHE.set(re, r); }
  const m = r.exec(w);
  if (!m || !m.indices || !m.indices.groups) return -1;
  for (const g of groupNames) if (m.indices.groups[g]) return m.indices.groups[g][0];
  return -1;
}
const VGROUPS = ['v', 'v2', 'v3', 'v4'];
const CGROUPS = ['c', 'c2'];
const regoleCat = cat => REGOLE.filter(r => r.cat === cat && r.re);

// ---------- regole per parole sconosciute ----------
function guess(key) {
  const w = [...key];
  const rules = [], dubbi = [];
  const nuc = nuclei(key);
  let st = stressIndex(key);           // accento ortografico finale
  let q = null;
  const tronca = st === key.length - 1;
  if (st < 0 || tronca) {
    const vrules = [...regoleCat('E'), ...regoleCat('O'), ...regoleCat('T')].filter(r => !r.tendenza && (tronca ? r.solo === 'tronca' : r.solo !== 'tronca'));
    for (const r of vrules) {
      const i = matchIndex(r.re, key, VGROUPS);
      if (i >= 0) { st = i; q = r.q; rules.push({ id: r.id, ok: true }); break; }
    }
  }
  if (st < 0 && nuc.length) {
    st = nuc.length >= 2 ? nuc[nuc.length - 2] : nuc[0];
    if ('eo'.includes(key[st]) && nuc.length >= 1) dubbi.push('timbro');
  }
  if (st >= 0 && nuc.length > 1) {
    const b = BASE[w[st]] || w[st];
    if (b === 'e' || b === 'o') {
      if (q) w[st] = q === 'open' ? (b === 'e' ? 'è' : 'ò') : (b === 'e' ? 'é' : 'ó');
    } else {
      const after = nuc.filter(k => k > st).length;
      if (after >= 2) w[st] = { a: 'à', i: 'ì', u: 'ù' }[b];
    }
  }
  for (const g of sGroups(key)) {
    const r = regoleCat('S').find(r => matchIndex(r.re, key, CGROUPS) === g);
    if (r && !r.tendenza) { if (r.v === 'z') w[g] = 'ṡ'; rules.push({ id: r.id, ok: true }); }
    else dubbi.push('s');
  }
  for (const g of zGroups(key)) {
    const zr = regoleCat('Z');
    const ordered = [...zr.filter(r => r.prima), ...zr.filter(r => !r.prima)];
    const r = ordered.find(r => matchIndex(r.re, key, CGROUPS) === g);
    if (r) {
      if (r.v === 'z') { let j = g; while (key[j] === 'z') { w[j] = 'ż'; j++; } }
      rules.push({ id: r.id, ok: true });
    } else dubbi.push('z');
  }
  return { marked: w.join(''), rules, dubbi };
}

// ---------- spiegazione: quali regole valgono per una parola del dizionario ----------
export { sGroups, zGroups, nuclei, stressIndex };
export function explain(key, marked) {
  const out = [];
  const st = stressIndex(marked);
  if (st >= 0 && ACC_E_O.includes(marked[st])) {
    const actual = 'èò'.includes(marked[st]) ? 'open' : 'closed';
    const tronca = st === marked.length - 1;
    const cat = 'eé'.includes(BASE[marked[st]] || marked[st]) || marked[st] === 'è' || marked[st] === 'é' ? 'E' : 'O';
    let found = false;
    for (const r of regoleCat(cat).filter(r => tronca ? r.solo === 'tronca' : r.solo !== 'tronca')) {
      const i = matchIndex(r.re, key, VGROUPS);
      if (i === st) { out.push({ id: r.id, ok: r.q === actual, tendenza: !!r.tendenza, feat: 'v', pos: st }); found = true; break; }
    }
    if (!found) {
      const nuc = nuclei(key); const after = nuc.filter(k => k > st).length;
      if (after >= 2) out.push({ id: cat === 'E' ? 'E10' : 'O6', ok: actual === 'open', tendenza: true, feat: 'v', pos: st });
    }
  }
  for (const g of sGroups(key)) {
    const actual = marked[g] === 'ṡ' ? 'z' : 's';
    const r = regoleCat('S').find(r => matchIndex(r.re, key, CGROUPS) === g);
    if (r) out.push({ id: r.id, ok: r.v === actual, tendenza: !!r.tendenza, feat: 's', pos: g });
  }
  for (const g of zGroups(key)) {
    const actual = marked[g] === 'ż' ? 'z' : 's';
    const zr = regoleCat('Z');
    const r = [...zr.filter(r => r.prima), ...zr.filter(r => !r.prima)].find(r => matchIndex(r.re, key, CGROUPS) === g);
    if (r) out.push({ id: r.id, ok: r.v === actual, tendenza: !!r.tendenza, feat: 'z', pos: g });
  }
  if (DIFF.has(stripAll(key))) out.push({ id: 'T3', ok: true });
  return out;
}

// ---------- analisi di una parola ----------
// ritorna { marked, alternative[], omografo:bool, fonte:'dizionario'|'flessa'|'regole'|'atona', regole[], dubbi[] }
const cache = new Map();
export function analyzeWord(word) {
  const lower = word.toLowerCase();
  const key = stripDizione(lower);
  if (cache.has(key)) return cache.get(key);
  let res;
  const plain = stripAll(key);
  const swap = { 'è': 'é', 'é': 'è', 'ò': 'ó', 'ó': 'ò' };
  const last = key.slice(-1);
  let entries = LEX.get(key) || (swap[last] && LEX.get(key.slice(0, -1) + swap[last])) ||
    (key !== plain ? LEX.get(plain) : LEX_NOACC.get(plain));
  if (entries) {
    const e = entries[0];
    const cur = OMOGRAFI_DESC[plain];
    let prim = e.prim, homs = [], descrizioni = {};
    if (cur) {
      // omografo vero: le forme e le descrizioni sono quelle scritte a mano (rules.js)
      const forms = cur.map(c => c[0]);
      const soft = f => noSZ(f).replace(/[àìù]/g, c => BASE[c]);
      prim = forms.find(f => f === prim) || forms.find(f => noSZ(f) === noSZ(prim)) || forms.find(f => soft(f) === soft(prim)) || forms[0];
      homs = forms.filter(f => f !== prim);
      for (const [f, d] of cur) descrizioni[f] = d;
    } else {
      const auto = OMO_AUTO.get(plain) || {};
      for (const f of [prim, ...e.homs]) if (auto[noSZ(f)]) descrizioni[f] = auto[noSZ(f)];
    }
    const inCur = f => cur && cur.some(c => noSZ(c[0]) === noSZ(f));
    const vIdx = e.vars.map((f, i) => i).filter(i => !inCur(e.vars[i]) && e.vars[i] !== prim);
    const alt = [...vIdx.map(i => e.vars[i]), ...(cur ? [] : e.homs)];
    const varianti = [...vIdx.map(i => ({ forma: fitLength(e.vars[i], key), code: e.vcodes[i] })),
      ...(cur ? [] : e.homs.map(f => ({ forma: fitLength(f, key), code: 'H', descrizione: descrizioni[f] })))];
    res = { marked: fitLength(prim, key), alternative: alt.map(a => fitLength(a, key)), varianti, omografi: homs.map(a => fitLength(a, key)),
      descrizioni, fonte: e.derived ? 'flessa' : 'dizionario', dubbi: [] };
    res.regole = explain(key, res.marked);
    // negli omografi veri la vocale la decide il significato, non una regola
    if (OMOGRAFI_DESC[plain]) res.regole = res.regole.filter(r => r.feat !== 'v');
  } else {
    const g = guess(key);
    res = { marked: g.marked, alternative: [], varianti: [], omografi: [], descrizioni: {}, fonte: 'regole', regole: g.rules, dubbi: g.dubbi };
  }
  if (ATONE.has(plain)) {
    res = { ...res, marked: [...res.marked].map((c, i) => 'àèéìòóù'.includes(c) && !'àèéìòóù'.includes(key[i]) ? BASE[c] : c).join(''), atona: true, omografi: [], alternative: [], varianti: [], dubbi: [],
      regole: (res.regole || []).filter(r => r.feat === 's' || r.feat === 'z') };
  }
  const d = DIFF.get(plain);
  if (d) res = { ...res, difficile: fitLength(d, key) };
  cache.set(key, res);
  return res;
}
// sicurezza: la forma segnata deve avere la stessa lunghezza della parola
function fitLength(m, key) { return [...m].length === [...key].length ? m : key; }

// ---------- applicazione dei segni secondo il selettore ----------
// opts = { eo:true, tonico:true, s:true, z:true }
export function applyMarks(original, marked, opts, difficile) {
  const o = [...original], m = [...marked], d = difficile ? [...difficile] : null;
  let out = '';
  for (let i = 0; i < o.length; i++) {
    const oc = o[i];
    const lowerO = oc.toLowerCase();
    let c = m[i] ?? lowerO;
    let use = lowerO;
    if (ACC_E_O.includes(c) && opts.eo) use = c;
    else if (ACC_TONICO.includes(c) && opts.tonico && !'àìù'.includes(lowerO)) use = c;
    else if (c === 'ṡ' && opts.s) use = c;
    else if (c === 'ż' && opts.z) use = c;
    if (d && opts.tonico && ACC_TONICO.includes(d[i])) use = d[i];
    if (d && opts.eo && opts.tonico && ACC_E_O.includes(d[i])) use = d[i];
    out += oc !== lowerO ? use.toUpperCase() : (use === lowerO ? oc : use);
  }
  return out;
}

// ---------- testo intero ----------
const WORD_RE = /[\p{L}ṡżṠŻ]+/gu;
export function tokenize(text) {
  const out = []; let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ w: m[0], i: m.index });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

// ritorna il testo segnato (stessa lunghezza in caratteri) e la lista delle parole
// choices: Map(chiave parola -> forma scelta) per omografi
export function markText(text, opts, choices) {
  let out = '';
  const words = [];
  for (const tk of tokenize(text)) {
    if (tk.t !== undefined) { out += tk.t; continue; }
    const a = analyzeWord(tk.w);
    const key = stripDizione(tk.w.toLowerCase());
    const chosen = choices && choices.get(key);
    let marked = chosen || a.marked;
    const userMarks = userMarked(tk.w.toLowerCase());
    if (!chosen && userMarks) {
      // l'utente ha già scritto un segno (àncora, pèsca): scegli la forma compatibile o rispetta la sua
      const cand = [a.marked, ...a.omografi, ...a.alternative].find(c => compatible(c, tk.w.toLowerCase()));
      marked = cand || tk.w.toLowerCase();
    }
    const res = applyMarks(tk.w, marked, opts, a.difficile);
    out += res;
    words.push({ ...a, word: tk.w, key, out: res, index: tk.i });
  }
  return { text: out, words };
}

function userMarked(w) {
  const a = [...w];
  return a.some((c, i) => (c === 'ṡ' || c === 'ż' || ('àèéìíòóùú'.includes(c) && i !== a.length - 1)));
}
function compatible(cand, w) {
  const c = [...cand], o = [...w];
  if (c.length !== o.length) return false;
  for (let i = 0; i < o.length; i++) if (BASE[o[i]] && o[i] !== c[i]) return false;
  return true;
}

export function stats(words) {
  const s = { totale: words.length, dizionario: 0, flessa: 0, regole: 0, dubbi: 0, omografi: 0 };
  for (const w of words) {
    s[w.fonte] = (s[w.fonte] || 0) + 1;
    if (w.dubbi.length) s.dubbi++;
    if (w.omografi.length) s.omografi++;
  }
  return s;
}
