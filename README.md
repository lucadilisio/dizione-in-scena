# Dizione in Scena

Sito per segnare automaticamente la dizione italiana (è/é, ò/ó, accento tonico, s e z sonore) su testi e copioni teatrali, consultare le regole e allenarsi giocando.

## Le quattro sezioni

| Sezione | Cosa fa |
|---|---|
| **Testo libero** | Scrivi una parola o un testo: la dizione compare mentre scrivi. Tocchi una parola per vedere da dove viene il segno (dizionario o regole), varianti, omografi e regole collegate. |
| **Copione** | Carichi un `.docx`: il programma sostituisce solo i caratteri (sostituzioni 1:1), quindi impaginazione, stili, tabelle, intestazioni, piè di pagina e note restano identici. Riconosce le parti del copione (battute, nomi dei personaggi, didascalie, altro) e di default segna solo le battute (non canzoni, didascalie come *(pausa)*, nomi, titoli); le caselle "Nel copione" permettono di segnare anche le altre parti. Prima del download chiede la pronuncia degli omografi (pèsca/pésca…). Il file non lascia il dispositivo. I PDF non sono supportati: serve il .docx originale. |
| **Teoria** | Tutte le regole usate dal programma, generate dallo stesso file usato dal motore (`js/rules.js`). Gli esempi vengono verificati dal vivo sul dizionario. |
| **Gioco** | Sfida a tempo (60 s, combo, classifica settimanale per gruppo), Duello (online fino a 8 giocatori con codice stanza, oppure sullo stesso telefono), Percorso a livelli (un livello per regola, con eccezioni e stelle). |

In Testo libero e Copione c'è il **selettore** per scegliere cosa segnare: E/O aperte e chiuse, accento tonico, S sonora, Z sonora.

## Come funziona

1. **Dizionario** (`data/lessico.txt`): circa 96.000 voci di Wiktionary con trascrizione IPA (edizione italiana e inglese, via [kaikki.org](https://kaikki.org)), convertite in forma segnata, più circa 330.000 forme flesse dalle tabelle di coniugazione e declinazione. Formato di una riga: `forma~variante@motivo;omografo` (`!` finale = forma flessa; `parola<TAB>…` quando la grafia ha un accento scritto, come città o però). Il motivo della variante è un codice: tipo (`V` timbro, `S` s, `Z` z, `A` accento), `+` se registrata anche dal Wiktionary italiano, `:N`/`:Rm`/`:T`… per l'etichetta regionale di Wiktionary (testi in `js/rules.js`, `VARIANTI`; regola B5 della Teoria).
2. **Regole** (`js/rules.js`): servono a spiegare le parole del dizionario (regola o eccezione) e a segnare quelle sconosciute (nomi propri, parole rare). Per le parole sconosciute il programma segna solo dove la regola è sicura e lascia il resto come "da controllare".
3. **Scelte di dizione tradizionale**: per le vocali prevale l'edizione italiana di Wiktionary; per la s intervocalica si usa la pronuncia tradizionale in *casa, cosa, così* e nel suffisso *-oso* (regola S6), mostrando la sonora come variante; i composti di *che* e *tre* sono sempre chiusi (perché, ventitré).

## Come riconosce le battute

In `js/docx.js` (`classify`):

- **battuta**: paragrafo `Nome` + tabulazione (o `NOME:`), con il rientro più frequente tra questi paragrafi; continuazioni che iniziano con una tabulazione o hanno lo stesso rientro; nome su una riga a parte (solo nei copioni che non usano il formato con tabulazione); righe di canzone con il nome in MAIUSCOLO grassetto anche con altro rientro;
- **nome**: la parte prima della tabulazione, i nomi in MAIUSCOLO grassetto dentro le battute, e i nomi dei personaggi (parole non presenti nel dizionario) citati nelle battute;
- **canzone**: dal titolo "Canzone - …" (o Song, Brano, Reprise) fino alla scena successiva o alla ripresa del dialogo normale (nome non in MAIUSCOLO); di default non viene segnata;
- **didascalia**: paragrafi interamente in corsivo o tra parentesi; dentro le battute il testo tra parentesi o quadre e il corsivo non tra virgolette;
- **altro**: titoli (stili Titolo/Heading), elenco attori, schede, note, intestazioni, piè di pagina e note a piè di pagina.

## Pubblicare su GitHub Pages

Il sito è statico (HTML, CSS e JavaScript, senza build).

1. Carica questa cartella in un repository GitHub.
2. Vai in **Settings → Pages**, alla voce *Source* scegli **Deploy from a branch**, poi branch `main` e cartella `/ (root)`.
3. Dopo un minuto il sito è disponibile su `https://<utente>.github.io/<repository>/`.

Per provarlo in locale: `python3 -m http.server` nella cartella, poi apri `http://localhost:8000`. Aprire `index.html` con doppio clic non funziona, perché il browser blocca il caricamento del dizionario.

## Classifica online e duelli (Firebase)

Il Gioco richiede Firebase: ogni ragazzo entra con il proprio account Google, e progressi, streak e trofei vengono salvati in `/utenti/{uid}`. Le altre sezioni funzionano senza account.

1. Vai su <https://console.firebase.google.com>, poi **Aggiungi progetto** (il piano gratuito Spark basta).
2. **Authentication → Metodo di accesso**: attiva **Google** (accesso dei ragazzi al Gioco) ed **Email/password** (area docente).
3. **Realtime Database → Crea database** (posizione `europe-west1`), in modalità bloccata. Nella scheda **Regole** incolla queste regole, sostituendo **ogni volta** (sette) `EMAIL-ADMIN` con l'email dell'account admin (punto 7):

   ```json
   {
     "rules": {
       "gruppi": {
         ".read": true,
         ".write": "auth != null && auth.token.email === 'EMAIL-ADMIN'"
       },
       "utenti": {
         ".read": "auth != null && auth.token.email === 'EMAIL-ADMIN'",
         ".write": "auth != null && auth.token.email === 'EMAIL-ADMIN'",
         ".indexOn": ["gruppo"],
         "$uid": {
           ".read": "auth != null && auth.uid === $uid",
           ".write": "auth != null && auth.uid === $uid",
           ".validate": "newData.child('nome').isString() && newData.child('nome').val().length <= 20"
         }
       },
       "operazioni": {
         ".write": "auth != null && auth.token.email === 'EMAIL-ADMIN'",
         "$uid": { ".read": "auth != null && auth.uid === $uid" }
       },
       "eliminati": {
         ".write": "auth != null && auth.token.email === 'EMAIL-ADMIN'",
         "$uid": { ".read": "auth != null && auth.uid === $uid" }
       },
       "classifiche": {
         ".read": "auth != null && auth.token.email === 'EMAIL-ADMIN'",
         ".write": "auth != null && auth.token.email === 'EMAIL-ADMIN'",
         "$gruppo": { "$modo": { "$settimana": {
           ".read": true,
           ".indexOn": "punti",
           "$uid": {
             ".write": "auth != null && auth.uid === $uid && root.child('gruppi').child($gruppo).child('attivo').val() === true",
             ".validate": "newData.child('punti').isNumber() && newData.child('punti').val() >= 0 && newData.child('punti').val() <= 200000 && newData.child('nome').isString() && newData.child('nome').val().length <= 20"
           }
         } } }
       },
       "duelli": {
         "$codice": { ".read": "auth != null", ".write": "auth != null" }
       }
     }
   }
   ```

   In questo modo i ragazzi possono salvare punteggi solo nei gruppi attivi creati dall'admin, e solo l'admin può creare gruppi, cancellare punteggi e modificare i progressi dei ragazzi (nome, gruppo, streak, XP bonus, azzeramenti). Ogni modifica del docente è registrata in `/operazioni/{uid}` e applicata anche dal telefono del ragazzo prima del salvataggio successivo, così non viene sovrascritta (vedi `applicaOperazione` in `js/progressi.js`). Quando il docente elimina un ragazzo, la data dell'eliminazione resta in `/eliminati/{uid}`: il telefono del ragazzo scarta i progressi più vecchi invece di risalvarli.

4. **Impostazioni progetto → Generali → Le tue app → Web (`</>`)**: registra l'app e copia l'oggetto `firebaseConfig`.
5. Incollalo in `js/firebase-config.js` e pubblica.
6. In **Authentication → Impostazioni → Domini autorizzati** aggiungi `<utente>.github.io`.
7. **Account admin**: in **Authentication → Metodo di accesso** attiva anche **Email/password**. Poi in **Authentication → Utenti → Aggiungi utente** crea l'account admin (email e password a scelta, la stessa email messa nelle regole).
8. Apri il sito su `#admin` (link "Area docente" in fondo alla pagina), entra con quell'account e crea i gruppi. Il nome del gruppo genera un codice (es. "Musical 1" → `musical-1`): ricreando un gruppo con lo stesso nome si ritrovano le sue classifiche.

### Proteggere la chiave API (consigliato)

GitHub segnala la `apiKey` come "secret": per le app web Firebase non è un segreto, ma conviene limitarla al proprio sito. In [Google Cloud Console → API e servizi → Credenziali](https://console.cloud.google.com/apis/credentials) apri la chiave "Browser key (auto created by Firebase)" e in **Limitazioni delle applicazioni** scegli **Siti web**, aggiungendo:

- `https://<utente>.github.io/*`
- `https://<progetto>.firebaseapp.com/*`
- `http://localhost:8000/*` (solo se lo provi in locale)

Salva, verifica che il gioco funzioni ancora, poi su GitHub chiudi l'avviso con **Close alert → Used in tests / False positive**.

I valori di `firebaseConfig` non sono segreti (sono pensati per stare nel codice del sito): la protezione la danno le regole del database.

## Rigenerare i dati

```bash
pip install wordfreq
curl -O https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl
curl -O https://kaikki.org/itwiktionary/Italiano/kaikki.org-dictionary-Italiano.jsonl
python3 tools/extract.py kaikki.org-dictionary-Italian.jsonl kaikki.org-dictionary-Italiano.jsonl raw.pkl
cd tools && python3 build.py ../raw.pkl ../data/lessico.txt && cd ..
python3 tools/gioco.py data/lessico.txt data/frequenti.txt
cd tools && python3 omografi.py ../kaikki.org-dictionary-Italian.jsonl ../kaikki.org-dictionary-Italiano.jsonl ../data/lessico.txt ../data/omografi.txt && cd ..
node tools/test_engine.mjs     # verifica gli esempi della Teoria contro il dizionario
```

## Licenze

- Dati del dizionario: Wiktionary, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). `data/lessico.txt` ne è un'opera derivata con la stessa licenza.
- Frequenze delle parole: [wordfreq](https://github.com/rspeer/wordfreq) (CC BY-SA 4.0).
- [JSZip](https://stuk.github.io/jszip/) (MIT).
