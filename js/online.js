// Classifiche e duelli online con Firebase Realtime Database (autenticazione anonima).
import { firebaseConfig } from './firebase-config.js';

export const enabled = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.databaseURL);
const V = '10.12.2';
let api = null;

async function init() {
  if (api) return api;
  if (!enabled) throw new Error('Classifica online non configurata');
  const [{ initializeApp }, A, D] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const cred = await A.signInAnonymously(auth);
  const db = D.getDatabase(app);
  let offset = 0;
  D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  api = { D, db, uid: cred.user.uid, now: () => Date.now() + offset };
  return api;
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

// ---------- duelli (2–8 giocatori) ----------
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export async function createRoom(nome) {
  const { D, db, uid } = await init();
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    const r = D.ref(db, `duelli/${code}`);
    const ok = await D.runTransaction(r, cur => cur ? undefined : {
      seed: Math.floor(Math.random() * 2 ** 31), stato: 'attesa', host: uid, creato: Date.now(),
      giocatori: { [uid]: { nome: String(nome).slice(0, 20), punti: 0, risposte: 0 } },
    });
    if (ok.committed) return code;
  }
  throw new Error('Non riesco a creare la stanza, riprova.');
}
export async function joinRoom(code, nome) {
  const { D, db, uid } = await init();
  code = code.toUpperCase().trim();
  const snap = await D.get(D.ref(db, `duelli/${code}`));
  if (!snap.exists()) throw new Error('Stanza non trovata');
  if (snap.val().stato !== 'attesa') throw new Error('La sfida è già iniziata');
  await D.set(D.ref(db, `duelli/${code}/giocatori/${uid}`), { nome: String(nome).slice(0, 20), punti: 0, risposte: 0 });
  return code;
}
export async function watchRoom(code, cb) {
  const { D, db, uid } = await init();
  return D.onValue(D.ref(db, `duelli/${code}`), s => cb(s.val(), uid));
}
export async function startRoom(code, secondi) {
  const { D, db, now } = await init();
  await D.update(D.ref(db, `duelli/${code}`), { stato: 'via', inizio: now() + 4000, durata: secondi });
}
export async function pushScore(code, punti, risposte) {
  const { D, db, uid } = await init();
  await D.update(D.ref(db, `duelli/${code}/giocatori/${uid}`), { punti, risposte });
}
export async function serverNow() { const { now } = await init(); return now(); }
