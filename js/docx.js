// Elaborazione .docx: sostituisce solo i caratteri dentro <w:t>, carattere per carattere.
// Tutte le sostituzioni (e→è/é, o→ò/ó, a→à, s→ṡ, z→ż) sono 1:1, quindi l'impaginazione resta identica.
//
// Il testo viene diviso in parti: battuta, nome (del personaggio), didascalia, altro (titoli, elenchi,
// note, intestazioni). Di default si segnano solo le battute; il selettore "Parti del copione" decide.
import { markText, analyzeWord } from './engine.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SEP = '\u0001';   // tabulazione / a capo dentro il paragrafo (non appartiene a nessun nodo di testo)

export const PARTI = [
  { id: 'battuta', label: 'Battute', def: true },
  { id: 'canzone', label: 'Canzoni', def: false },
  { id: 'didascalia', label: 'Didascalie', def: false },
  { id: 'nome', label: 'Nomi dei personaggi', def: false },
  { id: 'altro', label: 'Titoli e altro testo', def: false },
];

function partNames(zip) {
  return Object.keys(zip.files).filter(n =>
    /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
}

// ---------- stili (grassetto / corsivo / titolo / rientro ereditati) ----------
const on = el => !!el && !['0', 'false', 'off'].includes(el.getAttributeNS(W, 'val') || el.getAttribute('w:val') || '');
const child = (el, name) => el ? [...el.children].find(c => c.namespaceURI === W && c.localName === name) : null;
const attr = (el, name) => el ? (el.getAttributeNS(W, name) || el.getAttribute('w:' + name)) : null;

async function readStyles(zip) {
  const f = zip.file('word/styles.xml');
  const map = new Map();
  if (!f) return map;
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  for (const s of doc.getElementsByTagNameNS(W, 'style')) {
    const rPr = child(s, 'rPr'), pPr = child(s, 'pPr');
    const ind = child(pPr, 'ind');
    map.set(attr(s, 'styleId'), {
      name: (attr(child(s, 'name'), 'val') || '').toLowerCase(),
      based: attr(child(s, 'basedOn'), 'val'),
      b: child(rPr, 'b') ? on(child(rPr, 'b')) : null,
      i: child(rPr, 'i') ? on(child(rPr, 'i')) : null,
      ind: ind ? +(attr(ind, 'left') || attr(ind, 'start') || 0) : null,
      outline: !!child(pPr, 'outlineLvl'),
    });
  }
  return map;
}
function styleProp(styles, id, prop) {
  for (let k = 0; id && k < 10; k++) {
    const s = styles.get(id); if (!s) return null;
    if (s[prop] !== null && s[prop] !== undefined) return s[prop];
    id = s.based;
  }
  return null;
}

// ---------- paragrafi: nodi di testo + attributi per carattere ----------
function paragraphs(doc, styles) {
  const out = [];
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    const pPr = child(p, 'pPr');
    const pStyle = attr(child(pPr, 'pStyle'), 'val');
    const indEl = child(pPr, 'ind');
    const indent = indEl && (attr(indEl, 'left') || attr(indEl, 'start')) !== null && (attr(indEl, 'left') || attr(indEl, 'start')) !== ''
      ? +(attr(indEl, 'left') || attr(indEl, 'start')) : (styleProp(styles, pStyle, 'ind') || 0);
    const sname = (styles.get(pStyle) || {}).name || '';
    const heading = /^(heading|titolo|title|subtitle|sottotitolo|toc|sommario|indice)/.test(sname) || !!child(pPr, 'outlineLvl') || !!styleProp(styles, pStyle, 'outline');
    const pB = styleProp(styles, pStyle, 'b'), pI = styleProp(styles, pStyle, 'i');
    const segs = [];   // {node, b, i} | {sep}
    const walk = el => {
      for (const ch of el.children) {
        if (ch.namespaceURI !== W) { walk(ch); continue; }
        const n = ch.localName;
        if (n === 'p' || n === 'pPr' || n === 'rPr') continue;   // paragrafi annidati a parte; proprietà ignorate
        if (n === 't') {
          const r = ch.parentNode, rPr = child(r, 'rPr');
          const rs = attr(child(rPr, 'rStyle'), 'val');
          const b = child(rPr, 'b') ? on(child(rPr, 'b')) : (styleProp(styles, rs, 'b') ?? pB ?? false);
          const i = child(rPr, 'i') ? on(child(rPr, 'i')) : (styleProp(styles, rs, 'i') ?? pI ?? false);
          segs.push({ node: ch, b, i });
        } else if (['tab', 'br', 'cr', 'noBreakHyphen', 'softHyphen', 'sym', 'delText', 'instrText'].includes(n)) segs.push({ sep: true });
        else walk(ch);
      }
    };
    walk(p);
    if (!segs.some(s => s.node)) continue;
    let text = '', bold = [], ital = [];
    for (const s of segs) {
      if (s.sep) { text += SEP; bold.push(false); ital.push(false); continue; }
      const t = s.node.textContent;
      text += t; for (let k = 0; k < t.length; k++) { bold.push(s.b); ital.push(s.i); }
    }
    out.push({ segs, text, bold, ital, indent, heading, sname });
  }
  return out;
}

// ---------- riconoscimento delle parti del copione ----------
const isLetter = c => /\p{L}/u.test(c);
const QUOTE = /^["“”«»'‘’]/;
function nameLike(s) {
  const t = s.trim();
  if (!t || t.length > 32 || /[.!?;,…()]/.test(t.replace(/\.$/, ''))) return false;
  if (t.split(/\s+/).length > 4) return false;
  return /^[\p{Lu}\[]/u.test(t);
}
const allCaps = s => { const l = [...s].filter(isLetter); return l.length > 0 && l.every(c => c === c.toUpperCase()); };
function share(arr, a, b) { let n = 0, k = 0; for (let x = a; x < b; x++) { k++; if (arr[x]) n++; } return k ? n / k : 0; }
function italicWhole(p) {
  let n = 0, k = 0;
  for (let x = 0; x < p.text.length; x++) if (isLetter(p.text[x])) { k++; if (p.ital[x]) n++; }
  return k > 0 && n / k >= 0.9;
}
// "NOME<tab>battuta" oppure "NOME: battuta"
function speaker(p) {
  const m = /^([\s\u0001]*)([^\u0001:\n—–]{1,32}?)[ \t]*(\u0001|:(?=\s))/u.exec(p.text);
  if (!m || !nameLike(m[2])) return null;
  const a = m[1].length, b = a + m[2].length;
  const rest = p.text.slice(m[0].length).replace(/\u0001/g, '').trim();
  if (!rest) return null;
  const tab = m[3] === SEP;
  if (!(tab || allCaps(m[2]) || share(p.bold, a, b) > 0.8)) return null;
  return { a, b, tab };
}

export function classify(paras) {
  // rientro tipico delle battute = quello più frequente tra i paragrafi "nome + battuta"
  const cnt = new Map();
  for (const p of paras) if (!p.heading && speaker(p)) cnt.set(p.indent, (cnt.get(p.indent) || 0) + 1);
  let dialogInd = null, best = 0;
  for (const [k, v] of cnt) if (v > best) { best = v; dialogInd = k; }
  // nomi dei personaggi (dalle battute stesse): dentro le battute restano senza segni
  // (solo parole che non sono nel dizionario: "Zazu", "Mufasa" sì, "Con" no)
  const nomi = new Set();
  for (const p of paras) {
    const sp = !p.heading && speaker(p);
    if (sp && (p.indent === dialogInd || best < 3))
      for (const w of p.text.slice(sp.a, sp.b).match(/\p{L}+/gu) || [])
        if (w.length >= 3 && analyzeWord(w.toLowerCase()).fonte === 'regole') nomi.add(w.toLowerCase());
  }
  let inDialogue = false, afterNameLine = false;
  // canzoni: dal titolo "Canzone - …" fino alla scena successiva o alla ripresa del dialogo normale (nome non in MAIUSCOLO)
  const SONG = /^(canzone|song|brano|reprise)\b/i;
  let inSong = false;
  for (let idx = 0; idx < paras.length; idx++) {
    const p = paras[idx];
    const kinds = new Array(p.text.length).fill('altro');
    const set = (a, b, k) => { for (let x = a; x < b; x++) kinds[x] = k; };
    const trimmed = p.text.replace(/\u0001/g, ' ').trim();
    const sp = speaker(p);
    // rientro tipico del copione, oppure (es. canzoni con altro rientro) nome in MAIUSCOLO e grassetto.
    // Un nome di personaggio "noto" non basta: l'elenco attori ("Nala<tab>Nome Cognome") sembrerebbe una battuta.
    const isSpeaker = sp && (dialogInd === null || p.indent === dialogInd || best < 3
      || (allCaps(p.text.slice(sp.a, sp.b)) && share(p.bold, sp.a, sp.b) > 0.8));
    if (SONG.test(trimmed)) inSong = true;
    else if (p.heading) inSong = false;
    else if (inSong && isSpeaker && !allCaps(p.text.slice(sp.a, sp.b))) inSong = false;
    if (p.heading) { inDialogue = afterNameLine = false; }
    else if (isSpeaker) {      // prima del corsivo: "B (un respiro...) Sì." è una battuta, non una didascalia
      set(0, kinds.length, 'battuta'); set(sp.a, sp.b, 'nome'); inDialogue = true; afterNameLine = false;
    }
    else if (italicWhole(p) || /^[([].*[)\]]$/s.test(trimmed)) { set(0, kinds.length, 'didascalia'); inDialogue = afterNameLine = false; } else if (best < 5 && nameLike(trimmed) && (allCaps(trimmed) || share(p.bold, 0, p.text.length) > 0.8) && paras[idx + 1] && !paras[idx + 1].heading && !italicWhole(paras[idx + 1])) {
      set(0, kinds.length, 'nome'); inDialogue = true; afterNameLine = true;      // nome su una riga a parte
    } else if (inDialogue && (p.text.startsWith(SEP) || afterNameLine || (dialogInd && p.indent === dialogInd))) {
      set(0, kinds.length, 'battuta');                                            // continuazione della battuta
    } else { inDialogue = afterNameLine = false; }
    // dentro le battute: nomi in grassetto maiuscolo (canzoni), parentesi, corsivo non tra virgolette
    if (kinds.includes('battuta')) {
      let x = 0;
      while (x < p.text.length) {
        if (kinds[x] !== 'battuta') { x++; continue; }
        if (p.bold[x] && isLetter(p.text[x])) {
          let y = x; while (y < p.text.length && p.bold[y] && p.text[y] !== SEP) y++;
          if (nameLike(p.text.slice(x, y)) && allCaps(p.text.slice(x, y))) set(x, y, 'nome');
          x = y; continue;
        }
        if (p.text[x] === '(' || p.text[x] === '[') {
          const close = p.text[x] === '(' ? ')' : ']';
          const y = p.text.indexOf(close, x);
          if (y > x) { set(x, y + 1, 'didascalia'); x = y + 1; continue; }
        }
        if (p.ital[x] && isLetter(p.text[x])) {
          let y = x; while (y < p.text.length && (p.ital[y] || !isLetter(p.text[y])) && p.text[y] !== SEP && p.text[y] !== '(') y++;
          const before = p.text.slice(Math.max(0, x - 2), x);
          if (!QUOTE.test(p.text.slice(x).trimStart()) && !/["“«'‘]\s*$/.test(before)) set(x, y, 'didascalia');
          x = y; continue;
        }
        x++;
      }
    }
    if (kinds.includes('battuta') && nomi.size) {
      for (const m of p.text.matchAll(/\p{L}+/gu)) {
        if (kinds[m.index] === 'battuta' && /^\p{Lu}/u.test(m[0]) && nomi.has(m[0].toLowerCase())) set(m.index, m.index + m[0].length, 'nome');
      }
    }
    if (inSong) for (let x = 0; x < kinds.length; x++) if (kinds[x] === 'battuta') kinds[x] = 'canzone';
    p.kinds = kinds;
  }
  return paras;
}

// ---------- lettura del documento ----------
async function load(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const styles = await readStyles(zip);
  const parts = [];
  for (const name of partNames(zip)) {
    const xml = await zip.file(name).async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) continue;
    const paras = paragraphs(doc, styles);
    if (name === 'word/document.xml') classify(paras);
    else for (const p of paras) p.kinds = new Array(p.text.length).fill('altro');   // intestazioni, piè di pagina, note
    parts.push({ name, xml, doc, paras });
  }
  return { zip, parts };
}

// testo segnato solo nelle parti scelte
function markParagraph(p, opts, parti, choices) {
  const { text: marked, words } = markText(p.text, opts, choices);
  let out = '';
  for (let x = 0; x < p.text.length; x++) out += parti[p.kinds[x]] ? marked[x] : p.text[x];
  return { out, words: words.filter(w => parti[p.kinds[w.index]]) };
}

// Prima passata: parole (per statistiche e omografi) e anteprima con le parti
export async function analyzeDocx(buffer, opts, parti) {
  const { parts } = await load(buffer);
  const all = [], preview = [];
  const count = { battuta: 0, canzone: 0, didascalia: 0, nome: 0, altro: 0 };
  for (const part of parts) for (const p of part.paras) {
    const { out, words } = markParagraph(p, opts, parti);
    for (const w of words) all.push({ ...w, context: p.text.replaceAll(SEP, ' '), part: part.name });
    // anteprima: segmenti consecutivi dello stesso tipo
    const segs = []; let cur = null;
    for (let x = 0; x < out.length; x++) {
      const k = p.kinds[x], c = out[x] === SEP ? ' ' : out[x];
      if (cur && cur.k === k) cur.t += c; else { cur = { k, t: c }; segs.push(cur); }
    }
    for (const s of segs) if (/\p{L}/u.test(s.t)) count[s.k]++;
    preview.push(segs);
  }
  return { words: all, preview, count };
}

// Seconda passata: scrive il .docx segnato
export async function buildDocx(buffer, opts, choices, parti) {
  const { zip, parts } = await load(buffer);   // sempre dall'originale
  let changed = 0;
  for (const part of parts) {
    for (const p of part.paras) {
      const { out } = markParagraph(p, opts, parti, choices);
      if (out.length !== p.text.length) throw new Error('Lunghezza diversa in un paragrafo: interrotto per non rovinare il documento.');
      if (out === p.text) continue;
      let pos = 0;
      for (const s of p.segs) {
        if (s.sep) { pos += 1; continue; }
        const len = s.node.textContent.length;
        const nt = out.slice(pos, pos + len);
        if (nt !== s.node.textContent) { s.node.textContent = nt; changed++; }
        pos += len;
      }
    }
    let xmlOut = new XMLSerializer().serializeToString(part.doc);
    const decl = part.xml.match(/^<\?xml[^>]*\?>/);
    if (decl && !xmlOut.startsWith('<?xml')) xmlOut = decl[0] + '\r\n' + xmlOut;
    zip.file(part.name, xmlOut);
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  return { blob, changed };
}
