/**
 * I passi della prova guidata: la guida non spiega che cosa fa un pulsante,
 * lo fa premere e aspetta di vedere il risultato.
 *
 * La prova si fa sui pazienti di prova (`utils/pazientiProva.ts`), che la
 * guida mette in archivio all'inizio e toglie alla fine. Il percorso e' quello
 * di un controllo: Mario Rossi cercato per codice fiscale nella ricerca
 * "Nuova visita" (la apre la guida), Invio, e si apre la sua visita; i suoi
 * esami con l'andamento dell'LDL, un modello e il grassetto sull'esame
 * obiettivo, la stampa del referto, la sua scheda. Poi i pazienti a rischio in
 * dashboard, infine i modelli in Impostazioni.
 *
 * Ogni passo legge la pagina da un `ContestoPasso` e non dal DOM: cosi' le
 * condizioni si provano nei test senza un browser.
 */

import { CF_PAZIENTE_DA_CERCARE } from "../../utils/pazientiProva";

/** Selettore di un elemento marcato per la guida. */
export const g = (nome: string) => `[data-guida="${nome}"]`;

/** Evento che `AddVisit` lancia quando il referto e' stato aperto in PDF. */
export const EVENTO_REFERTO_APERTO = "corioli-referto-aperto";

/**
 * Evento con cui la guida apre la ricerca "Nuova visita": la guida sta fuori
 * dal provider della ricerca (lo avvolge), e ne ascolta gli eventi come fa con
 * il resto della pagina.
 */
export const EVENTO_APRI_NUOVA_VISITA = "corioli-apri-nuova-visita";

/** Il campo di testo modificabile dell'esame obiettivo. */
const CAMPO_ESAME_OBIETTIVO = `${g("campo-esame-obiettivo")} [contenteditable="true"]`;

/** La riga dell'LDL nella finestra degli esami: etichetta e colonna "Prec.". */
const RIGA_LDL = g("esame-lab.ldl");

export interface ContestoPasso {
  /** `pathname` della rotta attuale. */
  percorso: string;
  /** `search` della rotta attuale, con il `?`. */
  ricerca: string;
  esiste(selettore: string): boolean;
  /** Testo visibile del primo elemento che corrisponde. */
  testo(selettore: string): string;
  /** Valore del primo campo che corrisponde. */
  valore(selettore: string): string;
  /** Eventi della pagina arrivati da quando il passo e' cominciato. */
  eventi: ReadonlySet<string>;
}

/**
 * - `guarda`: si legge e si va avanti con il pulsante; la pagina sotto non
 *   risponde ai clic.
 * - `prova`: l'elemento illuminato si usa davvero, e il passo va avanti da
 *   solo quando `fatto` lo vede fatto (o con Avanti, se c'e' `pronto`).
 * - `attesa`: si lavora in una finestra dell'app (l'editor dei modelli); la
 *   guida si riduce a un promemoria in basso finche' `fatto` non torna vero.
 */
export type TipoPasso = "guarda" | "prova" | "attesa";

export interface PassoGuida {
  id: string;
  capitolo: string;
  tipo: TipoPasso;
  /** Selettori degli elementi da illuminare, presi tutti insieme. */
  bersagli: string[];
  titolo: string;
  testo: string;
  /** Scorciatoia da mostrare, tasto per tasto. */
  tasti?: string[];
  /**
   * Scorciatoie dell'app che in questo passo devono funzionare (le altre la
   * guida le ferma): la lettera, minuscola.
   */
  consentiti?: string[];
  /** "Scrivilo per me": riempie il campo con un valore di prova. */
  scrivi?: { selettore: string; testo: string };
  /**
   * Dove la manina mostra che cosa premere: il primo selettore che trova un
   * elemento (il menu, se e' aperto, prima del pulsante che lo apre).
   */
  punta?: string[];
  /** Dimostrazione animata nel fumetto. */
  demo?: "grassetto";
  /** Con `pronto`, il passo prova si chiude con Avanti quando e' vero. */
  pronto?(c: ContestoPasso): boolean;
  /** Il passo e' fatto: si va avanti da soli. */
  fatto?(c: ContestoPasso): boolean;
  /** Il contesto del passo e' sparito: id del passo da cui ripartire. */
  perso?(c: ContestoPasso): string | null;
  /**
   * Il passo si fa nella ricerca "Nuova visita" e la ricerca non c'e': la
   * guida la apre da sola, all'inizio del passo e se la si chiude con Esc.
   */
  apriRicerca?(c: ContestoPasso): boolean;
}

/** L'id del paziente della visita aperta, dalla rotta `/add-visit?patientId=`. */
export function pazienteDellaVisita(c: Pick<ContestoPasso, "percorso" | "ricerca">): string | null {
  if (!c.percorso.startsWith("/add-visit")) return null;
  return new URLSearchParams(c.ricerca).get("patientId");
}

/**
 * `mod` e' il tasto Ctrl, o Cmd sul Mac. `cf` e' il codice fiscale con cui
 * Mario Rossi e' finito in archivio: un altro, se il suo era gia' di un
 * paziente vero (vedi `services/pazientiProva`).
 */
export function passiGuida(mod: string, cf: string = CF_PAZIENTE_DA_CERCARE): PassoGuida[] {
  return [
    // ── Il paziente ────────────────────────────────────────────────────
    {
      id: "scrivi-cf",
      capitolo: "Il paziente",
      tipo: "prova",
      // La testata del pannello e quello che le sta sotto: il paziente
      // trovato non deve finire sotto il fumetto.
      bersagli: [g("pannello-paziente"), `${g("pannello-paziente")} ~ *`],
      titolo: "Cercalo per codice fiscale",
      testo:
        "Qui trovi i pazienti per cognome o codice fiscale. Mario Rossi è già in archivio, con tre controlli alle spalle: scrivi il suo codice fiscale e premi Invio. Si apre la sua visita di oggi.",
      scrivi: { selettore: `${g("pannello-paziente")} input`, testo: cf },
      fatto: (c) => pazienteDellaVisita(c) !== null,
      // Anche fuori dalla dashboard: con «Nuovo paziente» si finisce nella
      // scheda di registrazione, e la ricerca deve tornare.
      apriRicerca: (c) => pazienteDellaVisita(c) === null && !c.esiste(g("pannello-paziente")),
    },
    {
      id: "esami",
      capitolo: "Il paziente",
      tipo: "prova",
      bersagli: [g("card-laboratorio")],
      punta: [g("apri-esami")],
      titolo: "I suoi esami",
      testo:
        "Mario ha già tre prelievi in archivio. Premi «Inserisci esami»: è la finestra in cui scrivi quelli di oggi, accanto a quelli di prima.",
      fatto: (c) => c.esiste(g("finestra-esami")),
    },
    {
      id: "andamento",
      capitolo: "Il paziente",
      tipo: "prova",
      // La riga dell'LDL e, appena si apre, il grafico accanto.
      bersagli: [RIGA_LDL, g("pannello-andamento")],
      punta: [`button${RIGA_LDL}`],
      titolo: "Com'è andato il colesterolo",
      testo:
        "In «Prec.» c'è il valore dell'ultimo prelievo, in «Oggi» scrivi quello nuovo. Tocca il valore precedente dell'LDL: si apre l'andamento di tutti i prelievi.",
      fatto: (c) => c.esiste(g("pannello-andamento")),
      perso: (c) => (c.esiste(g("finestra-esami")) ? null : "esami"),
    },
    {
      id: "chiudi-esami",
      capitolo: "Il paziente",
      tipo: "prova",
      bersagli: [g("pannello-andamento"), g("chiudi-esami")],
      punta: [g("chiudi-esami")],
      titolo: "Ogni punto è un prelievo",
      testo:
        "Con la statina l'LDL di Mario è sceso, ma è ancora sopra l'obiettivo della sua classe di rischio. Lo stesso grafico c'è accanto a ogni esame ripetuto. Ora chiudi con «Fatto».",
      fatto: (c) => !c.esiste(g("finestra-esami")),
    },

    // ── La visita ──────────────────────────────────────────────────────
    {
      id: "visita",
      capitolo: "La visita",
      tipo: "guarda",
      bersagli: [g("barra-visita")],
      titolo: "Il referto",
      testo:
        "In alto chi stai visitando, la data e le azioni. Sotto, il referto a sezioni: la terapia in atto arriva già dall'ultima visita, si scrive dall'alto in basso e Tab passa al campo dopo.",
    },
    {
      id: "modello",
      capitolo: "La visita",
      tipo: "prova",
      bersagli: [g("campo-esame-obiettivo"), '[role="menu"]'],
      punta: ['[role="menu"] [role="menuitem"]', `${g("campo-esame-obiettivo")} button`],
      titolo: "Un modello, un clic",
      testo:
        "I modelli sono testi pronti. Premi «Modello» accanto a Esame obiettivo e scegli «Esame obiettivo cardiovascolare nella norma».",
      fatto: (c) => c.testo(CAMPO_ESAME_OBIETTIVO).trim().length > 0,
    },
    {
      id: "grassetto",
      capitolo: "La visita",
      tipo: "prova",
      bersagli: [g("campo-esame-obiettivo")],
      demo: "grassetto",
      titolo: "Metti in risalto",
      testo: `Il testo è tuo: correggilo come vuoi. Ora seleziona qualche parola e premi ${mod}+B. Nel referto stampato esce in grassetto.`,
      tasti: [mod, "B"],
      fatto: (c) =>
        c.esiste(`${CAMPO_ESAME_OBIETTIVO} b`) || c.esiste(`${CAMPO_ESAME_OBIETTIVO} strong`),
    },
    {
      id: "stampa",
      capitolo: "La visita",
      tipo: "prova",
      // Con il controllo prima di stampare aperto, anche lui: la terapia e i
      // fattori di rischio ripresi dall'ultima visita di Mario lo fanno
      // comparire, e senza la guida si fermava come davanti a una finestra
      // estranea.
      bersagli: [g("stampa-visita"), g("controllo-stampa"), `${g("controllo-stampa")} ~ *`],
      punta: [g("stampa-comunque"), g("stampa-visita")],
      titolo: "Stampa il referto",
      testo: `Premi «Stampa» o ${mod}+P: la visita si salva e il referto si apre in PDF, con il tuo studio in testa e il grassetto dove l'hai messo. Se hai ripreso qualcosa dall'ultima visita senza rileggerlo, prima te lo ricorda: per la prova, «Stampa comunque».`,
      tasti: [mod, "P"],
      consentiti: ["p"],
      fatto: (c) => c.eventi.has(EVENTO_REFERTO_APERTO),
    },
    {
      id: "salva-visita",
      capitolo: "La visita",
      tipo: "prova",
      bersagli: [g("salva-visita")],
      punta: [g("salva-visita")],
      titolo: "Chiudi la visita",
      testo: `Guardato il referto, torna qui e premi «Salva visita». Mentre scrivi, ${mod}+S salva senza uscire.`,
      consentiti: ["s"],
      fatto: (c) => c.percorso.startsWith("/patient-history/"),
    },
    {
      id: "scheda",
      capitolo: "La visita",
      tipo: "guarda",
      bersagli: [g("scheda-documenti")],
      titolo: "La scheda del paziente",
      testo:
        "A sinistra le visite di Mario, con quella di oggi: le riapri, le ristampi, le ricopi nella prossima. Qui accanto ricette, richieste di esame e certificati, ognuno con i suoi modelli.",
    },

    // ── I pazienti a rischio ───────────────────────────────────────────
    {
      id: "vai-dashboard",
      capitolo: "I pazienti a rischio",
      tipo: "prova",
      bersagli: [g("dashboard")],
      punta: [g("dashboard")],
      titolo: "Chi tenere d'occhio",
      testo:
        "Mario è di classe di rischio alta e ha l'LDL sopra l'obiettivo: la dashboard lo tiene in evidenza, insieme agli altri come lui. Apri la Dashboard.",
      fatto: (c) => c.percorso === "/",
    },
    {
      id: "rischio",
      capitolo: "I pazienti a rischio",
      tipo: "guarda",
      bersagli: [g("pazienti-a-rischio")],
      titolo: "I pazienti a rischio",
      testo:
        "Qui ci sono i pazienti di classe alta o molto alta, e chi ha l'LDL sopra l'obiettivo della sua classe: prima i più gravi. Il numero è di quanto l'LDL supera l'obiettivo. La classe la scegli tu nella visita.",
    },

    // ── I modelli ──────────────────────────────────────────────────────
    {
      id: "vai-modelli",
      capitolo: "I modelli",
      tipo: "prova",
      bersagli: [g("impostazioni")],
      punta: [g("impostazioni")],
      titolo: "I tuoi modelli",
      testo:
        "Il modello di prima è uno di quelli che trovi già pronti: li cambi e ne aggiungi di tuoi. Apri Impostazioni.",
      fatto: (c) => c.percorso === "/settings",
    },
    {
      id: "modelli",
      capitolo: "I modelli",
      tipo: "guarda",
      bersagli: [g("modelli-categorie")],
      titolo: "Cinque tipi di modello",
      testo:
        "Visita: i testi dei campi del referto, come quello che hai usato. Terapie: le frasi per le conclusioni. Ricette, Esami e Certificati: i documenti che fai dalla scheda del paziente.",
    },
    {
      id: "nuovo-modello",
      capitolo: "I modelli",
      tipo: "prova",
      bersagli: [g("nuovo-modello")],
      punta: [g("nuovo-modello")],
      titolo: "Preparane uno",
      testo:
        "Premi «Nuovo modello». Scegli il tipo e la sezione, dai un nome e scrivi il testo: l'anteprima accanto mostra dove comparirà.",
      fatto: (c) => c.esiste(g("editor-modello")),
    },
    {
      id: "editor-modello",
      capitolo: "I modelli",
      tipo: "attesa",
      bersagli: [g("editor-modello")],
      titolo: "Crea il modello o chiudi con Annulla",
      testo: "Poi finiamo.",
      fatto: (c) => !c.esiste(g("editor-modello")),
    },
  ];
}
