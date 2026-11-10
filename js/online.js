// Account (Google), progressi, classifiche e duelli online con Firebase Realtime Database.
import { firebaseConfig } from './firebase-config.js';
import { normalizza, applicaOperazione } from './progressi.js';

export const enabled = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.databaseURL);
const V = '10.12.2';
let core = null;

async function sdk() {
  if (core) return core;
  if (!enabled) throw new Error('Firebase non configurato');
  core = (async () => {
    const [{ initializeApp }, A, D] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    const auth = A.getAuth(app);
    await A.getRedirectResult(auth).catch(() => null);      // ritorno da un accesso con reindirizzamento
    await auth.authStateReady();
    // le vecchie sessioni anonime (versioni precedenti del sito) non valgono come account
    if (auth.currentUser && auth.currentUser.isAnonymous) await A.signOut(auth);
    const db = D.getDatabase(app);
    let offset = 0;
    D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
    return { A, D, auth, db, now: () => Date.now() + offset };
  })();
  return core;
}

// ---------- account Google ----------
export async function utente() {
  const c = await sdk();
  const u = c.auth.currentUser;
  return u ? { uid: u.uid, nome: u.displayName || '', foto: u.photoURL || '' } : null;
}
export async function entraConGoogle() {
  const { A, auth } = await sdk();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await A.signInWithPopup(auth, provider); }
  catch (e) {
    const code = e.code || '';
    if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(code)) { await A.signInWithRedirect(auth, provider); return; }
    if (/popup-closed-by-user|cancelled-popup-request/.test(code)) throw new Error('Accesso annullato.');
    if (/unauthorized-domain/.test(code)) throw new Error('Questo sito non è ancora autorizzato in Firebase (Domini autorizzati).');
    if (/operation-not-allowed/.test(code)) throw new Error('L’accesso con Google non è ancora attivo in Firebase.');
    throw new Error(e.message || code);
  }
}
export async function esci() { const { A, auth } = await sdk(); await A.signOut(auth); }

async function init() {
  const c = await sdk();
  const u = c.auth.currentUser;
  if (!u) throw new Error('Accedi con Google per giocare.');
  return { D: c.D, db: c.db, uid: u.uid, now: c.now };
}

// ---------- progressi del giocatore: /utenti/{uid} ----------
export async function caricaProgressi() {
  const { D, db, uid } = await init();
  const snap = await D.get(D.ref(db, `utenti/${uid}`));
  return snap.exists() ? snap.val() : null;
}
// data dell'eventuale eliminazione da parte del docente (i progressi più vecchi vanno scartati)
export async function caricaEliminazione() {
  const { D, db, uid } = await init();
  const snap = await D.get(D.ref(db, `eliminati/${uid}`));
  return snap.exists() ? snap.val() : null;
}
// modifiche del docente da applicare ai propri progressi (vedi progressi.js, applicaOperazione)
export async function caricaOperazioni() {
  const { D, db, uid } = await init();
  const snap = await D.get(D.ref(db, `operazioni/${uid}`));
  const ops = []; snap.forEach(c => { ops.push({ id: c.key, ...c.val() }); });
  return ops.sort((a, b) => (a.t || 0) - (b.t || 0));
}
export async function salvaProgressi(stato) {
  const { D, db, uid } = await init();
  await D.set(D.ref(db, `utenti/${uid}`), { ...stato, aggiornato: Date.now() });
}

export const clean = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'tutti';
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(); const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

// ---------- classifiche ----------
export async function submitScore(gruppo, nome, mode, punti) {
  const { D, db, uid } = await init();
  const r = D.ref(db, `classifiche/${clean(gruppo)}/${mode}/${weekKey()}/${uid}`);
  await D.runTransaction(r, cur => (!cur || cur.punti < punti) ? { nome: String(nome).slice(0, 20), punti, data: Date.now() } : undefined);
}
export async function topScores(gruppo, mode, week = weekKey()) {
  const { D, db, uid } = await init();
  const q = D.query(D.ref(db, `classifiche/${clean(gruppo)}/${mode}/${week}`), D.orderByChild('punti'), D.limitToLast(25));
  const snap = await D.get(q);
  const rows = [];
  snap.forEach(c => { rows.push({ ...c.val(), me: c.key === uid }); });
  return rows.sort((a, b) => b.punti - a.punti);
}

// ---------- duelli (2–8 giocatori, più partite nella stessa stanza) ----------
// duelli/{codice}: { seed, stato: 'attesa'|'via', round, host, inizio, durata,
//                    giocatori: { uid: { nome, punti (del round), totale (dei round precedenti), vinte, risposte, pronto } } }
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const nuovoSeme = () => Math.floor(Math.random() * 2 ** 31);
export async function createRoom(nome) {
  const { D, db, uid } = await init();
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    const r = D.ref(db, `duelli/${code}`);
    const ok = await D.runTransaction(r, cur => cur ? undefined : {
      seed: nuovoSeme(), stato: 'attesa', round: 1, host: uid, creato: Date.now(),
      giocatori: { [uid]: { nome: String(nome).slice(0, 20), punti: 0, totale: 0, vinte: 0, risposte: 0, pronto: true } },
    });
    if (ok.committed) return code;
  }
  throw new Error('Non riesco a creare la stanza, riprova.');
}
// entrare (o rientrare) in una stanza pronti per la prossima partita.
// Se l'ultima partita è finita, la stanza si prepara per una nuova partita con parole nuove.
export async function giocaAncora(code, nome) {
  const { D, db, uid, now } = await init();
  code = String(code).toUpperCase().trim();
  const t = now();
  let inCorso = false;
  const res = await D.runTransaction(D.ref(db, `duelli/${code}`), room => {
    if (!room) return room;
    if (room.stato === 'via') {
      if (t < (room.inizio || 0) + (room.durata || 60) * 1000 + 3000) { inCorso = true; return undefined; }
      // chiude il round: i punti si sommano al totale, chi ha fatto più punti vince il round
      const tutti = Object.values(room.giocatori || {});
      const giocato = tutti.filter(g => g.pronto);
      const max = Math.max(0, ...giocato.map(g => g.punti || 0));
      const primi = giocato.filter(g => max > 0 && (g.punti || 0) === max);
      for (const g of tutti) {
        g.totale = (g.totale || 0) + (g.punti || 0);
        if (primi.length === 1 && primi[0] === g) g.vinte = (g.vinte || 0) + 1;
        g.pronto = false; g.punti = 0; g.risposte = 0;
      }
      room.stato = 'attesa'; room.seed = nuovoSeme(); room.round = (room.round || 1) + 1;
    }
    room.giocatori = room.giocatori || {};
    if (!room.giocatori[uid] && Object.keys(room.giocatori).length >= 8) { inCorso = 'piena'; return undefined; }
    const prima = room.giocatori[uid] || {};
    room.giocatori[uid] = { ...prima, nome: String(nome).slice(0, 20), punti: 0, totale: prima.totale || 0, vinte: prima.vinte || 0, risposte: 0, pronto: true };
    if (!room.host || !room.giocatori[room.host]) room.host = uid;
    return room;
  });
  if (inCorso === 'piena') throw new Error('La stanza è piena (8 giocatori).');
  if (inCorso) throw new Error('C’è una partita in corso in questa stanza: riprova tra qualche secondo.');
  if (!res.committed || !res.snapshot.exists()) throw new Error('Stanza non trovata');
  return code;
}
export const joinRoom = giocaAncora;
export async function watchRoom(code, cb) {
  const { D, db, uid } = await init();
  return D.onValue(D.ref(db, `duelli/${code}`), s => cb(s.val(), uid));
}
// fa partire la partita (una sola volta, anche se più persone premono "Via!")
export async function startRoom(code, secondi) {
  const { D, db, now } = await init();
  const t = now();
  await D.runTransaction(D.ref(db, `duelli/${code}`), room => {
    if (!room) return room;
    if (room.stato !== 'attesa') return undefined;
    return { ...room, stato: 'via', inizio: t + 4000, durata: secondi };
  });
}
export async function esciStanza(code) {
  const { D, db, uid } = await init();
  await D.runTransaction(D.ref(db, `duelli/${code}`), room => {
    if (!room) return room;
    const g = { ...(room.giocatori || {}) };
    delete g[uid];
    const rimasti = Object.keys(g);
    if (!rimasti.length) return null;                     // ultimo che esce: la stanza si chiude
    return { ...room, giocatori: g, host: room.host === uid ? rimasti[0] : room.host };
  });
}
export async function pushScore(code, punti, risposte) {
  const { D, db, uid } = await init();
  await D.update(D.ref(db, `duelli/${code}/giocatori/${uid}`), { punti, risposte });
}
export async function serverNow() { const { now } = await init(); return now(); }

// ---------- gruppi prefissati (creati dall'admin) ----------
export async function listGroups() {
  const { D, db } = await init();
  const snap = await D.get(D.ref(db, 'gruppi'));
  const out = [];
  snap.forEach(c => { const g = c.val(); if (g && g.attivo !== false) out.push({ id: c.key, nome: g.nome || c.key }); });
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}

// ---------- admin: sessione separata (app Firebase con nome "admin") ----------
let adm = null;
async function initAdmin() {
  if (adm) return adm;
  if (!enabled) throw new Error('Firebase non configurato');
  const [{ initializeApp }, A, D] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig, 'admin');
  const auth = A.getAuth(app);
  await auth.authStateReady();
  adm = { A, D, auth, db: D.getDatabase(app) };
  return adm;
}
export async function adminUser() { const { auth } = await initAdmin(); const u = auth.currentUser; return u && !u.isAnonymous ? u.email : null; }
export async function adminLogin(email, password) {
  const { A, auth } = await initAdmin();
  try { await A.signInWithEmailAndPassword(auth, email.trim(), password); }
  catch (e) { throw new Error(/invalid|wrong|not-found|credential/.test(e.code || '') ? 'Email o password sbagliate' : (e.code || e.message)); }
}
export async function adminLogout() { const { A, auth } = await initAdmin(); await A.signOut(auth); }
export async function adminGroups() {
  const { D, db } = await initAdmin();
  const snap = await D.get(D.ref(db, 'gruppi'));
  const out = []; snap.forEach(c => { out.push({ id: c.key, ...c.val() }); });
  return out.sort((a, b) => (a.nome || a.id).localeCompare(b.nome || b.id, 'it'));
}
export async function adminSaveGroup(id, data) {
  const { D, db } = await initAdmin();
  await D.update(D.ref(db, `gruppi/${clean(id)}`), data);
}
export async function adminCreateGroup(nome) {
  const id = clean(nome);
  const { D, db } = await initAdmin();
  const r = D.ref(db, `gruppi/${id}`);
  if ((await D.get(r)).exists()) throw new Error('Esiste già un gruppo con questo nome');
  await D.set(r, { nome: String(nome).trim().slice(0, 40), attivo: true, creato: Date.now() });
  return id;
}
export async function adminDeleteGroup(id) {
  const { D, db } = await initAdmin();
  await D.remove(D.ref(db, `gruppi/${id}`));
  await D.remove(D.ref(db, `classifiche/${id}`));
}
export async function adminScores(gruppo, mode = 'sfida', week = weekKey()) {
  const { D, db } = await initAdmin();
  const snap = await D.get(D.ref(db, `classifiche/${gruppo}/${mode}/${week}`));
  const rows = []; snap.forEach(c => { rows.push({ uid: c.key, ...c.val() }); });
  return rows.sort((a, b) => b.punti - a.punti);
}
export async function adminDeleteScore(gruppo, uid, mode = 'sfida', week = weekKey()) {
  const { D, db } = await initAdmin();
  await D.remove(D.ref(db, `classifiche/${gruppo}/${mode}/${week}/${uid}`));
}

export async function adminRagazzi(gruppo) {
  const { D, db } = await initAdmin();
  const snap = await D.get(D.query(D.ref(db, 'utenti'), D.orderByChild('gruppo'), D.equalTo(gruppo)));
  const rows = []; snap.forEach(c => { rows.push({ uid: c.key, ...c.val() }); });
  return rows;
}

// il docente modifica i progressi di un ragazzo: registra l'operazione e la applica subito
export async function adminOperazione(uid, op) {
  const { D, db } = await initAdmin();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const full = { ...op, id, t: Date.now() };
  const { id: _, ...salvata } = full;
  await D.set(D.ref(db, `operazioni/${uid}/${id}`), salvata);
  const snap = await D.get(D.ref(db, `utenti/${uid}`));
  const stato = normalizza(snap.val());
  applicaOperazione(stato, full);
  await D.set(D.ref(db, `utenti/${uid}`), { ...stato, aggiornato: snap.val()?.aggiornato || Date.now() });
  return stato;
}
// aggiorna il nome nella classifica della settimana (se il ragazzo ha già un punteggio)
export async function adminRinominaClassifica(gruppo, uid, nome) {
  const { D, db } = await initAdmin();
  const r = D.ref(db, `classifiche/${gruppo}/sfida/${weekKey()}/${uid}`);
  if ((await D.get(r)).exists()) await D.update(r, { nome });
}

// il docente elimina un ragazzo: progressi, modifiche e tutti i suoi punteggi in classifica
export async function adminEliminaRagazzo(uid) {
  const { D, db } = await initAdmin();
  const upd = { [`utenti/${uid}`]: null, [`operazioni/${uid}`]: null, [`eliminati/${uid}`]: Date.now() };
  const cl = await D.get(D.ref(db, 'classifiche'));
  cl.forEach(g => g.forEach(m => m.forEach(w => { const v = w.val(); if (v && v[uid]) upd[`classifiche/${g.key}/${m.key}/${w.key}/${uid}`] = null; })));
  await D.update(D.ref(db), upd);
  return Object.keys(upd).filter(k => k.startsWith('classifiche/')).length;
}
