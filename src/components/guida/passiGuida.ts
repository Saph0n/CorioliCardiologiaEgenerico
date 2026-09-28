/**
 * I passi della prova guidata: la guida non spiega che cosa fa un pulsante,
 * lo fa premere e aspetta di vedere il risultato.
 *
 * La prova si fa su un archivio di prova (`archivioDiProva.ts`), perche' le
 * cose che contano di piu' si vedono solo con qualche mese di visite alle
 * spalle: i pazienti a rischio, il valore della visita precedente accanto ai
 * campi, l'andamento degli esami. Il percorso e' quello di un controllo: il
 * paziente arriva, Ctrl+N, il cognome nella ricerca, la visita con gli esami
 * nuovi; un modello e il grassetto sull'esame obiettivo, la stampa; infine i
 * modelli in Impostazioni.
 *
 * Ogni passo legge la pagina da un `ContestoPasso` e non dal DOM: cosi' le
 * condizioni si provano nei test senza un browser.
 */

import { PAZIENTE_DELLA_PROVA } from "./archivioDiProva";

/** Selettore di un elemento marcato per la guida. */
export const g = (nome: string) => `[data-guida="${nome}"]`;

/** Evento che `AddVisit` lancia quando il referto e' stato aperto in PDF. */
export const EVENTO_REFERTO_APERTO = "corioli-referto-aperto";

/** Il campo di testo modificabile dell'esame obiettivo. */
const CAMPO_ESAME_OBIETTIVO = `${g("campo-esame-obiettivo")} [contenteditable="true"]`;

/** La finestra degli esami del sangue, aperta. */
export const FINESTRA_ESAMI = "[data-trascrizione-finestra]";

/**
 * I valori precedenti che aprono il grafico: ci sono solo dove il paziente ha
 * almeno due prelievi. Il primo e' il colesterolo totale.
 */
export const BOTTONE_ANDAMENTO = `${FINESTRA_ESAMI} button[aria-label^="Andamento di"]`;

/** La riga del paziente della prova fra i risultati della ricerca. */
export const RISULTATO_PAZIENTE_DELLA_PROVA = `button[data-paziente="${PAZIENTE_DELLA_PROVA.id}"]`;

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
}

/** L'id del paziente della visita aperta, dalla rotta `/add-visit?patientId=`. */
export function pazienteDellaVisita(c: Pick<ContestoPasso, "percorso" | "ricerca">): string | null {
  if (!c.percorso.startsWith("/add-visit")) return null;
  return new URLSearchParams(c.ricerca).get("patientId");
}

/** `mod` e' il tasto Ctrl, o Cmd sul Mac. */
export function passiGuida(mod: string): PassoGuida[] {
  const { cognome } = PAZIENTE_DELLA_PROVA;
  return [
    // ── L'archivio di prova ────────────────────────────────────────────
    {
      id: "rischio",
      capitolo: "L'archivio di prova",
      tipo: "guarda",
      bersagli: [g("colonna-rischio")],
      titolo: "Pazienti a rischio",
      testo:
        "Per la prova l'archivio si è riempito di pazienti inventati, che spariscono quando esci dalla guida. Qui trovi quelli di classe alta o molto alta e chi è sopra l'obiettivo di LDL: il numero dice di quanto.",
    },

    // ── Il paziente ────────────────────────────────────────────────────
    {
      id: "apri-visita",
      capitolo: "Il paziente",
      tipo: "prova",
      bersagli: [g("nuova-visita")],
      punta: [g("nuova-visita")],
      titolo: "Arriva un paziente",
      testo: `È il signor ${cognome}, per il controllo. Si comincia sempre da qui: premi ${mod}+N, oppure il pulsante «Nuova visita».`,
      tasti: [mod, "N"],
      consentiti: ["n"],
      fatto: (c) => c.esiste(g("pannello-paziente")),
    },
    {
      id: "cerca",
      capitolo: "Il paziente",
      tipo: "prova",
      // La testata del pannello e quello che le sta sotto: i risultati non
      // devono finire sotto il fumetto.
      bersagli: [g("pannello-paziente"), `${g("pannello-paziente")} ~ *`],
      titolo: "Cercalo per cognome",
      testo: `Scrivi ${cognome}, o anche solo le prime lettere, poi fai clic sul suo nome: si apre la sua visita.`,
      scrivi: { selettore: `${g("pannello-paziente")} input`, testo: cognome },
      // La manina compare sul paziente appena la ricerca lo trova.
      punta: [RISULTATO_PAZIENTE_DELLA_PROVA],
      fatto: (c) => pazienteDellaVisita(c) !== null,
      perso: (c) => (c.percorso === "/" && !c.esiste(g("pannello-paziente")) ? "apri-visita" : null),
    },
    {
      id: "visita",
      capitolo: "Il paziente",
      tipo: "guarda",
      bersagli: [g("barra-visita")],
      titolo: "La visita di controllo",
      testo:
        "In alto chi stai visitando, la data e le azioni. Terapia in atto e fattori di rischio arrivano già dall'ultima visita: li rileggi e correggi quello che è cambiato.",
    },

    // ── Gli esami ──────────────────────────────────────────────────────
    {
      id: "esami",
      capitolo: "Gli esami",
      tipo: "prova",
      bersagli: [g("card-laboratorio")],
      punta: [g("apri-esami")],
      titolo: "Gli esami del sangue",
      testo: "Il paziente ha portato gli esami nuovi. Premi «Inserisci esami».",
      fatto: (c) => c.esiste(FINESTRA_ESAMI),
    },
    {
      id: "andamento",
      capitolo: "Gli esami",
      tipo: "prova",
      bersagli: [g("esami-burden"), g("grafico-andamento")],
      punta: [BOTTONE_ANDAMENTO],
      titolo: "Com'era, com'è andato",
      testo:
        "In «Prec.» c'è il valore dell'ultimo prelievo. Premi quello del colesterolo totale: vedi tutti i prelievi in archivio.",
      fatto: (c) => c.esiste(g("grafico-andamento")),
      // Un paziente con un prelievo solo non ha grafici: si va avanti lo stesso.
      pronto: (c) => !c.esiste(BOTTONE_ANDAMENTO),
      perso: (c) => (pazienteDellaVisita(c) && !c.esiste(FINESTRA_ESAMI) ? "esami" : null),
    },
    {
      id: "leggi-andamento",
      capitolo: "Gli esami",
      tipo: "guarda",
      bersagli: [g("grafico-andamento")],
      titolo: "L'andamento",
      testo:
        "Un punto per prelievo, dal primo all'ultimo: scritto il valore di oggi, si aggiunge alla linea. C'è per ogni esame che il paziente ha fatto almeno due volte.",
    },
    {
      id: "chiudi-esami",
      capitolo: "Gli esami",
      tipo: "prova",
      bersagli: [g("fine-esami")],
      punta: [g("fine-esami")],
      titolo: "Chiudi la finestra",
      testo: "Per la prova non serve scrivere i valori: premi «Fatto».",
      fatto: (c) => !c.esiste(FINESTRA_ESAMI),
    },

    // ── Il referto ─────────────────────────────────────────────────────
    {
      id: "modello",
      capitolo: "Il referto",
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
      capitolo: "Il referto",
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
      capitolo: "Il referto",
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
      capitolo: "Il referto",
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
      capitolo: "Il referto",
      tipo: "guarda",
      bersagli: [g("scheda-documenti")],
      titolo: "La scheda del paziente",
      testo:
        "A sinistra le sue visite, quella di oggi in cima: le riapri, le ristampi, le ricopi nella prossima. Qui accanto ricette, richieste di esame e certificati, ognuno con i suoi modelli.",
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
