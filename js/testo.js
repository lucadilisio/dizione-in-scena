import { markText, analyzeWord, stripDizione } from './engine.js';
import { regolaById } from './rules.js';
import { selectorHTML, bindSelector, getOpts, ensureLexicon, colorize, esc, store, $ } from './app.js';

const FONTE = { dizionario: 'Dal dizionario', flessa: 'Forma flessa (da tabella di coniugazione/declinazione)', regole: 'Parola non nel dizionario: dedotta dalle regole' };
let lastWords = [];

export async function mount(app) {
  await ensureLexicon(app);
  app.innerHTML = `
    <h1>Testo libero</h1>
    <p class="lead">Scrivi una parola, una frase o una battuta: la dizione compare mentre scrivi. Tocca una parola per sapere perché si pronuncia così.</p>
    ${selectorHTML()}
    <div class="grid2">
      <div>
        <textarea class="input" id="in" placeholder="Es. Essere o non essere, questo è il problema." spellcheck="false"></textarea>
        <div class="row small muted" style="margin-top:6px"><span id="count"></span></div>
      </div>
      <div class="card">
        <div class="output" id="out" aria-live="polite"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="copy">Copia testo segnato</button>
          <span id="copied" class="small muted"></span>
        </div>
      </div>
    </div>
    <div class="legend">
      <span><b class="m-open">è ò</b> aperta</span>
      <span><b class="m-closed">é ó</b> chiusa</span>
      <span><b class="m-voiced">ṡ ż</b> sonora</span>
      <span><b class="m-tonic">à ì ù</b> accento tonico</span>
      <span><i class="sw" style="background:var(--warn-bg)"></i>omografo o dubbio: controlla</span>
      <span><i class="sw" style="background:var(--unk-bg)"></i>non nel dizionario (regole)</span>
    </div>
    <div id="detail" class="detail"></div>`;
  const inp = $('#in', app);
  inp.value = store.get('testo', '');
  let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 120); store.set('testo', inp.value); });
  bindSelector(app, render);
  $('#copy', app).addEventListener('click', async () => {
    const { text } = markText(inp.value, getOpts());
    try { await navigator.clipboard.writeText(text); $('#copied', app).textContent = 'Copiato!'; }
    catch { $('#copied', app).textContent = 'Copia non riuscita: seleziona il testo a mano.'; }
    setTimeout(() => { $('#copied', app).textContent = ''; }, 2000);
  });
  $('#out', app).addEventListener('click', e => {
    const el = e.target.closest('.w'); if (!el) return;
    app.querySelectorAll('.w.sel').forEach(x => x.classList.remove('sel'));
    el.classList.add('sel');
    showDetail(lastWords[+el.dataset.i]);
  });
  render();
  inp.focus();
}

function render() {
  const app = $('#app');
  const inp = $('#in', app); if (!inp) return;
  const opts = getOpts();
  const { words } = markText(inp.value, opts);
  lastWords = words;
  // ricostruisce il testo con span cliccabili
  let html = '', last = 0;
  words.forEach((w, i) => {
    html += esc(inp.value.slice(last, w.index));
    const cls = ['w', w.fonte === 'regole' ? 'regole' : '', w.omografi.length ? 'omografo' : '', w.dubbi.length ? 'dubbio' : ''].join(' ');
    html += `<span class="${cls}" data-i="${i}">${colorize(w.out)}</span>`;
    last = w.index + w.word.length;
  });
  html += esc(inp.value.slice(last));
  $('#out', app).innerHTML = html || '<span class="muted">Il testo segnato apparirà qui.</span>';
  $('#count', app).textContent = words.length ? `${words.length} parole` : '';
  if (words.length === 1) showDetail(words[0]);
  else if (!words.length) $('#detail', app).innerHTML = '';
}

function showDetail(w) {
  if (!w) return;
  const box = $('#detail');
  const rules = (w.regole || []).map(r => {
    const R = regolaById(r.id); if (!R) return '';
    const tag = r.ok ? (r.tendenza ? '<span class="tag ok">segue la tendenza</span>' : '<span class="tag ok">segue la regola</span>')
      : (r.tendenza ? '<span class="tag warn">contro tendenza</span>' : '<span class="tag bad">eccezione</span>');
    return `<li><a class="rid" href="#teoria/${R.id}">${R.id}</a> <span>${esc(R.titolo)}</span> ${tag}</li>`;
  }).join('');
  const full = w.marked;
  const alts = w.alternative.length ? `<p><b>Varianti ammesse:</b> ${w.alternative.map(a => `<span style="font-family:var(--serif);font-size:1.15rem">${colorize(a)}</span>`).join(', ')}</p>` : '';
  const homs = w.omografi.length ? `<p><span class="tag warn">Omografo</span> si scrive uguale ma cambia pronuncia con il significato: ${[w.marked, ...w.omografi].map(a => `<b style="font-family:var(--serif);font-size:1.2rem">${colorize(a)}</b>`).join(' oppure ')}. Scegli in base al contesto.</p>` : '';
  const dub = w.dubbi.length ? `<p><span class="tag warn">Dubbio</span> Le regole non bastano per: ${w.dubbi.map(d => ({ timbro: 'apertura della vocale', s: 'la s', z: 'la z' }[d])).join(', ')}. Verifica su un dizionario d’ortoepia.</p>` : '';
  const at = w.atona ? '<p class="muted small">Parola atona: non ha accento proprio (regola <a href="#teoria/B2">B2</a>).</p>' : '';
  box.innerHTML = `<div class="card">
    <div class="row" style="justify-content:space-between">
      <div class="big-word">${colorize(full)}</div>
      <span class="tag">${esc(FONTE[w.fonte] || '')}</span>
    </div>
    ${homs}${alts}${dub}${at}
    ${rules ? `<b>Regole</b><ul class="rulelist">${rules}</ul>` : '<p class="muted small">Nessuna regola specifica: la pronuncia va imparata parola per parola.</p>'}
  </div>`;
}

export function unmount() {}
