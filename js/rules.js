// Regole di dizione usate dal programma.
// È l'UNICA fonte: la pagina "Teoria" le mostra da qui e il motore le usa per
// spiegare le parole del dizionario e per indovinare quelle che non conosce.
//
// Ogni regola vocalica ha un'espressione regolare con il gruppo (?<v>…) sulla vocale accentata.
// `q`: 'open' | 'closed' (timbro) oppure null (regola che fissa solo l'accento).
// Le regole s/z hanno il gruppo (?<c>…) sulla consonante e `v`: 's' (sorda) | 'z' (sonora).

export const CATEGORIE = [
  { id: 'base', titolo: 'Principi generali' },
  { id: 'E', titolo: 'La E: aperta (è) o chiusa (é)' },
  { id: 'O', titolo: 'La O: aperta (ò) o chiusa (ó)' },
  { id: 'S', titolo: 'La S: sorda o sonora (ṡ)' },
  { id: 'Z', titolo: 'La Z: sorda o sonora (ż)' },
  { id: 'T', titolo: 'L’accento tonico' },
  { id: 'X', titolo: 'Fenomeni di frase' },
];

export const REGOLE = [
  // ---------------- PRINCIPI ----------------
  { id: 'B1', cat: 'base', titolo: 'Solo la vocale accentata è aperta o chiusa',
    testo: 'La distinzione tra è/é e ò/ó vale solo per la vocale su cui cade l’accento. Tutte le e e le o non accentate si pronunciano chiuse e non si segnano.',
    esempi: ['bèllo → la seconda o è atona', 'perché → la prima e è atona'] },
  { id: 'B2', cat: 'base', titolo: 'Parole atone (articoli, preposizioni, pronomi deboli)',
    testo: 'Articoli, preposizioni (anche articolate), congiunzioni e pronomi deboli si appoggiano alla parola vicina e non hanno accento proprio: non si segnano.',
    esempi: ['il, lo, la, gli, le, un, di, del, della, nel, con, per, e, o, ma, se, che, mi, ti, si, ci, vi, ne, non'] },
  { id: 'B3', cat: 'base', titolo: 'Da dove vengono i segni',
    testo: 'Il programma usa prima il dizionario (≈96.000 voci di Wiktionary con trascrizione fonetica, più ≈330.000 forme flesse dalle tabelle di coniugazione e declinazione). Solo se una parola non c’è applica le regole di questa pagina, e lo dice. Quando il dizionario e le regole non coincidono, la parola viene indicata come eccezione.',
    esempi: [] },
  { id: 'B4', cat: 'base', titolo: 'Omografi e varianti',
    testo: 'Omografi: parole scritte uguali ma pronunciate diversamente secondo il significato (pèsca/pésca). Il programma non può capire il significato, quindi le segnala e ti fa scegliere. Varianti: altre pronunce che il dizionario registra oltre a quella principale. Il programma segna sempre la principale (quella della dizione tradizionale) e mostra le varianti con il loro motivo (B5).',
    esempi: ['pèsca (frutto) / pésca (il pescare)', 'vènti (plurale di vento) / vénti (20)', 'lègge (verbo) / légge (norma)', 'bòtte (percosse) / bótte (barile)', 'ancóra (avverbio) / àncora (della nave)', 'ròṡa (fiore) / rósa (rosicchiata)'] },

  { id: 'B5', cat: 'base', titolo: 'Perché esistono le varianti',
    testo: 'L’italiano standard nasce dal fiorentino colto, ma ogni regione lo pronuncia a modo suo: per questo i dizionari registrano più pronunce per molte parole. La dizione teatrale segue la pronuncia standard tradizionale, che è quella segnata dal programma. Accanto a ogni variante il programma indica che cosa cambia e perché:',
    varianti: true, esempi: [] },

  // ---------------- E APERTA ----------------
  { id: 'E1', cat: 'E', q: 'open', titolo: 'Dittongo IE accentato → è',
    re: /i(?<v>e)(?:[^aeiou]+[aeiou]+|[^aeiou]*)$/, esempi: ['piède', 'cièlo', 'ièri', 'bicchière', 'cavalière', 'chièṡa'],
    eccezioni: ['Le forme in -iéte del verbo (siéte è variante ammessa)'] },
  { id: 'E2', cat: 'E', q: 'open', titolo: 'Suffisso -ello / -ella → è',
    re: /(?<v>e)ll[oaie]$/, esempi: ['bèllo', 'cappèllo', 'sorèlla', 'cervèllo'],
    eccezioni: ['quéllo', 'capéllo (dei capelli)', 'stélla'] },
  { id: 'E3', cat: 'E', q: 'open', titolo: 'Suffissi -ente / -enza → è',
    re: /(?<!m)(?<v>e)nt[ei]$|(?<v2>e)nz[ae]$/, esempi: ['potènte', 'prudènza', 'gènte', 'presènza'],
    eccezioni: ['L’avverbio in -ménte è chiuso (vedi É1)'] },
  { id: 'E4', cat: 'E', q: 'open', titolo: 'Terminazioni -eo / -ea → è',
    re: /(?<v>e)[oaie]$/, esempi: ['europèo', 'idèa', 'trachèa', 'plebèo'] },
  { id: 'E5', cat: 'E', q: 'open', titolo: 'Condizionale -rei, -rebbe, -rebbero → è',
    re: /r(?<v>e)(?:i|bbe|bbero)$/, esempi: ['farèi', 'sarèbbe', 'potrèbbero'],
    eccezioni: ['La 2ª persona sing. e le persone plurali -résti, -rémmo, -réste sono chiuse (É7)', 'Per alcune forme (faréi) il dizionario riporta la pronuncia chiusa, diffusa nell’uso moderno'] },
  { id: 'E6', cat: 'E', q: 'open', titolo: 'Passato remoto -etti, -ette, -ettero → è',
    re: /(?<v>e)tt(?:i|e|ero)$/, esempi: ['credètti', 'dovètte', 'potèttero'],
    eccezioni: ['Il dizionario ammette anche la variante chiusa (credétti)'] },
  { id: 'E7', cat: 'E', q: 'open', titolo: 'Suffissi -estre, -enne, -ennio → è',
    re: /(?<v>e)(?:str[ei]|nn[ei]|nni[oi])$/, esempi: ['campèstre', 'decènne', 'millènnio'] },
  { id: 'E8', cat: 'E', q: 'open', titolo: 'Gerundio -endo → è',
    re: /(?<v>e)ndo$/, esempi: ['credèndo', 'facèndo', 'leggèndo'] },
  { id: 'E9', cat: 'E', q: 'open', titolo: 'Parole tronche in -è → è',
    re: /(?<v>[eè])$/, solo: 'tronca', esempi: ['è (verbo)', 'caffè', 'tè', 'cioè', 'ahimè'],
    eccezioni: ['I composti di che e di tre sono chiusi (É8)'] },
  { id: 'E10', cat: 'E', q: 'open', titolo: 'Tendenza: e accentata nelle sdrucciole → è',
    tendenza: true, esempi: ['mèdico', 'pècora', 'època', 'sèdano'],
    testo: 'Non è una regola fissa ma una tendenza statistica: nelle parole accentate sulla terzultima sillaba la e tonica è spesso aperta.' },

  // ---------------- E CHIUSA ----------------
  { id: 'É1', cat: 'E', q: 'closed', titolo: 'Suffissi -mento / -mente → é',
    re: /m(?<v>e)nt[oei]$/, esempi: ['moménto', 'veraménte', 'testaménto'] },
  { id: 'É2', cat: 'E', q: 'closed', titolo: 'Suffisso -ezza → é',
    re: /(?<v>e)zz[ae]$/, esempi: ['bellézza', 'giovinézza', 'certézza'],
    eccezioni: ['mèzzo (e derivati)'] },
  { id: 'É3', cat: 'E', q: 'closed', titolo: 'Suffissi -ese / -esa (aggettivi e nomi) → é',
    re: /(?<v>e)s[eia]$/, esempi: ['francéṡe', 'paéṡe', 'marchésa', 'spéṡa'],
    eccezioni: ['chièṡa (prevale il dittongo ie, E1)'] },
  { id: 'É4', cat: 'E', q: 'closed', titolo: 'Suffissi -eto / -eta (luoghi, collettivi) → é',
    re: /(?<v>e)t[oaie]$/, esempi: ['frutéto', 'pinéta', 'segréto', 'canéto'],
    eccezioni: ['Molte parole dotte sono aperte: pianèta, poèta, atlèta, profèta'] },
  { id: 'É5', cat: 'E', q: 'closed', titolo: 'Suffisso -evole → é',
    re: /(?<v>e)vol[ei]$/, esempi: ['piacévole', 'amichévole', 'favorévole'] },
  { id: 'É6', cat: 'E', q: 'closed', titolo: 'Suffisso -esco / -esca → é',
    re: /(?<v>e)sc(?:o|a|hi|he)$/, esempi: ['pittorésco', 'fiabésca', 'tedésco'],
    eccezioni: ['pèsca (frutto), èsca (verbo uscire)'] },
  { id: 'É7', cat: 'E', q: 'closed', titolo: 'Desinenze verbali chiuse',
    re: /(?:(?<v>e)v(?:o|i|a|ano)|(?<v2>e)ss(?:i|e|imo|ero)|r(?<v3>e)(?:mo|te|sti|mmo|ste)|(?<v4>e)re)$/,
    esempi: ['credévo (imperfetto)', 'avéssi (cong. imperfetto)', 'farémo, faréte (futuro)', 'farésti, farémmo (condizionale)', 'vedére, potére (infinito -ére)'],
    eccezioni: ['-ière (bicchière, cavalière) segue il dittongo ie (E1)'] },
  { id: 'É8', cat: 'E', q: 'closed', titolo: 'Composti di che e di tre → é',
    re: /(?:ch|tr)(?<v>[eé])$/, solo: 'tronca', esempi: ['perché', 'poiché', 'affinché', 'benché', 'ventitré', 'né', 'sé'] },
  { id: 'É9', cat: 'E', q: 'closed', titolo: 'Suffisso diminutivo -etto / -etta → é',
    re: /(?<v>e)tt[oaie]$/, esempi: ['caṡétta', 'librétto', 'piccolétto'],
    eccezioni: ['Le parole latine in -ètto sono aperte: lètto, pètto, effètto, perfètto, progètto, oggètto, rispètto, difètto'] },

  // ---------------- O APERTA ----------------
  { id: 'O1', cat: 'O', q: 'open', titolo: 'Dittongo UO → ò',
    re: /u(?<v>o)/, esempi: ['cuòre', 'buòno', 'fuòco', 'uòmo', 'scuòla'] },
  { id: 'O2', cat: 'O', q: 'open', titolo: 'Parole tronche in -ò → ò',
    re: /(?<v>[oò])$/, solo: 'tronca', esempi: ['però', 'farò', 'andò', 'ciò', 'può', 'perciò'] },
  { id: 'O3', cat: 'O', q: 'open', titolo: 'Suffissi -orio / -oria → ò',
    re: /(?<v>o)ri[oaie]$/, esempi: ['vittòria', 'memòria', 'laboratòrio', 'stòria'] },
  { id: 'O4', cat: 'O', q: 'open', titolo: 'Suffisso -otto / -otta → ò',
    re: /(?<v>o)tt[oaie]$/, esempi: ['giovanòtto', 'salòtto', 'cappòtto', 'pancòtto'],
    eccezioni: ['sótto', 'rótto', 'condótto, prodótto (da -durre)'] },
  { id: 'O5', cat: 'O', q: 'open', titolo: 'Suffissi dotti -ologo, -oide, -osi → ò',
    re: /(?<v>o)(?:log[oai]|logh[ie]|id[ei]|s[i])$/, esempi: ['psicòlogo', 'asteròide', 'tubercolòṡi', 'nevròṡi'] },
  { id: 'O6', cat: 'O', q: 'open', titolo: 'Tendenza: o accentata nelle sdrucciole → ò',
    tendenza: true, esempi: ['pòvero', 'còmodo', 'pòpolo', 'sòlito'],
    testo: 'Tendenza statistica, non regola: nelle sdrucciole la o tonica è spesso aperta.' },

  // ---------------- O CHIUSA ----------------
  { id: 'Ó1', cat: 'O', q: 'closed', titolo: 'Suffissi -one / -ona (anche -zione) → ó',
    re: /(?<v>o)n[eaiI]$/, esempi: ['bastóne', 'nazióne', 'padróna', 'canzóne'] },
  { id: 'Ó2', cat: 'O', q: 'closed', titolo: 'Suffissi -ore / -ora → ó',
    re: /(?<v>o)r[eaiI]$/, esempi: ['dolóre', 'signóra', 'attóre', 'amóre'],
    eccezioni: ['ancóra / àncora; òra è variante, ma la dizione tradizionale vuole óra'] },
  { id: 'Ó3', cat: 'O', q: 'closed', titolo: 'Suffisso -oso / -osa → ó (e s sorda)',
    re: /(?<v>o)s[oaie]$/, esempi: ['famóso', 'gioióso', 'curióso'] },
  { id: 'Ó4', cat: 'O', q: 'closed', titolo: 'Terminazione -ogno → ó',
    re: /(?<v>o)gn[oaie]$/, esempi: ['biṡógno', 'sógno', 'vergógna', 'carógna'],
    eccezioni: ['Attenzione: -occhio è invece aperto (òcchio, ginòcchio, finòcchio)'] },
  { id: 'Ó5', cat: 'O', q: 'closed', titolo: 'Tendenza: o + m/n + consonante → ó',
    re: /(?<v>o)[mn][bcdfgpqstvz][^aeiou]*[aeiou]$/, tendenza: true,
    esempi: ['móndo', 'pónte', 'frónte', 'fóndo', 'trómba'],
    eccezioni: ['mòndo (pulito), cònte (nobile) e altre: vedi dizionario'] },

  // ---------------- S ----------------
  { id: 'S1', cat: 'S', v: 's', titolo: 'S iniziale seguita da vocale → sorda',
    re: /^(?<c>s)[aeiouàèéìòóù]/, esempi: ['sole', 'sera', 'subito'] },
  { id: 'S2', cat: 'S', v: 's', titolo: 'SS doppia → sempre sorda',
    re: /(?<c>s)s/, esempi: ['rosso', 'passo', 'essere'] },
  { id: 'S3', cat: 'S', v: 's', titolo: 'S dopo consonante → sorda',
    re: /[bcdfglmnprtv](?<c>s)/, esempi: ['penso', 'falso', 'borsa', 'corsa'] },
  { id: 'S4', cat: 'S', v: 's', titolo: 'S davanti a consonante sorda (c, f, p, q, t) → sorda',
    re: /(?<c>s)[cfpqt]/, esempi: ['scala', 'sfera', 'spada', 'stella', 'squadra'] },
  { id: 'S5', cat: 'S', v: 'z', titolo: 'S davanti a consonante sonora (b, d, g, l, m, n, r, v) → sonora',
    re: /(?<c>s)[bdglmnrv]/, esempi: ['ṡbaglio', 'ṡdraio', 'ṡgarbo', 'ṡlitta', 'ṡmettere', 'ṡnello', 'ṡvelto'] },
  { id: 'S6', cat: 'S', v: 's', titolo: 'S tra vocali sorda: casa, cosa, così, -oso',
    re: /^(?:ca|co)(?<c>s)[aeiì]|o(?<c2>s)[oaie]$/, esempi: ['casa', 'cosa', 'così', 'famóso', 'nervóso'],
    testo: 'Nella dizione tradizionale (di base toscana) la s tra vocali è sorda in un gruppo di parole molto comuni e nel suffisso -oso. La pronuncia moderna le sonorizza spesso: il programma mostra la sonora come variante.' },
  { id: 'S7', cat: 'S', v: 'z', titolo: 'Prefisso es- + vocale → sonora',
    re: /^e(?<c>s)[aeiou]/, esempi: ['eṡame', 'eṡempio', 'eṡercito', 'eṡilio'] },
  { id: 'S8', cat: 'S', v: 's', titolo: 'S iniziale del secondo elemento nei composti → sorda',
    testo: 'Quando la s è l’iniziale della seconda parte di una parola composta resta sorda anche tra vocali.',
    esempi: ['risalire', 'girasole', 'presupporre', 'disotto'] },
  { id: 'S9', cat: 'S', v: 'z', titolo: 'S tra vocali (caso generale) → di solito sonora, ma va verificata',
    re: /[aeiouàèéìòóù](?<c>s)[aeiouàèéìòóù]/, tendenza: true,
    esempi: ['ròṡa', 'viṡo', 'fraṡe', 'criṡi', 'chièṡa'],
    testo: 'È la zona più incerta della dizione: la pronuncia cambia parola per parola. Il programma usa il dizionario; se una parola non c’è la segna come dubbia.' },

  // ---------------- Z ----------------
  { id: 'Z1', cat: 'Z', v: 's', titolo: '-zione, -zia, -zio → sorda',
    re: /(?<c>z)i(?:on[ei]|[aeo])$/, esempi: ['nazione', 'grazia', 'ozio', 'silenzio'] },
  { id: 'Z2', cat: 'Z', v: 's', titolo: '-ezza, -azzo/a, -ozzo/a, -uzzo/a → sorda',
    re: /(?:e(?<c>z)z[ae]|[aou](?<c2>z)z[oaie])$/, esempi: ['bellezza', 'ragazzo', 'pozzo', 'pagliuzza'],
    eccezioni: ['mèżżo'] },
  { id: 'Z3', cat: 'Z', v: 's', titolo: '-anza, -enza → sorda',
    re: /[ae]n(?<c>z)[ae]$/, esempi: ['danza', 'speranza', 'pazienza', 'partenza'] },
  { id: 'Z4', cat: 'Z', v: 's', titolo: 'Z dopo L o R → sorda',
    re: /[lr](?<c>z)/, esempi: ['alzare', 'calza', 'forza', 'scherzo'], eccezioni: ['òrżo'] },
  { id: 'Z5', cat: 'Z', v: 'z', titolo: '-izzare e derivati → sonora',
    re: /i(?<c>z)z(?:ar|at|az|and|ant|ab|er|av|ia|ò|o$|i$|a$)/, esempi: ['organiżżare', 'realiżżo', 'utiliżżazióne'],
    eccezioni: ['pizza, nella dizione standard è sorda'] },
  { id: 'Z6', cat: 'Z', v: 'z', titolo: 'Z iniziale → di solito sonora',
    re: /^(?<c>z)/, esempi: ['żèro', 'żaino', 'żùcchero', 'żèbra'],
    eccezioni: ['Sorda se la sillaba successiva contiene c, p o t (Z7)'] },
  { id: 'Z7', cat: 'Z', v: 's', titolo: 'Z iniziale con c, p, t nella sillaba seguente → sorda',
    re: /^(?<c>z)[aeiou]+[^aeiou]*[cpt]/, esempi: ['zucca', 'zampa', 'zitto', 'zoccolo', 'zappa'],
    prima: 'Z6' },
  { id: 'Z8', cat: 'Z', v: 'z', titolo: 'Parole di origine greca → sonora',
    testo: 'Le parole dotte di origine greca hanno la z sonora.', esempi: ['ażòto', 'ożòno', 'żodìaco', 'żèfiro'] },
  { id: 'Z9', cat: 'Z', v: 's', titolo: 'Z tra vocali si pronuncia sempre rafforzata',
    testo: 'Anche se scritta scempia, tra due vocali la z si pronuncia doppia: azione = "attsione".', esempi: ['azione', 'vizio', 'polizia'] },

  // ---------------- ACCENTO TONICO ----------------
  { id: 'T1', cat: 'T', titolo: 'Piane, sdrucciole, tronche',
    testo: 'La maggior parte delle parole italiane è piana (accento sulla penultima sillaba). Il programma segna l’accento su a, i, u solo quando non è sulla penultima (sdrucciole: àlacre, tàvolo) o quando la parola è un errore frequente. Le tronche hanno già l’accento scritto (città). Su e e o l’accento c’è sempre, perché indica anche il timbro.',
    esempi: ['tàvolo', 'àbito', 'ùltimo', 'città'] },
  { id: 'T2', cat: 'T', q: null, titolo: 'Suffissi -abile, -ibile, -issimo → sdrucciole',
    re: /(?:(?<v>a)bil[ei]|(?<v2>i)bil[ei]|(?<v3>i)ssim[oaie])$/, esempi: ['amàbile', 'possìbile', 'bellìssimo'] },
  { id: 'T3', cat: 'T', titolo: 'Accenti difficili (errori frequenti)',
    testo: 'Parole in cui si sbaglia spesso l’accento: il programma le segna sempre, anche se piane.',
    difficili: true, esempi: [] },

  // ---------------- FRASE ----------------
  { id: 'X1', cat: 'X', titolo: 'Raddoppiamento fonosintattico',
    testo: 'Dopo i monosillabi “forti” (a, da, e, è, che, chi, ma, o, se, sì, su, tra, fra, tre, ho, fa, va, sto…), dopo le parole tronche (città, perché, farò) e dopo come, dove, qualche, sopra, la consonante iniziale della parola seguente si raddoppia. Non succede dopo articoli e pronomi deboli. Non viene segnato sul copione.',
    esempi: ['a casa → "accasa"', 'e poi → "eppòi"', 'città bella → "cittabbèlla"', 'come mai → "comemmài"'] },
  { id: 'X2', cat: 'X', titolo: 'GN, GL, SC, Z tra vocali: sempre intense',
    testo: 'gn, gli, sc(e/i) e z tra due vocali si pronunciano sempre rafforzati, anche se scritti scempi.',
    esempi: ['ogni → "oggni"', 'figlio → "figglio"', 'pesce → "pessce"', 'azione → "attsione"'] },
  { id: 'X3', cat: 'X', titolo: 'La i “muta” dopo c, g, sc',
    testo: 'In ciao, giallo, scienza, cielo la i non si pronuncia: indica solo il suono dolce della consonante.',
    esempi: ['ciao', 'giallo', 'scienza', 'cielo'] },
];

// Parole in cui l'accento tonico si sbaglia spesso (sempre segnate se l'opzione "tonico" è attiva).
export const DIFFICILI = [
  'rubrìca', 'rubrìche', 'edìle', 'edìli', 'gratùito', 'gratùita', 'gratùiti', 'salùbre', 'leccornìa', 'leccornìe', 'guaìna',
  'amàca', 'amàche', 'pudìco', 'pudìca', 'mollìca', 'infìdo', 'infìda', 'regìme', 'regìmi', 'persuadére', 'dissuadére',
  'zaffìro', 'zaffìri', 'cucùlo', 'baùle', 'baùli', 'cosmopolìta', 'perìto', 'àlacre', 'ìlare', 'àmbito', 'diàtriba',
  'èlica', 'ùpupa', 'callìfugo', 'cadùco', 'adùlo', 'utensìle', 'scandinàvo', 'Nobèl',
];

// Parole atone: nessun accento (B2). Restano possibili i segni su s/z.
export const ATONE = new Set(('il lo la i gli le l un uno una di del dello della dei degli delle d a al allo alla ai agli alle ' +
  'da dal dallo dalla dai dagli dalle in nel nello nella nei negli nelle con col coi su sul sullo sulla sui sugli sulle ' +
  'per tra fra e ed o od ma se che mi ti si ci vi ne li non me te ce ve gliene glielo gliela n m t s c v').split(' '));

export function regolaById(id) { return REGOLE.find(r => r.id === id); }

// Omografi "veri": solo per questi il programma chiede di scegliere (B4).
// Ogni voce: [forma segnata, descrizione]. La prima forma NON è necessariamente quella predefinita:
// come predefinita si usa quella principale del dizionario.
// Per le altre parole con omografi le descrizioni vengono da Wiktionary (data/omografi.txt).
const C = (a, da, b, db) => [[a, da], [b, db]];
const coltoForme = (suf, plur) => C('còlt' + suf, `raccolt${suf} (participio di cogliere)`, 'cólt' + suf, `istruit${suf}, che ${plur ? 'hanno' : 'ha'} cultura`);
export const OMOGRAFI_DESC = {
  pesca: C('pèsca', 'frutto del pesco; colore', 'pésca', 'il pescare; verbo pescare (egli pesca)'),
  pesche: C('pèsche', 'plurale di pèsca (frutti)', 'pésche', 'plurale di pésca (il pescare)'),
  venti: C('vènti', 'plurale di vento', 'vénti', 'il numero 20'),
  legge: C('lègge', 'verbo leggere (egli legge)', 'légge', 'norma, regola'),
  leggi: C('lèggi', 'verbo leggere (tu leggi; leggi!)', 'léggi', 'plurale di légge (norme)'),
  botte: C('bòtte', 'colpi, percosse (plurale di botta)', 'bótte', 'grande barile per il vino'),
  ancora: C('ancóra', 'avverbio: di nuovo, un’altra volta', 'àncora', 'oggetto che tiene ferma la nave; verbo ancorare'),
  rosa: C('ròṡa', 'fiore; colore', 'róṡa', 'rosicchiata (participio di rodere)'),
  rose: C('ròṡe', 'plurale di rosa (fiori)', 'róṡe', 'rosicchiate; verbo rodere (egli rose)'),
  colto: coltoForme('o', false), colta: coltoForme('a', false), colti: coltoForme('i', true), colte: coltoForme('e', true),
  foro: C('fòro', 'piazza dell’antica Roma; tribunale', 'fóro', 'buco'),
  fori: C('fòri', 'plurale di fòro (piazze, tribunali)', 'fóri', 'plurale di fóro (buchi)'),
  mento: C('mènto', 'verbo mentire (io mento)', 'ménto', 'parte del viso sotto la bocca'),
  accetta: C('accètta', 'verbo accettare (egli accetta)', 'accétta', 'piccola scure'),
  accette: C('accètte', 'gradite (femminile plurale di accetto)', 'accétte', 'plurale di accétta (scuri)'),
  porci: C('pòrci', 'plurale di porco (maiali)', 'pórci', 'porre + ci (metterci)'),
  esca: C('èsca', 'verbo uscire (che io esca)', 'ésca', 'cibo per attirare pesci o animali'),
  volto: C('vòlto', 'girato (participio di volgere)', 'vólto', 'viso, faccia'),
  volti: C('vòlti', 'girati (participio di volgere)', 'vólti', 'plurale di vólto (visi)'),
  tocco: C('tòcco', 'verbo toccare (io tocco)', 'tócco', 'il toccare, colpo leggero; rintocco'),
  tocchi: C('tòcchi', 'verbo toccare (tu tocchi)', 'tócchi', 'plurale di tócco (colpi leggeri, rintocchi)'),
  dotto: C('dòtto', 'istruito, erudito', 'dótto', 'condotto, canale (in anatomia)'),
  dotti: C('dòtti', 'plurale di dòtto (eruditi)', 'dótti', 'plurale di dótto (condotti)'),
  rocca: C('ròcca', 'fortezza', 'rócca', 'strumento per filare la lana'),
  rocche: C('ròcche', 'plurale di ròcca (fortezze)', 'rócche', 'plurale di rócca (strumenti per filare)'),
  corso: C('córso', 'strada principale; corso di studi; participio di correre', 'còrso', 'della Corsica'),
  corsi: C('córsi', 'plurale di córso; verbo correre (io corsi)', 'còrsi', 'abitanti della Corsica'),
  principi: C('prìncipi', 'plurale di principe', 'princìpi', 'plurale di principio'),
  capitano: C('capitàno', 'comandante', 'càpitano', 'verbo capitare (essi capitano)'),
  subito: C('sùbito', 'immediatamente', 'subìto', 'participio di subire'),
  ambito: C('àmbito', 'campo, ambiente', 'ambìto', 'desiderato (participio di ambire)'),
  nocciolo: C('nòcciolo', 'seme duro della frutta; parte essenziale', 'nocciòlo', 'albero delle nocciole'),
  intimo: C('ìntimo', 'profondo, privato; amico stretto', 'intìmo', 'verbo intimare (io intimo)'),
  altero: C('altèro', 'superbo, orgoglioso', 'àltero', 'verbo alterare (io altero)'),
  viola: C('viòla', 'fiore; colore; strumento musicale', 'vìola', 'verbo violare (egli viola)'),
  meta: C('mèta', 'traguardo, obiettivo', 'méta', 'mucchio (di paglia, di fieno)'),
  collega: C('collèga', 'compagno di lavoro', 'colléga', 'verbo collegare (egli collega)'),
};
export const OMOGRAFI = new Set(Object.keys(OMOGRAFI_DESC));

// Motivi delle varianti (B5). Codice nel dizionario: tipo [+] [:etichetta], es. "V:N", "S+:M", "A".
export const VARIANTI = {
  tipi: {
    V: { titolo: 'Timbro della vocale (è/é, ò/ó)', testo: 'In molte regioni, soprattutto al Nord e in parte del Sud, la e e la o accentate si aprono o si chiudono in modo diverso dallo standard. In dizione vale la forma principale.', esempio: 'sèdia (standard) / sédia (regionale)' },
    S: { titolo: 'S sorda o sonora tra vocali', testo: 'Tra due vocali la s è sorda nella pronuncia tradizionale toscana e in gran parte del Centro-Sud, sempre sonora al Nord. La pronuncia moderna accetta spesso entrambe; la dizione segue la tradizione (regole S6 e S9).', esempio: 'casa (tradizionale) / caṡa (moderna, Nord)' },
    Z: { titolo: 'Z sorda o sonora', testo: 'La sonorità della z cambia da regione a regione, soprattutto a inizio parola e in alcune parole comuni. In dizione vale la forma principale (regole Z6 e Z7).', esempio: 'żio / zio' },
    A: { titolo: 'Accento in un’altra posizione', testo: 'Di solito è un errore diffuso, oppure la pronuncia “alla latina” o “alla greca” di una parola dotta. In dizione vale la forma principale.', esempio: 'rubrìca (corretta) / rùbrica (diffusa ma sbagliata)' },
    I: { titolo: 'Imperativo con il pronome attaccato', testo: 'Si scrive come un participio o un nome, ma è un’altra forma del verbo, con l’accento più indietro: arrèstati! (fermati!) invece di arrestàti (siamo stati arrestati). Il programma sceglie guardando le parole vicine.', esempio: 'arrestàti (participio) / arrèstati! (imperativo)' },
    H: { titolo: 'Altra parola scritta uguale', testo: 'Esiste un’altra parola con la stessa grafia, un significato diverso e un uso molto più raro (omografo minore). Per questo il programma non chiede di scegliere.', esempio: 'sóno (verbo essere) / sòno (parola rara)' },
  },
  accettata: 'registrata anche dal Wiktionary italiano: presente anche nell’uso standard',
  registrataIt: 'registrata anche dal Wiktionary italiano come pronuncia diffusa',
  regionale: 'registrata solo dal Wiktionary inglese, che riporta anche le pronunce regionali',
  etichette: {
    N: 'pronuncia del Nord Italia', Rm: 'pronuncia romana', To: 'pronuncia toscana', CS: 'pronuncia del Centro-Sud',
    T: 'pronuncia tradizionale o sorvegliata', Rg: 'pronuncia regionale', P: 'pronuncia sconsigliata (considerata un errore)',
    M: 'pronuncia moderna, diffusa soprattutto al Nord',
  },
};
export function motivoVariante(code) {
  const m = /^([AVSZHI]+)(\+)?(?::(\w+))?$/.exec(code || '') || [null, 'V', '', ''];
  return {
    tipi: [...m[1]].map(t => VARIANTI.tipi[t]).filter(Boolean),
    // per gli accenti (A) la presenza nel Wiktionary italiano non la rende corretta: di solito è registrata come pronuncia diffusa
    fonte: m[1] === 'H' || m[1] === 'I' ? '' : (m[2] ? (m[1].includes('A') ? VARIANTI.registrataIt : VARIANTI.accettata) : VARIANTI.regionale),
    etichetta: m[3] ? VARIANTI.etichette[m[3]] || '' : '',
    accettata: !!m[2],
  };
}
