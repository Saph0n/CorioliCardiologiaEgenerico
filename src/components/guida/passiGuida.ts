/**
 * I passi della prova guidata: la guida non spiega che cosa fa un pulsante,
 * lo fa premere e aspetta di vedere il risultato.
 *
 * Il percorso e' quello di tutti i giorni con un paziente nuovo: il codice
 * fiscale nella ricerca "Nuova visita" (la apre la guida), Invio, "Salva e
 * inizia visita". Poi, nella visita, un modello e il grassetto sull'esame
 * obiettivo, la stampa del referto; infine i modelli in Impostazioni.
 *
 * Ogni passo legge la pagina da un `ContestoPasso` e non dal DOM: cosi' le
 * condizioni si provano nei test senza un browser.
 */

/** Selettore di un elemento marcato per la guida. */
export const g = (nome: string) => `[data-guida="${nome}"]`;

/**
 * Codice fiscale di un paziente inventato (Mario Rossi, Roma, 1 gennaio
 * 1980): e' l'esempio di scuola, valido anche nel carattere di controllo, e
 * fa vedere l'app ricavare data e luogo di nascita e sesso.
 */
export const CF_PROVA = "RSSMRA80A01H501U";
export const COGNOME_PROVA = "Prova";

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

/** `mod` e' il tasto Ctrl, o Cmd sul Mac. */
export function passiGuida(mod: string): PassoGuida[] {
  return [
    // ── Il primo paziente ──────────────────────────────────────────────
    {
      id: "scrivi-cf",
      capitolo: "Il primo paziente",
      tipo: "prova",
      // La testata del pannello e quello che le sta sotto: il suggerimento
      // "Premi Invio per registrare" non deve finire sotto il fumetto.
      bersagli: [g("pannello-paziente"), `${g("pannello-paziente")} ~ *`],
      titolo: "Cercalo per codice fiscale",
      testo:
        "Qui trovi i pazienti per cognome o codice fiscale. Questo è nuovo: scrivi il suo codice fiscale e premi Invio. Per la prova usa quello di un paziente inventato.",
      scrivi: { selettore: `${g("pannello-paziente")} input`, testo: CF_PROVA },
      fatto: (c) => c.percorso === "/add-patient",
      apriRicerca: (c) => c.percorso === "/" && !c.esiste(g("pannello-paziente")),
    },
    // Due passi e non uno: codice fiscale e anagrafica insieme sono alti
    // quasi tutta la finestra a 1280x720, e il fumetto finiva sopra i campi
    // che doveva far vedere.
    {
      id: "dati-da-cf",
      capitolo: "Il primo paziente",
      tipo: "guarda",
      bersagli: [g("dati-da-cf")],
      titolo: "Il codice fiscale fa metà del lavoro",
      testo:
        "Data e luogo di nascita e sesso li ha ricavati l'app dal codice fiscale: sono i campi in verde. Dai sempre un'occhiata, poi vai avanti.",
      perso: (c) => (c.percorso === "/" ? "scrivi-cf" : null),
    },
    {
      id: "cognome",
      capitolo: "Il primo paziente",
      tipo: "prova",
      bersagli: [g("campo-cognome")],
      titolo: "Aggiungi il cognome",
      testo: "È così che il paziente si cerca e si stampa. Per la prova, scrivi Prova.",
      scrivi: { selettore: 'input[name="lastName"]', testo: COGNOME_PROVA },
      pronto: (c) => c.valore('input[name="lastName"]').trim().length > 0,
      perso: (c) => (c.percorso === "/" ? "scrivi-cf" : null),
    },
    {
      id: "salva-paziente",
      capitolo: "Il primo paziente",
      tipo: "prova",
      bersagli: [g("salva-e-visita")],
      punta: [g("salva-e-visita")],
      titolo: "Salva e comincia",
      testo:
        "Il resto dell'anagrafica lo completi quando vuoi. Premi «Salva e inizia visita»: il paziente è in archivio e si apre il referto.",
      fatto: (c) => pazienteDellaVisita(c) !== null,
      perso: (c) => (c.percorso === "/" ? "scrivi-cf" : null),
    },

    // ── La visita ──────────────────────────────────────────────────────
    {
      id: "visita",
      capitolo: "La visita",
      tipo: "guarda",
      bersagli: [g("barra-visita")],
      titolo: "Il referto",
      testo:
        "In alto chi stai visitando, la data e le azioni. Sotto, il referto a sezioni: si scrive dall'alto in basso, e Tab passa al campo dopo.",
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
      bersagli: [g("stampa-visita")],
      punta: [g("stampa-visita")],
      titolo: "Stampa il referto",
      testo: `Premi «Stampa» o ${mod}+P: la visita si salva e il referto si apre in PDF, con il tuo studio in testa e il grassetto dove l'hai messo.`,
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
        "A sinistra la visita di oggi: la riapri, la ristampi, la ricopi nella prossima. Qui accanto ricette, richieste di esame e certificati, ognuno con i suoi modelli.",
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
