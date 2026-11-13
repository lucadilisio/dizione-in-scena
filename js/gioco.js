// Il gioco: Sfida a tempo, Duello (online o sullo stesso telefono), Percorso a livelli, Ripasso errori.
// Serve un account Google: progressi, streak e trofei sono salvati online (/utenti/{uid}).
import { explain, sGroups, zGroups, nuclei, stripAll } from './engine.js';
import { REGOLE, ATONE, DIFFICILI, OMOGRAFI, regolaById } from './rules.js';
import { store, colorize, esc, $ } from './app.js';
import * as online from './online.js';
import * as P from './progressi.js';
import { mascotte } from './mascotte.js';
import { componiLivello } from './livelli.js';

const DURATA = 60;
let POOL = null;            // domande per tipo
let POOL_BY_ID = null;      // id domanda -> domanda (per il ripasso degli errori)
let timers = [];
const clearTimers = () => { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; };
let unwatch = null;

// ---------- RNG con seme (stesse domande per tutti in un duello) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- costruzione delle domande dalle parole frequenti ----------
async function loadPool() {
  if (POOL) return POOL;
  const text = await (await fetch('data/frequenti.txt')).text();
  const pool = { eo: [], s: [], z: [], acc: [] };
  // parole dall'accento difficile: forma segnata (edìle). Nel dizionario le piane non hanno il segno,
  // quindi la posizione dell'accento va presa da qui, altrimenti la risposta giusta non esisterebbe.
  const diffForma = new Map(DIFFICILI.map(d => [stripAll(d.toLowerCase()), d.toLowerCase()]));
  const diff = new Set(diffForma.keys());
  const righe = text.split('\n');
  // parole che sono solo la versione senza accento di un'altra (cosi/così, perche/perché): ambigue, escluse
  const conAccento = new Set(righe.map(l => l.split('\t')[0]).filter(k => /[àèéìòóù]$/.test(k)).map(k => stripAll(k)));
  righe.forEach((line, rank) => {
    if (!line) return;
    const tab = line.indexOf('\t');
    const body = (tab >= 0 ? line.slice(tab + 1) : line).replace(/!$/, '');
    if (body.includes(';')) return;                       // omografi: ambigui, esclusi
    const [prim, ...rawVars] = body.split('~');
    // le varianti regionali (non registrate dal Wiktionary italiano) non rendono ambigua la domanda
    const vars = rawVars.filter(v => (v.split('@')[1] || '').includes('+')).map(v => v.split('@')[0]);
    const key = tab >= 0 ? line.slice(0, tab) : stripAll(prim);
    if (key.length < 3 || ATONE.has(key) || OMOGRAFI.has(key) || conAccento.has(key) || [...prim].length !== [...key].length) return;
    const same = i => vars.every(v => v[i] === prim[i]);
    const ex = explain(key, prim);
    const ruleAt = (feat, pos) => ex.find(r => r.feat === feat && r.pos === pos) || null;
    const nuc = nuclei(key);
    for (let i = 0; i < prim.length; i++) {
      if ('èéòó'.includes(prim[i]) && same(i) && nuc.length > 1) {
        pool.eo.push({ type: 'eo', key, prim, pos: i, rank, ans: 'èò'.includes(prim[i]) ? 'open' : 'closed', rule: ruleAt('v', i) });
      }
    }
    for (const g of sGroups(key)) if (same(g)) {
      const r = ruleAt('s', g);
      pool.s.push({ type: 's', key, prim, pos: g, rank, ans: prim[g] === 'ṡ' ? 'z' : 's', rule: r, easy: r && ['S1', 'S2', 'S3', 'S4', 'S5'].includes(r.id) });
    }
    for (const g of zGroups(key)) if (same(g)) {
      pool.z.push({ type: 'z', key, prim, pos: g, rank, ans: prim[g] === 'ż' ? 'z' : 's', rule: ruleAt('z', g) });
    }
    // accento: sdrucciole e parole difficili
    const df = diffForma.get(key);
    const accentata = df && df.length === prim.length ? df : prim;
    const st = [...accentata].findIndex(c => 'àèéìòóù'.includes(c));
    const after = st >= 0 ? nuc.filter(k => k > st).length : -1;
    if (st >= 0 && (after >= 2 || df) && nuc.length >= 3 && nuc.length <= 5 && (df || same(st))) {
      // un pulsante per vocale: nel gruppo di vocali che contiene l'accento (baùle, guaìna) il pulsante va sulla vocale accentata
      const opz = nuc.map(k => gruppoVocalico(key, k).includes(st) ? st : k);
      const mostra = [...prim].map((c, i) => i === st ? accentata[st] : c).join('');
      pool.acc.push({ type: 'acc', key, prim: mostra, pos: st, rank, ans: st, nuc: opz, rule: df ? { id: 'T3', ok: true } : null });
    }
  });
  POOL = pool;
  POOL_BY_ID = new Map();
  for (const list of Object.values(pool)) for (const q of list) POOL_BY_ID.set(P.idDomanda(q), q);
  return pool;
}

// posizioni del gruppo di vocali consecutive che contiene la posizione k (es. "au" in baule)
function gruppoVocalico(w, k) {
  const voc = c => 'aeiouàèéìòóù'.includes(c);
  let a = k, b = k;
  while (a > 0 && voc(w[a - 1])) a--;
  while (b + 1 < w.length && voc(w[b + 1])) b++;
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

// ---------- presentazione di una domanda ----------
function questionView(q) {
  const k = q.key;
  const hl = (from, to) => esc(k.slice(0, from)) + `<span class="hl">${esc(k.slice(from, to))}</span>` + esc(k.slice(to));
  if (q.type === 'eo') {
    const e = 'èé'.includes(q.prim[q.pos]);
    return { word: hl(q.pos, q.pos + 1), hint: `${e ? 'La E' : 'La O'} evidenziata è…`,
      options: e ? [['open', 'è', 'aperta'], ['closed', 'é', 'chiusa']] : [['open', 'ò', 'aperta'], ['closed', 'ó', 'chiusa']] };
  }
  if (q.type === 's') {
    let j = q.pos; while (k[j] === 's') j++;
    return { word: hl(q.pos, j), hint: 'La S evidenziata è…', options: [['s', 's', 'sorda (sole)'], ['z', 'ṡ', 'sonora (ṡbaglio)']] };
  }
  if (q.type === 'z') {
    let j = q.pos; while (k[j] === 'z') j++;
    return { word: hl(q.pos, j), hint: 'La Z evidenziata è…', options: [['s', 'z', 'sorda (zucca)'], ['z', 'ż', 'sonora (żèro)']] };
  }
  // accento: un bottone per ogni vocale accentabile
  return { word: esc(k), hint: 'Dove cade l’accento?', many: true,
    options: q.nuc.map(p => [p, k.slice(0, p) + k[p].toUpperCase() + k.slice(p + 1), '']) };
}

// sceglie la prossima domanda: difficoltà crescente con il numero di risposte
function picker(pool, rand, opts = {}) {
  const weights = opts.types || [['eo', 50], ['s', 18], ['z', 16], ['acc', 16]];
  const used = new Set();
  return n => {
    const maxRank = n < 6 ? 1500 : n < 15 ? 5000 : n < 25 ? 10000 : 20000;
    const allowExc = n >= 8;
    for (let tries = 0; tries < 200; tries++) {
      let r = rand() * weights.reduce((s, w) => s + w[1], 0), type = weights[0][0];
      for (const [t, w] of weights) { if ((r -= w) < 0) { type = t; break; } }
      const list = pool[type];
      const q = list[Math.floor(rand() * list.length)];
      if (!q || q.rank > maxRank || used.has(q.key + q.type + q.pos)) continue;
      if (!allowExc && q.rule && !q.rule.ok) continue;
      if (q.type === 's' && q.easy && rand() < 0.7) continue;     // le s "ovvie" più rare
      used.add(q.key + q.type + q.pos);
      return q;
    }
    return pool.eo[Math.floor(rand() * Math.min(2000, pool.eo.length))];
  };
}

function ruleLine(q) {
  if (!q.rule) return '';
  const R = regolaById(q.rule.id); if (!R) return '';
  return `<div class="small"><a class="rid" href="#teoria/${R.id}" target="_blank">${R.id}</a> ${esc(R.titolo)} ${q.rule.ok ? '' : '<span class="tag bad">eccezione!</span>'}</div>`;
}

// ---------- account e progressi ----------
let ME = null;            // { uid, nomeGoogle, s: stato dei progressi }
let saveTimer = null;
const mondiMap = () => { const m = {}; for (const l of livelli()) (m[l.mondo] = m[l.mondo] || []).push(l.id); return m; };
// applica le modifiche fatte dal docente (XP bonus, streak ripristinata, ecc.) e avvisa il ragazzo
async function applicaDocente() {
  let ops = [];
  try { ops = await online.caricaOperazioni(); } catch { return 0; }
  const fatte = ops.filter(op => P.applicaOperazione(ME.s, op));
  if (fatte.length) toast(fatte.map(op => esc(P.descriviOperazione(op))).join('<br>'), 'festa');
  return fatte.length;
}
function salva(subito = false) {
  clearTimeout(saveTimer);
  const go = async () => {
    try {
      // se nel frattempo il docente ha eliminato il ragazzo, non risalvare i vecchi progressi
      const el = await online.caricaEliminazione().catch(() => null);
      if (el && (ME.s.creato || 0) < el) {
        ME = null;
        toast('Il docente ha eliminato i tuoi progressi: ricominci da capo.', 'triste');
        const app = document.getElementById('app'); if (location.hash.startsWith('#gioco') && app) mount(app, '');
        return;
      }
      await applicaDocente(); await online.salvaProgressi(ME.s);
    }
    catch (e) { toast(`<b>Salvataggio non riuscito</b><br>${esc(e.message)}. Controlla la connessione.`); }
  };
  if (subito) return go();
  saveTimer = setTimeout(go, 1500);
}
async function caricaAccount() {
  const u = await online.utente();
  if (!u) return null;
  if (ME && ME.uid === u.uid) {
    const el = await online.caricaEliminazione().catch(() => null);
    if (!(el && (ME.s.creato || 0) < el)) { if (await applicaDocente()) await online.salvaProgressi(ME.s); return ME; }
    ME = null;      // eliminato dal docente mentre il gioco era aperto: si ricarica da capo
  }
  let dati = await online.caricaProgressi();
  // eliminato dal docente: i progressi più vecchi dell'eliminazione non valgono più
  const eliminato = await online.caricaEliminazione().catch(() => null);
  const scartati = !!(eliminato && dati && (dati.creato || 0) < eliminato);
  const ripartito = scartati || !!(eliminato && !dati);
  if (ripartito) {
    dati = null;
    for (const k of ['record', 'percorso', 'profilo', 'storico']) store.set(k, k === 'record' ? 0 : k === 'storico' ? [] : {});
  }
  const nuovo = !dati;
  const s = P.normalizza(dati || P.nuovoStato((u.nome || '').split(' ')[0].slice(0, 20)));
  if (nuovo) {
    // progressi salvati sul dispositivo prima degli account: non si perdono
    P.unisciLocale(s, { record: store.get('record', 0), percorso: store.get('percorso', {}) });
    const p = store.get('profilo', {});
    if (p.gruppo) { s.gruppo = p.gruppo; s.gruppoNome = p.gruppoNome || p.gruppo; }
  }
  ME = { uid: u.uid, nomeGoogle: u.nome, s };
  if (ripartito) toast('Il docente ha eliminato i tuoi progressi: ricominci da capo.', 'triste');
  if (nuovo) await online.salvaProgressi(s);
  else if (await applicaDocente()) await online.salvaProgressi(s);
  return ME;
}

// ripulisce la lista degli errori: voci salvate con la vecchia posizione sbagliata dell'accento ("edile|acc|-1")
// vengono collegate alla domanda giusta; quelle che non corrispondono più a nessuna domanda vengono tolte
function ripulisciErrori() {
  if (!ME || !POOL_BY_ID) return false;
  let cambiato = false;
  for (const [id, e] of Object.entries(ME.s.errori)) {
    if (POOL_BY_ID.has(id)) continue;
    const q = e.type === 'acc' ? POOL.acc.find(x => x.key === e.key) : null;
    if (q) { const nid = P.idDomanda(q); ME.s.errori[nid] = { ...e, pos: q.pos, prim: q.prim, ...(ME.s.errori[nid] || {}) }; }
    delete ME.s.errori[id]; cambiato = true;
  }
  return cambiato;
}

// notifiche brevi (trofei, obiettivo del giorno)
function toast(html, umore = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = (umore ? mascotte(umore, { size: 54 }) : '') + `<div>${html}</div>`;
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4700);
}

// registra ogni risposta nei progressi
function registra(q, ok) {
  if (!ME) return { xp: 0 };
  const ev = P.registraRisposta(ME.s, q, ok);
  if (ev.obiettivo) {
    const st = P.streakInfo(ME.s);
    toast(`<b>Obiettivo del giorno raggiunto!</b><br>🔥 Streak: ${st.corrente} ${st.corrente === 1 ? 'giorno' : 'giorni'}`, 'festa');
    salva();
  }
  return ev;
}
// chiude una partita: statistiche, XP extra, trofei, salvataggio. Ritorna il riepilogo dei premi
function chiudiPartita(info, xpRisposte) {
  if (!ME) return null;
  const livPrima = P.livello(ME.s.xp - xpRisposte);
  const ev = P.finePartita(ME.s, info);
  const trofei = P.controllaTrofei(ME.s, mondiMap());
  const livDopo = P.livello(ME.s.xp);
  if (trofei.length) toast(`<b>${trofei.length === 1 ? 'Nuovo trofeo!' : `${trofei.length} nuovi trofei!`}</b><br>${trofei.map(t => `${t.icona} ${esc(t.nome)}`).join(' · ')}`, 'festa');
  salva(true);
  return { xp: xpRisposte + ev.xp, record: ev.record, trofei, salito: livDopo.n > livPrima.n ? livDopo : null };
}
function premiHTML(r) {
  if (!r) return '';
  const st = P.streakInfo(ME.s);
  return `<div class="premi card">
    <div class="premi-row"><span class="premio">✨ <b>+${r.xp}</b> XP</span>
      <span class="premio">🔥 Obiettivo di oggi: <b>${Math.min(st.oggi, st.obiettivo)}/${st.obiettivo}</b></span>
      ${r.salito ? `<span class="premio up">⬆️ Livello ${r.salito.n}: <b>${esc(r.salito.titolo)}</b></span>` : ''}</div>
    ${r.trofei.length ? `<div class="premi-trofei">${r.trofei.map(t => `<span class="trofeo-new">${t.icona} ${esc(t.nome)}</span>`).join('')}</div>` : ''}
  </div>`;
}

// ---------- motore di una partita (usato da tutte le modalità) ----------
// cfg: { seconds | count, next(n) -> q, onEnd(result), onScore(punti, n), title, startAt, registra: bool }
function playRound(root, cfg) {
  clearTimers();
  let punti = 0, n = 0, giuste = 0, combo = 0, comboMax = 0, mult = 1, xp = 0, errori = [], locked = false, q = null, endAt = 0;
  const conta = cfg.registra !== false;
  root.innerHTML = `<div class="play">
    <div class="hud"><span>${esc(cfg.title || '')}</span><span class="timer" id="tm"></span><span><span id="pt">0</span> pt</span></div>
    <div class="timerbar"><div id="tb" style="width:100%"></div></div>
    <div id="opp" class="small muted"></div>
    <div class="qword" id="qw"></div><div class="qhint" id="qh"></div>
    <div class="answers" id="ans"></div>
    <div class="feedback" id="fb"></div></div>`;
  const show = () => {
    q = cfg.next(n);
    const v = questionView(q);
    const qw = $('#qw', root);
    qw.innerHTML = v.word;
    // parole lunghe: testo più piccolo, così restano su una riga anche sul telefono
    qw.className = 'qword' + (q.key.length > 15 ? ' lunghissima' : q.key.length > 10 ? ' lunga' : '');
    $('#qh', root).textContent = v.hint;
    const ans = $('#ans', root);
    ans.className = 'answers' + (v.many ? ' many' : '');
    ans.innerHTML = v.options.map(([val, big, small]) => `<button class="ans" data-v="${val}">${esc(big)}${small ? `<small>${esc(small)}</small>` : ''}</button>`).join('');
    $('#fb', root).classList.add('old');
    locked = false;
  };
  const answer = (btn) => {
    if (locked) return; locked = true;
    const val = btn.dataset.v;
    const ok = String(q.ans) === val;
    n++;
    const ev = conta ? registra(q, ok) : { xp: 0 };
    xp += ev.xp;
    const fb = $('#fb', root); fb.classList.remove('old');
    if (ok) {
      giuste++; combo++; comboMax = Math.max(comboMax, combo); if (combo % 3 === 0 && mult < 5) mult++;
      const gain = (100 + (q.rule && !q.rule.ok ? 50 : 0)) * mult;
      punti += gain;
      btn.classList.add('ok');
      fb.innerHTML = `<b style="color:var(--ok)">+${gain}</b> ${mult > 1 ? `<span class="combo">combo ×${mult}</span>` : ''} ${ev.xp ? `<span class="xp">+${ev.xp} XP</span>` : ''}<div style="font:1.4rem var(--serif)">${colorize(q.prim)}</div>`;
    } else {
      combo = 0; mult = 1;
      btn.classList.add('bad');
      root.querySelector(`.ans[data-v="${q.ans}"]`)?.classList.add('ok');
      errori.push(q);
      fb.innerHTML = `<div style="font:1.4rem var(--serif)">${colorize(q.prim)}</div>${ruleLine(q)}`;
    }
    $('#pt', root).textContent = punti;
    if (cfg.onScore) cfg.onScore(punti, n);
    if (cfg.count && n >= cfg.count) { timers.push(setTimeout(end, ok ? 700 : 1600)); return; }
    timers.push(setTimeout(show, ok ? 550 : 1500));
  };
  const end = () => {
    clearTimers(); locked = true;
    cfg.onEnd({ punti, n, giuste, errori, comboMax, xp });
  };
  $('#ans', root).addEventListener('click', e => { const b = e.target.closest('.ans'); if (b) answer(b); });
  const begin = () => {
    show();
    if (cfg.seconds) {
      endAt = Date.now() + cfg.seconds * 1000;
      timers.push(setInterval(() => {
        const left = Math.max(0, endAt - Date.now());
        $('#tm', root).textContent = Math.ceil(left / 1000);
        $('#tb', root).style.width = (left / (cfg.seconds * 1000) * 100) + '%';
        if (left <= 0) end();
      }, 100));
    } else {
      $('#tm', root).textContent = '';
      timers.push(setInterval(() => { $('#tb', root).style.width = (100 - n / cfg.count * 100) + '%'; }, 200));
    }
  };
  const startAt = cfg.startAt || Date.now() + 3000;
  const cd = setInterval(() => {
    const left = Math.ceil((startAt - Date.now()) / 1000);
    if (left > 0) { $('#qw', root).textContent = left; $('#qh', root).textContent = 'Pronti…'; }
    else { clearInterval(cd); begin(); }
  }, 100);
  timers.push(cd);
}

// ---------- ingresso nella sezione: accesso, primo avvio, guida ----------
export async function mount(app, sub) {
  clearTimers(); if (unwatch) { unwatch(); unwatch = null; }
  if (!online.enabled) { app.innerHTML = '<div class="play"><h1>Gioco</h1><p>Il gioco richiede la configurazione di Firebase (vedi README).</p></div>'; return; }
  app.innerHTML = '<div class="loading">Preparo il palcoscenico…</div>';
  let acc;
  try { [acc] = await Promise.all([caricaAccount(), loadPool()]); }
  catch (e) { app.innerHTML = `<div class="play"><h1>Gioco</h1><p style="color:var(--bad)">Non riesco a collegarmi (${esc(e.message)}). Controlla la connessione e ricarica la pagina.</p></div>`; return; }
  if (!acc) return login(app);
  if (ripulisciErrori()) salva();
  if (!ME.s.nome || !ME.s.gruppo) return benvenuto(app, sub);
  if (!ME.s.guida && sub !== 'guida') return guida(app, true);
  if (sub === 'sfida') return sfida(app);
  if (sub === 'duello') return duello(app);
  if (sub === 'percorso') return percorso(app);
  if (sub === 'ripasso') return ripasso(app);
  if (sub === 'profilo') return profilo(app);
  if (sub === 'guida') return guida(app, false);
  return menu(app);
}

function login(app, err = '') {
  app.innerHTML = `<div class="play login">
    <h1>Gioco</h1>
    ${mascotte('felice', { size: 130, msg: 'Ciao! Sono Masca. Entra con il tuo account Google: così streak, trofei e progressi restano salvati, anche se cambi telefono.' })}
    <button class="btn primary big google-btn" id="google"><span class="g">G</span> Entra con Google</button>
    <p class="small" style="color:var(--bad)" id="err">${esc(err)}</p>
    <div class="card small muted" style="text-align:left">
      <b>Cosa salviamo:</b> il nome che scegli (puoi cambiarlo quando vuoi), il tuo gruppo e i risultati del gioco. L’email resta nel sistema di accesso di Google/Firebase e non compare nel gioco.
      Il docente del tuo gruppo vede un riepilogo dei tuoi progressi.<br><br>
      Testo libero, Copione e Teoria funzionano anche senza account.
    </div></div>`;
  $('#google', app).addEventListener('click', async () => {
    $('#google', app).disabled = true; $('#err', app).textContent = '';
    try { await online.entraConGoogle(); ME = null; mount(app, location.hash.split('/')[1] || ''); }
    catch (e) { login(app, e.message); }
  });
}

// primo avvio: nome visibile in classifica + gruppo
async function benvenuto(app, sub) {
  const s = ME.s;
  app.innerHTML = `<div class="play">
    ${mascotte('festa', { size: 110, msg: 'Benvenuto in compagnia! Scegli come ti chiamerai in classifica e il tuo gruppo.' })}
    <form class="card form-grid" id="f" style="margin-top:16px;text-align:left">
      <label class="field"><span>Nome in classifica</span><input class="text" id="nome" maxlength="20" required value="${esc(s.nome)}" placeholder="Es. Giulia R."></label>
      <label class="field"><span>Gruppo</span><select class="text" id="gruppo" required><option value="">Caricamento…</option></select></label>
      <p class="small muted" style="grid-column:1/-1;margin:0">Consiglio: solo nome e iniziale del cognome. Se il tuo gruppo non c’è, chiedi al docente.</p>
      <button class="btn primary big" type="submit" style="grid-column:1/-1">Continua</button>
    </form></div>`;
  await riempiGruppi($('#gruppo', app), s.gruppo);
  $('#f', app).addEventListener('submit', async e => {
    e.preventDefault();
    const sel = $('#gruppo', app);
    s.nome = $('#nome', app).value.trim().slice(0, 20);
    s.gruppo = sel.value; s.gruppoNome = sel.selectedOptions[0]?.textContent || sel.value;
    if (!s.nome || !s.gruppo) return;
    await salva(true);
    mount(app, sub);
  });
}
async function riempiGruppi(sel, attuale) {
  try {
    const gruppi = await online.listGroups();
    sel.innerHTML = gruppi.length
      ? `<option value="">— scegli —</option>` + gruppi.map(g => `<option value="${esc(g.id)}" ${g.id === attuale ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')
      : '<option value="">Nessun gruppo: chiedi al docente</option>';
  } catch { sel.innerHTML = '<option value="">Gruppi non disponibili</option>'; }
}

// intestazione: mascotte, streak, obiettivo, livello
function testata() {
  const s = ME.s, st = P.streakInfo(s), lv = P.livello(s.xp), m = P.umore(s);
  const pct = Math.min(100, Math.round(st.oggi / st.obiettivo * 100));
  return `<div class="testata card">
    ${mascotte(m.umore, { size: 104, msg: m.msg })}
    <div class="testata-dati">
      <div class="td-riga"><span class="fiamma ${st.stato === 'fatto' ? 'accesa' : ''}">🔥</span> <b>${st.corrente}</b> ${st.corrente === 1 ? 'giorno' : 'giorni'} di streak <span class="muted small">· record ${st.migliore}</span></div>
      <div class="td-label small">Obiettivo di oggi: <b>${Math.min(st.oggi, st.obiettivo)}/${st.obiettivo}</b> risposte giuste ${st.stato === 'fatto' ? '✅' : ''}</div>
      <div class="barra"><div style="width:${pct}%"></div></div>
      <div class="td-label small">Livello <b>${lv.n} · ${esc(lv.titolo)}</b> <span class="muted">${s.xp} XP${lv.a ? ` / ${lv.a}` : ''}</span></div>
      <div class="barra xp"><div style="width:${lv.pct}%"></div></div>
    </div></div>`;
}

function menu(app) {
  const s = ME.s;
  const nErr = Object.keys(s.errori).length;
  const nTrofei = Object.keys(s.trofei).length, totTrofei = P.trofei(mondiMap()).length;
  app.innerHTML = `
    <div class="gioco-head">
      <h1>Gioco</h1>
      <div class="gh-right"><span class="small">Ciao, <b>${esc(s.nome)}</b> · ${esc(s.gruppoNome || s.gruppo)}</span>
        <div class="gh-btns"><a class="btn" href="#gioco/profilo">👤 Profilo</a><a class="btn" href="#gioco/guida">❓ Come si gioca</a></div></div>
    </div>
    ${testata()}
    <div class="modes">
      <a class="card mode" href="#gioco/sfida"><div class="emoji">⏱️</div><h3>Sfida a tempo</h3><p class="muted">60 secondi: più rispondi giusto di fila, più sale la combo. Il tuo record: <b>${s.stats.record}</b></p></a>
      <a class="card mode" href="#gioco/percorso"><div class="emoji">🗺️</div><h3>Percorso a livelli</h3><p class="muted">Un livello per ogni regola, con le sue eccezioni. Stelle: <b>${Object.values(s.percorso).reduce((a, b) => a + b, 0)}</b></p></a>
      <a class="card mode ${nErr ? '' : 'disabled'}" href="${nErr ? '#gioco/ripasso' : '#gioco'}"><div class="emoji">🔁</div><h3>Ripasso errori</h3><p class="muted">${nErr === 1 ? 'Ripassa la parola che hai sbagliato: quando la indovini esce dalla lista.' : nErr ? `Ripassa le <b>${nErr}</b> parole che hai sbagliato. Quando le indovini escono dalla lista.` : 'Nessun errore da ripassare: complimenti!'}</p></a>
      <a class="card mode" href="#gioco/duello"><div class="emoji">⚔️</div><h3>Duello</h3><p class="muted">Stesse parole, stesso tempo: vince chi fa più punti. Online con un codice stanza, fino a 8 giocatori.</p></a>
    </div>
    <a class="card trofei-link" href="#gioco/profilo"><span>🏆 Trofei: <b>${nTrofei}</b> / ${totTrofei}</span><span class="muted small">Vedi il profilo →</span></a>
    <div id="lb" style="margin-top:20px"></div>`;
  showLeaderboard($('#lb', app), 'sfida');
}

async function showLeaderboard(box, mode) {
  const s = ME.s;
  box.innerHTML = '<div class="card"><h3>Classifica della settimana</h3><p class="muted">Carico…</p></div>';
  try {
    const rows = await online.topScores(s.gruppo, mode);
    box.innerHTML = `<div class="card"><h3>Classifica della settimana · ${esc(s.gruppoNome || s.gruppo)}</h3>${rows.length ? `<table class="lb"><tr><th>#</th><th>Nome</th><th>Punti</th></tr>${rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(r.nome)}</td><td><b>${r.punti}</b></td></tr>`).join('')}</table>` : '<p class="muted">Ancora nessun punteggio questa settimana: sii il primo!</p>'}</div>`;
  } catch (e) { box.innerHTML = `<p class="small muted">Classifica non disponibile (${esc(e.message)}).</p>`; }
}

// ---------- Sfida a tempo ----------
function sfida(app) {
  const next = picker(POOL, rng(Math.floor(Math.random() * 2 ** 31)));
  playRound(app, {
    title: '⏱️ Sfida', seconds: DURATA, next,
    onEnd: async res => {
      const premi = chiudiPartita({ modo: 'sfida', punti: res.punti, comboMax: res.comboMax, giuste: res.giuste, n: res.n }, res.xp);
      endScreen(app, res, premi, 'sfida', () => sfida(app));
      try { await online.submitScore(ME.s.gruppo, ME.s.nome, 'sfida', res.punti); showLeaderboard($('#lb2', app), 'sfida'); } catch { /* offline */ }
    },
  });
}

function endScreen(app, res, premi, mode, again, extra = '') {
  const acc = res.n ? Math.round(res.giuste / res.n * 100) : 0;
  const errs = res.errori.slice(0, 12).map(q => `<li><span style="font:1.15rem var(--serif)">${colorize(q.prim)}</span> ${q.rule ? `<a class="rid" href="#teoria/${q.rule.id}">${q.rule.id}</a>` : ''}</li>`).join('');
  app.innerHTML = `<div class="play">
    <h1>${premi && premi.record ? '🏆 Nuovo record!' : 'Tempo scaduto!'}</h1>
    <div class="qword">${res.punti} <span style="font-size:.5em">punti</span></div>
    <p>${res.giuste} giuste su ${res.n} · precisione ${acc}%</p>
    ${premiHTML(premi)}
    ${extra}
    <div class="cta"><button class="btn primary big" id="again">Rigioca</button><a class="btn big" href="#gioco">Menu</a></div>
    ${errs ? `<div class="card" style="text-align:left"><h3>Da ripassare</h3><p class="small muted">Le trovi anche in “Ripasso errori”.</p><ul class="rulelist">${errs}</ul></div>` : ''}
    <div id="lb2" style="margin-top:16px;text-align:left"></div></div>`;
  $('#again', app).addEventListener('click', again);
}

// ---------- Ripasso errori ----------
function ripasso(app) {
  const errori = Object.entries(ME.s.errori).map(([id, e]) => ({ id, ...e }));
  const qs = errori.map(e => POOL_BY_ID.get(e.id)).filter(Boolean);
  if (!qs.length) { location.hash = '#gioco'; return; }
  const rand = rng(Math.floor(Math.random() * 2 ** 31));
  const seq = qs.map(q => [rand() - (ME.s.errori[P.idDomanda(q)].n || 1), q]).sort((a, b) => a[0] - b[0]).slice(0, 10).map(x => x[1]);
  playRound(app, {
    title: '🔁 Ripasso', count: seq.length, next: n => seq[n],
    onEnd: res => {
      const premi = chiudiPartita({ modo: 'ripasso', giuste: res.giuste, n: res.n, comboMax: res.comboMax }, res.xp);
      const rimaste = Object.keys(ME.s.errori).length;
      endScreen(app, res, premi, 'ripasso', () => ripasso(app),
        `<p>${rimaste ? `${rimaste === 1 ? 'Resta <b>1</b> parola' : `Restano <b>${rimaste}</b> parole`} da ripassare. Ogni parola esce dalla lista quando la indovini abbastanza volte.` : '🎉 Hai ripassato tutto!'}</p>`);
      $('#app h1').textContent = res.giuste === res.n ? '🎉 Ripasso perfetto!' : 'Ripasso finito';
    },
  });
}

// ---------- Duello ----------
function duello(app) {
  app.innerHTML = `<div class="play">
    <h1>⚔️ Duello</h1>
    <div class="card" style="margin-bottom:14px">
      <h3>Online</h3>
      <p class="muted small">Crea una stanza e fai entrare gli altri con il codice (fino a 8 giocatori). Conta per i tuoi progressi.</p>
      <div class="row" style="justify-content:center"><button class="btn primary" id="crea">Crea stanza</button></div>
      <div class="row" style="justify-content:center;margin-top:10px"><input class="text" id="cod" maxlength="4" placeholder="CODICE" style="text-transform:uppercase;width:140px;text-align:center"><button class="btn" id="entra">Entra</button></div>
      <p id="err" class="small" style="color:var(--bad)"></p>
    </div>
    <div class="card">
      <h3>Sullo stesso telefono</h3>
      <p class="muted small">Due giocatori, stesse parole, 45 secondi a testa. Passate il telefono a metà. Non conta per i progressi dell’account.</p>
      <div class="row" style="justify-content:center"><input class="text" id="g1" placeholder="Giocatore 1" value="${esc(ME.s.nome)}"><input class="text" id="g2" placeholder="Giocatore 2"></div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn primary" id="locale">Inizia</button></div>
    </div>
    <div class="cta"><a class="btn" href="#gioco">← Menu</a></div></div>`;
  $('#locale', app).addEventListener('click', () => duelloLocale(app, $('#g1', app).value.trim() || 'Giocatore 1', $('#g2', app).value.trim() || 'Giocatore 2'));
  $('#crea', app).addEventListener('click', async () => { try { stanza(app, await online.createRoom(ME.s.nome)); } catch (e) { $('#err', app).textContent = e.message; } });
  $('#entra', app).addEventListener('click', async () => { try { stanza(app, await online.joinRoom($('#cod', app).value, ME.s.nome)); } catch (e) { $('#err', app).textContent = e.message; } });
}

function duelloLocale(app, n1, n2) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const res = [];
  const turno = (i) => {
    const nome = i === 0 ? n1 : n2;
    app.innerHTML = `<div class="play"><h1>Tocca a ${esc(nome)}</h1>${i === 1 ? `<p>${esc(n1)} ha fatto <b>${res[0].punti}</b> punti. Passa il telefono!</p>` : ''}<button class="btn primary big" id="via">Sono pronto</button></div>`;
    $('#via', app).addEventListener('click', () => playRound(app, {
      title: nome, seconds: 45, next: picker(POOL, rng(seed)), registra: false,
      onEnd: r => { res.push(r); if (i === 0) turno(1); else fine(); },
    }));
  };
  const fine = () => {
    const [a, b] = res; const win = a.punti === b.punti ? 'Pareggio!' : `Vince ${esc(a.punti > b.punti ? n1 : n2)}!`;
    app.innerHTML = `<div class="play"><h1>🏆 ${win}</h1><table class="lb"><tr><td>${esc(n1)}</td><td><b>${a.punti}</b> pt</td><td>${a.giuste}/${a.n}</td></tr><tr><td>${esc(n2)}</td><td><b>${b.punti}</b> pt</td><td>${b.giuste}/${b.n}</td></tr></table>
      <div class="cta"><button class="btn primary big" id="rv">Rivincita</button><a class="btn big" href="#gioco">Menu</a></div></div>`;
    $('#rv', app).addEventListener('click', () => duelloLocale(app, n1, n2));
  };
  turno(0);
}

async function stanza(app, code) {
  let lastRoom = null, myUid = null;
  let vista = 'lobby';          // 'lobby' (sala d'attesa) | 'gioco' | 'risultati'
  let roundGiocato = 0;         // ultimo round giocato da me
  let roundPremiato = 0;        // round per cui ho già ricevuto XP e trofei
  let fotoRound = [];           // punteggi dell'ultimo round giocato (prima che una rivincita li azzeri)
  const lista = room => Object.entries((room && room.giocatori) || {}).map(([id, g]) => ({ id, punti: 0, totale: 0, vinte: 0, ...g }));
  const tot = g => (g.totale || 0) + (g.punti || 0);
  const medaglia = i => ['🥇', '🥈', '🥉'][i] || i + 1;
  // classifica: punti del round, totale della stanza, round vinti
  // nei risultati il round appena finito conta già tra i round vinti (in archivio entra alla rivincita)
  const tabella = (players, uid) => {
    const max = Math.max(0, ...players.map(g => g.punti || 0));
    const primi = players.filter(g => max > 0 && (g.punti || 0) === max);
    const vinte = g => (g.vinte || 0) + (primi.length === 1 && primi[0] === g ? 1 : 0);
    return `<table class="lb duello-lb"><tr><th>#</th><th>Nome</th><th>Round</th><th>Totale</th><th title="Round vinti">🏆</th></tr>
    ${players.map((g, i) => `<tr class="${g.id === uid ? 'me' : ''}"><td>${medaglia(i)}</td><td>${esc(g.nome)}</td><td><b>${g.punti || 0}</b></td><td>${tot(g)}</td><td>${vinte(g)}</td></tr>`).join('')}</table>
    <p class="small muted" style="text-align:left">Round: punti di questa partita · Totale: tutte le partite giocate in questa stanza · 🏆 round vinti${primi.length > 1 ? ' · questo round è finito in pareggio' : ''}.</p>`;
  };

  const lobby = (room, uid) => {
    const pl = lista(room).sort((a, b) => tot(b) - tot(a));
    const pronti = pl.filter(g => g.pronto);
    const io = room.giocatori[uid] || {};
    const hostPronto = room.giocatori[room.host] && room.giocatori[room.host].pronto;
    const puoPartire = io.pronto && (room.host === uid || !hostPronto);
    app.innerHTML = `<div class="play"><h1>Stanza ${room.round > 1 ? `· partita ${room.round}` : ''}</h1>
      <p>Codice da condividere:</p><div class="code">${code}</div>
      <div class="card" style="margin:14px 0;text-align:left"><h3>Giocatori (${pl.length}/8)</h3>
        <table class="lb"><tr><th>Nome</th><th></th>${room.round > 1 ? '<th>Totale</th><th title="Round vinti">🏆</th>' : ''}</tr>
        ${pl.map(g => `<tr class="${g.id === uid ? 'me' : ''}"><td>🎭 ${esc(g.nome)}${g.id === room.host ? ' <span class="tag">host</span>' : ''}</td>
          <td>${g.pronto ? '<span class="tag ok">✓ pronto</span>' : '<span class="small muted">guarda i risultati…</span>'}</td>
          ${room.round > 1 ? `<td>${tot(g)}</td><td>${g.vinte || 0}</td>` : ''}</tr>`).join('')}</table></div>
      ${puoPartire ? `<button class="btn primary big" id="via" ${pronti.length < 2 ? 'disabled' : ''}>Via!</button>
        <p class="small muted">${pronti.length < 2 ? 'Serve almeno un altro giocatore pronto.' : `Giocano i ${pronti.length} giocatori pronti.`}</p>`
        : '<p class="muted">In attesa che l’host faccia partire la sfida…</p>'}
      <div class="cta"><button class="btn" id="esci">Esci dalla stanza</button></div></div>`;
    $('#via', app)?.addEventListener('click', e => { e.target.disabled = true; online.startRoom(code, DURATA); });
    $('#esci', app).addEventListener('click', esci);
  };

  const gioca = (room, uid) => {
    vista = 'gioco'; roundGiocato = room.round || 1;
    const round = roundGiocato;
    online.serverNow().then(now => {
      playRound(app, {
        title: `⚔️ ${code}${round > 1 ? ` · ${round}` : ''}`, seconds: room.durata || DURATA, startAt: Date.now() + (room.inizio - now), next: picker(POOL, rng(room.seed)),
        onScore: (punti, n) => { online.pushScore(code, punti, n); },
        onEnd: r => {
          online.pushScore(code, r.punti, r.n);
          vista = 'risultati';
          app.innerHTML = `<div class="play"><h1>Fine della partita ${round > 1 ? round : ''}</h1>
            <div id="classifica"></div><div id="premi-duello"></div><p id="rivincita-info" class="small"></p>
            <div class="cta"><button class="btn primary big" id="ancora">🔁 Gioca ancora</button><button class="btn big" id="esci">Esci dalla stanza</button></div></div>`;
          $('#ancora', app).addEventListener('click', ancora);
          $('#esci', app).addEventListener('click', esci);
          render(lastRoom, uid);
          // aspetta gli ultimi punteggi degli altri prima di decidere chi ha vinto il round
          setTimeout(() => {
            if (roundPremiato >= round) return;
            roundPremiato = round;
            const base = lastRoom && (lastRoom.round || 1) === round ? lista(lastRoom) : fotoRound;
            const pl = base.filter(g => g.pronto || g.id === uid).map(g => g.id === uid ? { ...g, punti: r.punti } : g);
            const max = Math.max(...pl.map(g => g.punti || 0));
            const vinto = r.punti > 0 && r.punti === max && pl.filter(g => (g.punti || 0) === max).length === 1;
            const premi = chiudiPartita({ modo: 'duello', vinto, comboMax: r.comboMax, giuste: r.giuste, n: r.n }, r.xp);
            const box = document.getElementById('premi-duello');
            if (box) box.innerHTML = (vinto ? '<h2>🏆 Hai vinto il round!</h2>' : '') + premiHTML(premi);
          }, 2500);
        },
      });
    });
  };

  async function ancora() {
    const b = $('#ancora', app); if (b) b.disabled = true;
    try { await online.giocaAncora(code, ME.s.nome); vista = 'lobby'; render(lastRoom, myUid); }
    catch (e) { const info = document.getElementById('rivincita-info'); if (info) { info.textContent = e.message; info.style.color = 'var(--bad)'; } if (b) b.disabled = false; }
  }
  async function esci() {
    if (unwatch) { unwatch(); unwatch = null; }
    try { await online.esciStanza(code); } catch { /* già uscito */ }
    location.hash = '#gioco';
  }

  const render = (room, uid) => {
    myUid = uid;
    if (!room) { if (vista !== 'risultati') app.innerHTML = '<div class="play"><h1>Stanza chiusa</h1><div class="cta"><a class="btn" href="#gioco">← Menu</a></div></div>'; return; }
    const io = (room.giocatori || {})[uid];
    if (roundGiocato && (room.round || 1) === roundGiocato && room.stato === 'via') fotoRound = lista(room);
    // parte una nuova partita a cui sono pronto
    if (room.stato === 'via' && io && io.pronto && (room.round || 1) !== roundGiocato && vista !== 'gioco') return gioca(room, uid);
    if (vista === 'lobby') {
      if (room.stato === 'attesa') return lobby(room, uid);
      app.innerHTML = '<div class="play"><h1>Partita in corso</h1><p class="muted">Aspetta la fine: poi potrai unirti alla prossima.</p><div class="cta"><button class="btn" id="esci">Esci dalla stanza</button></div></div>';
      $('#esci', app).addEventListener('click', esci);
      return;
    }
    const pl = lista(room).sort((a, b) => (b.punti || 0) - (a.punti || 0));
    if (vista === 'gioco') {
      const opp = document.getElementById('opp');
      if (opp) opp.innerHTML = pl.filter(g => g.id !== uid && g.pronto).map(g => `${esc(g.nome)}: <b>${g.punti || 0}</b>`).join(' · ');
      return;
    }
    // risultati: classifica del round appena giocato (finché nessuno riparte) e avvisi di rivincita
    const c = document.getElementById('classifica');
    if (c && !(room.round > roundGiocato)) c.innerHTML = tabella(pl.filter(g => g.pronto), uid);
    const info = document.getElementById('rivincita-info');
    if (info && room.round > roundGiocato) {
      const pronti = pl.filter(g => g.pronto && g.id !== uid).map(g => esc(g.nome));
      info.style.color = '';
      info.innerHTML = room.stato === 'attesa'
        ? `🔁 ${pronti.length ? `<b>${pronti.join(', ')}</b> ${pronti.length === 1 ? 'vuole' : 'vogliono'} giocare ancora: premi “Gioca ancora”.` : 'Si sta preparando un’altra partita.'}`
        : '⏳ È iniziata un’altra partita: premi “Gioca ancora” per la prossima.';
    }
  };
  app.innerHTML = '<div class="loading">Entro nella stanza…</div>';
  unwatch = await online.watchRoom(code, (room, uid) => { lastRoom = room; render(room, uid); });
}

// ---------- Percorso a livelli ----------
const MONDI = [
  { id: 'E', titolo: 'Il mondo della E', tipo: 'eo' },
  { id: 'O', titolo: 'Il mondo della O', tipo: 'eo' },
  { id: 'S', titolo: 'Il mondo della S', tipo: 's' },
  { id: 'Z', titolo: 'Il mondo della Z', tipo: 'z' },
  { id: 'T', titolo: 'Accenti difficili', tipo: 'acc' },
];
let LIVELLI = null;
function livelli() {
  if (LIVELLI) return LIVELLI;
  const out = [];
  for (const m of MONDI) {
    const rules = REGOLE.filter(r => r.cat === m.id && (r.re || r.difficili) && !r.tendenza);
    for (const r of rules) {
      let qs = POOL[m.tipo].filter(q => q.rule && q.rule.id === r.id);
      if (m.tipo === 'eo') qs = qs.filter(q => (m.id === 'E' ? 'èé' : 'òó').includes(q.prim[q.pos]));
      const regolari = qs.filter(q => q.rule.ok), ecc = qs.filter(q => !q.rule.ok);
      if (regolari.length < 5) continue;
      // parole di confronto: stessa lettera, risposta opposta, da altre regole (non eccezioni)
      const ans = String(regolari[0].ans);
      const contrasto = m.tipo === 'acc' ? [] : POOL[m.tipo].filter(q => String(q.ans) !== ans && q.rank < 8000
        && (!q.rule || (q.rule.ok && q.rule.id !== r.id))
        && (m.tipo !== 'eo' || (m.id === 'E' ? 'èé' : 'òó').includes(q.prim[q.pos])));
      out.push({ id: r.id, mondo: m.id, titolo: r.titolo, regolari, ecc, contrasto });
    }
    const mix = POOL[m.tipo].filter(q => q.rank < 6000 && (m.tipo !== 'eo' || (m.id === 'E' ? 'èé' : 'òó').includes(q.prim[q.pos])));
    if (mix.length >= 10) out.push({ id: m.id + '-mix', mondo: m.id, titolo: 'Ripasso misto', regolari: mix, ecc: [] });
  }
  return (LIVELLI = out);
}
function percorso(app) {
  const prog = ME.s.percorso;
  const L = livelli();
  const totStelle = Object.values(prog).reduce((s, v) => s + v, 0);
  let html = `<h1>🗺️ Percorso</h1><p class="lead">Ogni livello allena una regola: 10 parole mescolate, tra parole che la seguono, eccezioni e parole che seguono altre regole. ⭐⭐⭐ con zero errori. Stelle totali: <b>${totStelle}</b> / ${L.length * 3}</p>`;
  for (const m of MONDI) {
    const ls = L.filter(l => l.mondo === m.id); if (!ls.length) continue;
    html += `<h2 style="margin-top:20px">${esc(m.titolo)}</h2><div class="levels">`;
    ls.forEach((l, i) => {
      const prev = i === 0 || (prog[ls[i - 1].id] || 0) > 0;
      const s = prog[l.id] || 0;
      html += `<button class="level ${prev ? '' : 'locked'}" data-id="${esc(l.id)}" ${prev ? '' : 'disabled'}><span class="rid">${esc(l.id.replace('-mix', ' ★'))}</span><div class="small" style="margin:6px 0">${esc(l.titolo)}</div><div class="stars">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</div></button>`;
    });
    html += '</div>';
  }
  html += `<div class="row" style="margin-top:20px"><a class="btn" href="#gioco">Menu</a></div>`;
  app.innerHTML = html;
  app.querySelectorAll('.level:not(.locked)').forEach(b => b.addEventListener('click', () => livello(app, L.find(l => l.id === b.dataset.id))));
}
function livello(app, l) {
  const R = regolaById(l.id);
  // parole della regola, eccezioni e parole di confronto, mescolate (vedi livelli.js)
  const seq = componiLivello(l, rng(Math.floor(Math.random() * 2 ** 31)));
  app.innerHTML = `<div class="play">
    <span class="rid">${esc(l.id)}</span><h1 style="margin-top:8px">${esc(l.titolo)}</h1>
    ${R ? `<div class="card" style="text-align:left">${R.testo ? `<p>${esc(R.testo)}</p>` : ''}<div style="font:1.15rem var(--serif)">${(R.esempi || []).map(colorize).join(' · ')}</div>${R.eccezioni ? `<p class="small"><b>Eccezioni:</b> ${R.eccezioni.map(colorize).join(' · ')}</p>` : ''}</div>` : ''}
    ${l.id.endsWith('-mix') ? '' : `<p class="small muted" style="margin-top:12px">👀 Occhio: non tutte le parole seguono questa regola! Ci sono anche eccezioni e parole che seguono altre regole. Leggi bene ogni parola.</p>`}
    <button class="btn primary big" id="go" style="margin-top:8px">Inizia</button></div>`;
  $('#go', app).addEventListener('click', () => playRound(app, {
    title: l.id, count: seq.length, next: n => seq[n],
    onEnd: res => {
      const err = res.n - res.giuste;
      const stelle = err === 0 ? 3 : err <= 2 ? 2 : err <= 4 ? 1 : 0;
      const premi = chiudiPartita({ modo: 'percorso', livelloId: l.id, stelle, comboMax: res.comboMax, giuste: res.giuste, n: res.n }, res.xp);
      app.innerHTML = `<div class="play"><h1>${stelle ? 'Livello superato!' : 'Riprova!'}</h1><div class="stars" style="font-size:2.6rem;color:var(--gold)">${'★'.repeat(stelle)}${'☆'.repeat(3 - stelle)}</div><p>${res.giuste} giuste su ${res.n}</p>
        ${premiHTML(premi)}
        ${res.errori.length ? `<div class="card" style="text-align:left"><h3>Da ripassare</h3><ul class="rulelist">${res.errori.map(q => `<li><span style="font:1.15rem var(--serif)">${colorize(q.prim)}</span> ${q.rule && !q.rule.ok ? '<span class="tag bad">eccezione</span>' : ''}</li>`).join('')}</ul></div>` : ''}
        <div class="cta"><button class="btn primary big" id="rt">Rigioca</button><button class="btn big" id="mp">Percorso</button></div></div>`;
      $('#rt', app).addEventListener('click', () => livello(app, l));
      $('#mp', app).addEventListener('click', () => percorso(app));
    },
  }));
}

// ---------- Profilo: livello, streak, calendario, trofei, statistiche ----------
async function profilo(app) {
  const s = ME.s, st = P.streakInfo(s), lv = P.livello(s.xp), m = P.umore(s);
  const oggi = P.dayKey();
  // calendario: ultime 5 settimane, da lunedì
  const giorni = [];
  const lun = P.addDays(oggi, -(((new Date().getDay()) + 6) % 7) - 28);
  for (let i = 0; i < 35; i++) giorni.push(P.addDays(lun, i));
  const cal = giorni.map(g => {
    const v = s.giorni[g] || 0;
    const cls = g > oggi ? 'fut' : v >= P.OBIETTIVO ? 'ok' : v > 0 ? 'parz' : '';
    return `<span class="cal-g ${cls} ${g === oggi ? 'oggi' : ''}" title="${g}: ${v} risposte giuste">${+g.slice(8)}</span>`;
  }).join('');
  const tr = P.trofei(mondiMap());
  const stat = [['Partite', s.stats.partite], ['Risposte giuste', s.stats.giuste], ['Precisione', s.stats.risposte ? Math.round(s.stats.giuste / s.stats.risposte * 100) + '%' : '—'],
    ['Record Sfida', s.stats.record], ['Combo migliore', s.stats.comboMax], ['Eccezioni indovinate', s.stats.eccezioni], ['Stelle', Object.values(s.percorso).reduce((a, b) => a + b, 0)], ['Duelli vinti', s.stats.duelliVinti]];
  app.innerHTML = `
    <div class="gioco-head"><h1>👤 Profilo</h1><a class="btn" href="#gioco">← Menu</a></div>
    ${testata()}
    <div class="grid2">
      <div class="card"><h3>🔥 Calendario della streak</h3>
        <div class="cal"><span class="cal-h">L</span><span class="cal-h">M</span><span class="cal-h">M</span><span class="cal-h">G</span><span class="cal-h">V</span><span class="cal-h">S</span><span class="cal-h">D</span>${cal}</div>
        <p class="small muted">Oro: obiettivo raggiunto (${P.OBIETTIVO} risposte giuste). Chiaro: hai giocato ma senza arrivare all’obiettivo.</p></div>
      <div class="card"><h3>📊 Statistiche</h3><div class="stats-mini">${stat.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div></div>
    </div>
    <h2 style="margin-top:20px">🏆 Trofei <span class="muted" style="font-size:1rem">${Object.keys(s.trofei).length} / ${tr.length}</span></h2>
    <div class="trofei">${tr.map(t => { const d = s.trofei[t.id]; return `<div class="trofeo ${d ? 'preso' : ''}"><span class="t-icona">${d ? t.icona : '🔒'}</span><b>${esc(t.nome)}</b><span class="small muted">${esc(t.desc)}</span>${d ? `<span class="small">${new Date(d).toLocaleDateString('it')}</span>` : ''}</div>`; }).join('')}</div>
    <div class="card" style="margin-top:20px"><h3>Impostazioni</h3>
      <form class="form-grid" id="f">
        <label class="field"><span>Nome in classifica</span><input class="text" id="nome" maxlength="20" required value="${esc(s.nome)}"></label>
        <label class="field"><span>Gruppo</span><select class="text" id="gruppo"><option>Caricamento…</option></select></label>
        <div class="row" style="grid-column:1/-1"><button class="btn primary" type="submit">Salva</button><span id="msg" class="small muted"></span>
          <span style="flex:1"></span><button class="btn" type="button" id="guida">❓ Rivedi la guida</button><button class="btn" type="button" id="esci">Esci dall’account</button></div>
      </form></div>`;
  await riempiGruppi($('#gruppo', app), s.gruppo);
  $('#f', app).addEventListener('submit', async e => {
    e.preventDefault();
    const sel = $('#gruppo', app);
    s.nome = $('#nome', app).value.trim().slice(0, 20) || s.nome;
    if (sel.value) { s.gruppo = sel.value; s.gruppoNome = sel.selectedOptions[0]?.textContent || sel.value; }
    await salva(true); $('#msg', app).textContent = 'Salvato.';
  });
  $('#guida', app).addEventListener('click', () => { location.hash = '#gioco/guida'; });
  $('#esci', app).addEventListener('click', async () => { await online.esci(); ME = null; location.hash = '#gioco'; mount(app, ''); });
}

// ---------- Come si gioca ----------
function guida(app, primaVolta) {
  const es = (word, hint, opts, giusta) => `<div class="g-es"><div class="g-word">${word}</div><div class="small muted">${hint}</div>
    <div class="answers">${opts.map(([big, small], i) => `<span class="ans ${i === giusta ? 'ok' : ''}">${big}<small>${small}</small></span>`).join('')}</div></div>`;
  app.innerHTML = `<div class="play guida">
    ${mascotte('felice', { size: 100, msg: primaVolta ? 'Prima di iniziare ti spiego come si gioca: ci vuole un minuto!' : 'Ecco come si gioca.' })}
    <div class="card"><h3>1 · Come funziona una domanda</h3>
      <p>Compare una parola con una lettera <b style="color:var(--accent)">evidenziata</b>: tocca il pulsante con la pronuncia giusta. Se sbagli ti mostro la parola corretta e la regola da ripassare.</p>
      <div class="g-grid">
        ${es('b<span class="hl">e</span>llo', 'E aperta o chiusa?', [['è', 'aperta'], ['é', 'chiusa']], 0)}
        ${es('ca<span class="hl">s</span>a', 'S sorda o sonora?', [['s', 'sorda'], ['ṡ', 'sonora']], 0)}
        ${es('<span class="hl">z</span>ero', 'Z sorda o sonora?', [['z', 'sorda'], ['ż', 'sonora']], 1)}
        ${es('tavolo', 'Dove cade l’accento?', [['tAvolo', ''], ['tavOlo', ''], ['tavolO', '']], 0)}
      </div></div>
    <div class="card"><h3>2 · Punti, combo e XP</h3>
      <p>Ogni risposta giusta vale punti; ogni 3 giuste di fila la <b>combo</b> aumenta (fino a ×5). Le <b>eccezioni</b> valgono di più. Con le risposte giuste guadagni anche <b>XP</b> per salire di livello: da Comparsa a Mito del teatro.</p></div>
    <div class="card"><h3>3 · Obiettivo del giorno e streak 🔥</h3>
      <p>Ogni giorno fai <b>${P.OBIETTIVO} risposte giuste</b>, in qualsiasi modalità: così la tua <b>streak</b> cresce. Se salti un giorno riparte da zero. Io ti avviso: se sbadiglio, la streak è a rischio!</p></div>
    <div class="card"><h3>4 · Le modalità</h3>
      <ul class="rulelist">
        <li>⏱️ <span><b>Sfida a tempo</b>: 60 secondi per fare più punti possibile. Il record va nella classifica della settimana del tuo gruppo.</span></li>
        <li>🗺️ <span><b>Percorso</b>: un livello per ogni regola. Leggi la regola, poi 10 parole: con zero errori prendi 3 stelle.</span></li>
        <li>🔁 <span><b>Ripasso errori</b>: le parole che hai sbagliato, finché non le impari.</span></li>
        <li>⚔️ <span><b>Duello</b>: stesse parole per tutti, vince chi fa più punti.</span></li>
      </ul></div>
    <div class="cta">
      <button class="btn primary big" id="prova">Prova 3 domande</button>
      <button class="btn big" id="fine">${primaVolta ? 'Ho capito, si gioca!' : 'Torna al menu'}</button></div></div>`;
  const chiudi = async () => { if (!ME.s.guida) { ME.s.guida = true; await salva(true); } location.hash = '#gioco'; mount(app, ''); };
  $('#fine', app).addEventListener('click', chiudi);
  $('#prova', app).addEventListener('click', () => {
    const next = picker(POOL, rng(Math.floor(Math.random() * 2 ** 31)));
    playRound(app, { title: 'Prova', count: 3, next, registra: false, onEnd: res => {
      app.innerHTML = `<div class="play">${mascotte(res.giuste === 3 ? 'festa' : 'felice', { size: 110, msg: res.giuste === 3 ? 'Perfetto! Sei pronto per il palcoscenico.' : `${res.giuste} su 3: niente paura, si impara giocando!` })}
        <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary big" id="ok">Si gioca!</button></div></div>`;
      $('#ok', app).addEventListener('click', chiudi);
    } });
  });
}

export function unmount() { clearTimers(); if (unwatch) { unwatch(); unwatch = null; } if (ME) salva(true); }

// controllo di coerenza (usato dai test): domande la cui risposta giusta non è tra i pulsanti
export async function domandeSenzaRisposta() {
  await loadPool();
  const out = [];
  for (const q of POOL.acc) if (!q.nuc.includes(q.ans)) out.push(q.key);
  for (const t of ['eo', 's', 'z']) for (const q of POOL[t]) if (!['open', 'closed', 's', 'z'].includes(q.ans)) out.push(q.key);
  return { totaleAccento: POOL.acc.length, problemi: out };
}
