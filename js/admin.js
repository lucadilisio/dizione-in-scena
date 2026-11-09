// Area docente: gestione dei gruppi e moderazione delle classifiche.
// La protezione vera è nelle regole del database: solo l'account admin può scrivere in /gruppi.
import * as online from './online.js';
import { esc, colorize, $ } from './app.js';
import * as P from './progressi.js';

export async function mount(app) {
  if (!online.enabled) { app.innerHTML = '<h1>Area docente</h1><p>Firebase non è configurato (vedi README).</p>'; return; }
  app.innerHTML = '<div class="loading">Controllo l’accesso…</div>';
  let email;
  try { email = await online.adminUser(); }
  catch (e) { app.innerHTML = `<h1>Area docente</h1><p style="color:var(--bad)">Non riesco a collegarmi a Firebase (${esc(e.message)}). Controlla la connessione e ricarica.</p>`; return; }
  if (!email) return login(app);
  dashboard(app, email);
}

function login(app, err = '') {
  app.innerHTML = `<div class="play" style="max-width:420px">
    <h1>Area docente</h1>
    <p class="muted">Accesso riservato a chi gestisce i gruppi.</p>
    <form class="card" id="f" style="text-align:left;display:grid;gap:12px">
      <label>Email<br><input class="text" id="em" type="email" autocomplete="username" required style="width:100%"></label>
      <label>Password<br><input class="text" id="pw" type="password" autocomplete="current-password" required style="width:100%"></label>
      <button class="btn primary" type="submit">Entra</button>
      <p class="small" style="color:var(--bad);margin:0" id="err">${esc(err)}</p>
    </form></div>`;
  $('#f', app).addEventListener('submit', async e => {
    e.preventDefault();
    const btn = app.querySelector('button[type=submit]'); btn.disabled = true;
    try { await online.adminLogin($('#em', app).value, $('#pw', app).value); dashboard(app, await online.adminUser()); }
    catch (er) { login(app, er.message); }
  });
}

async function dashboard(app, email) {
  app.innerHTML = `
    <div class="row" style="justify-content:space-between"><h1 style="margin:0">Area docente</h1>
      <div class="row small"><span class="muted">${esc(email)}</span><button class="btn" id="out">Esci</button></div></div>
    <p class="lead">I ragazzi scelgono il gruppo da questa lista nel menu del Gioco. Un gruppo disattivato sparisce dalla lista ma conserva le classifiche.</p>
    <form class="card row" id="nuovo" style="margin-bottom:16px">
      <input class="text" id="nome" maxlength="40" placeholder="Nome del nuovo gruppo (es. Musical 1)" required style="flex:1;min-width:200px">
      <button class="btn primary" type="submit">Crea gruppo</button>
      <span class="small" id="msg"></span>
    </form>
    <div id="lista"><div class="loading">Carico i gruppi…</div></div>`;
  $('#out', app).addEventListener('click', async () => { await online.adminLogout(); login(app); });
  $('#nuovo', app).addEventListener('submit', async e => {
    e.preventDefault();
    try { await online.adminCreateGroup($('#nome', app).value); $('#nome', app).value = ''; $('#msg', app).textContent = ''; lista(app); }
    catch (er) { $('#msg', app).textContent = errore(er); }
  });
  lista(app);
}

const errore = e => /permission|PERMISSION_DENIED/i.test(e.message || e.code || '') ? 'Permesso negato: controlla che le regole del database contengano la tua email admin (README).' : (e.message || String(e));

async function lista(app) {
  const box = $('#lista', app);
  let gruppi;
  try { gruppi = await online.adminGroups(); } catch (e) { box.innerHTML = `<p style="color:var(--bad)">${esc(errore(e))}</p>`; return; }
  if (!gruppi.length) { box.innerHTML = '<p class="muted">Nessun gruppo. Creane uno qui sopra.</p>'; return; }
  box.innerHTML = gruppi.map(g => `
    <div class="card" style="margin-bottom:12px" data-id="${esc(g.id)}">
      <div class="row" style="justify-content:space-between">
        <div><h3 style="margin:0">${esc(g.nome || g.id)} ${g.attivo === false ? '<span class="tag">disattivato</span>' : '<span class="tag ok">attivo</span>'}</h3>
          <span class="small muted">codice: ${esc(g.id)}</span></div>
        <div class="row">
          <button class="btn" data-act="rinomina">Rinomina</button>
          <button class="btn" data-act="attiva">${g.attivo === false ? 'Riattiva' : 'Disattiva'}</button>
          <button class="btn" data-act="ragazzi">Ragazzi</button>
          <button class="btn" data-act="classifica">Classifica</button>
          <button class="btn" data-act="elimina" style="color:var(--bad)">Elimina</button>
        </div>
      </div>
      <div class="cls"></div>
    </div>`).join('');
  box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
    const card = b.closest('[data-id]'); const id = card.dataset.id; const g = gruppi.find(x => x.id === id);
    try {
      if (b.dataset.act === 'rinomina') {
        const n = prompt('Nuovo nome visualizzato (il codice resta uguale):', g.nome || id);
        if (n && n.trim()) { await online.adminSaveGroup(id, { nome: n.trim().slice(0, 40) }); lista(app); }
      } else if (b.dataset.act === 'attiva') {
        await online.adminSaveGroup(id, { attivo: g.attivo === false }); lista(app);
      } else if (b.dataset.act === 'elimina') {
        if (confirm(`Eliminare "${g.nome || id}" e tutte le sue classifiche? Non si può annullare.`)) { await online.adminDeleteGroup(id); lista(app); }
      } else if (b.dataset.act === 'ragazzi') {
        ragazzi(card.querySelector('.cls'), id);
      } else if (b.dataset.act === 'classifica') {
        classifica(card.querySelector('.cls'), id);
      }
    } catch (e) { alert(errore(e)); }
  }));
}

async function classifica(box, id) {
  box.innerHTML = '<p class="muted small">Carico…</p>';
  const rows = await online.adminScores(id);
  box.innerHTML = rows.length ? `<h3 style="margin-top:14px">Settimana ${esc(online.weekKey())}</h3><table class="lb">${rows.map((r, i) => `
      <tr><td>${i + 1}</td><td>${esc(r.nome)}</td><td><b>${r.punti}</b></td><td><button class="btn small" data-uid="${esc(r.uid)}">Rimuovi</button></td></tr>`).join('')}</table>
      <p class="small muted">“Rimuovi” cancella il punteggio (per esempio un nome inappropriato); il ragazzo può rigiocare.</p>`
    : '<p class="muted small" style="margin-top:12px">Nessun punteggio questa settimana.</p>';
  box.querySelectorAll('[data-uid]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Rimuovere questo punteggio?')) return;
    try { await online.adminDeleteScore(id, b.dataset.uid); classifica(box, id); } catch (e) { alert(errore(e)); }
  }));
}

// riepilogo dei progressi dei ragazzi del gruppo
async function ragazzi(box, id) {
  box.innerHTML = '<p class="muted small">Carico…</p>';
  let rows;
  try { rows = (await online.adminRagazzi(id)).map(r => ({ ...r, s: P.normalizza(r) })); }
  catch (e) { box.innerHTML = `<p style="color:var(--bad)">${esc(errore(e))}</p>`; return; }
  if (!rows.length) { box.innerHTML = '<p class="muted small" style="margin-top:12px">Nessun ragazzo ha ancora scelto questo gruppo.</p>'; return; }
  rows.sort((a, b) => b.s.xp - a.s.xp);
  // parole più sbagliate dal gruppo
  const err = new Map();
  for (const r of rows) for (const e of Object.values(r.s.errori)) {
    const k = e.prim; const v = err.get(k) || { prim: e.prim, n: 0, chi: 0 };
    v.n += e.tot || e.n || 1; v.chi++; err.set(k, v);
  }
  const top = [...err.values()].sort((a, b) => b.chi - a.chi || b.n - a.n).slice(0, 15);
  const quando = t => { if (!t) return '—'; const g = Math.floor((Date.now() - t) / 864e5); return g <= 0 ? 'oggi' : g === 1 ? 'ieri' : `${g} giorni fa`; };
  box.innerHTML = `<h3 style="margin-top:14px">Progressi (${rows.length})</h3>
    <div style="overflow-x:auto"><table class="lb small">
      <tr><th>Nome</th><th>Livello</th><th>Streak</th><th>Oggi</th><th>Stelle</th><th>Giuste</th><th>Precisione</th><th>Trofei</th><th>Ultima attività</th></tr>
      ${rows.map(r => { const s = r.s, st = P.streakInfo(s), lv = P.livello(s.xp);
        return `<tr><td><b>${esc(s.nome)}</b></td><td>${lv.n} · ${esc(lv.titolo)}</td><td>🔥 ${st.corrente} <span class="muted">(rec. ${st.migliore})</span></td>
          <td>${Math.min(st.oggi, st.obiettivo)}/${st.obiettivo}</td><td>${Object.values(s.percorso).reduce((a, b) => a + b, 0)}</td><td>${s.stats.giuste}</td>
          <td>${s.stats.risposte ? Math.round(s.stats.giuste / s.stats.risposte * 100) + '%' : '—'}</td><td>${Object.keys(s.trofei).length}</td><td>${quando(r.aggiornato)}</td></tr>`; }).join('')}
    </table></div>
    ${top.length ? `<h3 style="margin-top:14px">Parole più sbagliate dal gruppo</h3><p class="small muted">Tra parentesi: quanti ragazzi la stanno ancora sbagliando. Utile per scegliere su cosa lavorare a lezione.</p>
      <div class="ex" style="font:1.1rem var(--serif);display:flex;flex-wrap:wrap;gap:6px 16px">${top.map(t => `<span>${colorize(t.prim)} <span class="small muted">(${t.chi})</span></span>`).join('')}</div>` : ''}`;
}

export function unmount() {}
