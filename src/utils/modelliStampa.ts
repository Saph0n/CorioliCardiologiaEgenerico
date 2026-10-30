import type {
  ArchivioModelliStampa,
  DocumentoStampa,
  ModelloStampa,
  SezioneReferto,
} from "../types/Storage";

/**
 * Modelli di stampa: i valori predefiniti, la normalizzazione di quello che
 * arriva dall'archivio o da un file, e il formato del file di esportazione.
 *
 * Il predefinito di ogni documento ("Corioli") e' il PDF com'era prima dei
 * modelli, impaginazione per impaginazione: chi non apre mai l'editor non deve
 * accorgersi che esiste. Accanto ci sono i modelli pronti (vedi
 * `STILI_PRONTI`). Nessuno dei due si salva da qualche parte o si modifica:
 * si duplicano.
 */

export const DOCUMENTI_STAMPA: DocumentoStampa[] = [
  "referto",
  "ricetta",
  "certificato",
  "richiestaEsame",
];

export const NOMI_DOCUMENTO: Record<DocumentoStampa, string> = {
  referto: "Referto",
  ricetta: "Ricetta",
  certificato: "Certificato",
  richiestaEsame: "Richiesta di esame",
};

/**
 * Le sezioni del referto nell'ordine di Corioli, con il titolo che stampano.
 *
 * L'ordine e' quello chiesto dal cardiologo il 22 settembre 2026 (vedi il
 * commento in `PdfService.impaginaReferto`): resta il predefinito, e il
 * pulsante "Ripristina" dell'editor riporta qui.
 */
export const SEZIONI_REFERTO: { id: SezioneReferto; titolo: string }[] = [
  { id: "variabili", titolo: "Variabili cliniche" },
  { id: "anamnesi", titolo: "Anamnesi" },
  { id: "motivo", titolo: "Motivo della visita" },
  { id: "laboratorio", titolo: "Esami ematochimici" },
  { id: "terapiaInAtto", titolo: "Terapia in atto" },
  { id: "pressione", titolo: "Pressione arteriosa" },
  { id: "ecg", titolo: "Elettrocardiogramma" },
  { id: "esameObiettivo", titolo: "Esame Obiettivo" },
  { id: "ecocardiogramma", titolo: "Ecocardiogramma color-Doppler transtoracico" },
  { id: "tcCoronarica", titolo: "TC coronarica" },
  { id: "testErgometrico", titolo: "Test ergometrico" },
  { id: "holterEcg", titolo: "ECG dinamico secondo Holter" },
  { id: "holterPressorio", titolo: "Monitoraggio pressorio delle 24 ore" },
  { id: "dopplerTsa", titolo: "EcoColorDoppler dei tronchi sovraaortici" },
  { id: "inquadramento", titolo: "Inquadramento clinico" },
  { id: "accertamenti", titolo: "Accertamenti" },
  { id: "conclusioni", titolo: "Conclusioni e Terapia" },
];

const TITOLO_SEZIONE = new Map(SEZIONI_REFERTO.map((s) => [s.id, s.titolo]));

/** Il titolo di Corioli di una sezione del referto. */
export function titoloPredefinitoSezione(id: SezioneReferto): string {
  return TITOLO_SEZIONE.get(id) ?? id;
}

const TITOLI: Record<DocumentoStampa, { testo: string; sottotitolo: string }> = {
  referto: { testo: "Visita cardiologica", sottotitolo: "" },
  ricetta: { testo: "Ricetta medica", sottotitolo: "Ricetta bianca" },
  // Vuoto: sotto il titolo va il tipo di certificato ("Idoneità").
  certificato: { testo: "Certificato medico", sottotitolo: "" },
  richiestaEsame: {
    testo: "Richiesta di esame",
    sottotitolo: "Prescrizione di esame complementare",
  },
};

/** I titoletti sopra il testo di ricetta, certificato e richiesta. */
const TESTI: Record<DocumentoStampa, { principale: string; secondario: string }> = {
  referto: { principale: "", secondario: "" },
  ricetta: { principale: "Prescrizione", secondario: "" },
  certificato: { principale: "Si certifica che", secondario: "" },
  richiestaEsame: { principale: "Si richiede", secondario: "Quesito diagnostico" },
};

/** Id fisso del predefinito: non e' in archivio, si ricostruisce ogni volta. */
export function idPredefinito(documento: DocumentoStampa): string {
  return `corioli-${documento}`;
}

export function ePredefinito(modello: Pick<ModelloStampa, "id" | "documento">): boolean {
  return modello.id === idPredefinito(modello.documento);
}

/** Il modello "Corioli" del documento: il PDF come Corioli lo stampa da sempre. */
export function modelloPredefinito(documento: DocumentoStampa): ModelloStampa {
  const referto = documento === "referto";
  return {
    id: idPredefinito(documento),
    documento,
    // Il nome che ha nell'editor e alla prima configurazione: e' lo stile
    // "Corioli" nella versione in bianco e nero.
    nome: "Corioli in bianco e nero",
    pagina: {
      carattere: "helvetica",
      testo: "normale",
      margini: "normali",
      colore: "nero",
      accento: "",
      formato: "A4",
      stile: "classico",
      evidenza: "grassetto",
      angoli: "vivi",
    },
    intestazione: {
      cartaIntestata: false,
      spazioAlto: 45,
      spazioBasso: 20,
      sfondoInStampa: false,
      disposizione: "lati",
      grandezzaLogo: "medio",
      specializzazione: true,
      ambulatorio: true,
      telefono: true,
      email: true,
      partitaIva: true,
      righeAggiuntive: "",
    },
    titolo: { ...TITOLI[documento], stile: "fascia" },
    // Ricetta, certificato e richiesta portano solo nome e codice fiscale:
    // l'eta' e il sesso non servono a chi li riceve.
    paziente: {
      riquadro: false,
      dataNascita: referto,
      luogoNascita: false,
      sesso: referto,
      codiceFiscale: true,
      residenza: false,
      data: false,
    },
    testi: { ...TESTI[documento] },
    sezioni: referto
      ? SEZIONI_REFERTO.map((s) => ({ id: s.id, titolo: "", visibile: true }))
      : [],
    stileSezioni: "fascia",
    conclusioniInEvidenza: false,
    inquadramentoInRiquadri: false,
    // Sul referto niente luogo e data in calce (la data della visita e' gia'
    // in testa a ogni pagina) e niente riga per la firma a penna: li ha tolti
    // il cardiologo. Ricetta, certificato e richiesta li tengono.
    firma: {
      immagine: true,
      luogoData: !referto,
      posizione: "destra",
      grandezza: "normale",
      rigaAPenna: false,
    },
    piede: { numeroPagina: true, pazienteSullePagine: true, testo: "" },
    creatoIl: "",
    aggiornatoIl: "",
  };
}

// ─── Stili e modelli pronti ─────────────────────────────────────────────────

/** Le scelte che fanno l'aspetto di un modello, senza toccare cosa stampa. */
export interface Aspetto {
  carattere: ModelloStampa["pagina"]["carattere"];
  colore: ModelloStampa["pagina"]["colore"];
  accento: string;
  stile: ModelloStampa["pagina"]["stile"];
  evidenza: ModelloStampa["pagina"]["evidenza"];
  angoli: ModelloStampa["pagina"]["angoli"];
  titolo: ModelloStampa["titolo"]["stile"];
  sezioni: ModelloStampa["stileSezioni"];
  riquadroPaziente: boolean;
  conclusioniInEvidenza: boolean;
  inquadramentoInRiquadri: boolean;
  /** Nome e recapiti del medico ai lati o al centro. */
  disposizione: ModelloStampa["intestazione"]["disposizione"];
  testo: ModelloStampa["pagina"]["testo"];
}

/** Ogni stile pronto ha due versioni: a colori e in bianco e nero. */
export type Variante = "colore" | "biancoNero";
export const VARIANTI: Variante[] = ["colore", "biancoNero"];

export interface StilePronto {
  id: string;
  nome: string;
  /** Com'e' fatto, in una riga. */
  descrizione: string;
  /** Cosa ci guadagnano medico e paziente: e' quello che fa scegliere. */
  pregio: string;
  colore: Aspetto;
  biancoNero: Aspetto;
}

/** L'aspetto del predefinito: il PDF di Corioli come e' sempre stato. */
const ASPETTO_CORIOLI: Aspetto = {
  carattere: "helvetica", colore: "nero", accento: "", stile: "classico",
  evidenza: "grassetto", angoli: "vivi", titolo: "fascia", sezioni: "fascia",
  riquadroPaziente: false, conclusioniInEvidenza: false, inquadramentoInRiquadri: false,
  disposizione: "lati", testo: "normale",
};

/** La versione in bianco e nero di un aspetto a colori: stessa forma, grigi. */
function inBiancoENero(a: Aspetto): Aspetto {
  return { ...a, colore: "nero", accento: "" };
}

const MODERNO: Aspetto = {
  carattere: "lato", colore: "#1565c0", accento: "#ef8a2b", stile: "moderno",
  evidenza: "colore", angoli: "arrotondati", titolo: "sfumato", sezioni: "barra",
  riquadroPaziente: true, conclusioniInEvidenza: true, inquadramentoInRiquadri: true,
  disposizione: "lati", testo: "normale",
};
const ELEGANTE: Aspetto = {
  carattere: "times", colore: "bordeaux", accento: "#c0892b", stile: "moderno",
  evidenza: "grassetto", angoli: "vivi", titolo: "sottolineato", sezioni: "centrate",
  riquadroPaziente: false, conclusioniInEvidenza: true, inquadramentoInRiquadri: false,
  disposizione: "centro", testo: "normale",
};
const ESSENZIALE: Aspetto = {
  carattere: "helvetica", colore: "#0e7490", accento: "", stile: "moderno",
  evidenza: "grassetto", angoli: "vivi", titolo: "sinistra", sezioni: "punto",
  riquadroPaziente: false, conclusioniInEvidenza: false, inquadramentoInRiquadri: false,
  disposizione: "lati", testo: "normale",
};
const GRANDE: Aspetto = {
  carattere: "lato", colore: "#5b3a8c", accento: "#e5674e", stile: "moderno",
  evidenza: "colore", angoli: "arrotondati", titolo: "testo", sezioni: "piena",
  riquadroPaziente: true, conclusioniInEvidenza: true, inquadramentoInRiquadri: false,
  disposizione: "banda", testo: "grande",
};

/**
 * Gli stili che Corioli porta con se': si scelgono alla prima configurazione
 * e nell'editor, e sono anche modelli pronti da usare cosi' come sono (vedi
 * `modelloPronto`). Diversi fra loro nella forma, non solo nel colore, e
 * tutti leggibili anche fotocopiati. "Moderno" a colori e' il referto "blu e
 * azzurro" che Pablo ha mandato il 22 ottobre 2026; "Corioli" in bianco e nero
 * e' il predefinito.
 */
export const STILI_PRONTI: StilePronto[] = [
  {
    id: "corioli",
    nome: "Corioli",
    descrizione: "Fasce piene e testo compatto: il foglio di sempre",
    pregio: "Fitto e ordinato: un referto lungo sta in meno pagine.",
    colore: { ...ASPETTO_CORIOLI, colore: "verde" },
    biancoNero: ASPETTO_CORIOLI,
  },
  {
    id: "moderno",
    nome: "Moderno",
    descrizione: "Lato, titolo sfumato, dati del paziente in un riquadro",
    pregio: "Conclusioni in un riquadro e valori fuori norma evidenziati: il paziente trova subito l'essenziale.",
    colore: MODERNO,
    biancoNero: inBiancoENero(MODERNO),
  },
  {
    id: "elegante",
    nome: "Elegante",
    descrizione: "Times, intestazione al centro, capitoli fra due filetti",
    pregio: "Ha l'aria di una lettera: adatto a relazioni e certificati da consegnare.",
    colore: ELEGANTE,
    biancoNero: inBiancoENero(ELEGANTE),
  },
  {
    id: "essenziale",
    nome: "Essenziale",
    descrizione: "Titolo grande a sinistra, niente fasce, tanto bianco",
    pregio: "Consuma pochissimo inchiostro e si fotocopia bene.",
    colore: ESSENZIALE,
    biancoNero: inBiancoENero(ESSENZIALE),
  },
  {
    id: "grande",
    nome: "Grande e chiaro",
    descrizione: "Intestazione su una banda colorata, titoli pieni, testo più grande",
    pregio: "Titoli su fasce piene e testo più grande: per i pazienti che leggono con fatica.",
    colore: GRANDE,
    biancoNero: inBiancoENero(GRANDE),
  },
];

export const NOMI_VARIANTE: Record<Variante, string> = {
  colore: "a colori",
  biancoNero: "in bianco e nero",
};

/** L'aspetto del modello, cosi' com'e'. */
export function aspettoDi(m: ModelloStampa): Aspetto {
  return {
    carattere: m.pagina.carattere,
    colore: m.pagina.colore,
    accento: m.pagina.accento,
    stile: m.pagina.stile,
    evidenza: m.pagina.evidenza,
    angoli: m.pagina.angoli,
    titolo: m.titolo.stile,
    sezioni: m.stileSezioni,
    riquadroPaziente: m.paziente.riquadro,
    conclusioniInEvidenza: m.conclusioniInEvidenza,
    inquadramentoInRiquadri: m.inquadramentoInRiquadri,
    disposizione: m.intestazione.disposizione,
    testo: m.pagina.testo,
  };
}

/** Applica un aspetto al modello (lo modifica): contenuti, testi e campi restano. */
export function applicaAspetto(m: ModelloStampa, a: Aspetto): void {
  m.pagina.carattere = a.carattere;
  m.pagina.colore = a.colore;
  m.pagina.accento = a.accento;
  m.pagina.stile = a.stile;
  m.pagina.evidenza = a.evidenza;
  m.pagina.angoli = a.angoli;
  m.titolo.stile = a.titolo;
  m.stileSezioni = a.sezioni;
  m.paziente.riquadro = a.riquadroPaziente;
  m.conclusioniInEvidenza = a.conclusioniInEvidenza;
  m.inquadramentoInRiquadri = a.inquadramentoInRiquadri;
  m.intestazione.disposizione = a.disposizione;
  m.pagina.testo = a.testo;
}

/** Due aspetti uguali, campo per campo (l'ordine delle chiavi non conta). */
function stessoAspetto(a: Aspetto, b: Aspetto): boolean {
  return (Object.keys(a) as (keyof Aspetto)[]).every((k) => a[k] === b[k]);
}

/** Lo stile pronto (e quale versione) che il modello ha, se non e' stato cambiato dopo. */
export function stileProntoDi(m: ModelloStampa): { stile: StilePronto; variante: Variante } | undefined {
  const attuale = aspettoDi(m);
  for (const stile of STILI_PRONTI) {
    for (const variante of VARIANTI) {
      if (stessoAspetto(stile[variante], attuale)) return { stile, variante };
    }
  }
  return undefined;
}

/**
 * Id fisso di un modello pronto. Come il predefinito non e' in archivio: si
 * ricostruisce ogni volta, e migliorando uno stile in una versione nuova di
 * Corioli migliora anche per chi lo usa gia'. "Corioli" in bianco e nero e' il
 * predefinito stesso.
 */
export function idModelloPronto(stile: string, variante: Variante, documento: DocumentoStampa): string {
  return stile === "corioli" && variante === "biancoNero"
    ? idPredefinito(documento)
    : `pronto-${stile}-${variante}-${documento}`;
}

/** Il modello pronto del documento: il predefinito con l'aspetto dello stile. */
export function modelloPronto(
  stile: StilePronto,
  variante: Variante,
  documento: DocumentoStampa,
): ModelloStampa {
  const m = modelloPredefinito(documento);
  if (m.id === idModelloPronto(stile.id, variante, documento)) return m;
  applicaAspetto(m, stile[variante]);
  m.id = idModelloPronto(stile.id, variante, documento);
  m.nome = `${stile.nome} ${NOMI_VARIANTE[variante]}`;
  return m;
}

/** Stile e versione di un modello pronto, dal suo id; `undefined` se e' un modello del medico. */
export function prontoDi(
  m: Pick<ModelloStampa, "id" | "documento">,
): { stile: StilePronto; variante: Variante } | undefined {
  for (const stile of STILI_PRONTI) {
    for (const variante of VARIANTI) {
      if (idModelloPronto(stile.id, variante, m.documento) === m.id) return { stile, variante };
    }
  }
  return undefined;
}

/** Un modello di Corioli (il predefinito o uno pronto): non si modifica, si copia. */
export function eModelloPronto(m: Pick<ModelloStampa, "id" | "documento">): boolean {
  return prontoDi(m) !== undefined;
}

function modelloProntoDaId(id: string, documento: DocumentoStampa): ModelloStampa | undefined {
  const p = prontoDi({ id, documento });
  return p ? modelloPronto(p.stile, p.variante, documento) : undefined;
}

/**
 * Lo stesso stile su tutti i documenti: l'archivio con i quattro documenti
 * che usano il modello pronto scelto. Con "Corioli" in bianco e nero il
 * documento torna semplicemente al predefinito.
 */
export function usaStileProntoOvunque(
  archivio: ArchivioModelliStampa,
  stile: StilePronto,
  variante: Variante,
): ArchivioModelliStampa {
  const inUso = { ...archivio.inUso };
  for (const documento of DOCUMENTI_STAMPA) {
    const id = idModelloPronto(stile.id, variante, documento);
    if (id === idPredefinito(documento)) delete inUso[documento];
    else inUso[documento] = id;
  }
  return { ...archivio, inUso };
}

/**
 * Porta su `destinazione` l'aspetto e la carta intestata di `origine`, per
 * avere ricetta, certificato e richiesta uguali al referto. Restano del
 * documento i testi (titolo, titoletti, sezioni), i dati del paziente, il
 * formato del foglio e luogo e data della firma, che cambiano da un documento
 * all'altro per ragioni loro.
 */
export function copiaAspetto(origine: ModelloStampa, destinazione: ModelloStampa): void {
  applicaAspetto(destinazione, aspettoDi(origine));
  destinazione.pagina.margini = origine.pagina.margini;
  destinazione.intestazione = structuredClone(origine.intestazione);
  destinazione.firma.immagine = origine.firma.immagine;
  destinazione.firma.posizione = origine.firma.posizione;
  destinazione.firma.grandezza = origine.firma.grandezza;
  destinazione.piede.testo = origine.piede.testo;
}

/** Chiave dell'archivio chiave/valore (diventa `AppDottori_modelli_stampa`). */
export const CHIAVE_MODELLI_STAMPA = "modelli_stampa";

export const ARCHIVIO_MODELLI_VUOTO: ArchivioModelliStampa = { modelli: [], inUso: {} };

/**
 * Unione per il ripristino "aggiungi ai dati attuali": entrano i modelli che
 * non ci sono gia' (per id), e il modello in uso resta quello attuale; solo per
 * i documenti che non ne avevano uno si prende quello del backup.
 */
export function unisciArchivi(
  attuale: ArchivioModelliStampa,
  entrante: ArchivioModelliStampa,
): ArchivioModelliStampa {
  const ids = new Set(attuale.modelli.map((m) => m.id));
  const nuovi = entrante.modelli.filter((m) => !ids.has(m.id));
  const modelli = [...attuale.modelli, ...nuovi];
  const inUso = { ...attuale.inUso };
  for (const documento of DOCUMENTI_STAMPA) {
    const id = entrante.inUso[documento];
    if (!inUso[documento] && id && (nuovi.some((m) => m.id === id) || prontoDi({ id, documento }))) {
      inUso[documento] = id;
    }
  }
  return { modelli, inUso };
}

/** Il modello in uso per il documento: uno del medico, uno pronto, o il predefinito. */
export function modelloInUso(
  archivio: ArchivioModelliStampa,
  documento: DocumentoStampa,
): ModelloStampa {
  const id = archivio.inUso[documento];
  if (!id) return modelloPredefinito(documento);
  return (
    modelloProntoDaId(id, documento) ??
    archivio.modelli.find((m) => m.id === id && m.documento === documento) ??
    modelloPredefinito(documento)
  );
}

/**
 * I modelli fra cui scegliere stampando: il predefinito, quello pronto in
 * uso con la sua altra versione, e quelli del medico. La versione in bianco
 * e nero di quello in uso serve il giorno che la stampante a colori e' senza
 * inchiostro; gli altri modelli pronti restano nell'editor: dieci voci in
 * piu' in ogni tendina sarebbero solo rumore.
 */
export function modelliDelDocumento(
  archivio: ArchivioModelliStampa,
  documento: DocumentoStampa,
): ModelloStampa[] {
  const predefinito = modelloPredefinito(documento);
  const p = prontoDi(modelloInUso(archivio, documento));
  // Solo da colori a bianco e nero: chi stampa in bianco e nero non ha
  // bisogno dei colori per una volta, e col predefinito in uso la tendina
  // non deve comparire.
  const pronti = p?.variante === "colore"
    ? [modelloPronto(p.stile, "colore", documento), modelloPronto(p.stile, "biancoNero", documento)]
      .filter((m) => m.id !== predefinito.id)
    : p && !ePredefinito(modelloPronto(p.stile, p.variante, documento))
      ? [modelloPronto(p.stile, p.variante, documento)]
      : [];
  return [
    predefinito,
    ...pronti,
    ...archivio.modelli.filter((m) => m.documento === documento),
  ];
}

/**
 * Il modello che torna in uso quando si elimina quello in uso: lo stile
 * pronto che usano tutti gli altri documenti, se e' uno solo, altrimenti il
 * predefinito. Chi ha scelto "Moderno" alla prima configurazione, ne ha fatto
 * una copia per il referto e poi la elimina, si aspetta di tornare a
 * "Moderno" come ricetta e certificato, non al bianco e nero di Corioli.
 */
export function ripiegoDopoEliminazione(
  archivio: ArchivioModelliStampa,
  documento: DocumentoStampa,
): ModelloStampa {
  const altri = DOCUMENTI_STAMPA.filter((d) => d !== documento).map((d) => prontoDi(modelloInUso(archivio, d)));
  const primo = altri[0];
  const tuttiUguali = primo !== undefined &&
    altri.every((p) => p?.stile.id === primo.stile.id && p.variante === primo.variante);
  return tuttiUguali ? modelloPronto(primo.stile, primo.variante, documento) : modelloPredefinito(documento);
}

export function nuovoIdModello(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** "Studio di Pisa" se e' libero, altrimenti "Studio di Pisa (2)", "(3)"... */
export function nomeUnivoco(nome: string, esistenti: string[]): string {
  const base = nome.trim().replace(/\s*\(\d+\)$/, "") || "Nuovo modello";
  const presi = new Set(esistenti.map((n) => n.trim().toLowerCase()));
  if (!presi.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base} (${n})`;
    if (!presi.has(candidato.toLowerCase())) return candidato;
  }
}

/** Copia modificabile di un modello, predefinito compreso. */
export function duplicaModello(
  modello: ModelloStampa,
  nomiEsistenti: string[],
  nome?: string,
): ModelloStampa {
  const ora = new Date().toISOString();
  const copia = structuredClone(modello);
  const base = nome ?? (eModelloPronto(modello) ? "Il mio modello" : modello.nome);
  return {
    ...copia,
    id: nuovoIdModello(),
    nome: nomeUnivoco(base, nomiEsistenti),
    creatoIl: ora,
    aggiornatoIl: ora,
  };
}

// ─── Normalizzazione ────────────────────────────────────────────────────────

/** Oltre questa misura un logo e' una foto, non un logo: si rifiuta. */
export const LOGO_MAX_CARATTERI = 1_500_000;
/**
 * La carta intestata e' un foglio intero: l'editor la riduce a 1240 pixel di
 * larghezza (150 dpi sull'A4) in JPEG, qualche centinaio di kB. Il limite
 * lascia margine a un PNG.
 */
export const SFONDO_MAX_CARATTERI = 4_000_000;

const LIMITI_TESTO = {
  nome: 60,
  titolo: 80,
  sottotitolo: 120,
  sezione: 80,
  righe: 400,
  piede: 300,
  testi: 60,
};

function eOggetto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function scelta<T extends string>(valore: unknown, ammessi: readonly T[], predefinito: T): T {
  return ammessi.includes(valore as T) ? (valore as T) : predefinito;
}

function booleano(valore: unknown, predefinito: boolean): boolean {
  return typeof valore === "boolean" ? valore : predefinito;
}

function testo(valore: unknown, predefinito: string, max: number): string {
  if (typeof valore !== "string") return predefinito;
  // I caratteri di controllo non hanno niente da fare in un'intestazione; gli
  // a capo si', nelle righe in piu' e nel piede.
  const pulito = Array.from(valore)
    .filter((c) => {
      const codice = c.charCodeAt(0);
      return c === "\n" || (codice >= 0x20 && codice !== 0x7f);
    })
    .join("");
  return pulito.slice(0, max);
}

function numero(valore: unknown, predefinito: number, min: number, max: number): number {
  const n = typeof valore === "number" ? valore : Number.NaN;
  if (!Number.isFinite(n)) return predefinito;
  return Math.round(Math.min(max, Math.max(min, n)));
}

/** Un colore "#rrggbb" scritto bene, in minuscolo; altrimenti `undefined`. */
export function coloreEsadecimale(valore: unknown): string | undefined {
  return typeof valore === "string" && /^#[0-9a-f]{6}$/i.test(valore.trim())
    ? valore.trim().toLowerCase()
    : undefined;
}

const TAVOLOZZA = ["nero", "blu", "verde", "bordeaux"] as const;

function immagineValida(valore: unknown, max = LOGO_MAX_CARATTERI): string | undefined {
  if (typeof valore !== "string") return undefined;
  if (valore.length > max) return undefined;
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(valore) ? valore : undefined;
}

/**
 * Le sezioni del referto in un ordine valido: quelle note nell'ordine dato,
 * senza doppioni, e quelle che mancano rimesse dopo la sezione che nell'ordine
 * di Corioli le precede. Serve ai file fatti con un'altra edizione o con una
 * versione che non aveva ancora una sezione: un modulo nuovo non deve sparire
 * dal referto perche' il modello non lo conosceva.
 */
function normalizzaSezioni(valore: unknown): ModelloStampa["sezioni"] {
  const note = new Set(SEZIONI_REFERTO.map((s) => s.id));
  const risultato: ModelloStampa["sezioni"] = [];
  const viste = new Set<SezioneReferto>();
  if (Array.isArray(valore)) {
    for (const voce of valore) {
      if (!eOggetto(voce)) continue;
      const id = voce.id as SezioneReferto;
      if (!note.has(id) || viste.has(id)) continue;
      viste.add(id);
      risultato.push({
        id,
        titolo: testo(voce.titolo, "", LIMITI_TESTO.sezione).trim(),
        visibile: booleano(voce.visibile, true),
      });
    }
  }
  SEZIONI_REFERTO.forEach((s, i) => {
    if (viste.has(s.id)) return;
    let dopo = -1;
    for (let j = i - 1; j >= 0 && dopo < 0; j--) {
      dopo = risultato.findIndex((r) => r.id === SEZIONI_REFERTO[j].id);
    }
    risultato.splice(dopo + 1, 0, { id: s.id, titolo: "", visibile: true });
    viste.add(s.id);
  });
  return risultato;
}

/**
 * Un modello completo e valido a partire da quello che c'e': dall'archivio, da
 * un file importato, da una versione precedente. Ogni campo mancante o fuori
 * dai valori ammessi prende quello del predefinito del documento. `null` se
 * non si capisce nemmeno di quale documento sia.
 */
export function normalizzaModello(grezzo: unknown): ModelloStampa | null {
  if (!eOggetto(grezzo)) return null;
  const documento = grezzo.documento as DocumentoStampa;
  if (!DOCUMENTI_STAMPA.includes(documento)) return null;
  const p = modelloPredefinito(documento);
  const pag = eOggetto(grezzo.pagina) ? grezzo.pagina : {};
  const int = eOggetto(grezzo.intestazione) ? grezzo.intestazione : {};
  const tit = eOggetto(grezzo.titolo) ? grezzo.titolo : {};
  const paz = eOggetto(grezzo.paziente) ? grezzo.paziente : {};
  const fir = eOggetto(grezzo.firma) ? grezzo.firma : {};
  const pie = eOggetto(grezzo.piede) ? grezzo.piede : {};
  const tst = eOggetto(grezzo.testi) ? grezzo.testi : {};
  const id = typeof grezzo.id === "string" && grezzo.id.trim() ? grezzo.id : nuovoIdModello();
  const logo = immagineValida(int.logo);
  const sfondo = immagineValida(int.sfondo, SFONDO_MAX_CARATTERI);
  const ambulatorioId =
    typeof int.ambulatorioId === "string" && int.ambulatorioId ? int.ambulatorioId : undefined;

  return {
    id,
    documento,
    nome: testo(grezzo.nome, "", LIMITI_TESTO.nome).trim() || "Modello senza nome",
    pagina: {
      carattere: scelta(pag.carattere, ["helvetica", "times", "lato"] as const, p.pagina.carattere),
      testo: scelta(pag.testo, ["piccolo", "normale", "grande"] as const, p.pagina.testo),
      margini: scelta(pag.margini, ["stretti", "normali", "larghi"] as const, p.pagina.margini),
      colore: coloreEsadecimale(pag.colore) ?? scelta(pag.colore, TAVOLOZZA, "nero"),
      accento: coloreEsadecimale(pag.accento) ?? "",
      stile: scelta(pag.stile, ["classico", "moderno"] as const, p.pagina.stile),
      evidenza: scelta(pag.evidenza, ["grassetto", "colore"] as const, p.pagina.evidenza),
      angoli: scelta(pag.angoli, ["vivi", "arrotondati"] as const, p.pagina.angoli),
      formato:
        documento === "referto"
          ? "A4"
          : scelta(pag.formato, ["A4", "A5"] as const, p.pagina.formato),
    },
    intestazione: {
      cartaIntestata: booleano(int.cartaIntestata, p.intestazione.cartaIntestata),
      spazioAlto: numero(int.spazioAlto, p.intestazione.spazioAlto, 15, 90),
      spazioBasso: numero(int.spazioBasso, p.intestazione.spazioBasso, 0, 50),
      ...(sfondo ? { sfondo } : {}),
      sfondoInStampa: booleano(int.sfondoInStampa, p.intestazione.sfondoInStampa),
      disposizione: scelta(int.disposizione, ["lati", "centro", "banda"] as const, p.intestazione.disposizione),
      ...(logo ? { logo } : {}),
      grandezzaLogo: scelta(int.grandezzaLogo, ["piccolo", "medio", "grande"] as const, p.intestazione.grandezzaLogo),
      specializzazione: booleano(int.specializzazione, p.intestazione.specializzazione),
      ...(ambulatorioId ? { ambulatorioId } : {}),
      ambulatorio: booleano(int.ambulatorio, p.intestazione.ambulatorio),
      telefono: booleano(int.telefono, p.intestazione.telefono),
      email: booleano(int.email, p.intestazione.email),
      partitaIva: booleano(int.partitaIva, p.intestazione.partitaIva),
      righeAggiuntive: testo(int.righeAggiuntive, "", LIMITI_TESTO.righe),
    },
    titolo: {
      testo: testo(tit.testo, p.titolo.testo, LIMITI_TESTO.titolo).trim() || p.titolo.testo,
      sottotitolo: testo(tit.sottotitolo, p.titolo.sottotitolo, LIMITI_TESTO.sottotitolo).trim(),
      stile: scelta(tit.stile, ["fascia", "sottolineato", "testo", "sfumato", "sinistra"] as const, p.titolo.stile),
    },
    paziente: {
      riquadro: booleano(paz.riquadro, p.paziente.riquadro),
      dataNascita: booleano(paz.dataNascita, p.paziente.dataNascita),
      luogoNascita: booleano(paz.luogoNascita, p.paziente.luogoNascita),
      sesso: booleano(paz.sesso, p.paziente.sesso),
      codiceFiscale: booleano(paz.codiceFiscale, p.paziente.codiceFiscale),
      residenza: booleano(paz.residenza, p.paziente.residenza),
      data: booleano(paz.data, p.paziente.data),
    },
    testi: {
      principale: testo(tst.principale, p.testi.principale, LIMITI_TESTO.testi).trim(),
      secondario: testo(tst.secondario, p.testi.secondario, LIMITI_TESTO.testi).trim(),
    },
    sezioni: documento === "referto" ? normalizzaSezioni(grezzo.sezioni) : [],
    stileSezioni: scelta(
      grezzo.stileSezioni,
      ["fascia", "sottolineato", "barra", "centrate", "punto", "piena"] as const,
      p.stileSezioni,
    ),
    conclusioniInEvidenza: booleano(grezzo.conclusioniInEvidenza, p.conclusioniInEvidenza),
    inquadramentoInRiquadri: booleano(grezzo.inquadramentoInRiquadri, p.inquadramentoInRiquadri),
    firma: {
      immagine: booleano(fir.immagine, p.firma.immagine),
      luogoData: booleano(fir.luogoData, p.firma.luogoData),
      posizione: scelta(fir.posizione, ["sinistra", "centro", "destra"] as const, p.firma.posizione),
      grandezza: scelta(fir.grandezza, ["piccola", "normale", "grande"] as const, p.firma.grandezza),
      rigaAPenna: booleano(fir.rigaAPenna, p.firma.rigaAPenna),
    },
    piede: {
      numeroPagina: booleano(pie.numeroPagina, p.piede.numeroPagina),
      pazienteSullePagine: booleano(pie.pazienteSullePagine, p.piede.pazienteSullePagine),
      testo: testo(pie.testo, "", LIMITI_TESTO.piede),
    },
    creatoIl: typeof grezzo.creatoIl === "string" ? grezzo.creatoIl : "",
    aggiornatoIl: typeof grezzo.aggiornatoIl === "string" ? grezzo.aggiornatoIl : "",
  };
}

/** L'archivio dei modelli com'e' salvato, ripulito: mai un errore in lettura. */
export function normalizzaArchivio(grezzo: unknown): ArchivioModelliStampa {
  if (!eOggetto(grezzo)) return { modelli: [], inUso: {} };
  const modelli: ModelloStampa[] = [];
  const ids = new Set<string>();
  for (const voce of Array.isArray(grezzo.modelli) ? grezzo.modelli : []) {
    const m = normalizzaModello(voce);
    // Un modello che si spaccia per uno di Corioli non entra: quelli non si
    // salvano, e due modelli con lo stesso id si confonderebbero.
    if (!m || eModelloPronto(m)) continue;
    if (ids.has(m.id)) m.id = nuovoIdModello();
    ids.add(m.id);
    modelli.push(m);
  }
  const inUso: ArchivioModelliStampa["inUso"] = {};
  const usoGrezzo = eOggetto(grezzo.inUso) ? grezzo.inUso : {};
  for (const documento of DOCUMENTI_STAMPA) {
    const id = usoGrezzo[documento];
    if (typeof id !== "string") continue;
    // Il predefinito in uso non si scrive: e' quello che si usa senza scelta.
    if (id === idPredefinito(documento)) continue;
    if (prontoDi({ id, documento }) || modelli.some((m) => m.id === id && m.documento === documento)) {
      inUso[documento] = id;
    }
  }
  return { modelli, inUso };
}

// ─── File di esportazione ───────────────────────────────────────────────────

export const FORMATO_FILE_MODELLI = "corioli-modelli-di-stampa";
export const VERSIONE_FILE_MODELLI = 1;

/**
 * Il contenuto del file di esportazione: i modelli senza id ne' date, che
 * all'importazione si rifanno. L'ambulatorio scelto non viaggia: e' un id
 * dell'archivio di chi esporta e da un altro medico non vorrebbe dire niente.
 */
export function fileModelli(modelli: ModelloStampa[], versioneApp?: string): string {
  return JSON.stringify(
    {
      formato: FORMATO_FILE_MODELLI,
      versione: VERSIONE_FILE_MODELLI,
      ...(versioneApp ? { app: versioneApp } : {}),
      esportatoIl: new Date().toISOString(),
      modelli: modelli.map((m) => {
        const { id: _id, creatoIl: _c, aggiornatoIl: _a, ...resto } = structuredClone(m);
        const { ambulatorioId: _amb, ...intestazione } = resto.intestazione;
        return { ...resto, intestazione };
      }),
    },
    null,
    2,
  );
}

export function nomeFileModelli(modelli: ModelloStampa[]): string {
  const base = modelli.length === 1
    ? modelli[0].nome
    : "modelli-di-stampa";
  const pulito = base
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 50) || "modello";
  return `${pulito}.corioli-modelli.json`;
}

export type LetturaFileModelli =
  | { ok: true; modelli: ModelloStampa[]; scartati: number }
  | { ok: false; errore: string };

/**
 * Legge un file di modelli. Accetta anche un modello solo, senza l'involucro:
 * e' quello che resta a chi apre il file e ne copia un pezzo.
 */
export function leggiFileModelli(contenuto: string): LetturaFileModelli {
  let dati: unknown;
  try {
    dati = JSON.parse(contenuto);
  } catch {
    return { ok: false, errore: "Il file non si legge: non è un file di modelli di Corioli." };
  }
  let voci: unknown[];
  if (eOggetto(dati) && dati.formato === FORMATO_FILE_MODELLI) {
    if (typeof dati.versione === "number" && dati.versione > VERSIONE_FILE_MODELLI) {
      return {
        ok: false,
        errore: "Il file è stato fatto con una versione più recente di Corioli: aggiorna l'app e riprova.",
      };
    }
    voci = Array.isArray(dati.modelli) ? dati.modelli : [];
  } else if (eOggetto(dati) && typeof dati.documento === "string") {
    voci = [dati];
  } else {
    return { ok: false, errore: "Questo non è un file di modelli di stampa di Corioli." };
  }
  const ora = new Date().toISOString();
  const modelli: ModelloStampa[] = [];
  let scartati = 0;
  for (const voce of voci) {
    const m = normalizzaModello(eOggetto(voce) ? { ...voce, id: undefined } : voce);
    if (!m) {
      scartati++;
      continue;
    }
    delete m.intestazione.ambulatorioId;
    modelli.push({ ...m, id: nuovoIdModello(), creatoIl: ora, aggiornatoIl: ora });
  }
  if (modelli.length === 0) {
    return { ok: false, errore: "Nel file non c'è nessun modello che Corioli sappia usare." };
  }
  return { ok: true, modelli, scartati };
}
