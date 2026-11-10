// Test della composizione dei livelli: risposte bilanciate e niente serie lunghe.
import { componiLivello, serieMax } from '../js/livelli.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  ✗', m); } else console.log('  ✓', m); };
let seed = 42; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const parole = (pref, n, ans, extra = {}) => Array.from({ length: n }, (_, i) => ({ key: pref + i, type: 'eo', pos: 1, ans, rank: i * 10, ...extra }));
// livello tipo "E2 -ello → è": 40 regolari (open), 5 eccezioni (closed), 60 di confronto (closed)
const l = { id: 'E2', regolari: parole('r', 40, 'open'), ecc: parole('e', 5, 'closed'), contrasto: parole('c', 60, 'closed') };
let peggiore = 0, sbilanciati = 0, doppioni = 0;
for (let t = 0; t < 500; t++) {
  const seq = componiLivello(l, rand);
  const aperte = seq.filter(q => q.ans === 'open').length;
  if (aperte < 4 || aperte > 6) sbilanciati++;
  peggiore = Math.max(peggiore, serieMax(seq));
  if (new Set(seq.map(q => q.key)).size !== seq.length) doppioni++;
  if (seq.length !== 10) fail++;
}
ok(sbilanciati === 0, 'in 500 livelli generati le risposte sono sempre tra 4 e 6 per tipo');
ok(peggiore <= 3, `mai più di 3 risposte uguali di fila (massimo trovato: ${peggiore})`);
ok(doppioni === 0, 'nessuna parola ripetuta nello stesso livello');
const s1 = componiLivello(l, rand);
ok(s1.some(q => q.key.startsWith('e')) && s1.some(q => q.key.startsWith('c')), 'ci sono sia eccezioni sia parole di confronto');
// regola senza eccezioni e con poche parole di confronto: si completa comunque a 10
const l2 = { id: 'S5', regolari: parole('r', 30, 'z'), ecc: [], contrasto: parole('c', 2, 's') };
ok(componiLivello(l2, rand).length === 10, 'livello con poche parole di confronto: 10 parole comunque');
// ripasso misto: metà e metà
const mix = { id: 'E-mix', regolari: [...parole('a', 50, 'open'), ...parole('b', 50, 'closed')], ecc: [] };
let mixOk = true;
for (let t = 0; t < 200; t++) { const s = componiLivello(mix, rand); const a = s.filter(q => q.ans === 'open').length; if (a !== 5 || serieMax(s) > 3) mixOk = false; }
ok(mixOk, 'Ripasso misto: sempre 5 e 5, mai più di 3 uguali di fila');
console.log(fail ? `\n${fail} TEST FALLITI` : '\nTutti i test passati');
process.exit(fail ? 1 : 0);
