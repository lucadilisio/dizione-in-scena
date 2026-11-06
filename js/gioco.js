// Il gioco: Sfida a tempo, Duello (online o sullo stesso telefono), Percorso a livelli.
import { explain, sGroups, zGroups, nuclei, stripAll } from './engine.js';
import { REGOLE, ATONE, DIFFICILI, regolaById } from './rules.js';
import { store, colorize, esc, $ } from './app.js';
import * as online from './online.js';

const DURATA = 60;
let POOL = null;            // domande per tipo
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
  const diff = new Set(DIFFICILI.map(d => stripAll(d.toLowerCase())));
  text.split('\n').forEach((line, rank) => {
    if (!line) return;
    const tab = line.indexOf('\t');
    const body = (tab >= 0 ? line.slice(tab + 1) : line).replace(/!$/, '');
    if (body.includes(';')) return;                       // omografi: ambigui, esclusi
    const [prim, ...rawVars] = body.split('~');
    // le varianti regionali (non registrate dal Wiktionary italiano) non rendono ambigua la domanda
    const vars = rawVars.filter(v => (v.split('@')[1] || '').includes('+')).map(v => v.split('@')[0]);
    const key = tab >= 0 ? line.slice(0, tab) : stripAll(prim);
    if (key.length < 3 || ATONE.has(key) || [...prim].length !== [...key].length) return;
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
    const st = [...prim].findIndex(c => 'àèéìòóù'.includes(c));
    const after = st >= 0 ? nuc.filter(k => k > st).length : -1;
    if ((after >= 2 || diff.has(key)) && nuc.length >= 3 && nuc.length <= 5 && same(st)) {
      pool.acc.push({ type: 'acc', key, prim, pos: st, rank, ans: st, nuc, rule: diff.has(key) ? { id: 'T3', ok: true } : null });
    }
  });
  POOL = pool;
  return pool;
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

// ---------- motore di una partita (usato da tutte le modalità) ----------
// cfg: { seconds | count, seed, next(n) -> q, onEnd(result), onScore(punti, n), title, startAt (ms epoch) }
function playRound(root, cfg) {
  clearTimers();
  let punti = 0, n = 0, giuste = 0, combo = 0, mult = 1, errori = [], locked = false, q = null, endAt = 0;
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
    $('#qw', root).innerHTML = v.word;
    $('#qh', root).textContent = v.hint;
    const ans = $('#ans', root);
    ans.className = 'answers' + (v.many ? ' many' : '');
    ans.innerHTML = v.options.map(([val, big, small]) => `<button class="ans" data-v="${val}">${esc(big)}${small ? `<small>${esc(small)}</small>` : ''}</button>`).join('');
    locked = false;
  };
  const answer = (btn) => {
    if (locked) return; locked = true;
    const val = btn.dataset.v;
    const ok = String(q.ans) === val;
    n++;
    if (ok) {
      giuste++; combo++; if (combo % 3 === 0 && mult < 5) mult++;
      const gain = (100 + (q.rule && !q.rule.ok ? 50 : 0)) * mult;
      punti += gain;
      btn.classList.add('ok');
      $('#fb', root).innerHTML = `<b style="color:var(--ok)">+${gain}</b> ${mult > 1 ? `<span class="combo">combo ×${mult}</span>` : ''}<div style="font:1.4rem var(--serif)">${colorize(q.prim)}</div>`;
    } else {
      combo = 0; mult = 1;
      btn.classList.add('bad');
      root.querySelector(`.ans[data-v="${q.ans}"]`)?.classList.add('ok');
      errori.push(q);
      $('#fb', root).innerHTML = `<div style="font:1.4rem var(--serif)">${colorize(q.prim)}</div>${ruleLine(q)}`;
    }
    $('#pt', root).textContent = punti;
    if (cfg.onScore) cfg.onScore(punti, n);
    if (cfg.count && n >= cfg.count) { timers.push(setTimeout(end, ok ? 700 : 1600)); return; }
    timers.push(setTimeout(show, ok ? 550 : 1500));
  };
  const end = () => {
    clearTimers(); locked = true;
    cfg.onEnd({ punti, n, giuste, errori });
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
  // conto alla rovescia
  const startAt = cfg.startAt || Date.now() + 3000;
  const cd = setInterval(() => {
    const left = Math.ceil((startAt - Date.now()) / 1000);
    if (left > 0) { $('#qw', root).textContent = left; $('#qh', root).textContent = 'Pronti…'; }
    else { clearInterval(cd); begin(); }
  }, 100);
  timers.push(cd);
  return { get punti() { return punti; } };
}

// ---------- profilo ----------
const profile = () => ({ nome: '', gruppo: '', ...store.get('profilo', {}) });

// ---------- schermata principale ----------
export async function mount(app, sub) {
  clearTimers(); if (unwatch) { unwatch(); unwatch = null; }
  app.innerHTML = '<div class="loading">Preparo le parole…</div>';
  await loadPool();
  if (sub === 'sfida') return sfida(app);
  if (sub === 'duello') return duello(app);
  if (sub === 'percorso') return percorso(app);
  const p = profile();
  const best = store.get('record', 0);
  app.innerHTML = `
    <h1>Gioco</h1>
    <p class="lead">Allenati sulla dizione e sfida il tuo gruppo. Ogni errore ti mostra la parola corretta e la regola da ripassare.</p>
    <div class="card" style="margin-bottom:16px">
      <div class="form-grid">
        <label class="field"><span>Il tuo nome</span><input class="text" id="nome" maxlength="20" value="${esc(p.nome)}" placeholder="Es. Giulia"></label>
        ${online.enabled
          ? `<label class="field"><span>Gruppo</span><select class="text" id="gruppo"><option value="">Caricamento…</option></select></label>`
          : `<label class="field"><span>Gruppo / classe</span><input class="text" id="gruppo" maxlength="30" value="${esc(p.gruppo)}" placeholder="Es. laboratorio-lunedi"></label>`}
      </div>
      <p class="small muted" style="margin:8px 0 0">${online.enabled ? 'Scegli il tuo gruppo: compete nella stessa classifica settimanale. Se il tuo gruppo non c’è, chiedi al docente.' : '<b>Classifica online non attiva</b>: i record restano su questo dispositivo.'}</p>
    </div>
    <div class="modes">
      <a class="card mode" href="#gioco/sfida" style="text-decoration:none;color:inherit"><div class="emoji">⏱️</div><h3>Sfida a tempo</h3><p class="muted">60 secondi, più rispondi giusto più sale la combo. Il tuo record: <b>${best}</b></p></a>
      <a class="card mode" href="#gioco/duello" style="text-decoration:none;color:inherit"><div class="emoji">⚔️</div><h3>Duello</h3><p class="muted">Stesse parole, stesso tempo: vince chi fa più punti. Online con un codice stanza (fino a 8 giocatori) o sullo stesso telefono.</p></a>
      <a class="card mode" href="#gioco/percorso" style="text-decoration:none;color:inherit"><div class="emoji">🗺️</div><h3>Percorso a livelli</h3><p class="muted">Un livello per ogni regola, con le sue eccezioni. Guadagna stelle e sblocca i livelli successivi.</p></a>
    </div>
    <div id="lb" style="margin-top:20px"></div>`;
  const save = () => { store.set('profilo', { nome: $('#nome', app).value.trim(), gruppo: $('#gruppo', app).value.trim(), gruppoNome: $('#gruppo', app).selectedOptions?.[0]?.textContent || '' }); };
  $('#nome', app).addEventListener('change', save);
  $('#gruppo', app).addEventListener('change', () => { save(); showLeaderboard($('#lb', app), 'sfida'); });
  if (online.enabled) {
    try {
      const gruppi = await online.listGroups();
      const sel = $('#gruppo', app);
      sel.innerHTML = gruppi.length
        ? `<option value="">— scegli —</option>` + gruppi.map(g => `<option value="${esc(g.id)}" ${g.id === p.gruppo ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')
        : '<option value="">Nessun gruppo disponibile</option>';
      if (p.gruppo && !gruppi.some(g => g.id === p.gruppo)) save();   // gruppo eliminato o disattivato
    } catch { $('#gruppo', app).innerHTML = '<option value="">Gruppi non disponibili</option>'; }
  }
  showLeaderboard($('#lb', app), 'sfida');
}

async function showLeaderboard(box, mode) {
  const p = profile();
  if (!online.enabled) {
    const loc = store.get('storico', []).slice(0, 10);
    box.innerHTML = loc.length ? `<div class="card"><h3>I tuoi migliori punteggi</h3><table class="lb">${loc.map((r, i) => `<tr><td>${i + 1}</td><td>${r.punti} pt</td><td class="muted small">${new Date(r.data).toLocaleDateString('it')}</td></tr>`).join('')}</table></div>` : '';
    return;
  }
  if (!p.gruppo) { box.innerHTML = '<div class="card"><h3>Classifica della settimana</h3><p class="muted">Scegli il tuo gruppo per vedere la classifica.</p></div>'; return; }
  box.innerHTML = '<div class="card"><h3>Classifica della settimana</h3><p class="muted">Carico…</p></div>';
  try {
    const rows = await online.topScores(p.gruppo, mode);
    box.innerHTML = `<div class="card"><h3>Classifica della settimana · ${esc(p.gruppoNome || p.gruppo)}</h3>${rows.length ? `<table class="lb"><tr><th>#</th><th>Nome</th><th>Punti</th></tr>${rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(r.nome)}</td><td><b>${r.punti}</b></td></tr>`).join('')}</table>` : '<p class="muted">Ancora nessun punteggio: sii il primo!</p>'}</div>`;
  } catch (e) { box.innerHTML = `<p class="small muted">Classifica non disponibile (${esc(e.message)}).</p>`; }
}

// ---------- Sfida a tempo ----------
function sfida(app) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const next = picker(POOL, rng(seed));
  playRound(app, {
    title: '⏱️ Sfida', seconds: DURATA, next,
    onEnd: async res => {
      const rec = store.get('record', 0);
      const nuovo = res.punti > rec;
      if (nuovo) store.set('record', res.punti);
      const st = store.get('storico', []); st.push({ punti: res.punti, data: Date.now() }); st.sort((a, b) => b.punti - a.punti); store.set('storico', st.slice(0, 20));
      endScreen(app, res, nuovo, 'sfida', () => sfida(app));
      const p = profile();
      if (online.enabled && p.nome && p.gruppo) { try { await online.submitScore(p.gruppo, p.nome, 'sfida', res.punti); showLeaderboard($('#lb2', app), 'sfida'); } catch { /* offline */ } }
    },
  });
}

function endScreen(app, res, nuovo, mode, again, extra = '') {
  const acc = res.n ? Math.round(res.giuste / res.n * 100) : 0;
  const errs = res.errori.slice(0, 12).map(q => `<li><span style="font:1.15rem var(--serif)">${colorize(q.prim)}</span> ${q.rule ? `<a class="rid" href="#teoria/${q.rule.id}">${q.rule.id}</a>` : ''}</li>`).join('');
  app.innerHTML = `<div class="play">
    <h1>${nuovo ? '🏆 Nuovo record!' : 'Tempo scaduto!'}</h1>
    <div class="qword">${res.punti} <span style="font-size:.5em">punti</span></div>
    <p>${res.giuste} giuste su ${res.n} · precisione ${acc}%</p>
    ${extra}
    <div class="row" style="justify-content:center;margin:16px 0"><button class="btn primary big" id="again">Rigioca</button><a class="btn big" href="#gioco">Menu</a></div>
    ${errs ? `<div class="card" style="text-align:left"><h3>Da ripassare</h3><ul class="rulelist">${errs}</ul></div>` : ''}
    <div id="lb2" style="margin-top:16px;text-align:left"></div></div>`;
  $('#again', app).addEventListener('click', again);
  if (!online.enabled || !profile().nome || !profile().gruppo) showLeaderboard($('#lb2', app), mode);
}

// ---------- Duello ----------
function duello(app) {
  const p = profile();
  app.innerHTML = `<div class="play">
    <h1>⚔️ Duello</h1>
    ${online.enabled ? `
      <div class="card" style="margin-bottom:14px">
        <h3>Online</h3>
        <p class="muted small">Crea una stanza e fai entrare gli altri con il codice (fino a 8 giocatori).</p>
        <div class="row" style="justify-content:center"><button class="btn primary" id="crea">Crea stanza</button></div>
        <div class="row" style="justify-content:center;margin-top:10px"><input class="text" id="cod" maxlength="4" placeholder="CODICE" style="text-transform:uppercase;width:120px;text-align:center"><button class="btn" id="entra">Entra</button></div>
        <p id="err" class="small" style="color:var(--bad)"></p>
      </div>` : `<p class="muted small">Il duello online si attiva configurando Firebase (vedi README). Intanto puoi sfidarti sullo stesso telefono.</p>`}
    <div class="card">
      <h3>Sullo stesso telefono</h3>
      <p class="muted small">Due giocatori, stesse parole, 45 secondi a testa. Passate il telefono a metà.</p>
      <div class="row" style="justify-content:center"><input class="text" id="g1" placeholder="Giocatore 1" value="${esc(p.nome)}"><input class="text" id="g2" placeholder="Giocatore 2"></div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn primary" id="locale">Inizia</button></div>
    </div></div>`;
  $('#locale', app).addEventListener('click', () => duelloLocale(app, $('#g1', app).value.trim() || 'Giocatore 1', $('#g2', app).value.trim() || 'Giocatore 2'));
  if (online.enabled) {
    const need = () => { if (!profile().nome) { $('#err', app).textContent = 'Prima scrivi il tuo nome nel menu del Gioco.'; return false; } return true; };
    $('#crea', app).addEventListener('click', async () => { if (!need()) return; try { stanza(app, await online.createRoom(profile().nome)); } catch (e) { $('#err', app).textContent = e.message; } });
    $('#entra', app).addEventListener('click', async () => { if (!need()) return; try { stanza(app, await online.joinRoom($('#cod', app).value, profile().nome)); } catch (e) { $('#err', app).textContent = e.message; } });
  }
}

function duelloLocale(app, n1, n2) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const res = [];
  const turno = (i) => {
    const nome = i === 0 ? n1 : n2;
    app.innerHTML = `<div class="play"><h1>Tocca a ${esc(nome)}</h1>${i === 1 ? `<p>${esc(n1)} ha fatto <b>${res[0].punti}</b> punti. Passa il telefono!</p>` : ''}<button class="btn primary big" id="via">Sono pronto</button></div>`;
    $('#via', app).addEventListener('click', () => playRound(app, {
      title: nome, seconds: 45, next: picker(POOL, rng(seed)),
      onEnd: r => { res.push(r); if (i === 0) turno(1); else fine(); },
    }));
  };
  const fine = () => {
    const [a, b] = res; const win = a.punti === b.punti ? 'Pareggio!' : `Vince ${esc(a.punti > b.punti ? n1 : n2)}!`;
    app.innerHTML = `<div class="play"><h1>🏆 ${win}</h1><table class="lb"><tr><td>${esc(n1)}</td><td><b>${a.punti}</b> pt</td><td>${a.giuste}/${a.n}</td></tr><tr><td>${esc(n2)}</td><td><b>${b.punti}</b> pt</td><td>${b.giuste}/${b.n}</td></tr></table>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary big" id="rv">Rivincita</button><a class="btn big" href="#gioco">Menu</a></div></div>`;
    $('#rv', app).addEventListener('click', () => duelloLocale(app, n1, n2));
  };
  turno(0);
}

async function stanza(app, code) {
  let started = false;
  const render = (room, uid) => {
    if (!room) { app.innerHTML = '<div class="play"><h1>Stanza chiusa</h1><a class="btn" href="#gioco">Menu</a></div>'; return; }
    const players = Object.entries(room.giocatori || {}).map(([id, g]) => ({ id, ...g })).sort((a, b) => b.punti - a.punti);
    if (room.stato === 'attesa') {
      app.innerHTML = `<div class="play"><h1>Stanza</h1><p>Codice da condividere:</p><div class="code">${code}</div>
        <div class="card" style="margin:14px 0;text-align:left"><h3>Giocatori (${players.length}/8)</h3>${players.map(g => `<div>🎭 ${esc(g.nome)}${g.id === room.host ? ' <span class="tag">host</span>' : ''}</div>`).join('')}</div>
        ${room.host === uid ? `<button class="btn primary big" id="via" ${players.length < 2 ? 'disabled' : ''}>Via!</button><p class="small muted">Serve almeno un altro giocatore.</p>` : '<p class="muted">In attesa che l’host faccia partire la sfida…</p>'}</div>`;
      $('#via', app)?.addEventListener('click', () => online.startRoom(code, DURATA));
      return;
    }
    if (room.stato === 'via' && !started) {
      started = true;
      online.serverNow().then(now => {
        const startAt = Date.now() + (room.inizio - now);
        playRound(app, {
          title: `⚔️ ${code}`, seconds: room.durata || DURATA, startAt, next: picker(POOL, rng(room.seed)),
          onScore: (punti, n) => { online.pushScore(code, punti, n); },
          onEnd: r => {
            online.pushScore(code, r.punti, r.n);
            app.innerHTML = `<div class="play"><h1>Fine!</h1><div id="classifica"></div><a class="btn big" href="#gioco" style="margin-top:14px">Menu</a></div>`;
            render(lastRoom, uid);
          },
        });
      });
    }
    // punteggi live / finali
    const tbl = `<table class="lb">${players.map((g, i) => `<tr class="${g.id === uid ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(g.nome)}</td><td><b>${g.punti}</b></td></tr>`).join('')}</table>`;
    const c = document.getElementById('classifica');
    if (c) c.innerHTML = tbl;
    const opp = document.getElementById('opp');
    if (opp) opp.innerHTML = players.filter(g => g.id !== uid).map(g => `${esc(g.nome)}: <b>${g.punti}</b>`).join(' · ');
  };
  let lastRoom = null;
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
function livelli() {
  const out = [];
  for (const m of MONDI) {
    const rules = REGOLE.filter(r => r.cat === m.id && (r.re || r.difficili) && !r.tendenza);
    for (const r of rules) {
      let qs = POOL[m.tipo].filter(q => q.rule && q.rule.id === r.id);
      if (m.tipo === 'eo') qs = qs.filter(q => (m.id === 'E' ? 'èé' : 'òó').includes(q.prim[q.pos]));
      const regolari = qs.filter(q => q.rule.ok), ecc = qs.filter(q => !q.rule.ok);
      if (regolari.length >= 5) out.push({ id: r.id, mondo: m.id, titolo: r.titolo, regolari, ecc });
    }
    // livello misto finale del mondo
    const mix = POOL[m.tipo].filter(q => q.rank < 6000 && (m.tipo !== 'eo' || (m.id === 'E' ? 'èé' : 'òó').includes(q.prim[q.pos])));
    if (mix.length >= 10) out.push({ id: m.id + '-mix', mondo: m.id, titolo: 'Ripasso misto', regolari: mix, ecc: [] });
  }
  return out;
}
function percorso(app) {
  const prog = store.get('percorso', {});
  const L = livelli();
  const totStelle = Object.values(prog).reduce((s, v) => s + v, 0);
  let html = `<h1>🗺️ Percorso</h1><p class="lead">Ogni livello allena una regola: 10 parole, prima quelle regolari poi le eccezioni. ⭐⭐⭐ con zero errori. Stelle totali: <b>${totStelle}</b> / ${L.length * 3}</p>`;
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
  const rand = rng(Math.floor(Math.random() * 2 ** 31));
  const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const reg = shuffle(l.regolari.filter(q => q.rank < 8000).length >= 7 ? l.regolari.filter(q => q.rank < 8000) : l.regolari);
  const ecc = shuffle(l.ecc);
  const nEcc = Math.min(3, ecc.length);
  const seq = [...reg.slice(0, 10 - nEcc), ...ecc.slice(0, nEcc)];
  app.innerHTML = `<div class="play">
    <span class="rid">${esc(l.id)}</span><h1 style="margin-top:8px">${esc(l.titolo)}</h1>
    ${R ? `<div class="card" style="text-align:left">${R.testo ? `<p>${esc(R.testo)}</p>` : ''}<div style="font:1.15rem var(--serif)">${(R.esempi || []).map(colorize).join(' · ')}</div>${R.eccezioni ? `<p class="small"><b>Eccezioni:</b> ${R.eccezioni.map(colorize).join(' · ')}</p>` : ''}</div>` : ''}
    <button class="btn primary big" id="go" style="margin-top:16px">Inizia</button></div>`;
  $('#go', app).addEventListener('click', () => playRound(app, {
    title: l.id, count: seq.length, next: n => seq[n],
    onEnd: res => {
      const err = res.n - res.giuste;
      const stelle = err === 0 ? 3 : err <= 2 ? 2 : err <= 4 ? 1 : 0;
      const prog = store.get('percorso', {});
      if (stelle > (prog[l.id] || 0)) { prog[l.id] = stelle; store.set('percorso', prog); }
      app.innerHTML = `<div class="play"><h1>${stelle ? 'Livello superato!' : 'Riprova!'}</h1><div class="stars" style="font-size:2.6rem;color:var(--gold)">${'★'.repeat(stelle)}${'☆'.repeat(3 - stelle)}</div><p>${res.giuste} giuste su ${res.n}</p>
        ${res.errori.length ? `<div class="card" style="text-align:left"><h3>Da ripassare</h3><ul class="rulelist">${res.errori.map(q => `<li><span style="font:1.15rem var(--serif)">${colorize(q.prim)}</span> ${q.rule && !q.rule.ok ? '<span class="tag bad">eccezione</span>' : ''}</li>`).join('')}</ul></div>` : ''}
        <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary big" id="rt">Rigioca</button><button class="btn big" id="mp">Percorso</button></div></div>`;
      $('#rt', app).addEventListener('click', () => livello(app, l));
      $('#mp', app).addEventListener('click', () => percorso(app));
    },
  }));
}

export function unmount() { clearTimers(); if (unwatch) { unwatch(); unwatch = null; } }
