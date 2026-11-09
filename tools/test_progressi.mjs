// Test della logica dei progressi (streak, XP, trofei, ripasso).
import * as P from '../js/progressi.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  ✗', m); } else console.log('  ✓', m); };
const q = (key, rule = { ok: true }) => ({ key, type: 'eo', pos: 1, prim: key, rule });

// streak su più giorni
const s = P.nuovoStato('Giulia');
const d1 = '2026-11-01', d2 = '2026-11-02', d4 = '2026-11-04';
ok(P.streakInfo(s, d1).stato === 'nuova', 'all\'inizio la streak è "nuova"');
let ev;
for (let i = 0; i < 20; i++) ev = P.registraRisposta(s, q('w' + i), true, d1);
ok(ev.obiettivo && s.streak.corrente === 1 && s.streak.ultimo === d1, 'giorno 1: 20 giuste → obiettivo, streak 1');
P.registraRisposta(s, q('x'), true, d1);
ok(s.streak.corrente === 1, 'altre risposte lo stesso giorno non aumentano la streak');
ok(P.streakInfo(s, d2).stato === 'rischio', 'giorno 2 prima di giocare: a rischio');
for (let i = 0; i < 20; i++) P.registraRisposta(s, q('y' + i), true, d2);
ok(s.streak.corrente === 2 && s.streak.migliore === 2, 'giorno 2: streak 2');
ok(P.streakInfo(s, d4).stato === 'persa' && P.streakInfo(s, d4).persa === 2, 'saltato un giorno: persa (era 2)');
for (let i = 0; i < 20; i++) P.registraRisposta(s, q('z' + i), true, d4);
ok(s.streak.corrente === 1 && s.streak.migliore === 2, 'ripartenza: streak 1, migliore resta 2');

// XP ed eccezioni
const t = P.nuovoStato();
P.registraRisposta(t, q('a', { ok: false }), true, d1);
ok(t.xp === 15 && t.stats.eccezioni === 1, 'eccezione giusta: 15 XP');
P.registraRisposta(t, q('b'), false, d1);
ok(t.xp === 15 && t.errori['b|eo|1'].n === 1, 'risposta sbagliata: nessun XP, parola tra gli errori');
P.registraRisposta(t, q('b'), true, d1);
ok(!t.errori['b|eo|1'], 'ripassata giusta: tolta dagli errori');

// fine partita e trofei
const u = P.nuovoStato();
for (let i = 0; i < 12; i++) P.registraRisposta(u, q('c' + i), true, d1);
P.finePartita(u, { modo: 'sfida', punti: 2500, comboMax: 12 });
const mondi = { E: ['E1', 'E2'] };
let nuovi = P.controllaTrofei(u, mondi).map(x => x.id);
ok(nuovi.includes('debutto') && nuovi.includes('combo-5') && nuovi.includes('record-2000') && !nuovi.includes('record-5000'), 'trofei: debutto, combo ×5, 2000 punti');
ok(P.controllaTrofei(u, mondi).length === 0, 'i trofei non si assegnano due volte');
let e2 = P.finePartita(u, { modo: 'percorso', livelloId: 'E1', stelle: 3 });
ok(e2.xp === 60 && u.percorso.E1 === 3, 'livello con 3 stelle: +60 XP');
e2 = P.finePartita(u, { modo: 'percorso', livelloId: 'E1', stelle: 2 });
ok(e2.xp === 0 && u.percorso.E1 === 3, 'rigiocare peggio non toglie stelle né dà XP');
P.finePartita(u, { modo: 'percorso', livelloId: 'E2', stelle: 1 });
nuovi = P.controllaTrofei(u, mondi).map(x => x.id);
ok(nuovi.includes('mondo-E') && nuovi.includes('perfetto'), 'trofei: mondo della E completato, tre stelle');

// livelli e migrazione
ok(P.livello(0).titolo === 'Comparsa' && P.livello(500).n === 4 && P.livello(450).pct === 80, 'livelli e percentuale');
const m = P.unisciLocale(P.nuovoStato(), { record: 900, percorso: { E1: 2 } });
ok(m.stats.record === 900 && m.percorso.E1 === 2, 'progressi del dispositivo trasferiti');
ok(P.normalizza({ nome: 'X', stats: { giuste: 5 } }).stats.partite === 0, 'stato vecchio completato con i campi mancanti');
ok(P.umore(s, d4).umore === 'felice' && P.umore(s, '2026-11-05').umore === 'assonnata' && P.umore(s, '2026-11-07').umore === 'triste', 'umore della mascotte');
console.log(fail ? `\n${fail} TEST FALLITI` : '\nTutti i test passati');
process.exit(fail ? 1 : 0);
