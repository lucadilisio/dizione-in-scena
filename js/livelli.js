// Composizione delle 10 parole di un livello del Percorso.
// Obiettivo: non si deve poter vincere premendo sempre lo stesso pulsante.
// - parole che seguono la regola del livello + qualche eccezione + parole "di confronto" con la risposta
//   opposta (da altre regole), così le risposte sono circa metà e metà;
// - ordine casuale, ma mai più di 3 risposte uguali di fila.

export function mescola(arr, rand) {
  const b = [...arr];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// lunghezza della serie più lunga di risposte uguali
export function serieMax(seq) {
  let max = 0, cur = 0, prev;
  for (const q of seq) { const a = String(q.ans); cur = a === prev ? cur + 1 : 1; prev = a; if (cur > max) max = cur; }
  return max;
}

// mescola evitando serie lunghe (se impossibile, tiene il tentativo migliore)
export function senzaSerie(seq, rand, maxSerie = 3, tentativi = 400) {
  let best = mescola(seq, rand), bestRun = serieMax(best);
  for (let t = 0; t < tentativi && bestRun > maxSerie; t++) {
    const c = mescola(seq, rand), r = serieMax(c);
    if (r < bestRun) { best = c; bestRun = r; }
  }
  return best;
}

// prende k elementi a caso, saltando le parole già usate
function prendi(list, k, usate, rand) {
  const out = [];
  for (const q of mescola(list, rand)) {
    if (out.length >= k) break;
    if (usate.has(q.key)) continue;
    usate.add(q.key); out.push(q);
  }
  return out;
}

// l: { id, regolari, ecc, contrasto } — contrasto: parole con la risposta opposta a quella della regola
export function componiLivello(l, rand, n = 10) {
  const usate = new Set();
  const frequenti = list => list.filter(q => q.rank < 8000).length >= 5 ? list.filter(q => q.rank < 8000) : list;
  // livello "Ripasso misto": metà parole per ciascuna risposta
  if (l.id.endsWith('-mix')) {
    const perRisposta = new Map();
    for (const q of frequenti(l.regolari)) { const a = String(q.ans); (perRisposta.get(a) || perRisposta.set(a, []).get(a)).push(q); }
    const gruppi = [...perRisposta.values()];
    let seq = [];
    const base = Math.floor(n / gruppi.length), resto = n % gruppi.length;
    mescola(gruppi, rand).forEach((g, i) => { seq.push(...prendi(g, base + (i < resto ? 1 : 0), usate, rand)); });
    if (seq.length < n) seq.push(...prendi(l.regolari, n - seq.length, usate, rand));
    return senzaSerie(seq.slice(0, n), rand);
  }
  const contrasto = frequenti(l.contrasto || []);
  const nEcc = Math.min(2, l.ecc.length);
  const nCon = Math.min(contrasto.length, Math.max(0, Math.round(n / 2) - nEcc));
  const nReg = n - nEcc - nCon;
  const seq = [
    ...prendi(frequenti(l.regolari), nReg, usate, rand),
    ...prendi(l.ecc, nEcc, usate, rand),
    ...prendi(contrasto, nCon, usate, rand),
  ];
  if (seq.length < n) seq.push(...prendi(l.regolari, n - seq.length, usate, rand));
  return senzaSerie(seq, rand);
}
