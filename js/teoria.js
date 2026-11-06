import { REGOLE, CATEGORIE, DIFFICILI, OMOGRAFI, VARIANTI } from './rules.js';
import { analyzeWord, stripDizione, lexiconSize } from './engine.js';
import { ensureLexicon, colorize, esc, $ } from './app.js';

export async function mount(app, focus) {
  await ensureLexicon(app);
  const exHTML = (ex) => {
    // se l'esempio è una singola parola, controlla che il dizionario sia d'accordo
    const word = ex.split(/[ (→,]/)[0];
    if (/^[\p{L}ṡż]+$/u.test(word) && word.length > 2) {
      const a = analyzeWord(stripDizione(word.toLowerCase()));
      const exp = word.toLowerCase();
      const agree = [a.marked, ...a.alternative, ...a.omografi].some(c => [...exp].every((ch, i) => !'èéòóàìùṡż'.includes(ch) || c[i] === ch || i === exp.length - 1));
      const rest = ex.slice(word.length);
      return `<span class="${agree || a.fonte === 'regole' ? '' : 'diff'}" title="${agree ? '' : 'Il dizionario indica: ' + esc(a.marked)}">${colorize(word)}${esc(rest)}</span>`;
    }
    return `<span>${colorize(ex)}</span>`;
  };
  const ruleHTML = r => `
    <article class="card rule" id="r-${r.id}">
      <h3><span class="rid">${r.id}</span> ${esc(r.titolo)} ${r.tendenza ? '<span class="tag warn">tendenza</span>' : ''}</h3>
      ${r.testo ? `<p>${esc(r.testo)}</p>` : ''}
      ${r.esempi && r.esempi.length ? `<div class="ex">${r.esempi.map(exHTML).join('')}</div>` : ''}
      ${r.eccezioni && r.eccezioni.length ? `<p class="small"><b>Eccezioni:</b> ${r.eccezioni.map(e => colorize(e)).join(' · ')}</p>` : ''}
      ${r.varianti ? `<ul class="rulelist">${Object.values(VARIANTI.tipi).map(t => `<li><span><b>${esc(t.titolo)}.</b> ${esc(t.testo)} <span class="ex" style="white-space:nowrap">${colorize(t.esempio)}</span></span></li>`).join('')}</ul>
        <p class="small muted">Per ogni variante il programma dice anche da dove viene: se è ${esc(VARIANTI.accettata)}, oppure ${esc(VARIANTI.regionale)}. Quando Wiktionary lo specifica, aggiunge l’etichetta (per esempio “${esc(VARIANTI.etichette.N)}”).</p>` : ''}
      ${r.difficili ? `<div class="ex">${DIFFICILI.map(d => `<span>${colorize(d)}</span>`).join('')}</div>` : ''}
    </article>`;
  app.innerHTML = `
    <h1>Teoria</h1>
    <p class="lead">Queste sono <b>tutte</b> le regole che il programma usa, nell’ordine in cui le applica. Ogni parola segnata nel Testo libero indica quale regola segue o di quale è un’eccezione. Gli esempi sono controllati dal vivo sul dizionario (${lexiconSize().toLocaleString('it')} voci): una sottolineatura ondulata vuol dire che il dizionario non è d’accordo.</p>
    <div class="card" style="margin-bottom:16px">
      <h3>I segni</h3>
      <p style="font-family:var(--serif);font-size:1.15rem;margin:0">
        <b class="m-open">è ò</b> vocale aperta · <b class="m-closed">é ó</b> vocale chiusa · <b class="m-tonic">à ì ù</b> accento tonico (sdrucciole e parole difficili) · <b class="m-voiced">ṡ</b> s sonora (come in <i>ṡbaglio</i>) · <b class="m-voiced">ż</b> z sonora (come in <i>żèro</i>). Le s e le z senza segno sono sorde.
      </p>
    </div>
    <input class="search" id="q" placeholder="Cerca una regola o una parola (es. -ezza, dittongo, sbaglio)…">
    <nav class="toc">${CATEGORIE.map(c => `<a href="#teoria/cat-${c.id}">${esc(c.titolo)}</a>`).join('')}<a href="#teoria/omografi">Omografi</a></nav>
    <div id="rules">
      ${CATEGORIE.map(c => `<section id="r-cat-${c.id}"><h2 style="margin-top:22px">${esc(c.titolo)}</h2>${REGOLE.filter(r => r.cat === c.id).map(ruleHTML).join('')}</section>`).join('')}
      <section id="r-omografi"><h2 style="margin-top:22px">Omografi per cui il programma chiede di scegliere</h2>
        <div class="card"><div class="ex" style="font-family:var(--serif);font-size:1.1rem">${[...OMOGRAFI].map(k => { const a = analyzeWord(k); return `<span style="margin-right:14px">${[a.marked, ...a.omografi].map(colorize).join(' / ')}</span>`; }).join('')}</div></div>
      </section>
    </div>`;
  $('#q', app).addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    app.querySelectorAll('.rule').forEach(el => { el.classList.toggle('hidden', q && !el.textContent.toLowerCase().includes(q)); });
  });
  if (focus) {
    const el = document.getElementById('r-' + focus);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
}
export function unmount() {}
