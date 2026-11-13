// Test della scelta in base al contesto: imperativo con pronome o participio/nome.
import fs from 'fs';
import * as E from '../js/engine.js';
E.parseLexicon(fs.readFileSync(new URL('../data/lessico.txt', import.meta.url), 'utf8'));
const all = { eo: true, tonico: true, s: true, z: true };
let fail = 0;
const casi = [
  ['Siamo stati arrestati.', 'arrestati', 'participio'],
  ['I ladri sono già stati arrestati ieri.', 'arrestati', 'participio'],
  ['La polizia li ha arrestati.', 'arrestati', 'participio'],
  ['Arrestati!', 'Arrèstati', 'imperativo'],
  ['Fermati, ti prego.', 'Férmati', 'imperativo'],
  ['Ti ho detto: fermati!', 'férmati', 'imperativo'],
  ['Erano tutti fermati al confine.', 'fermati', 'participio'],
  ['Alzati e cammina.', 'Àlzati', 'imperativo'],
  ['Si sono alzati presto.', 'alzati', 'participio'],
  ['Ho comprato dei vestiti nuovi.', 'vestiti', 'participio'],
  ['Vestiti, è tardi!', 'Vèstiti', 'imperativo'],
];
for (const [frase, atteso, tipo] of casi) {
  const { text, words } = E.markText(frase, all);
  const w = words.find(x => x.contesto);
  const ok = text.includes(atteso) && w && w.contesto.scelta === tipo;
  if (!ok) fail++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${frase.padEnd(40)} → ${text}  (${w ? w.contesto.scelta + ', ' + w.contesto.perche : 'nessun contesto'})`);
}
const dubbio = E.markText('Ecco i ragazzi fermati.', all).words.find(x => x.contesto);
console.log(`  ${dubbio && dubbio.contesto.scelta === 'participio' ? '✓' : '✗'} caso dopo un nome: participio (${dubbio && dubbio.contesto.perche})`);
console.log(fail ? `\n${fail} TEST FALLITI` : '\nTutti i test passati');
process.exit(fail ? 1 : 0);
