# Corioli Cardiologia

Applicazione desktop per la gestione di pazienti e visite di un ambulatorio
**cardiologico**. Stessa base di Corioli, senza i moduli di ginecologia e
ostetricia, con i moduli strumentali e gli indici della cardiologia. I dati
clinici restano **in locale** sul computer del medico: non esiste un archivio
pazienti sul server.

- **Interfaccia:** React 18 + TypeScript, NextUI, Tailwind
- **Contenitore:** Electron (Windows via Microsoft Store, macOS, Linux)
- **Archivio:** SQLite locale (`sql.js`) usato come store chiave-valore
- **Referti:** PDF generati con jsPDF (referto di visita, ricetta, certificato,
  richiesta di esame)

## La visita cardiologica

Un solo tipo di visita, come in ambulatorio. Il referto segue quest'ordine:

1. **Variabili cliniche** — parametri vitali, antropometria, fattori di rischio
2. Anamnesi — campo unico oppure sezioni multiple configurabili
   (familiare, fisiologica, patologica, chirurgica, farmacologica, allergica,
   abitudini di vita + sezioni personalizzate)
3. Motivo della visita
4. Esame obiettivo
5. **Esami strumentali**, una fascia ciascuno — **pressione arteriosa**,
   elettrocardiogramma, ecocardiogramma, TC coronarica, test ergometrico,
   Holter ECG e pressorio, **Doppler TSA**
6. **Esami ematochimici**
7. **Inquadramento clinico**, sotto un titolo solo — scompenso, fibrillazione
   atriale, rischio cardiovascolare
8. Accertamenti
9. Conclusioni e terapia
10. Immagini allegate

L'anamnesi viene prima del motivo della visita, come nei referti cardiologici
standard e come nella maschera di inserimento: per capire perché il paziente è
qui serve prima conoscerne la storia.

### Moduli opzionali

Alla prima apertura la visita è quella scarna: anamnesi, motivo, esame
obiettivo, pressione, elettrocardiogramma, ecocardiogramma, laboratorio,
rischio cardiovascolare, accertamenti e conclusioni. **TC coronarica, test
ergometrico, Holter ECG, Holter pressorio, Doppler TSA, scompenso e
fibrillazione atriale si accendono uno per uno** dalla card «Moduli della
visita» in Impostazioni, e lo stesso vale per il **prontuario**.

È una richiesta del cardiologo referente: il grosso delle visite cardiologiche
è refertato in poche righe, e una maschera che apre subito tutti i moduli è una
maschera che non si usa. Il prontuario è spento per un motivo diverso — le
schede sono contenuto clinico e restano in revisione finché non le valida il
cardiologo.

I numeri delle sezioni si assegnano su quelle visibili, quindi la sequenza non
ha buchi. **Un modulo spento ma compilato resta visibile**: senza questa
eccezione, riaprire una visita in archivio farebbe sparire dalla maschera dei
valori che il referto continua a stampare.

Colonna di sinistra (**variabili cliniche**: cambiano a ogni controllo, ed è
il confronto con il valore precedente che si guarda): parametri vitali
(P.A., F.C.), peso con BMI, fattori di rischio, esami di laboratorio, indici
calcolati e immagini allegabili al PDF.

I pannelli di laboratorio seguono il ragionamento, non l'ordine del referto di
laboratorio:

- **Burden aterogeno** (era «assetto lipidico»): colesterolo totale, HDL,
  trigliceridi, LDL dosato, ApoB, Lp(a) e **ATS carotidea**, la stenosi
  carotidea in percentuale. La placca vista all'ecografo non ha niente di
  lipidico, ma è lo stesso burden e pesa sulla classe di rischio più di
  qualunque dosaggio: sta lì perché è lì che la si guarda mentre si decide.
- **Profilo infiammatorio / redox**: hs-PCR, LDL ossidate e **fibrinogeno**,
  cioè la parte della placca che i lipidi non misurano. Stavano sparsi fra il
  pannello lipidico e «altri esami».
- **Metabolismo glucidico**: glicemia, insulinemia, HbA1c, con **HOMA-IR**
  calcolato. La «i» in alto a destra del pannello apre la tabella delle sei
  fasce di lettura, con evidenziata quella del paziente.
- **Funzione renale**: creatinina, albuminuria, con eGFR calcolato.
- **Altri esami**: emocromo, transaminasi, uricemia e **azotemia** (senza
  soglia finché il cardiologo non la indica), TSH.

L'**ATS carotidea** del burden aterogeno e la **stenosi massima** del modulo
Doppler TSA sono lo stesso campo, non due copie: si scrive da tutte e due le
parti e il valore resta uno.

La pressione arteriosa si può scrivere con la barra, il trattino o lo spazio
(`120/80`, `120-80`, `120 80`): viene ricondotta alla forma canonica al
salvataggio. Il separatore che si digita non decide se la visita si salva.

Nel PDF ogni modulo strumentale è reso come tabella a griglia (etichetta sopra,
valore in grassetto sotto, righe a bande alterne) e le sezioni hanno
un'intestazione su barra grigia: con otto sezioni e una dozzina di misure per
modulo, la vecchia riga continua separata da punti era illeggibile. Nella
tabella degli esami ematochimici compaiono anche LDL secondo Friedewald (quando
manca il dosaggio diretto) ed eGFR: che siano calcolati lo dice l'etichetta
della cella, e tanto basta a chi legge il referto.

**Ogni esame ha la sua fascia**, come anamnesi ed esame obiettivo:
«Elettrocardiogramma», «Ecocardiogramma color-Doppler transtoracico», «TC
coronarica» e così via, tutti allo stesso livello. C'è stato un titolo unico
«Esami strumentali» con i moduli come sottotitoli sottolineati: il cardiologo
l'ha fatto togliere l'11 settembre 2026 («meglio evidenziare in grigio le
singole voci»). **«Inquadramento clinico»** invece resta un gruppo, con
scompenso, fibrillazione atriale e rischio cardiovascolare come sottotitoli:
nella call dello stesso giorno ha detto di lasciarlo così, e deve ancora
decidere cosa ci entra (per esempio la cardiopatia ischemica).

La **pressione arteriosa** apre gli esami con una fascia sua, prima
dell'elettrocardiogramma, come nei referti del cardiologo, e porta la
posizione della misurazione: *clinostatismo* o *ortostatismo*. Si può
aggiungere una seconda misurazione, di solito in ortostatismo, per documentare
un'ipotensione ortostatica. Nella maschera resta fra le variabili cliniche,
con la posizione sotto il campo; «150 85» diventa «150/85» appena si esce dal
campo. Fra le variabili cliniche del referto resta la frequenza, e una colonna
senza valori non si stampa, nemmeno l'intestazione.

### Doppler TSA

L'EcoColorDoppler dei tronchi sovraaortici sta fra gli esami strumentali anche
se a refertarlo sono il chirurgo vascolare o il radiologo: il cardiologo lo
legge per la stessa ragione per cui legge la TC coronarica, cioè perché la
placca vista con gli ultrasuoni è aterosclerosi documentata e sposta la classe
di rischio senza bisogno di nessun punteggio. È anche l'esame che i pazienti
chiedono più spesso.

Il modulo porta data e struttura, IMT massimo, stenosi massima con la sua sede,
placche, assi vertebrali e il referto testuale, con tre modelli di refertazione
predefiniti. Nel referto stampato la stenosi esce con la sede accanto — «45%
(bulbo carotideo destro)» — perché una percentuale senza il vaso non è
refertabile.

### I fattori di rischio stanno nel referto

Il referto stampa la classe di rischio dichiarata e l'obiettivo lipidico che ne
discende, ma **la classe non è calcolata**: la attribuisce il medico guardando
le caselle dei fattori di rischio della visita. Quelle caselle ora escono nel
referto, come terza colonna delle variabili cliniche: senza, il foglio chiede al
curante di credere alla classe sulla parola, e il ragionamento che la sezione
del rischio dice di voler documentare resta a metà.

Sono righe di elenco senza etichetta — sette «Ipertensione arteriosa: Sì» di
fila direbbero sette volte la stessa cosa. Il **fumo** tiene l'etichetta perché
è l'unico che si stampa anche in negativo, e sta qui e non più fra i parametri
vitali: non è mai stato un segno vitale, ed era anche l'unico fattore di rischio
che usciva nel referto mentre gli altri sette restavano nella maschera.

### Un carattere solo

Tutto il referto è in **bastoni** (Helvetica): carta intestata, prosa clinica,
etichette, numeri e tabelle. Il racconto clinico — anamnesi, motivo della
visita, esame obiettivo, referti testuali dei moduli, conclusioni — è a
10,5 pt con interlinea di 5,2 mm: il corpo del testo si distingue dai dati per
dimensione e interlinea, non per famiglia.

C'erano due voci, tondo con grazie per la prosa e bastoni per i dati. La
distinzione si leggeva, ma due famiglie su un foglio sono anche due misure, due
pesi e due allineamenti da tenere insieme a ogni modifica. Con una sola il
referto è più uniforme e la gerarchia la fanno corpo, interlinea e grassetto —
che è poi l'unico segnale che il referto usa per il resto.

### Carta intestata

In alto a sinistra chi firma — il nome in neretto, in corpo 11 come il titolo,
e sotto la specializzazione scritta nel profilo — a destra dove lo si trova
(ambulatorio, indirizzo, telefono e e-mail secondo le preferenze di stampa).
A corpo 15 il nome pesava più di «VISITA CARDIOLOGICA», e la specializzazione
era stata tolta perché ripeteva il titolo: il cardiologo l'ha rivoluta, e con
due specialità dice una cosa che il titolo non dice. Sotto, un **filetto doppio** —
0,7 mm e 0,15 mm a poco più di un millimetro di distanza — e poi il titolo
del documento, centrato in maiuscoletto spaziato su una **fascia grigia** come
quelle delle sezioni, un po' più alta. L'ha proposta il cardiologo l'11
settembre 2026; la carta intestata è la stessa di ricetta, certificato e
richiesta di esame, e la fascia vale anche per loro.

I recapiti stavano nel piede in corpo 6,5: è il primo posto dove si cerca chi
ha scritto il referto, non l'ultimo. Nel piede restano la numerazione di
pagina e la firma dell'applicazione.

L'anagrafica del paziente è una fascia di celle con l'etichetta piccola sopra
e il valore in grassetto sotto — lo stesso linguaggio con cui il referto
scrive tutti gli altri dati. Nel referto le celle sono **centrate**: sotto un
titolo centrato, allineate a sinistra «Data di nascita» e «Sesso» non cadevano
simmetriche e il cardiologo le vedeva storte. Erano righe «Etichetta: valore» su due colonne,
cioè la grafica di un modulo da compilare.

### Il grassetto vuol dire una cosa sola

Nel referto il **grassetto segnala il valore fuori dai limiti di riferimento**, e
nient'altro. Prima ogni valore misurato era in grassetto: con quaranta numeri in
grassetto su un foglio, il grassetto non diceva niente. Ora il corpo è tutto di
peso normale e chi apre il referto vede subito dove guardare — la pressione a
150/85, l'eGFR a 44, i trigliceridi a 260.

Le soglie stanno tutte in `rangeClinici.ts`: il PDF non ne conosce nessuna, si
limita a chiedere se il valore è fuori norma. Sono in grassetto anche il calcium
score in fascia severa, l'NT-proBNP sopra la soglia di esclusione e i lipidi
fuori dall'obiettivo della classe di rischio.

Le uniche due eccezioni sono strutturali e stanno fuori dai dati clinici: il nome
del paziente nella fascia identificativa e i titoli, che sono gerarchia di pagina
e non enfasi.

Il grassetto e il solo segnale: accanto al valore non compare **nessun giudizio
scritto**. Sulla pressione arteriosa in particolare il referto non dice
"iperteso", mette in grassetto 150/85 e basta.

### Il referto non spiega

La regola vale per tutto quello che l'applicazione sa e il referto non deve
dire: **il foglio va in mano a un medico, che sa cosa sta leggendo**. Sono
uscite dal referto, una dopo l'altra:

- la lettura della soglia accanto all'NT-proBNP — «210 pg/mL *(Sopra la soglia
  di esclusione)*» — che diceva a parole quello che il grassetto dice da solo;
- lo **stadio KDIGO** accanto all'eGFR: nel referto esce «63», la stadiazione
  resta nella maschera dove serve mentre si compila;
- la **fascia Agatston** accanto al calcium score, tolta prima delle altre;
- tutte le note che l'app scriveva sotto la tabella dello scompenso: la fascia
  HFmrEF di ESC 2021, l'avvertenza a non sospendere la terapia quando la
  frazione risale, la soglia di esclusione per contesto, il confronto fra la
  frazione precedente e quella attuale. Uscivano **nello stesso carattere della
  prosa del cardiologo**, e niente sul foglio diceva che non le aveva scritte
  lui;
- la **distanza dei lipidi dall'obiettivo** — «132 mg/dL — 77 mg/dL sopra
  l'obiettivo di 55 mg/dL». Era stata chiesta dal cardiologo, ed è uscita con le
  altre: il valore e il bersaglio sono stampati entrambi, uno sotto l'altro, e
  il grassetto dice già che il paziente è fuori;
- la nota che sotto gli ematochimici diceva che i valori calcolati sono stime
  derivate e non risultati di laboratorio: lo dice l'etichetta della cella.

Nel referto restano quindi i dati, i calcoli con la loro etichetta, il grassetto
per il fuori norma e le parole del cardiologo. Le letture, le fasce e le soglie
restano tutte **nella maschera**, dove servono mentre si compila.

Le etichette **non sono in maiuscolo**: ApoB, NT-proBNP, hs-PCR e Lp(a) hanno una
grafia loro, e si leggono a colpo d occhio proprio per come alternano maiuscole e
minuscole. Appiattirla in APOB e NT-PROBNP e come scrivere un cognome tutto in
maiuscolo per farlo sembrare piu importante.

### Gerarchia della pagina

Tre livelli, un trattamento ciascuno, più il titolo del documento su una
fascia più alta in testa al foglio:

1. **Sezione** — maiuscoletto spaziato su una **fascia grigio chiaro** da
   margine a margine. Vale per tutte: Anamnesi, Esame obiettivo, Pressione
   arteriosa, ogni esame strumentale (Elettrocardiogramma, TC coronarica…),
   Esami ematochimici, Inquadramento clinico, Conclusioni.
2. **Modulo dentro «Inquadramento clinico»** — grassetto piccolo sottolineato
   (Scompenso cardiaco, Fibrillazione atriale, Rischio cardiovascolare).
3. **Colonna dentro una griglia** — etichetta grigia piccola in maiuscolo
   (Parametri vitali, Antropometria).

Il secondo livello valeva anche per gli esami, sotto «Esami strumentali»:
l'11 settembre 2026 il cardiologo ha preferito una fascia per esame, e per
l'inquadramento clinico ha detto di lasciarlo com'è. Prima ancora la barra
grigia significava due cose — sezione del referto *e* colonna di una griglia —
e le sezioni di prosa avevano un titolo tutto loro.

**L'aria fra i blocchi è l'interlinea.** Una fascia comincia dove finisce
l'ultima riga del blocco sopra, senza margini aggiunti, e il contenuto parte
poco più di un millimetro sotto la fascia. Le righe della tabella a griglia
sono da 8,4 mm, quelle della tabella a due colonne da 6,4. Con le spaziature
di prima il referto di prova, con tutti i moduli compilati, faceva cinque
pagine; il cardiologo le ha trovate eccessive e ora sono quattro.
Interlinea della prosa e altezza della fascia sono costanti in cima a
`PdfService.ts`; l'altezza delle righe sta nelle due funzioni delle tabelle.

Il foglio è **A4 dichiarato** (non sottinteso, così i visualizzatori sanno che
scala applicare in stampa) con margini di **18 mm per lato**. I tre millimetri
in più rispetto ai 15 di prima sono tolleranza: fra l'area non stampabile
della macchina e il trascinamento del foglio, una stampa leggermente fuori
centro con margini stretti mangia del testo; con 18 mangia solo bianco.

**Gli unici fondini sono le fasce dei titoli**, del documento e delle sezioni,
grigio 235 su 255 (circa l'8% di nero); il resto del referto è tipografia e
filetti. Per qualche giorno
i titoli sono stati solo un filetto sotto la parola, perché un retino chiaro
stampato in bianco e nero può sparire o sporcarsi a seconda della macchina. Il
cardiologo, guardando i referti stampati, ha preferito la fascia e l'ha voluta
anche sulle sezioni di prosa, che prima avevano un titolo diverso da quelle di
dati.

Nell'anagrafica il **nome prende due colonne solo se in una non ci sta**: si
misura con il carattere con cui verra' scritto e si allarga soltanto quando
serve, perche' allargarlo sempre faceva scendere la data della visita anche per
un nome corto. Se non ci sta nemmeno in due colonne va a capo dentro la cella e
la riga si alza: un referto che tronca il cognome e' un referto sbagliato.

Le due tabelle (misure a griglia, valori lunghi a due colonne) restano due,
perché servono a cose diverse, ma hanno la stessa etichetta e lo stesso filetto
di riga. Quando una si spezza fra due pagine, la pagina nuova riapre con il
nome del modulo seguito da *(segue)*: senza, si trovavano due righe di misure
orfane senza sapere a quale esame appartenessero.


Le **immagini allegate** chiudono il referto, dopo le conclusioni: stavano
prima, e con quattro allegati la sezione che il curante e il paziente cercano
per prima finiva dietro una galleria. Le immagini panoramiche — un tracciato
ECG, una striscia Holter — prendono la riga intera invece della mezza colonna,
perché in una cella da 85 mm un tracciato lungo e basso è decorativo e non
refertabile. Ogni figura è numerata (*Fig. 1*) per poterla citare nel testo, e
viene ricampionata a 200 dpi sulla dimensione stampata: prima entrava nel PDF
alla risoluzione della fotocamera, e quattro foto facevano un referto da
megabyte che poi doveva viaggiare per posta.

Il riquadro del **BMI** porta accanto l'altezza da cui è calcolato — «BMI 27,4
· h 175 cm». L'altezza sta nella scheda del paziente e non si ripete a ogni
visita: dopo la prima volta spariva dalla vista, e il BMI sembrava uscire dal
nulla. Se manca, al posto del riquadro c'è il campo per inserirla.

Peso e BMI stanno **solo** fra le variabili cliniche. Comparivano anche nel
blocco d'intestazione, venti millimetri più sopra: sono variabili della
visita, non identità del paziente.

### Pagine, identità e firma

Il referto si stampa e viaggia: finisce dal medico curante, dai colleghi, in
una cartella di carta. Da qui tre cose che i referti ospedalieri hanno sempre:

- **«Pagina 2 di 3»** in fondo a destra, e **«Pagina 1 di 1»** anche quando la
  pagina è una sola: la numerazione è il modo in cui il foglio dichiara di
  essere intero. I piedi si disegnano in coda, a documento chiuso, perché il
  totale prima non si conosce.
- **Riga di identificazione** in testa alle pagine dopo la prima (cognome e
  nome, data di nascita, data della visita) e, a destra, **il nome del medico
  che lo ha scritto**: la carta intestata sta solo sulla prima pagina, e un
  foglio che si stacca dalla graffetta era attribuibile al paziente ma non al
  suo autore.
- **Data di emissione** al centro del piede, con il riferimento della visita:
  la visita si può correggere e il referto ristampare, e due copie della stessa
  visita sono due fogli diversi che devono poterlo dire.
- **Proprietà del file** (titolo, autore, oggetto): il referto finisce in
  archivi e allegati di posta, e senza proprietà è un documento senza titolo che
  nessuna ricerca trova.
Il referto **non** porta il blocco firma in calce: si chiude sulle conclusioni.
Luogo, data e riga per la firma erano stati aggiunti sull'esempio dei referti
ospedalieri e il cardiologo li ha tolti — chi firma lo fa sul foglio stampato, e
il nome del medico è già in testa a ogni pagina. Ricetta, certificato e
richiesta di esame la firma la tengono: senza, non varrebbero niente.

Sotto il filetto del piede, allineata a sinistra, una riga in corpo 5 e grigio
chiarissimo dice **«Creato con Corioli»**. Sta nella banda già vuota fra la
fine del contenuto e il piede: si legge se la si cerca, non si nota mentre si
legge il referto.

Dei punteggi (CHA₂DS₂-VASc, HAS-BLED) il referto porta **solo il totale**: le
voci che li compongono restano nella maschera, dove servono mentre si compila,
ma nel referto sono già nella prosa dell'anamnesi. Accanto ai due punteggi
compaiono peso, creatinina, età ed eGFR, che sono i dati da cui si decide la
dose dell'anticoagulante orale. Il modulo della fibrillazione atriale si stampa
solo se il medico ha dichiarato qualcosa sull'aritmia: i punteggi si calcolano
da età, sesso e fattori di rischio, quindi da soli comparirebbero su ogni
referto.

Ogni modulo ha i propri modelli di refertazione riutilizzabili, gestibili da
Impostazioni → Modelli. La **TC coronarica** fa eccezione e non ne ha: il suo
referto lo scrive il cardiologo leggendo quello del radiologo, e un testo
precompilato su un esame che si chiede ogni cinque anni non fa risparmiare
tempo.

### Una barra di scorrimento sola

A sinistra i parametri, a destra il referto, e le due colonne sono **alte
uguale** per il solo `align-items: stretch` del flex: nessuna altezza in `vh`,
nessuna colonna agganciata, nessuno `overflow` interno. Funziona perché le tre
card in alto — variabili cliniche, laboratorio, rischio cardiovascolare — si
richiudono, e chiuse tengono la colonna sotto i 900px, quindi più corta del
referto. L'ultima card, le immagini allegate, si prende lo spazio che avanza
ma **al massimo fino a 240px**: senza tetto, coi moduli del referto aperti la
zona di caricamento si allungava per centinaia di pixel e sembrava un errore
di impaginazione, non un bersaglio per il trascinamento.

La regola da non rompere è **una barra di scorrimento sola, quella della
pagina.** La colonna agganciata con scroll proprio era stata provata e
scartata: con due barre la rotella fa una cosa diversa a seconda di dove sta
il mouse e di quanto si è scorsa la pagina, e chi compila lo paga a ogni
visita. Per la stessa ragione la card delle immagini usa `grow` con
`basis-auto` e `shrink-0` invece di `flex-1`, e perde il tetto quando contiene
miniature: entrambe le scorciatoie la strizzerebbero sotto l'altezza del suo
contenuto, e il `CardBody` di NextUI — che ha `overflow-y: auto` di serie —
tirerebbe su la seconda barra.

A card chiusa la testata porta una riga di sintesi (`LDL 112 · 14 valori ·
prelievo 10/09`), perché richiudere non deve costare la lettura del dato:
senza quella riga il medico lascia tutto aperto e le card richiudibili non
servono a niente. Quali valori meritino quella riga è una domanda aperta per
il cardiologo. Lo stato aperto/chiuso sta in `localStorage` e non sulla
visita, perché è una preferenza di chi compila e non un dato clinico; e una
card piena **non** si riapre da sola, al contrario dei moduli collassabili del
referto, che partono aperti se contengono dati.

### Quello che la maschera non chiede

Alcune voci sono state tolte di proposito, e vanno lasciate fuori:

- **Il ritmo all'ECG** e la **forma clinica della fibrillazione atriale** erano
  tendine con la diagnosi dentro. La diagnosi la scrive il cardiologo nel
  referto testuale del modulo: viene da una frase sua e non da una voce di
  menu.
- **La terapia anticoagulante in atto** era un campo strutturato. Serviva a
  filtrare la voce «INR labile» dell'HAS-BLED, che vale solo in warfarin: ora
  quella casella si spunta a mano e la sua nota dice la condizione.
- Nelle tendine della TC coronarica (CAD-RADS, burden di placca, esito FFR-TC,
  segmenti) c'è la voce **«Nessuna menzione»**. Le tendine non si riportano a
  vuoto una volta scelte: senza quella voce, sfiorare il burden di placca
  bastava a far uscire nel referto un valore fra P1 e P4 che il referto
  radiologico non nominava affatto.
- Il modulo **fibrillazione atriale** ha un interruttore esplicito. I due
  punteggi si calcolano da età, sesso e fattori di rischio, quindi senza una
  dichiarazione del medico ogni referto porterebbe un «CHA₂DS₂-VASc 0 / 9»
  addosso a un paziente che non è mai stato fibrillante.

## Gruppi di ricerca

Si attivano dalla card dedicata in Impostazioni. Servono a etichettare i
pazienti inclusi in un progetto e a ritrovarli tutti insieme.

- **Impostazioni:** crea, rinomina ed elimina i gruppi, con il numero di
  partecipanti. Rinominare aggiorna tutti i pazienti che usano il gruppo;
  eliminare lo toglie da tutti, previa conferma con il conteggio.
- **Scheda paziente:** chip compatti accanto ai dati anagrafici. Il `+` assegna
  un gruppo esistente o ne crea uno al volo; cliccando un chip si corregge la
  data di arruolamento.
- **Elenco pazienti:** mostra sempre **tutti** i pazienti, con un badge sulla
  card di chi fa parte di un progetto. Nessun filtro per gruppo qui: la vista
  per progetti sta nella pagina dedicata.
- **Dashboard:** terza colonna con i progetti attivi, partecipanti e da quanto
  tempo vanno avanti.
- **Pagina "Gruppi di ricerca"** (`/gruppi-ricerca`): contiene **solo** i
  pazienti arruolati, raggruppati per progetto, ciascuno con la data di
  arruolamento e da quanto tempo ne fa parte. Chi sta in due progetti compare
  sotto entrambi. Ha una ricerca interna fra gli arruolati e si apre sul singolo
  progetto con `?gruppo=Nome`. Ci si arriva dal pannello in dashboard: il
  pulsante apre tutti gli arruolati, il clic su un progetto apre quello.

L'appartenenza è salvata **sul paziente** (`Patient.gruppiRicerca`: nome del
gruppo più data di arruolamento), non in un archivio separato. I backup
contengono i pazienti ma non le preferenze, quindi dopo un ripristino
assegnazioni e date sopravvivono e i gruppi ricompaiono dai dati; l'elenco
mostrato è sempre l'unione fra il registro in Impostazioni e i gruppi già in
uso. La durata di un progetto è calcolata dalla data di arruolamento più
vecchia fra i suoi pazienti, così non serve una data di inizio a parte. Il
vecchio formato a sole stringhe viene ancora letto senza perdere i dati.

## Indici calcolati

Sono **suggerimenti**: compaiono in un riquadro a parte, riportano sempre la
formula di provenienza e non vengono mai scritti automaticamente nei campi del
referto. L'interpretazione resta del medico.

| Indice | Formula | Limiti applicati |
|---|---|---|
| LDL | Friedewald (tot − HDL − TG/5) | non calcolato con TG ≥ 400 mg/dL |
| Colesterolo non-HDL | totale − HDL | — |
| eGFR + stadio KDIGO | CKD-EPI 2021 senza coefficiente etnico | richiede età e sesso; nel referto esce il solo eGFR |
| HOMA-IR | (glicemia × insulinemia) / 405 | solo su prelievo a digiuno; nel referto esce il numero, le sei fasce di lettura restano nella maschera |
| QTc | Bazett (QT / √RR) | segnalato come inaffidabile fuori da 50-100 bpm |
| Fascia calcium score | fasce Agatston 0 / 1-99 / 100-399 / ≥ 400 | descrittiva, non diagnostica |
| SCORE2 | modello ESC 2021 per regione di rischio | **non attivo**, vedi sotto |

### La TC coronarica nel referto: tre numeri

Del modulo TC il referto stampa **il punteggio Agatston, la classe CAD-RADS e il
burden di placca**, e nient altro. Niente fascia di calcificazione, niente
intervallo Agatston accanto al punteggio, niente descrizione per esteso della
classe CAD-RADS, niente avvertenza sul fatto che il calcium score non equivale a
stenosi ostruttiva.

Non e una semplificazione: e il cardiologo che legge. Sa che 460 e alto e sa
cosa vuol dire 4B, e tre righe che glielo spiegano tolgono valore al colpo
d occhio. La lettura del quadro la scrive lui nella sintesi del modulo, dove puo
dire dove sono le alterazioni invece di elencarle a segmenti.

I tre valori stanno su una riga sola. Data, struttura, metodica, componenti
della placca, stenosi massima, segmenti SCCT e FFR-TC restano compilabili nella
maschera — servono per gli studi — ma **nel referto non entrano nemmeno quando
sono compilati**. Prima comparivano se c'erano, e un modulo compilato per intero
stampava nove righe al posto di tre numeri.

### La classe di rischio nel referto

La classe di rischio **non si ricava dai lipidi**: la attribuisce il medico
dall'anamnesi dei fattori di rischio — eventi pregressi, danno d'organo,
comorbidità — e sono le linee guida a legare a quella classe l'obiettivo di
LDL e di ApoB. Il referto stampa la classe dichiarata, l'obiettivo che le
corrisponde e di quanto il paziente ne è distante: è il ragionamento che il
medico curante deve poter rifare leggendo il foglio. Senza classe dichiarata
la sezione non esce — un obiettivo lipidico senza la classe da cui deriva
sarebbe un numero senza motivo. Il punteggio SCORE2 resta invece di supporto
e fuori dal referto.

### SCORE2: perché è disattivato

I coefficienti pubblicati di SCORE2 stanno solo nel materiale supplementare di
*Eur Heart J 2021;42:2439-2454* (Supplementary Table S7), non nel testo
dell'articolo né nei manuali dei calcolatori online: non è stato possibile
verificarli sulla fonte primaria.

La pipeline è completa e coperta da test, ma
`SCORE2_COEFFICIENTS_VALIDATED` in
[`src/utils/score2Coefficients.ts`](src/utils/score2Coefficients.ts) è a
`false`, quindi l'app mostra il motivo invece di un numero di rischio
potenzialmente sbagliato. Per attivarlo: confrontare ogni valore della tabella
con la Supplementary S7, correggere quelli errati e mettere il flag a `true`.

## Requisiti

Node.js 18+ e npm.

## Comandi

```bash
npm install          # dipendenze
npm run electron:dev # app in sviluppo (Vite + Electron)
npm run dev          # solo interfaccia nel browser, su http://localhost:5173
npm test             # test (vitest)
npm run anteprima    # scrive anteprima-referto.pdf con una visita di prova
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
  printFiles.js      PDF di stampa in %TEMP%/CorioliCardiologia/stampe
  appLock.js         PIN, codice di recupero, Windows Hello / Touch ID
src/
  Pages/Dashboard/   home, pazienti, visite, documenti, impostazioni
  components/cardio/ campi misura e riquadri degli indici calcolati
  services/          accesso ai dati, PDF, import CSV, backup, chat assistenza
  utils/cardioCalcs  calcolatori cardiologici
  utils/score2Coefficients  tabella dei coefficienti SCORE2 (da validare)
```

## Dati e backup

Tutto sta in `%APPDATA%/CorioliCardiologia` (Windows) o
`~/Library/Application Support/CorioliCardiologia` (macOS):

| Percorso | Contenuto |
|----------|-----------|
| `corioli-cardiologia.db` | archivio pazienti, visite, documenti, modelli |
| `corioli-cardiologia.db.bak` | copia dello stato con cui si è aperta la sessione |
| `backups/` | copie automatiche (giornaliera, pre-import, pre-ripristino, manuale) |

L'archivio è **separato da quello di Corioli**: le due applicazioni possono
convivere sullo stesso computer senza interferire.

> **Nota sulla migrazione.** La cartella dati è cambiata rispetto alle build
> precedenti (`CorioliGenerale` → `CorioliCardiologia`): i dati inseriti in una
> build di prova non vengono letti automaticamente. Per portarli avanti:
> esportare il backup JSON dalle impostazioni della vecchia build e importarlo
> nella nuova.

Il database viene scritto in modo atomico (file temporaneo + `rename`): una
scrittura interrotta non può corromperlo. All'avvio, se il file principale è
illeggibile, viene messo da parte e si riparte dalla copia `.bak`.

L'export JSON dalle impostazioni resta il backup da **conservare altrove**: le
copie automatiche stanno sullo stesso disco dell'app.

## Test

I test coprono i calcolatori cardiologici, le date locali, la validazione e
l'import dei backup, la migrazione dei dati demo e i moduli Electron di backup
e stampa.

Sul referto ce ne sono di due tipi. `refertoVisita.test.ts` verifica **cosa**
c'è scritto: sono le regole di composizione che arrivano dal cardiologo, e si
perdono facilmente in un refactor del layout. `refertoImpaginazione.test.ts`
verifica **dove** finisce: intercetta ogni `doc.text`, misura la stringa con lo
stesso metro che usa jsPDF e controlla che niente esca dai margini o scenda nel
piede. È la classe di difetti che il testo estratto dal PDF non mostra — le
parole ci sono tutte e il foglio si stampa sbagliato — ed è così che è venuto
fuori che la prosa veniva mandata a capo misurandola con il carattere delle
tabelle, e usciva fino a un centimetro e mezzo oltre il margine destro.

```bash
npm test
npm run anteprima    # per guardare il foglio invece di leggerlo
```

`npm run anteprima` scrive `anteprima-referto.pdf` usando il paziente e la
visita di prova in `refertoDiProva.ts`: serve a vedere un cambiamento di layout
senza doversi creare un paziente finto nell'applicazione e stampargli una
visita.

## Da completare prima della distribuzione

- **SCORE2:** validare i coefficienti come descritto sopra.
- **Microsoft Store:** `identityName` (`CorioliCardiologia.CorioliCardiologia`)
  va riservato in Partner Center e l'ID della scheda in
  `src/Pages/Dashboard/Settings.tsx` (`CORIOLI_MS_STORE_ID`) va sostituito con
  quello della nuova app.
- **Font del referto:** jsPDF usa i caratteri standard, che sono in codifica
  WinAnsi. Il sanificatore in `PdfService.san` deve quindi degradare tutto
  quello che quella tabella non contiene: le vocali accentate diventano `e'`, il
  maggiore-uguale diventa `>=`, i pedici di CHA₂DS₂-VASc diventano cifre normali
  e l'eGFR **esce senza unità di misura**, perché `mL/min/1,73 m²` ha un
  carattere che il font non disegna. Fuori dall'italiano il danno è peggiore: un
  cognome come *Michał* diventa `Micha?`, e `β-bloccante` diventa
  `?-bloccante`. Si risolve incorporando un font Unicode
  (`addFileToVFS` + `addFont`); serve decidere **quale**, perché i caratteri di
  sistema Windows non sono ridistribuibili. Da quando il referto è tutto in
  bastoni ne basta **uno solo**, in tondo e neretto: su questa macchina c'è Noto
  Sans, licenza SIL OFL, ridistribuibile. Da subsettare con `pyftsubset` prima
  di incorporarlo: il TTF intero pesa 415 KB per stile e finirebbe dentro ogni
  referto.
- **Layout del referto:** in attesa dei referti reali del cardiologo per
  allineare tipografia e occupazione della pagina.

## Avvertenza

Corioli Cardiologia non è un dispositivo medico certificato. Gli indici
calcolati sono strumenti di supporto: non pongono diagnosi, non propongono
soglie terapeutiche e vanno letti nel contesto clinico complessivo.

## Privacy

I dati sanitari non lasciano il computer. Verso il server vanno solo la
telemetria di licenza (dati del medico e conteggi aggregati) e la chat di
assistenza. Stato di conformità e attività aperte: [Corioli-GDPR-backlog.md](Corioli-GDPR-backlog.md).
