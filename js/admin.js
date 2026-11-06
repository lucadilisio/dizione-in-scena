// Area docente: gestione dei gruppi e moderazione delle classifiche.
// La protezione vera è nelle regole del database: solo l'account admin può scrivere in /gruppi.
import * as online from './online.js';
import { esc, $ } from './app.js';

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

export function unmount() {}
