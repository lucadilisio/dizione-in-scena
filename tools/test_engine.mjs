import fs from 'fs';
import * as E from '../js/engine.js';
import { REGOLE } from '../js/rules.js';
E.parseLexicon(fs.readFileSync(new URL('../data/lessico.txt', import.meta.url), 'utf8'));
const all = { eo: true, tonico: true, s: true, z: true };
const t = "Essere o non essere, questo è il problema. Perche la rosa del Francese era bella? Organizzare una zuppa di pesce, sbagliando il pranzo! Tornò a casa e pensavano alla stella più famosa. Città, però, ventitré. Rubrica e àncora. SBAGLIO enorme. L'anima dell'uomo c'è.";
console.log(E.markText(t, all).text);
console.log(E.markText(t, { eo: true, tonico: false, s: false, z: false }).text);
for (const w of ['pesca', 'zigrinatura', 'blablatore', 'pittoresche', 'zappatello', 'stella', 'casetta', 'sbirulino', 'ventesimo', 'perche']) {
  const a = E.analyzeWord(w); console.log(w, '->', a.marked, a.fonte, JSON.stringify(a.regole), a.dubbi.join(','), a.alternative.join('/'), a.omografi.join('/'));
}
// verifica esempi delle regole contro il dizionario
let bad = 0;
for (const r of REGOLE) for (const ex of (r.esempi || [])) {
  const word = ex.split(/[ (→,]/)[0];
  if (!/^[\p{L}ṡż]+$/u.test(word) || word.length < 3) continue;
  const a = E.analyzeWord(E.stripDizione(word.toLowerCase()));
  if (a.fonte === 'regole') { console.log('  [non nel diz.]', r.id, word, a.marked); continue; }
  const exp = word.toLowerCase();
  const got = a.marked;
  const all2 = [got, ...a.alternative, ...a.omografi];
  const okFeat = c => [...exp].every((ch, i) => !'èéòóàìùṡż'.includes(ch) || c[i] === ch || (i === exp.length - 1 && 'àìùè'.includes(ch)));
  if (!all2.some(okFeat)) { bad++; console.log('  [DIVERSO]', r.id, 'esempio', word, 'diz.', got, a.alternative.join('/')); }
}
console.log('esempi discordanti:', bad);
