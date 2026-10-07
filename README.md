# Corioli Generale

Applicazione desktop per la gestione di pazienti e visite di un ambulatorio
specialistico **generale** (cardiologia, medicina interna, qualsiasi branca):
stessa base di Corioli, senza i moduli di ginecologia e ostetricia. I dati
clinici restano **in locale** sul computer del medico: non esiste un archivio
pazienti sul server.

- **Interfaccia:** React 18 + TypeScript, NextUI, Tailwind
- **Contenitore:** Electron (Windows via Microsoft Store, macOS, Linux)
- **Archivio:** SQLite locale (`sql.js`) usato come store chiave-valore
- **Referti:** PDF generati con jsPDF (referto di visita, ricetta, certificato,
  richiesta di esame)

## Cosa cambia rispetto a Corioli

| Corioli (ginecologia/ostetricia) | Corioli Generale |
|---|---|
| Tre tipi di visita (ginecologica, ginecologica pediatrica, ostetrica) | Un solo tipo di visita, uguale per ogni specialista |
| Anamnesi ginecologica, GPA, ultima mestruazione, HPV, menarca | Parametri vitali (P.A., F.C.), peso corporeo con BMI |
| Biometria fetale, centili di crescita, flussimetria Doppler, pagina Gravidanze | Rimossi |
| Referto ginecologico e referto ostetrico | Referto unico, titolo "Visita specialistica" modificabile nelle impostazioni |
| Modelli per categoria Ginecologia / Ostetricia | Categoria unica "Visita" con modelli di medicina generale |

Restano invariati: anagrafica pazienti, import CSV, cronologia visite e
revisioni, ricette, certificati, richieste di esame, documenti, modelli
personalizzabili, backup automatici e manuali, blocco con PIN/biometria,
esportazione dati.

### Struttura del referto di visita

1. Descrizione problema / dati clinici
2. Anamnesi — campo unico oppure sezioni multiple configurabili
   (familiare, fisiologica, patologica, chirurgica, farmacologica, allergica,
   abitudini di vita + sezioni personalizzate)
3. Esame obiettivo
4. Accertamenti
5. Conclusioni e terapia

Nella colonna di sinistra: parametri vitali e immagini da allegare al PDF.

- **Pressione arteriosa** disposta come su Corioli Cardiologia: P.A. e F.C.,
  posizione Clino/Orto e "Seconda misurazione" (con la sua posizione, di
  default Orto, e la sua F.C.). Sotto il campo: categoria ESH 2023, come la
  Cardiologia (ottimale, normale, normale-alta, ipertensione di grado 1-3;
  120/80 e' normale), pressione media e differenziale. Scritta senza barra ("12080") diventa "120/80".
- **Prova ortostatica**: con una misura in clino e una in orto compare il
  confronto, con ipotensione ortostatica (calo ≥ 20/10 mmHg), tachicardia in
  ortostatismo (FC +30, +40 fra 12 e 19 anni) e rapporto ΔFC/ΔPAS. Nel
  referto vanno le due misure con la posizione, la variazione e l'esito.
- **Peso e circonferenza vita**, con BMI e classe OMS, superficie corporea
  (Mosteller), rischio legato alla vita (OMS, soglie per sesso) e rapporto
  vita/altezza. L'altezza si può salvare in anagrafica direttamente dalla
  visita.

Classi e soglie (BMI, categoria della pressione, circonferenza vita) sono
quelle dell'adulto: sotto i 18 anni, all'età della visita, i valori si
mostrano senza giudizio, perché vanno letti sui percentili. I calcoli stanno
in `src/utils/parametriVitali.ts`, con i test.

### Scheda del paziente

Ogni visita dello storico mostra i parametri misurati quel giorno come
etichette colorate (pressione, frequenza, peso, BMI, vita, prova ortostatica).

### Dashboard

Tre colonne come su Corioli Cardiologia: pazienti recenti, visite recenti e
**Pazienti da seguire**, cioè chi all'ultima misura ha la pressione da 140/90
in su, un BMI da 30 in su o un'ipotensione ortostatica (`utils/pazientiDaSeguire.ts`).
"Vedi tutti" apre l'elenco completo, filtrabile per motivo. La ricerca del
paziente si apre da qualunque pagina con Ctrl+K (scheda) o Ctrl+N (nuova visita);
"Salva e inizia visita" nel form del paziente nuovo apre subito la visita.

## Requisiti

Node.js 18+ e npm.

## Comandi

```bash
npm install          # dipendenze
npm run electron:dev # app in sviluppo (Vite + Electron)
npm run dev          # solo interfaccia nel browser, su http://localhost:5173
npm test             # test (vitest)
npm run typecheck    # controllo dei tipi
npm run lint         # eslint
npm run build        # typecheck + build dell'interfaccia
npm run dist         # pacchetto desktop (electron-builder)
```

`npm run build` esegue `tsc --noEmit` prima di Vite: un errore di tipi ferma la build.

## Struttura

```
electron/          processo principale: finestra, archivio SQLite, backup, stampa
  backupFiles.js     scrittura atomica del DB, copie di sicurezza, ripristino
  printFiles.js      PDF di stampa in %TEMP%/CorioliGenerale/stampe
  appLock.js         PIN, codice di recupero, Windows Hello / Touch ID
src/
  Pages/Dashboard/   home, pazienti, visite, documenti, impostazioni
  components/        componenti condivisi (AppModal, backup, modelli referto)
  services/          accesso ai dati, PDF, import CSV, backup, chat assistenza
  utils/             anamnesi strutturata, validazione, date e formati
```

## Dati e backup

Tutto sta in `%APPDATA%/CorioliGenerale` (Windows) o
`~/Library/Application Support/CorioliGenerale` (macOS):

| Percorso | Contenuto |
|----------|-----------|
| `corioli-generale.db` | archivio pazienti, visite, documenti, modelli |
| `corioli-generale.db.bak` | copia dello stato con cui si è aperta la sessione |
| `backups/` | copie automatiche (giornaliera, pre-import, pre-ripristino, manuale) |

I PDF aperti per la stampa stanno in `%TEMP%/CorioliGenerale/stampe` e vengono
ripuliti a ogni avvio e chiusura.

L'archivio è **separato da quello di Corioli**: le due applicazioni possono
convivere sullo stesso computer senza interferire.

Il database viene scritto in modo atomico (file temporaneo + `rename`): una
scrittura interrotta non può corromperlo. All'avvio, se il file principale è
illeggibile, viene messo da parte e si riparte dalla copia `.bak`.

L'export JSON dalle impostazioni resta il backup da **conservare altrove**: le
copie automatiche stanno sullo stesso disco dell'app.

## Test

I test coprono le date locali, la validazione dei backup, l'import dei backup,
la migrazione dei dati demo e i moduli Electron di backup e stampa.

```bash
npm test
```

## Da completare prima della distribuzione

- **Microsoft Store:** `identityName` (`CorioliGenerale.CorioliGenerale`) va
  riservato in Partner Center e l'ID della scheda in
  `src/Pages/Dashboard/Settings.tsx` (`CORIOLI_MS_STORE_ID`) va sostituito con
  quello della nuova app.
- **Backend licenze:** l'heartbeat invia `app: "corioli-generale"`. Il backend
  (`Corioli-Dashboard-BE/utils/apps.js`) accetta oggi solo `corioli` e
  `corioli-pediatria` e normalizza qualsiasi altro valore a `corioli`: la
  chiamata risponde 200 e blocco/licenza funzionano, ma questa edizione risulta
  indistinguibile da Corioli in dashboard. Per separarla basta aggiungere
  `"corioli-generale"` a `VALID_APPS` e il relativo caso in `mapAppToTipo`
  (`tipo` e `app` sono colonne `String`, nessuna migrazione DB necessaria).

## Privacy

I dati sanitari non lasciano il computer. Verso il server vanno solo la
telemetria di licenza (dati del medico e conteggi aggregati) e la chat di
assistenza. Stato di conformità e attività aperte: [Corioli-GDPR-backlog.md](Corioli-GDPR-backlog.md).
