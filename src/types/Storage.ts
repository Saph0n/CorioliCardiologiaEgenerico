// Tipi per i dati dell'applicazione offline

/** Appartenenza di un paziente a un gruppo di ricerca. */
export interface AppartenenzaGruppo {
  /** Nome del gruppo (e' anche la sua identita': non esistono id). */
  nome: string;
  /** Data di arruolamento nel progetto (ISO `aaaa-mm-gg`). */
  dal?: string;
}

export interface Patient {
  /** Identificativo univoco del paziente (UUID). Non usare il codice fiscale come id. */
  id: string;
  /** Codice fiscale, opzionale (non tutti i pazienti lo hanno). */
  codiceFiscale?: string;
  /** True se il CF è stato generato automaticamente in fase di import */
  codiceFiscaleGenerato?: boolean;
  nome: string;
  cognome: string;
  dataNascita: string;
  luogoNascita: string;
  sesso: 'M' | 'F';
  indirizzo?: string;
  telefono?: string;
  email?: string;
  /** Campi clinici opzionali nel profilo */
  gruppoSanguigno?: string;
  allergie?: string;
  altezza?: number; // in cm
  peso?: number; // in kg (utile per BMI iniziale)
  /** Note rapide del medico (visibili in scheda paziente, modificabili al volo) */
  notaBene?: string;
  /**
   * Gruppi di ricerca a cui il paziente appartiene, con la data di arruolamento.
   * Vedi `utils/gruppiRicerca.ts` per il motivo della scelta dei nomi al posto
   * dei riferimenti a un archivio separato. In lettura viene accettato anche il
   * vecchio formato a sole stringhe.
   */
  gruppiRicerca?: AppartenenzaGruppo[];
  createdAt: string;
  updatedAt: string;
}

/** Richiesta di esame complementare: entità separata dalla visita, foglio dedicato */
export interface RichiestaEsameComplementare {
  id: string;
  patientId: string;
  nome: string;
  note?: string;
  dataRichiesta: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

/** Certificato medico rilasciato al paziente (assenze, idoneità, malattia, altro) */
export interface CertificatoPaziente {
  id: string;
  patientId: string;
  /** Tipo: assenza lavoro, idoneità, malattia, altro */
  tipo: 'assenza_lavoro' | 'idoneita' | 'malattia' | 'altro';
  dataCertificato: string; // ISO date
  descrizione: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Anamnesi suddivisa per categorie (referto strutturato in stile specialistico).
 * Tutti i campi sono facoltativi. Se valorizzata, sostituisce l'anamnesi singola
 * (`visita.prestazione`) nel referto PDF.
 */
export interface AnamnesiStrutturata {
  familiare?: string;
  fisiologica?: string;
  patologica?: string;
  /** Interventi chirurgici e ricoveri pregressi */
  chirurgica?: string;
  farmacologica?: string;
  allergica?: string;
  /** Abitudini di vita: fumo, alcol, attivita' fisica, lavoro */
  abitudini?: string;
  /**
   * Sezioni personalizzate aggiunte dal medico (chiave generata, es. "custom_xxx").
   * Il contenuto è indicizzato per chiave; le etichette stanno in `anamnesiConfig`.
   */
  [key: string]: string | undefined;
}

/** Singolo farmaco in una ricetta */
export interface RicettaFarmaco {
  nome: string;
  posologia: string;
  durata?: string;
}

/** Ricetta / promemoria terapia rilasciato al paziente (PDF cartaceo) */
export interface RicettaPaziente {
  id: string;
  patientId: string;
  /** SSN dematerializzata (promemoria), bianca fuori SSN, promemoria terapia */
  tipo: 'ssn' | 'bianca' | 'promemoria';
  dataRicetta: string; // ISO date
  /** Testo libero della prescrizione (farmaci, posologie e indicazioni insieme). */
  testo?: string;
  /** @deprecated Vecchio formato a elenco; conservato per retrocompatibilità in lettura. */
  farmaci?: RicettaFarmaco[];
  /** @deprecated Confluito in `testo`; conservato per retrocompatibilità in lettura. */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Singolo campo modificato in una revisione della visita. I valori sono già formattati per la lettura. */
export interface VisitFieldChange {
  /** Chiave tecnica del campo (eventualmente con prefisso sezione, es. "visita.pesoCorporeo"). */
  field: string;
  /** Etichetta leggibile in italiano (es. "Visita · Peso corporeo"). */
  label: string;
  /** Valore precedente, formattato come stringa per la visualizzazione. */
  previousValue: string;
  /** Nuovo valore, formattato come stringa per la visualizzazione. */
  newValue: string;
}

/**
 * Una voce della cronologia delle modifiche di una visita.
 * Viene salvata in uno store dedicato e indipendente dalla visita/paziente:
 * non deve mai essere eliminata (né eliminando il paziente, né la visita, né col reset totale).
 * Per questo include uno snapshot dei dati di contesto (nome paziente, data visita...).
 */
export interface VisitRevision {
  id: string;
  /** Id della visita a cui si riferisce la modifica. */
  visitId: string;
  /** Id del paziente. */
  patientId: string;
  /** Nome del paziente al momento della modifica (resta leggibile anche se il paziente viene eliminato). */
  patientName?: string;
  /** Data della visita al momento della modifica (snapshot ISO). */
  visitDate: string;
  /** Tipo di visita al momento della modifica. */
  visitType?: string;
  /** Data e ora in cui la modifica è stata salvata (ISO). */
  modifiedAt: string;
  /** Elenco dei campi modificati con il relativo valore precedente. */
  changes: VisitFieldChange[];
}

/**
 * Elettrocardiogramma. I tempi sono in millisecondi; il QTc non viene salvato
 * calcolato ma ricalcolato alla lettura, così resta coerente con QT e FC.
 */
export interface EcgData {
  /**
   * @deprecated Non più chiesto in maschera e non più stampato.
   *
   * Era una tendina con la diagnosi di ritmo (sinusale, fibrillazione, da
   * pacemaker). Tolta su richiesta del cardiologo: la diagnosi la scrive lui
   * nel referto testuale sotto, ed è più professionale che venga da una frase
   * sua invece che da una voce di menu. Il campo resta per non perdere il dato
   * delle visite già in archivio.
   */
  ritmo?: string;
  /** Intervallo PR (ms). */
  pr?: number;
  /** Durata del QRS (ms). */
  qrs?: number;
  /** Intervallo QT misurato (ms). */
  qt?: number;
  /** Asse elettrico del QRS (gradi). */
  asse?: number;
  /** Refertazione testuale del tracciato. */
  referto?: string;
}

/** Ecocardiogramma transtoracico: misure standard + referto testuale. */
export interface EcocardiogrammaData {
  /** Diametro telediastolico del ventricolo sinistro (mm). */
  ddvs?: number;
  /** Diametro telesistolico del ventricolo sinistro (mm). */
  dsvs?: number;
  /** Spessore del setto interventricolare (mm). */
  siv?: number;
  /** Spessore della parete posteriore (mm). */
  pp?: number;
  /**
   * Frazione di eiezione (%).
   *
   * Numero secco anche quando il referto dell'esame la da' come stima ("FE
   * >55%"): il campo serve a vedere il dato grezzo a colpo d'occhio, la
   * qualifica va nel referto testuale. Scelta del referente clinico.
   */
  fe?: number;
  /** Diametro dell'atrio sinistro (mm). */
  atrioSinistro?: number;
  /**
   * Gradiente transvalvolare aortico medio (mmHg).
   *
   * La stenosi aortica è la patologia in cui tutto il resto dell'ecocardiogramma
   * può leggersi normale: senza i gradienti il referto non la descrive.
   */
  gradienteAorticoMedio?: number;
  /** Gradiente transvalvolare aortico massimo, di picco (mmHg). */
  gradienteAorticoMassimo?: number;
  /**
   * Area valvolare aortica, AVA (cm²).
   *
   * Con una portata ridotta i gradienti sottostimano la stenosi: e' l'area a
   * dire che e' severa quando il medio resta basso.
   */
  areaValvolareAortica?: number;
  /**
   * Gradiente transvalvolare mitralico medio (mmHg).
   *
   * Nella stenosi mitralica, e dopo una riparazione o una protesi mitralica, e'
   * il medio a contare: il massimo dipende troppo dalla compliance atriale.
   */
  gradienteMitralicoMedio?: number;
  /** Gradiente transvalvolare mitralico massimo, di picco (mmHg). */
  gradienteMitralicoMassimo?: number;
  /** Radice aortica (mm). */
  radiceAortica?: number;
  /** Aorta ascendente (mm). */
  aortaAscendente?: number;
  /** TAPSE (mm). */
  tapse?: number;
  /**
   * Pressione arteriosa polmonare sistolica stimata (mmHg).
   *
   * Il valore gia' sommato: gradiente VD-AD piu' pressione atriale destra
   * stimata. Il "27+5" che si trova in certi referti qui diventa 32, e la
   * scomposizione, se serve, va nel referto testuale.
   */
  paps?: number;
  /** Rapporto E/A. */
  rapportoEA?: number;
  /**
   * @deprecated Non più chiesto in maschera e non più stampato.
   *
   * Rapporto E/e'. Tolto su richiesta del cardiologo: fra le misure restano le
   * sedici da leggere a colpo d'occhio, e la funzione diastolica viene meglio
   * descritta nel referto testuale. Il campo resta per non perdere il dato
   * delle visite già in archivio.
   */
  rapportoEe?: number;
  /** Refertazione testuale. */
  referto?: string;
}

/**
 * TC coronarica: calcium score e angio-TC, storicizzati per il confronto.
 *
 * La categoria del calcium score e il percentile **non si salvano**: si
 * ricavano dal punteggio a ogni lettura, così cambiare la soglia severa del
 * centro (300 o 400) non lascia in archivio categorie calcolate con la vecchia
 * impostazione.
 */
export interface TcCoronaricaData {
  /** Data di esecuzione dell'esame (ISO), spesso diversa da quella della visita. */
  dataEsame?: string;
  /** Struttura che ha eseguito e refertato l'esame. */
  struttura?: string;
  /** Metodica e apparecchio (es. "TC multidetettore 128 strati, protocollo dedicato"). */
  metodica?: string;

  /** Calcium score secondo Agatston, come misurato e senza arrotondamenti. */
  cacScore?: number;

  /** Categoria CAD-RADS del grado di stenosi (chiave di CAD_RADS_CATEGORIE). */
  cadRads?: string;
  /**
   * Modificatori CAD-RADS applicati (N, HRP, S, G, E). Sono più d'uno per lo
   * stesso esame: uno stent e una placca ad alto rischio convivono.
   */
  cadRadsModificatori?: string[];
  /** Burden di placca: P1, P2, P3 o P4. */
  burdenPlacca?: string;

  /**
   * Componente della placca, in due campi distinti e non in un unico valore
   * aggregato: una placca calcifica al 90% e una non calcifica al 90% hanno
   * implicazioni diverse e non vanno riassunte in un numero solo.
   */
  componenteCalcifica?: number;
  componenteNonCalcifica?: number;

  /** Numeri dei segmenti SCCT con placca (modello a 18 segmenti). */
  segmenti?: number[];

  /** Stenosi più severa su base per-paziente (%). */
  stenosiMassima?: number;
  /** Segmento SCCT in cui si trova la stenosi massima. */
  stenosiMassimaSegmento?: number;

  /** Valore del FFR-TC, quando l'esame lo riporta. */
  ffrCt?: number;
  /** Esito del FFR-TC: I+, I− o I±. */
  ffrCtEsito?: string;

  /** Sintesi del referto radiologico. */
  referto?: string;
}

/**
 * Test ergometrico (cicloergometro o treadmill). I carichi si esprimono in watt
 * o in METs a seconda del protocollo: si salvano entrambi, valorizzando quello
 * che l'apparecchio riporta.
 */
export interface TestErgometricoData {
  /** Data di esecuzione (ISO), spesso diversa da quella della visita. */
  dataEsame?: string;
  /** Protocollo usato (Bruce, Bruce modificato, rampa...). */
  protocollo?: string;
  /** Durata dell'esercizio (minuti). */
  durataMin?: number;
  /** Carico massimo raggiunto (watt). */
  caricoWatt?: number;
  /** Carico massimo in equivalenti metabolici. */
  mets?: number;
  /** Frequenza cardiaca massima raggiunta (bpm). */
  fcMax?: number;
  /** Percentuale della frequenza massima teorica raggiunta. */
  fcMaxTeoricaPct?: number;
  /** Pressione arteriosa al picco dello sforzo ("180/90"). */
  paMax?: string;
  /** Motivo dell'interruzione (esaurimento muscolare, sintomi, aritmia...). */
  motivoInterruzione?: string;
  /** Esito complessivo del test. */
  esito?: string;
  /** Refertazione testuale. */
  referto?: string;
}

/** ECG dinamico secondo Holter (24 ore o piu'). */
export interface HolterEcgData {
  /** Data di inizio della registrazione (ISO). */
  dataEsame?: string;
  /** Durata della registrazione (ore). */
  durataOre?: number;
  /** Frequenza cardiaca media (bpm). */
  fcMedia?: number;
  /** Frequenza cardiaca minima (bpm). */
  fcMin?: number;
  /** Frequenza cardiaca massima (bpm). */
  fcMax?: number;
  /** Numero di battiti ectopici sopraventricolari nelle 24 ore. */
  besv?: number;
  /** Numero di battiti ectopici ventricolari nelle 24 ore. */
  bev?: number;
  /** Pausa piu' lunga registrata (secondi). */
  pausaMaxSec?: number;
  /** Ritmo prevalente nel tracciato. */
  ritmoPrevalente?: string;
  /** Refertazione testuale. */
  referto?: string;
}

/** Monitoraggio pressorio delle 24 ore (ABPM). */
export interface HolterPressorioData {
  /** Data di inizio della registrazione (ISO). */
  dataEsame?: string;
  /** Media delle 24 ore, sistolica (mmHg). */
  media24Sist?: number;
  /** Media delle 24 ore, diastolica (mmHg). */
  media24Diast?: number;
  /** Media diurna, sistolica (mmHg). */
  mediaDiurnaSist?: number;
  /** Media diurna, diastolica (mmHg). */
  mediaDiurnaDiast?: number;
  /** Media notturna, sistolica (mmHg). */
  mediaNotturnaSist?: number;
  /** Media notturna, diastolica (mmHg). */
  mediaNotturnaDiast?: number;
  /** Calo pressorio notturno (%): sotto il 10% il profilo e' non-dipper. */
  caloNotturnoPct?: number;
  /** Percentuale di misurazioni oltre la soglia. */
  caricoPressorioPct?: number;
  /** Refertazione testuale. */
  referto?: string;
}

/**
 * EcoColorDoppler dei tronchi sovraaortici.
 *
 * Non e' un esame del cardiologo — lo refertano il chirurgo vascolare o il
 * radiologo — ma il cardiologo lo legge e lo usa: la placca carotidea e'
 * aterosclerosi documentata, e sposta il paziente di classe di rischio senza
 * bisogno di nessun punteggio. Per questo la stenosi massima compare anche
 * fra le variabili cliniche, sotto il burden aterogeno, accanto ai lipidi.
 */
export interface DopplerTsaData {
  /** Data dell'esame (ISO). */
  dataEsame?: string;
  /** Struttura in cui e' stato eseguito. */
  struttura?: string;
  /** Spessore medio-intimale massimo (mm). */
  imtMax?: number;
  /**
   * Stenosi carotidea massima (%).
   *
   * E' la voce "ATS carotidea" delle variabili cliniche: stesso campo, mostrato
   * in due punti della maschera perche' serve in due ragionamenti diversi —
   * nel referto dell'esame e nel bilancio del rischio.
   */
  stenosiCarotidea?: number;
  /** Sede della stenosi massima (es. "bulbo carotideo destro"). */
  sedeStenosi?: string;
  /** Placche: sede ed ecostruttura, come le descrive il referto. */
  placche?: string;
  /** Assi vertebrali: pervieta' e direzione del flusso. */
  vertebrali?: string;
  /** Refertazione testuale. */
  referto?: string;
}

/**
 * Scompenso cardiaco: classe funzionale e peptide natriuretico.
 *
 * Il fenotipo (HFrEF / HFpEF) **non si salva**: si ricava dalla
 * frazione di eiezione dell'ecocardiogramma della stessa visita, così non puo'
 * restare indietro rispetto alla FE se questa viene corretta.
 */
export interface ScompensoData {
  /** Classe funzionale NYHA attribuita dal medico. */
  nyha?: "I" | "II" | "III" | "IV";
  /** NT-proBNP (pg/mL). */
  ntProBnp?: number;
  /**
   * Contesto del prelievo: le soglie di esclusione sono diverse fra
   * ambulatorio (125 pg/mL) e urgenza (300), quindi senza questo dato il
   * valore non e' interpretabile.
   */
  contestoBnp?: "ambulatoriale" | "acuto";
  /** Data del dosaggio del peptide (ISO), spesso diversa da quella della visita. */
  dataBnp?: string;
  /** Refertazione testuale. */
  referto?: string;
}

/**
 * Fattori di rischio cardiovascolare, da spuntare per averli sott'occhio
 * accanto alle variabili cliniche.
 *
 * Sono **anamnestici**: non cambiano da un controllo all'altro, e infatti alla
 * visita nuova arrivano già spuntati come nell'ultima (restano modificabili).
 * Si salvano comunque sulla visita e non sull'anagrafica, così resta la storia:
 * di un paziente si vede a che controllo è comparso il diabete.
 *
 * Il fumo non è qui: sta già su `visita.fumatore`, che ha tre stati (sì / no /
 * non rilevato) perché alimenta il calcolo SCORE2, dove "non rilevato" e "no"
 * non sono la stessa cosa.
 */
export interface FattoriRischioCvData {
  /** Ipertensione arteriosa nota, anche se controllata dalla terapia. */
  ipertensione?: boolean;
  /** Dislipidemia nota o in trattamento. */
  dislipidemia?: boolean;
  /** Diabete mellito o prediabete. */
  diabete?: boolean;
  /** Familiarità per cardiopatia ischemica precoce. */
  familiaritaCad?: boolean;
  /** Obesità (BMI ≥ 30). */
  obesita?: boolean;
  /** Sedentarietà: assenza di attività fisica regolare. */
  sedentarieta?: boolean;
  /** Pregresso evento cardiovascolare: sposta il paziente in prevenzione secondaria. */
  eventoCvPregresso?: boolean;
}

/**
 * Fibrillazione atriale: i fattori dichiarati dal medico per il CHA₂DS₂-VASc e
 * per l'HAS-BLED.
 *
 * I punteggi **non si salvano**: si ricalcolano dai fattori a ogni apertura,
 * come il fenotipo dello scompenso, così non possono restare indietro se il
 * medico corregge una casella. Non si salvano nemmeno età e sesso, che il
 * punteggio prende dall'anagrafica.
 *
 * I campi sono booleani piatti e non due oggetti annidati perché un fattore
 * non selezionato resta `undefined`: è la condizione che permette al
 * salvataggio di riconoscere un modulo mai compilato e di ometterlo dalla
 * visita, invece di scriverci dentro una decina di `false`.
 */
export interface FibrillazioneAtrialeData {
  /**
   * Il medico ha deciso di valutare la fibrillazione atriale in questa visita.
   *
   * Senza questo interruttore il modulo si autoinvitava nel referto: i due
   * punteggi si calcolano da età, sesso e fattori di rischio, quindi bastava
   * aprire la sezione per ritrovarsi un "CHA₂DS₂-VASc 0 / 9" stampato su un
   * paziente che non è mai stato fibrillante.
   */
  attivo?: boolean;

  /**
   * @deprecated Non più chiesta in maschera e non più stampata.
   *
   * Forma clinica dell'aritmia (parossistica, persistente, permanente).
   * Tolta su richiesta del cardiologo: è una diagnosi e la formula lui nel
   * referto. Resta per le visite già in archivio.
   */
  tipo?: "parossistica" | "persistente" | "persistente-lunga" | "permanente";
  /**
   * @deprecated Non più chiesta in maschera e non più stampata.
   *
   * Terapia anticoagulante in atto. Serviva a filtrare la voce "INR labile"
   * dell'HAS-BLED, che vale solo in warfarin; ora quella voce si spunta a mano
   * e la sua etichetta dice la condizione. Resta per le visite in archivio.
   */
  anticoagulante?: "nessuno" | "warfarin" | "doac";

  // CHA₂DS₂-VASc — prefisso `cv`.
  //
  // Ipertensione e diabete non sono qui: il punteggio li legge da
  // `fattoriRischio`, dove il medico li ha già dichiarati. Chiederli una
  // seconda volta significherebbe poterli avere spuntati di là e no di qua.
  /** Scompenso cardiaco o disfunzione ventricolare sinistra (1 punto). */
  cvScompenso?: boolean;
  /** Pregresso ictus, TIA o tromboembolismo (2 punti). */
  cvIctus?: boolean;
  /** Malattia vascolare: IMA, arteriopatia periferica, placca aortica (1 punto). */
  cvVascolare?: boolean;

  // HAS-BLED — prefisso `hb`. L'ictus compare in entrambi i punteggi e va
  // spuntato due volte: sono due domande diverse sullo stesso evento.
  /** Ipertensione non controllata, PAS > 160 mmHg (1 punto). */
  hbIpertensioneNonControllata?: boolean;
  /** Funzione renale alterata (1 punto). */
  hbFunzioneRenale?: boolean;
  /** Funzione epatica alterata (1 punto). */
  hbFunzioneEpatica?: boolean;
  /** Ictus pregresso (1 punto). */
  hbIctus?: boolean;
  /** Storia di sanguinamento o predisposizione emorragica (1 punto). */
  hbSanguinamento?: boolean;
  /** INR labile: conta solo in terapia con warfarin (1 punto). */
  hbInrLabile?: boolean;
  /** Antiaggreganti o FANS in associazione (1 punto). */
  hbFarmaci?: boolean;
  /** Consumo eccessivo di alcol (1 punto). */
  hbAlcol?: boolean;

  /** Refertazione testuale. */
  referto?: string;
}

/** Esami ematochimici usati dai calcolatori del rischio cardiovascolare (mg/dL salvo diversa indicazione). */
export interface LaboratorioData {
  /** Data del prelievo (ISO). */
  dataPrelievo?: string;
  colesteroloTotale?: number;
  hdl?: number;
  trigliceridi?: number;
  /** LDL dosato direttamente; se assente viene stimato con Friedewald. */
  ldlMisurato?: number;
  /** Apolipoproteina B (mg/dL): ha un obiettivo proprio per classe di rischio. */
  apoB?: number;
  /**
   * Lipoproteina(a) in mg/dL. Il dosaggio viene refertato anche in nmol/L e i
   * due valori non si convertono con un fattore fisso: si salva quello in
   * mg/dL, che e' l'unita' delle soglie usate qui.
   */
  lpa?: number;
  /** Glicemia a digiuno. */
  glicemia?: number;
  /** Insulinemia a digiuno (µU/mL). */
  insulina?: number;
  /** Emoglobina glicata (%). */
  hba1c?: number;
  creatinina?: number;
  /** Rapporto albumina/creatinina urinaria (mg/g). */
  albuminuria?: number;
  /** Emoglobina (g/dL). */
  emoglobina?: number;
  /** Aspartato aminotransferasi (U/L). */
  ast?: number;
  /** Alanina aminotransferasi (U/L). */
  alt?: number;
  /** Acido urico (mg/dL). */
  uricemia?: number;
  /**
   * Azotemia, cioe' urea ematica (mg/dL). Chiesta dal cardiologo accanto
   * all'uricemia (call dell'11 settembre 2026): e' fra i primi valori del rene
   * che si guardano. Senza soglia finche' non la indica lui.
   */
  azotemia?: number;
  /** Ormone tireostimolante (mU/L). */
  tsh?: number;
  /** Proteina C reattiva ad alta sensibilità (mg/L). */
  hsPcr?: number;
  /** Fibrinogeno (mg/dL): parte del profilo infiammatorio con hs-PCR e LDL ossidate. */
  fibrinogeno?: number;
  /**
   * LDL ossidate (U/L).
   *
   * Il dosaggio **non è standardizzato**: ogni laboratorio ha i suoi valori di
   * riferimento e confrontare due referti di centri diversi non ha senso. Per
   * questo il valore si salva e si stampa, ma non ha una soglia nell'app.
   */
  oxLdl?: number;
}

export interface Visit {
  id: string;
  patientId: string;
  dataVisita: string;
  descrizioneClinica: string;
  anamnesi: string;
  esamiObiettivo: string;
  conclusioniDiagnostiche: string;
  terapie: string;
  /**
   * Tipo di visita. L'edizione generale ha un solo tipo (`generale`); il campo
   * resta per compatibilità con i backup e per eventuali estensioni future.
   */
  tipo?: 'generale';
  /**
   * Anamnesi strutturata (familiare, fisiologica, patologica, farmacologica,
   * allergica + sezioni personalizzate). Presente solo se il medico usa la
   * modalità "anamnesi strutturata". Se valorizzata, ha priorità sull'anamnesi
   * singola (`visita.prestazione`) nella stampa del referto.
   */
  anamnesiStrutturata?: AnamnesiStrutturata;
  /** Contenuto clinico della visita cardiologica. */
  visita?: {
    /** Descrizione del problema / dati clinici riferiti dal paziente. */
    problemaClinico: string;
    /** Anamnesi in campo unico (usata quando l'anamnesi strutturata è disattivata). */
    prestazione: string;
    /** Esame obiettivo. */
    esameObiettivo: string;
    /** Accertamenti / esami visionati o richiesti. */
    accertamenti: string;
    /** Conclusioni diagnostiche e terapia consigliata. */
    terapiaSpecifica: string;
    /** Peso corporeo (kg) — usato per il calcolo del BMI. */
    pesoCorporeo?: number;
    /** Pressione arteriosa (es. "120/80"). */
    pressioneArteriosa?: string;
    /**
     * Posizione in cui e' stata misurata `pressioneArteriosa`. Senza, e' in
     * clinostatismo: la misurazione di ogni visita.
     */
    posizionePa?: "clino" | "orto";
    /**
     * Seconda misurazione, facoltativa: serve a documentare un'ipotensione
     * ortostatica. Senza `posizionePa2` si intende in ortostatismo.
     */
    pressioneArteriosa2?: string;
    posizionePa2?: "clino" | "orto";
    /** Frequenza cardiaca (bpm). */
    frequenzaCardiaca?: string;
    /** Fumatore attuale: input del rischio cardiovascolare. */
    fumatore?: "si" | "no";
    /**
     * Classe di rischio cardiovascolare **attribuita dal medico** in base
     * all'anamnesi dei fattori di rischio. Non viene calcolata dall'app: serve
     * a cercare nelle linee guida gli obiettivi di LDL e ApoB corrispondenti.
     * Vedi `utils/rischioCv.ts`.
     */
    categoriaRischioCv?:
      | "basso"
      | "moderato"
      | "alto"
      | "molto-alto"
      | "molto-alto-ricorrente";
    /** Data URL (base64) delle immagini allegate al referto. */
    immagini?: string[];
    /** Elettrocardiogramma a 12 derivazioni eseguito durante la visita. */
    ecg?: EcgData;
    /** Ecocardiogramma color-Doppler transtoracico. */
    ecocardiogramma?: EcocardiogrammaData;
    /** TC coronarica (esame di secondo livello, spesso refertato altrove). */
    tcCoronarica?: TcCoronaricaData;
    /** Esami ematochimici rilevanti per il rischio cardiovascolare. */
    laboratorio?: LaboratorioData;
    /** Test ergometrico (esame dinamico di primo livello). */
    testErgometrico?: TestErgometricoData;
    /** ECG dinamico secondo Holter. */
    holterEcg?: HolterEcgData;
    /** Monitoraggio pressorio delle 24 ore. */
    holterPressorio?: HolterPressorioData;
    /** EcoColorDoppler dei tronchi sovraaortici. */
    dopplerTsa?: DopplerTsaData;
    /** Scompenso cardiaco: classe NYHA e NT-proBNP. */
    scompenso?: ScompensoData;
    /** Fibrillazione atriale: fattori di CHA₂DS₂-VASc e HAS-BLED. */
    fibrillazioneAtriale?: FibrillazioneAtrialeData;
    /** Fattori di rischio cardiovascolare spuntati accanto alle variabili cliniche. */
    fattoriRischio?: FattoriRischioCvData;
    /**
     * Sintesi del rischio cardiovascolare scritta dal medico.
     *
     * È l'unico punto in cui rischio calcolato (SCORE2) e rischio osservato
     * all'imaging (calcium score, CAD-RADS) vengono messi insieme, e li mette
     * insieme una persona: l'applicazione **non calcola un rischio combinato**,
     * perché nessuna formula condivisa lo fa e sommarli darebbe a un numero
     * inventato l'autorevolezza dei due che lo hanno prodotto.
     */
    sintesiRischio?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Ambulatorio {
  id: string;
  nome: string;
  indirizzo: string;
  citta: string;
  cap: string;
  telefono: string;
  email?: string;
  isPrimario: boolean;
}

export interface Doctor {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  telefono?: string;
  specializzazione?: string;
  ambulatori?: Ambulatorio[];
  /** Data URL (base64) della foto profilo */
  profileImage?: string;
  /** Data URL (base64) immagine timbro e/o firma per i PDF */
  signatureStampImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  title: string;
  description?: string;
  /** Se valorizzato, documento associato a uno specifico paziente */
  patientId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: 'corso_aggiornamento' | 'certificato' | 'altro';
  uploadDate: string;
  expiryDate?: string;
  credits?: number; // Crediti ECM se applicabile
  fileData: string; // Base64 encoded file data
  createdAt: string;
  updatedAt: string;
}

export interface MedicalTemplate {
  id: string;
  category: 'visita' | 'terapie' | 'ricette' | 'esame_complementare' | 'certificato';
  section:
    | 'prestazione'
    | 'esameObiettivo'
    | 'conclusioni'
    | 'generale'
    | 'nome'
    | 'note'
    // Moduli strumentali della visita cardiologica
    | 'ecg'
    | 'ecocardiogramma'
    | 'tcCoronarica'
    | 'testErgometrico'
    | 'holterEcg'
    | 'holterPressorio'
    | 'dopplerTsa'
    // Sotto-sezioni dell'anamnesi strutturata
    | 'anamnesiFamiliare'
    | 'anamnesiFisiologica'
    | 'anamnesiPatologica'
    | 'anamnesiChirurgica'
    | 'anamnesiFarmacologica'
    | 'anamnesiAllergica'
    | 'anamnesiAbitudini'
    // Sezioni personalizzate dell'anamnesi: chiave generata (es. "custom_xxx").
    // `string & {}` mantiene i suggerimenti sui valori noti pur accettando chiavi custom.
    | (string & {});
  label: string;
  text: string;
  note?: string;
  isDefault?: boolean;
}

export interface AppData {
  /** Versione dello schema del backup (assente nei backup prodotti prima della 1.3.2). */
  schemaVersion?: number;
  /** Versione dell'app che ha generato il backup. */
  appVersion?: string;
  /** Data/ora di generazione (ISO). */
  exportedAt?: string;
  patients: Patient[];
  visits: Visit[];
  /** Cronologia delle modifiche delle visite (store indipendente, non viene mai cancellata). */
  visitRevisions?: VisitRevision[];
  richiesteEsami?: RichiestaEsameComplementare[];
  certificatiPaziente?: CertificatoPaziente[];
  ricettePaziente?: RicettaPaziente[];
  doctor: Doctor;
  documents: Document[];
  templates?: MedicalTemplate[];
  lastSync?: string;
}

export type BackupImportMode = 'replace' | 'merge';

export interface StorageService {
  // Pazienti
  getPatients(): Promise<Patient[]>;
  getPatientById(id: string): Promise<Patient | null>;
  getPatientByCF(cf: string): Promise<Patient | null>;
  addPatient(patient: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Patient>;
  updatePatient(id: string, patient: Partial<Patient>): Promise<Patient>;
  deletePatient(id: string): Promise<void>;

  // Visite
  getVisits(): Promise<Visit[]>;
  getVisitsByPatientId(patientId: string): Promise<Visit[]>;
  getVisitById(id: string): Promise<Visit | null>;
  addVisit(visit: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<Visit>;
  updateVisit(id: string, visit: Partial<Visit>): Promise<Visit>;
  deleteVisit(id: string): Promise<void>;

  /** Cronologia modifiche visite (store dedicato, mai cancellato dalle eliminazioni o dal reset). */
  getVisitRevisions(): Promise<VisitRevision[]>;

  // Richieste esami complementari (entità separata dalla visita)
  getRichiesteEsamiByPatientId(patientId: string): Promise<RichiestaEsameComplementare[]>;
  getRichiestaEsameById(id: string): Promise<RichiestaEsameComplementare | null>;
  addRichiestaEsame(data: Omit<RichiestaEsameComplementare, 'id' | 'createdAt' | 'updatedAt'>): Promise<RichiestaEsameComplementare>;
  updateRichiestaEsame(id: string, data: Partial<RichiestaEsameComplementare>): Promise<RichiestaEsameComplementare>;
  deleteRichiestaEsame(id: string): Promise<void>;

  // Certificati paziente
  getCertificatiByPatientId(patientId: string): Promise<CertificatoPaziente[]>;
  getCertificatoById(id: string): Promise<CertificatoPaziente | null>;
  addCertificato(data: Omit<CertificatoPaziente, 'id' | 'createdAt' | 'updatedAt'>): Promise<CertificatoPaziente>;
  updateCertificato(id: string, data: Partial<CertificatoPaziente>): Promise<CertificatoPaziente>;
  deleteCertificato(id: string): Promise<void>;

  // Ricette paziente
  getRicetteByPatientId(patientId: string): Promise<RicettaPaziente[]>;
  getRicettaById(id: string): Promise<RicettaPaziente | null>;
  addRicetta(data: Omit<RicettaPaziente, 'id' | 'createdAt' | 'updatedAt'>): Promise<RicettaPaziente>;
  updateRicetta(id: string, data: Partial<RicettaPaziente>): Promise<RicettaPaziente>;
  deleteRicetta(id: string): Promise<void>;

  // Dottore
  getDoctor(): Promise<Doctor | null>;
  updateDoctor(doctor: Partial<Doctor>): Promise<Doctor>;

  // Documenti
  getDocuments(): Promise<Document[]>;
  getDocumentById(id: string): Promise<Document | null>;
  addDocument(document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document>;
  updateDocument(id: string, document: Partial<Document>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;

  // Template
  getTemplates(): Promise<MedicalTemplate[]>;
  addTemplate(template: Omit<MedicalTemplate, 'id'>): Promise<MedicalTemplate>;
  updateTemplate(id: string, template: Partial<MedicalTemplate>): Promise<MedicalTemplate>;
  deleteTemplate(id: string): Promise<void>;

  // Backup/Export
  exportData(): Promise<AppData>;
  importData(data: AppData, mode?: BackupImportMode): Promise<void>;
  clearAllData(): Promise<void>;
}
