import { loadLexicon } from './engine.js';

// ---------- stato condiviso ----------
export const store = {
  get(k, def) { try { const v = localStorage.getItem('dizione:' + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('dizione:' + k, JSON.stringify(v)); } catch { /* storage non disponibile */ } },
};

export const DEFAULT_OPTS = { eo: true, tonico: true, s: true, z: true };
export const getOpts = () => ({ ...DEFAULT_OPTS, ...store.get('opts', {}) });

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Selettore "su cosa vuoi segnare la dizione"
export function selectorHTML() {
  const o = getOpts();
  const chip = (k, sym, label) => `<label class="chip"><input type="checkbox" data-opt="${k}" ${o[k] ? 'checked' : ''}><span class="tick"></span><span class="sym">${sym}</span> ${label}</label>`;
  return `<div class="selector" role="group" aria-label="Cosa segnare">
    <span class="label">Segna:</span>
    ${chip('eo', 'è é ò ó', 'E e O aperte/chiuse')}
    ${chip('tonico', 'à ì ù', 'Accento tonico')}
    ${chip('s', 'ṡ', 'S sonora')}
    ${chip('z', 'ż', 'Z sonora')}
  </div>`;
}
export function bindSelector(root, onChange) {
  root.querySelectorAll('[data-opt]').forEach(inp => inp.addEventListener('change', () => {
    const o = getOpts(); o[inp.dataset.opt] = inp.checked; store.set('opts', o); onChange(o);
  }));
}

// Colora i segni di una parola già segnata
export function colorize(word) {
  let h = '';
  for (const c of word) {
    const lc = c.toLowerCase();
    if ('èò'.includes(lc)) h += `<span class="m-open">${c}</span>`;
    else if ('éó'.includes(lc)) h += `<span class="m-closed">${c}</span>`;
    else if ('ṡż'.includes(lc)) h += `<span class="m-voiced">${c}</span>`;
    else if ('àìù'.includes(lc)) h += `<span class="m-tonic">${c}</span>`;
    else h += esc(c);
  }
  return h;
}

// ---------- caricamento dizionario con barra ----------
let lexReady = null;
export function ensureLexicon(container) {
  if (!lexReady) lexReady = loadLexicon('data/lessico.txt');
  if (container) {
    container.innerHTML = `<div class="loading">Carico il dizionario (≈420.000 parole)…<div class="progress" style="max-width:300px;margin:12px auto"><div style="width:60%"></div></div></div>`;
  }
  return lexReady;
}

// ---------- router ----------
const routes = {
  testo: () => import('./testo.js'),
  copione: () => import('./copione.js'),
  teoria: () => import('./teoria.js'),
  gioco: () => import('./gioco.js'),
  admin: () => import('./admin.js'),
};
let current = null;
async function route() {
  const hash = location.hash.slice(1) || 'testo';
  const [name, ...rest] = hash.split('/');
  const r = routes[name] ? name : (name.match(/^[A-ZÉÓ]\d+$/) ? 'teoria' : 'testo');
  document.querySelectorAll('nav.tabs a').forEach(a => a.classList.toggle('active', a.dataset.route === r));
  const app = $('#app');
  if (current && current.unmount) current.unmount();
  const mod = await routes[r]();
  current = mod;
  await mod.mount(app, rest.join('/') || (r === 'teoria' && name !== 'teoria' ? name : ''));
}
window.addEventListener('hashchange', route);
route();
