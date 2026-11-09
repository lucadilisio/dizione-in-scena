import { analyzeDocx, buildDocx, PARTI } from './docx.js';
import { stats } from './engine.js';
import { selectorHTML, bindSelector, getOpts, ensureLexicon, colorize, esc, store, $ } from './app.js';

let state = null;   // { name, buffer, words, preview, count, choices: Map }

// quali parti del copione segnare (di default solo le battute)
const getParti = () => ({ ...Object.fromEntries(PARTI.map(p => [p.id, p.def])), ...store.get('parti', {}) });
function partiHTML() {
  const o = getParti();
  return `<div class="selector" role="group" aria-label="Parti del copione da segnare">
    <span class="label">Nel copione:</span>
    ${PARTI.map(p => `<label class="chip"><input type="checkbox" data-parte="${p.id}" ${o[p.id] ? 'checked' : ''}><span class="tick"></span> ${esc(p.label)}</label>`).join('')}
  </div>`;
}

export async function mount(app) {
  await ensureLexicon(app);
  app.innerHTML = `
    <h1>Copione</h1>
    <p class="lead">Carica un copione in formato Word (.docx). Il programma cambia solo i caratteri (e → è/é, o → ò/ó, s → ṡ, z → ż, accenti tonici): impaginazione, stili, tabelle, intestazioni e note restano identici.</p>
    ${selectorHTML()}
    ${partiHTML()}
    <label class="drop" id="drop">
      <input type="file" id="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
      <div class="icon">🎭</div>
      <div><b>Trascina qui il copione</b> oppure tocca per sceglierlo</div>
      <div class="small muted">Solo .docx. Il file resta sul tuo dispositivo: niente viene caricato su internet.</div>
    </label>
    <div class="notice" role="note">
      <b>Solo file Word (.docx).</b> I PDF non sono supportati: in un PDF le lettere non si possono sostituire senza rovinare l’impaginazione.
      Se il copione ti è arrivato in PDF, chiedi a chi l’ha scritto il file Word originale da cui è stato esportato.
      In alternativa puoi aprire il PDF con Word (File → Apri) e salvarlo come .docx: Word lo converte, ma controlla l’impaginazione prima di usarlo.
    </div>
    <div id="result"></div>`;
  const drop = $('#drop', app), file = $('#file', app);
  file.addEventListener('change', () => file.files[0] && load(file.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) load(f); });
  bindSelector(app, () => state && analyze());
  app.querySelectorAll('[data-parte]').forEach(inp => inp.addEventListener('change', () => {
    const o = getParti(); o[inp.dataset.parte] = inp.checked; store.set('parti', o); if (state) analyze();
  }));
  if (state) analyze();
}

async function load(f) {
  if (!/\.docx$/i.test(f.name)) {
    const pdf = /\.pdf$/i.test(f.name);
    $('#result').innerHTML = `<div class="notice bad" role="alert"><b>${pdf ? 'I PDF non sono supportati.' : 'Serve un file Word in formato .docx.'}</b>
      ${pdf ? 'Carica il file Word originale del copione. Se hai solo il PDF, aprilo con Word (File → Apri) e salvalo come .docx, poi caricalo qui.' : 'Se hai un .doc (Word vecchio) aprilo con Word e scegli File → Salva con nome → Documento di Word (.docx).'}</div>`;
    return;
  }
  state = { name: f.name, buffer: await f.arrayBuffer(), choices: new Map() };
  analyze();
}

async function analyze() {
  const res = $('#result');
  res.innerHTML = '<div class="loading">Analizzo il copione…</div>';
  try {
    const { words, preview, count } = await analyzeDocx(state.buffer, getOpts(), getParti());
    state.words = words; state.preview = preview; state.count = count;
    render();
  } catch (e) {
    res.innerHTML = `<p class="tag bad">Non riesco a leggere il file: ${esc(e.message)}</p>`;
  }
}

function render() {
  const s = stats(state.words);
  // omografi: una scelta per parola (non per occorrenza)
  const omo = new Map();
  const dubbi = new Map();
  for (const w of state.words) {
    if (w.omografi.length && !omo.has(w.key)) omo.set(w.key, w);
    else if (w.omografi.length) omo.get(w.key).count = (omo.get(w.key).count || 1) + 1;
    if (w.fonte === 'regole' && w.dubbi.length && !dubbi.has(w.key)) dubbi.set(w.key, w);
  }
  const ctx = w => {
    const i = w.context.indexOf(w.word);
    const a = Math.max(0, i - 50), b = Math.min(w.context.length, i + w.word.length + 50);
    return (a > 0 ? '…' : '') + esc(w.context.slice(a, i)) + '<mark>' + esc(w.word) + '</mark>' + esc(w.context.slice(i + w.word.length, b)) + (b < w.context.length ? '…' : '');
  };
  const omoHTML = [...omo.values()].map(w => {
    const opts = [w.marked, ...w.omografi];
    const cur = state.choices.get(w.key) || w.marked;
    return `<div class="amb-item">
      <div class="ctx">${ctx(w)} ${w.count > 1 ? `<span class="tag">${w.count} volte</span>` : ''}</div>
      <div class="choices">${opts.map(o => `<label class="choice"><input type="radio" name="omo-${esc(w.key)}" value="${esc(o)}" data-key="${esc(w.key)}" ${o === cur ? 'checked' : ''}> <b>${colorize(o)}</b> <span class="choice-desc">${esc((w.descrizioni || {})[o] || '')}</span></label>`).join('')}</div>
    </div>`;
  }).join('');
  const dubHTML = [...dubbi.values()].slice(0, 60).map(w => `<span class="tag warn" style="font-family:var(--serif);font-size:1rem;margin:2px">${colorize(w.out)}</span>`).join(' ');
  $('#result').innerHTML = `
    <div class="stats">
      <div class="stat"><b>${s.totale}</b>parole</div>
      <div class="stat"><b>${s.dizionario + s.flessa}</b>dal dizionario</div>
      <div class="stat"><b>${s.regole}</b>dalle regole</div>
      <div class="stat"><b>${omo.size}</b>omografi da scegliere</div>
    </div>
    ${omo.size ? `<h2>Omografi: scegli la pronuncia</h2><p class="muted">Queste parole cambiano pronuncia secondo il significato. La scelta vale per tutte le volte che la parola compare.</p><div class="amb" id="omo">${omoHTML}</div>` : ''}
    ${dubbi.size ? `<h2 style="margin-top:20px">Da controllare</h2><p class="muted">Parole che non sono nel dizionario e per cui le regole non bastano (nomi propri, parole rare o inventate). Sono segnate solo dove le regole sono sicure.</p><div>${dubHTML}${dubbi.size > 60 ? ` <span class="muted">e altre ${dubbi.size - 60}</span>` : ''}</div>` : ''}
    <div class="row" style="margin:22px 0">
      <button class="btn primary big" id="dl">⬇ Scarica il copione segnato</button>
      <span id="dlmsg" class="small muted"></span>
    </div>
    <h2>Anteprima</h2>
    <p class="small muted">Riconosciuti: ${state.count.battuta} battute · ${state.count.canzone} righe di canzoni · ${state.count.didascalia} didascalie · ${state.count.nome} nomi · ${state.count.altro} altre parti.
      In grigio le parti che <b>non</b> vengono segnate (passa sopra per vedere di che tipo sono). Se il riconoscimento sbaglia, cambia le caselle “Nel copione”.</p>
    <div class="card preview">${state.preview.slice(0, 500).map(segs => segs.map(sg => getParti()[sg.k]
      ? colorize(sg.t) : `<span class="skip skip-${sg.k}" title="${esc(PARTI.find(p => p.id === sg.k).label)}: non segnato">${esc(sg.t)}</span>`).join('')).join('\n')}${state.preview.length > 500 ? '\n…' : ''}</div>`;
  document.querySelectorAll('#omo input[type=radio]').forEach(r => r.addEventListener('change', () => {
    state.choices.set(r.dataset.key, r.value);
  }));
  $('#dl').addEventListener('click', download);
}

async function download() {
  const btn = $('#dl'); btn.disabled = true; $('#dlmsg').textContent = 'Preparo il file…';
  try {
    const { blob, changed } = await buildDocx(state.buffer, getOpts(), state.choices, getParti());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.name.replace(/\.docx$/i, '') + ' - dizione.docx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $('#dlmsg').textContent = `Fatto: ${changed} porzioni di testo aggiornate.`;
  } catch (e) {
    $('#dlmsg').textContent = 'Errore: ' + e.message;
  } finally { btn.disabled = false; }
}

export function unmount() {}
