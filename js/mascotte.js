// "Masca": la mascotte del gioco, una piccola maschera teatrale che cambia umore con la streak.
// umore: 'felice' | 'assonnata' | 'triste' | 'festa'
import { esc } from './app.js';

export const NOME = 'Masca';

export function mascotte(umore = 'felice', { size = 120, msg = '' } = {}) {
  const svg = `
  <svg class="masca-svg" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
    <g class="m-corpo">
      <!-- nastri -->
      <path class="m-nastro m-nastro-s" d="M14 58 C4 62 2 76 8 86" fill="none" stroke="#8e1b2c" stroke-width="4" stroke-linecap="round"/>
      <path class="m-nastro m-nastro-d" d="M106 58 C116 62 118 76 112 86" fill="none" stroke="#8e1b2c" stroke-width="4" stroke-linecap="round"/>
      <!-- maschera -->
      <path d="M14 40 C14 26 34 20 60 20 C86 20 106 26 106 40 L106 62 C106 92 86 108 60 108 C34 108 14 92 14 62 Z" fill="#f6d27a" stroke="#b8860b" stroke-width="3"/>
      <path d="M22 44 C22 34 38 29 60 29 C82 29 98 34 98 44" fill="none" stroke="#fff3c4" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      <!-- corona (festa) -->
      <g class="m-corona" transform="translate(0 -6)">
        <path d="M38 22 L46 8 L54 20 L60 4 L66 20 L74 8 L82 22 Z" fill="#f2c94c" stroke="#b8860b" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="60" cy="6" r="3" fill="#e05a6d"/>
      </g>
      <!-- guance -->
      <ellipse cx="32" cy="74" rx="8" ry="5" fill="#f19a8c" opacity=".7"/>
      <ellipse cx="88" cy="74" rx="8" ry="5" fill="#f19a8c" opacity=".7"/>
      <!-- sopracciglia -->
      <g class="m-ciglia" stroke="#7a4a12" stroke-width="3.5" stroke-linecap="round" fill="none">
        <path class="m-ciglio-s" d="M30 44 Q40 39 50 44"/>
        <path class="m-ciglio-d" d="M70 44 Q80 39 90 44"/>
      </g>
      <!-- occhi -->
      <g class="m-occhi">
        <ellipse cx="40" cy="56" rx="10" ry="8" fill="#2b1d16"/>
        <ellipse cx="80" cy="56" rx="10" ry="8" fill="#2b1d16"/>
        <circle cx="43" cy="53" r="2.6" fill="#fff"/><circle cx="83" cy="53" r="2.6" fill="#fff"/>
        <rect class="m-palpebra" x="29" y="46" width="22" height="0" fill="#f6d27a"/>
        <rect class="m-palpebra" x="69" y="46" width="22" height="0" fill="#f6d27a"/>
      </g>
      <!-- bocche -->
      <path class="m-bocca m-bocca-felice" d="M42 80 Q60 98 78 80 Q60 90 42 80 Z" fill="#8e1b2c" stroke="#7a4a12" stroke-width="2" stroke-linejoin="round"/>
      <ellipse class="m-bocca m-bocca-assonnata" cx="60" cy="86" rx="7" ry="8" fill="#8e1b2c" stroke="#7a4a12" stroke-width="2"/>
      <path class="m-bocca m-bocca-triste" d="M44 92 Q60 78 76 92" fill="none" stroke="#7a4a12" stroke-width="3.5" stroke-linecap="round"/>
      <path class="m-bocca m-bocca-festa" d="M38 78 Q60 104 82 78 Z" fill="#8e1b2c" stroke="#7a4a12" stroke-width="2" stroke-linejoin="round"/>
      <path class="m-bocca m-bocca-festa" d="M46 80 Q60 86 74 80" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <!-- lacrima (triste) -->
      <path class="m-lacrima" d="M36 66 C36 66 31 73 31 76 A5 5 0 0 0 41 76 C41 73 36 66 36 66 Z" fill="#7aa2ff"/>
    </g>
    <!-- z z z (assonnata) -->
    <g class="m-zzz" fill="#6f625a" font-family="Georgia, serif" font-weight="700">
      <text x="96" y="30" font-size="14">z</text><text x="104" y="18" font-size="11">z</text><text x="110" y="8" font-size="8">z</text>
    </g>
    <!-- coriandoli (festa) -->
    <g class="m-coriandoli">
      <rect x="10" y="20" width="6" height="3" fill="#e05a6d"/><rect x="100" y="16" width="6" height="3" fill="#2dd4bf"/>
      <rect x="22" y="6" width="3" height="6" fill="#7aa2ff"/><rect x="92" y="34" width="3" height="6" fill="#f2c94c"/>
      <circle cx="16" cy="40" r="2.5" fill="#c084fc"/><circle cx="104" cy="44" r="2.5" fill="#e05a6d"/>
    </g>
  </svg>`;
  return `<div class="masca" data-umore="${esc(umore)}">${svg}${msg ? `<div class="masca-fumetto" role="status">${esc(msg)}</div>` : ''}</div>`;
}
