// Elaborazione .docx: sostituisce solo i caratteri dentro <w:t>, carattere per carattere.
// Tutte le sostituzioni (e→è/é, o→ò/ó, a→à, s→ṡ, z→ż) sono 1:1, quindi l'impaginazione resta identica.
import { markText } from './engine.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SEP = '\u0001';   // separatore per tabulazioni/a capo dentro il paragrafo

function partNames(zip) {
  return Object.keys(zip.files).filter(n =>
    /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
}

// Raccoglie per ogni paragrafo i nodi di testo, in ordine
function paragraphs(doc) {
  const out = [];
  const ps = doc.getElementsByTagNameNS(W, 'p');
  for (const p of ps) {
    const segs = [];   // {node} | {sep}
    const walk = el => {
      for (const ch of el.children) {
        if (ch.namespaceURI === W && ch.localName === 'p') continue;          // paragrafi annidati (caselle di testo): a parte
        if (ch.namespaceURI === W && ch.localName === 't') segs.push({ node: ch });
        else if (ch.namespaceURI === W && ['tab', 'br', 'cr', 'noBreakHyphen', 'softHyphen', 'sym'].includes(ch.localName)) segs.push({ sep: true });
        else if (ch.namespaceURI === W && ['delText', 'instrText'].includes(ch.localName)) segs.push({ sep: true });
        else walk(ch);
      }
    };
    walk(p);
    if (segs.some(s => s.node)) out.push(segs);
  }
  return out;
}

function segText(segs) { return segs.map(s => s.node ? s.node.textContent : SEP).join(''); }

// Prima passata: analizza tutto il documento e restituisce parole + contesti (per la revisione degli omografi)
export async function analyzeDocx(buffer, opts) {
  const zip = await JSZip.loadAsync(buffer);
  const all = [];
  const paras = [];
  for (const name of partNames(zip)) {
    const xml = await zip.file(name).async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) continue;
    for (const segs of paragraphs(doc)) {
      const text = segText(segs);
      const { words, text: marked } = markText(text, opts);
      paras.push(marked.replaceAll(SEP, ' '));
      for (const w of words) all.push({ ...w, context: text.replaceAll(SEP, ' '), part: name });
    }
  }
  return { words: all, preview: paras };
}

// Seconda passata: scrive il .docx segnato
export async function buildDocx(buffer, opts, choices) {
  const zip = await JSZip.loadAsync(buffer);   // sempre dall'originale
  let changed = 0;
  for (const name of partNames(zip)) {
    const xml = await zip.file(name).async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) continue;
    for (const segs of paragraphs(doc)) {
      const text = segText(segs);
      const { text: marked } = markText(text, opts, choices);
      if (marked.length !== text.length) throw new Error('Lunghezza diversa in un paragrafo: interrotto per non rovinare il documento.');
      if (marked === text) continue;
      let pos = 0;
      for (const s of segs) {
        if (s.sep) { pos += 1; continue; }
        const len = s.node.textContent.length;
        const nt = marked.slice(pos, pos + len);
        if (nt !== s.node.textContent) { s.node.textContent = nt; changed++; }
        pos += len;
      }
    }
    let out = new XMLSerializer().serializeToString(doc);
    const decl = xml.match(/^<\?xml[^>]*\?>/);
    if (decl && !out.startsWith('<?xml')) out = decl[0] + '\r\n' + out;
    zip.file(name, out);
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  return { blob, changed };
}
