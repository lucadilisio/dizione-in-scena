// Logica dei progressi del giocatore: XP, livelli, obiettivo del giorno, streak, trofei, parole da ripassare.
// Funzioni pure (nessuna dipendenza): lo stato è l'oggetto salvato in /utenti/{uid}.

export const OBIETTIVO = 20;          // risposte giuste al giorno per tenere viva la streak
const MAX_ERRORI = 150;
const GIORNI_TENUTI = 120;

// ---------- date (giorno locale del dispositivo) ----------
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(key, n) {
  const [y, m, g] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, g + n));
}

// ---------- stato iniziale ----------
export function nuovoStato(nome = '') {
  return {
    nome, gruppo: '', gruppoNome: '', creato: Date.now(), xp: 0, guida: false,
    stats: { partite: 0, risposte: 0, giuste: 0, eccezioni: 0, record: 0, comboMax: 0, duelliVinti: 0, ripassiPerfetti: 0, livelliPerfetti: 0 },
    percorso: {}, giorni: {}, streak: { corrente: 0, migliore: 0, ultimo: null }, trofei: {}, errori: {},
  };
}
// completa uno stato letto dal database (campi mancanti nelle versioni precedenti)
export function normalizza(s) {
  const n = nuovoStato(s && s.nome);
  const out = { ...n, ...(s || {}) };
  out.stats = { ...n.stats, ...((s && s.stats) || {}) };
  out.streak = { ...n.streak, ...((s && s.streak) || {}) };
  for (const k of ['percorso', 'giorni', 'trofei', 'errori', 'opDocente']) out[k] = { ...((s && s[k]) || {}) };
  out.bonus = [...((s && s.bonus) || [])];
  return out;
}

// ---------- livelli ----------
const SOGLIE = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 6000, 8500, 12000, 16000, 21000, 27000];
const TITOLI = ['Comparsa', 'Figurante', 'Generico', 'Allievo attore', 'Attore', 'Attore brillante', 'Caratterista',
  'Primo attore', 'Mattatore', 'Capocomico', 'Stella del palcoscenico', 'Maestro di dizione', 'Voce d’oro', 'Leggenda della scena', 'Mito del teatro'];
export function livello(xp = 0) {
  let i = 0; while (i + 1 < SOGLIE.length && xp >= SOGLIE[i + 1]) i++;
  const da = SOGLIE[i], a = SOGLIE[i + 1] ?? null;
  return { n: i + 1, titolo: TITOLI[i], da, a, pct: a ? Math.round((xp - da) / (a - da) * 100) : 100 };
}

// ---------- streak ----------
// stato: 'fatto' (obiettivo di oggi raggiunto), 'rischio' (ieri fatto, oggi non ancora), 'persa', 'nuova' (mai fatto)
export function streakInfo(s, oggi = dayKey()) {
  const { corrente, migliore, ultimo } = s.streak;
  const fattiOggi = s.giorni[oggi] || 0;
  let stato, vale = corrente;
  if (!ultimo) { stato = 'nuova'; vale = 0; }
  else if (ultimo === oggi) stato = 'fatto';
  else if (ultimo === addDays(oggi, -1)) stato = 'rischio';
  else { stato = 'persa'; vale = 0; }
  return { stato, corrente: vale, migliore, oggi: fattiOggi, obiettivo: OBIETTIVO, persa: stato === 'persa' ? corrente : 0 };
}

// ---------- risposte ----------
export const idDomanda = q => `${q.key}|${q.type}|${q.pos}`;
// aggiorna lo stato dopo una risposta; ritorna gli eventi (es. obiettivo del giorno raggiunto)
export function registraRisposta(s, q, ok, oggi = dayKey()) {
  const ev = { xp: 0, obiettivo: false };
  s.stats.risposte++;
  const id = idDomanda(q);
  if (ok) {
    const ecc = !!(q.rule && !q.rule.ok);
    s.stats.giuste++;
    if (ecc) s.stats.eccezioni++;
    ev.xp = 10 + (ecc ? 5 : 0);
    s.xp += ev.xp;
    s.giorni[oggi] = (s.giorni[oggi] || 0) + 1;
    if (s.giorni[oggi] === OBIETTIVO) {
      const st = s.streak;
      if (st.ultimo !== oggi) {
        st.corrente = st.ultimo === addDays(oggi, -1) ? st.corrente + 1 : 1;
        st.ultimo = oggi;
        st.migliore = Math.max(st.migliore, st.corrente);
        ev.obiettivo = true;
      }
    }
    const e = s.errori[id];
    if (e) { e.n -= 1; if (e.n <= 0) delete s.errori[id]; }
  } else {
    const e = s.errori[id] || { key: q.key, type: q.type, pos: q.pos, prim: q.prim, n: 0 };
    e.n = Math.min(3, e.n + 1); e.t = Date.now(); e.tot = (e.tot || 0) + 1;
    s.errori[id] = e;
    const ids = Object.keys(s.errori);
    if (ids.length > MAX_ERRORI) {
      ids.sort((a, b) => (s.errori[a].t || 0) - (s.errori[b].t || 0));
      for (const k of ids.slice(0, ids.length - MAX_ERRORI)) delete s.errori[k];
    }
  }
  // tiene solo gli ultimi mesi del calendario
  const limite = addDays(oggi, -GIORNI_TENUTI);
  for (const g of Object.keys(s.giorni)) if (g < limite) delete s.giorni[g];
  return ev;
}

// ---------- fine partita ----------
// info: { modo: 'sfida'|'percorso'|'duello'|'ripasso', punti, comboMax, giuste, n, livelloId, stelle, vinto }
export function finePartita(s, info) {
  const ev = { xp: 0, record: false };
  s.stats.partite++;
  if (info.comboMax) s.stats.comboMax = Math.max(s.stats.comboMax, info.comboMax);
  if (info.modo === 'sfida' && info.punti > s.stats.record) { s.stats.record = info.punti; ev.record = true; }
  if (info.modo === 'percorso' && info.livelloId) {
    const prima = s.percorso[info.livelloId] || 0;
    if (info.stelle > prima) { s.percorso[info.livelloId] = info.stelle; ev.xp += (info.stelle - prima) * 20; }
    if (info.stelle === 3) s.stats.livelliPerfetti = Object.values(s.percorso).filter(v => v === 3).length;
  }
  if (info.modo === 'duello' && info.vinto) { s.stats.duelliVinti++; ev.xp += 50; }
  if (info.modo === 'ripasso' && info.n >= 5 && info.giuste === info.n) s.stats.ripassiPerfetti++;
  s.xp += ev.xp;
  return ev;
}

// ---------- trofei ----------
// mondi: { E: ['E1', …], … } livelli del percorso per mondo (serve per i trofei dei mondi)
export function trofei(mondi = {}) {
  const mondo = (id, nome) => ({ id: 'mondo-' + id, icona: '🗺️', nome: `Esploratore: ${nome}`, desc: `Supera tutti i livelli del ${nome}`,
    test: s => (mondi[id] || []).length > 0 && mondi[id].every(l => (s.percorso[l] || 0) > 0) });
  return [
    { id: 'debutto', icona: '🎭', nome: 'Il debutto', desc: 'Gioca la tua prima partita', test: s => s.stats.partite >= 1 },
    { id: 'obiettivo', icona: '🎯', nome: 'Prova generale', desc: 'Raggiungi l’obiettivo del giorno', test: s => !!s.streak.ultimo },
    { id: 'streak-3', icona: '🔥', nome: 'Tre sere di fila', desc: 'Streak di 3 giorni', test: s => s.streak.migliore >= 3 },
    { id: 'streak-7', icona: '🔥', nome: 'Una settimana in scena', desc: 'Streak di 7 giorni', test: s => s.streak.migliore >= 7 },
    { id: 'streak-30', icona: '🌟', nome: 'Stagione teatrale', desc: 'Streak di 30 giorni', test: s => s.streak.migliore >= 30 },
    { id: 'combo-5', icona: '⚡', nome: 'Tutto d’un fiato', desc: 'Arriva alla combo ×5', test: s => s.stats.comboMax >= 12 },
    { id: 'record-2000', icona: '⏱️', nome: 'Applausi', desc: '2.000 punti in una Sfida', test: s => s.stats.record >= 2000 },
    { id: 'record-5000', icona: '👏', nome: 'Standing ovation', desc: '5.000 punti in una Sfida', test: s => s.stats.record >= 5000 },
    { id: 'giuste-100', icona: '📜', nome: 'Cento battute', desc: '100 risposte giuste', test: s => s.stats.giuste >= 100 },
    { id: 'giuste-1000', icona: '📚', nome: 'Mille battute', desc: '1.000 risposte giuste', test: s => s.stats.giuste >= 1000 },
    { id: 'eccezioni-25', icona: '🦉', nome: 'Occhio alle eccezioni', desc: 'Indovina 25 eccezioni', test: s => s.stats.eccezioni >= 25 },
    { id: 'perfetto', icona: '⭐', nome: 'Tre stelle', desc: 'Supera un livello senza errori', test: s => s.stats.livelliPerfetti >= 1 },
    { id: 'ripasso', icona: '🔁', nome: 'Ripasso perfetto', desc: 'Un ripasso degli errori tutto giusto (almeno 5 parole)', test: s => s.stats.ripassiPerfetti >= 1 },
    { id: 'duello', icona: '⚔️', nome: 'Primo duello vinto', desc: 'Vinci un duello online', test: s => s.stats.duelliVinti >= 1 },
    mondo('E', 'mondo della E'), mondo('O', 'mondo della O'), mondo('S', 'mondo della S'), mondo('Z', 'mondo della Z'),
    { id: 'livello-8', icona: '👑', nome: 'Primo attore', desc: 'Arriva al livello 8', test: s => livello(s.xp).n >= 8 },
  ];
}
// assegna i trofei nuovi e li restituisce
export function controllaTrofei(s, mondi, ora = Date.now()) {
  const nuovi = [];
  for (const t of trofei(mondi)) if (!s.trofei[t.id] && t.test(s)) { s.trofei[t.id] = ora; nuovi.push(t); }
  return nuovi;
}

// ---------- progressi salvati sul dispositivo prima degli account ----------
export function unisciLocale(s, { record = 0, percorso = {} } = {}) {
  s.stats.record = Math.max(s.stats.record, record || 0);
  for (const [k, v] of Object.entries(percorso || {})) s.percorso[k] = Math.max(s.percorso[k] || 0, v);
  return s;
}

// ---------- messaggio e umore della mascotte ----------
export function umore(s, oggi = dayKey()) {
  const st = streakInfo(s, oggi);
  const manca = Math.max(0, OBIETTIVO - st.oggi);
  if (st.stato === 'fatto') return { umore: 'felice', msg: st.corrente > 1 ? `Bravo! ${st.corrente} giorni di fila. Ci vediamo domani in scena!` : 'Obiettivo raggiunto! Torna domani per iniziare la streak.' };
  if (st.stato === 'rischio') return { umore: 'assonnata', msg: `La tua streak di ${st.corrente} ${st.corrente === 1 ? 'giorno' : 'giorni'} è a rischio! Ancora ${manca} risposte giuste oggi.` };
  if (st.stato === 'persa') return { umore: 'triste', msg: `Oh no, la streak di ${st.persa} ${st.persa === 1 ? 'giorno' : 'giorni'} si è interrotta. Ricominciamo? Servono ${manca} risposte giuste.` };
  return { umore: 'felice', msg: `Ciao! Fai ${OBIETTIVO} risposte giuste oggi per iniziare la tua streak.` };
}

// ---------- modifiche del docente ----------
// Ogni modifica è un'operazione con un id unico, salvata in /operazioni/{uid}/{id}.
// Il docente la applica subito ai progressi; il telefono del ragazzo la applica alla propria copia
// prima di salvare. opDocente ricorda le operazioni già applicate, così nessuna viene applicata due volte.
// op: { id, t, tipo: 'nome'|'gruppo'|'streak'|'xp'|'errori'|'reset', valore, motivo, ieri }
export function applicaOperazione(s, op) {
  s.opDocente = s.opDocente || {};
  if (!op || !op.id || s.opDocente[op.id]) return false;
  switch (op.tipo) {
    case 'nome': s.nome = String(op.valore || '').trim().slice(0, 20) || s.nome; break;
    case 'gruppo': s.gruppo = op.valore.id; s.gruppoNome = op.valore.nome || op.valore.id; break;
    case 'streak': {
      const n = Math.max(0, Math.min(3650, Math.round(+op.valore || 0)));
      s.streak.corrente = n;
      s.streak.ultimo = n > 0 ? op.ieri : null;          // "ieri" del docente: se oggi gioca, la streak continua
      s.streak.migliore = Math.max(s.streak.migliore, n);
      break;
    }
    case 'xp': {
      const n = Math.max(-100000, Math.min(100000, Math.round(+op.valore || 0)));
      s.xp = Math.max(0, s.xp + n);
      s.bonus = [...(s.bonus || []), { xp: n, motivo: String(op.motivo || '').slice(0, 80), t: op.t }].slice(-20);
      break;
    }
    case 'errori': s.errori = {}; break;
    case 'reset': {
      // tiene anche la memoria delle operazioni già applicate: altrimenti verrebbero riapplicate dopo l'azzeramento
      const keep = { nome: s.nome, gruppo: s.gruppo, gruppoNome: s.gruppoNome, guida: s.guida, creato: s.creato, opDocente: s.opDocente };
      const fresh = nuovoStato();
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, fresh, keep);
      break;
    }
    default: return false;
  }
  s.opDocente[op.id] = op.t || Date.now();
  return true;
}
export function descriviOperazione(op) {
  switch (op.tipo) {
    case 'nome': return `Il docente ha cambiato il tuo nome in classifica in “${op.valore}”.`;
    case 'gruppo': return `Il docente ti ha spostato nel gruppo “${op.valore.nome}”.`;
    case 'streak': return `Il docente ha ripristinato la tua streak: ${op.valore} ${+op.valore === 1 ? 'giorno' : 'giorni'}.`;
    case 'xp': return `${+op.valore >= 0 ? `Il docente ti ha dato ${op.valore} XP bonus` : `Il docente ha tolto ${-op.valore} XP`}${op.motivo ? `: ${op.motivo}` : ''}.`;
    case 'errori': return 'Il docente ha azzerato la tua lista di errori da ripassare.';
    case 'reset': return 'Il docente ha azzerato i tuoi progressi.';
    default: return '';
  }
}
