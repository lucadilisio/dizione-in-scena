// Pulsanti "Installa l'app" per Android e iPhone.
// Android/Chrome: apre la finestra di installazione vera (evento beforeinstallprompt).
// iPhone: Apple non permette l'installazione da un sito, quindi mostriamo le istruzioni.
import { esc } from './app.js';

let deferred = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const iosNotSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; render(); });
window.addEventListener('appinstalled', () => { deferred = null; render(); });

const SHARE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

function dialog(title, steps, note = '') {
  let d = document.getElementById('install-dialog');
  if (!d) { d = document.createElement('dialog'); d.id = 'install-dialog'; document.body.appendChild(d); }
  d.innerHTML = `<h2>${esc(title)}</h2><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>${note ? `<p class="small muted">${note}</p>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="install-close">Ho capito</button></div>`;
  d.querySelector('#install-close').addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.showModal();
}

async function android() {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice;
    deferred = null; render();
    return;
  }
  dialog('Installa su Android', [
    'Apri questa pagina con <b>Chrome</b>.',
    'Tocca il menu <b>⋮</b> in alto a destra.',
    'Scegli <b>Installa app</b> (oppure <b>Aggiungi a schermata Home</b>).',
    'Conferma: l’icona <b>Dizione</b> compare tra le tue app.',
  ], isAndroid ? 'Con Samsung Internet: menu ≡ → <b>Aggiungi pagina a</b> → <b>Schermata Home</b>.' : 'Stai usando un computer o un iPhone: queste istruzioni valgono per un telefono Android.');
}

function iphone() {
  dialog('Installa su iPhone', [
    iosNotSafari ? 'Tocca il pulsante <b>Condividi</b> ' + SHARE_ICON + ' (in Chrome è in alto a destra, nella barra degli indirizzi).' : 'Apri questa pagina con <b>Safari</b> e tocca il pulsante <b>Condividi</b> ' + SHARE_ICON + ' in basso.',
    'Scorri verso il basso e scegli <b>Aggiungi alla schermata Home</b> ⊞.',
    'Lascia attivo <b>Apri come app web</b>, se compare, e tocca <b>Aggiungi</b>.',
    'L’icona <b>Dizione</b> compare nella schermata Home.',
  ], isIOS ? 'Apple non permette ai siti di installarsi da soli: per questo serve fare questi passaggi a mano.' : 'Queste istruzioni valgono per iPhone e iPad.');
}

function render() {
  const box = document.getElementById('install');
  if (!box) return;
  if (standalone()) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<span>📱 Usala come app:</span>
    <button class="btn ${isAndroid || (!isIOS && deferred) ? 'primary' : ''}" id="inst-android">Installa su Android</button>
    <button class="btn ${isIOS ? 'primary' : ''}" id="inst-ios">Installa su iPhone</button>`;
  box.querySelector('#inst-android').addEventListener('click', android);
  box.querySelector('#inst-ios').addEventListener('click', iphone);
}

export function initInstall() {
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* non bloccante */ });
}
