import { describe, expect, it, vi } from "vitest";
import type { Patient, Visit } from "../../types/Storage";
import { pazienteDiProva, visitaDiProva } from "./refertoDiProva";

/**
 * Il referto non sborda.
 *
 * Gli altri test sul referto controllano *cosa* c'e' scritto; questo controlla
 * *dove* finisce. Sono due classi di difetti diverse, e la seconda non si vede
 * leggendo il testo estratto dal PDF: una colonna che scrive sotto il piede o
 * una riga che esce dal margine destro producono un documento che contiene
 * tutte le parole giuste e si stampa sbagliato.
 *
 * Si intercetta `doc.text` invece di rileggere il PDF: al momento della
 * chiamata il font e' quello vero, quindi la larghezza della stringa si misura
 * con lo stesso metro che usa jsPDF per mandarla a capo.
 *
 * L'intercettazione avvolge il costruttore e non il prototipo: jsPDF assegna i
 * suoi metodi a ogni istanza, e sul prototipo non c'e' niente da sostituire.
 */

interface OpzioniTesto { align?: string; charSpace?: number }
interface DocDisegnabile {
  text(testo: unknown, x: number, y: number, opzioni?: OpzioniTesto): unknown;
  getTextWidth(testo: string): number;
}

interface Scritta {
  testo: string;
  y: number;
  sinistra: number;
  destra: number;
}

const { scritte } = vi.hoisted(() => ({ scritte: [] as Scritta[] }));

vi.mock("jspdf", async () => {
  const reale = await vi.importActual<{
    default: new (...args: unknown[]) => object;
  }>("jspdf");

  class Spia extends reale.default {
    constructor(...args: unknown[]) {
      super(...args);
      const doc = this as unknown as DocDisegnabile;
      const originale = doc.text.bind(doc);
      doc.text = (testo, x, y, opzioni) => {
        const stringa = Array.isArray(testo) ? testo.join(" ") : String(testo);
        let larghezza = doc.getTextWidth(stringa);
        // La spaziatura fra le lettere allarga la stringa e `getTextWidth` non
        // la conosce: e' il caso dei titoli di sezione.
        const charSpace = opzioni?.charSpace ?? 0;
        if (charSpace) larghezza += charSpace * Math.max(stringa.length - 1, 0);

        const sinistra = opzioni?.align === "right"
          ? x - larghezza
          : opzioni?.align === "center"
            ? x - larghezza / 2
            : x;
        scritte.push({ testo: stringa, y, sinistra, destra: sinistra + larghezza });
        return originale(testo, x, y, opzioni);
      };
    }
  }

  return { ...reale, default: Spia, jsPDF: Spia };
});

vi.mock("../OfflineServices", () => ({
  DoctorService: {
    getDoctor: async () => ({
      nome: "Vincenzo",
      cognome: "Trani",
      specializzazione: "Cardiologia",
      telefono: "035 123456",
      email: "studio.cardiologico.bergamo@example.it",
      ambulatori: [{
        isPrimario: true,
        nome: "Studio Cardiologico",
        indirizzo: "Via Garibaldi 14",
        cap: "24122",
        citta: "Bergamo",
      }],
    }),
  },
  PreferenceService: { getPreferences: async () => ({}) },
  VisitService: { getVisitsByPatientId: async () => [] },
}));

const { PdfService } = await import("../PdfService");

// Gli stessi valori del servizio: se il foglio cambia margini, cambiano qui.
const ML = 18;
const MR = 192;
const FOOT_Y = 297 - 14;

const paziente = pazienteDiProva;

/**
 * La visita di prova con la prosa moltiplicata.
 *
 * A sbordare sono le righe lunghe di testo, e servono abbastanza pagine da far
 * entrare in gioco anche i salti: il referto corto sta dentro i margini quasi
 * per caso.
 */
const prosa = visitaDiProva.visita!;
const visitaPiena: Visit = {
  ...visitaDiProva,
  visita: {
    ...prosa,
    problemaClinico: (prosa.problemaClinico + " ").repeat(4),
    prestazione: (prosa.prestazione + " ").repeat(4),
    esameObiettivo: (prosa.esameObiettivo + " ").repeat(4),
    accertamenti: (prosa.accertamenti + " ").repeat(3),
    terapiaSpecifica: (prosa.terapiaSpecifica + " ").repeat(3),
  },
};

/** Genera il referto restituendo ogni stringa disegnata e dove va a finire. */
async function scritteDelReferto(patient: Patient, visit: Visit): Promise<Scritta[]> {
  scritte.length = 0;
  await PdfService.generateVisitPDF(patient, visit);
  expect(scritte.length).toBeGreaterThan(50);
  return [...scritte];
}

describe("referto di visita: niente esce dal foglio", () => {
  it("nessuna riga sfonda il margine destro", async () => {
    // Mezzo millimetro di tolleranza: quello e' arrotondamento, non sbordo.
    const fuori = (await scritteDelReferto(paziente, visitaPiena))
      .filter((s) => s.destra > MR + 0.5)
      .map((s) => `"${s.testo}" arriva a ${s.destra.toFixed(1)} mm`);
    expect(fuori).toEqual([]);
  });

  it("nessuna riga comincia prima del margine sinistro", async () => {
    const fuori = (await scritteDelReferto(paziente, visitaPiena))
      .filter((s) => s.sinistra < ML - 0.5)
      .map((s) => `"${s.testo}" comincia a ${s.sinistra.toFixed(1)} mm`);
    expect(fuori).toEqual([]);
  });

  it("niente scrive nella fascia riservata al piede", async () => {
    // Sotto il filetto ci va solo il piede — numerazione, firma
    // dell'applicazione, timbro di emissione — che si disegna a FOOT_Y + 4,5.
    const dentroIlPiede = (await scritteDelReferto(paziente, visitaPiena))
      .filter((s) => s.y > FOOT_Y && s.y < FOOT_Y + 3)
      .map((s) => `"${s.testo}" a ${s.y.toFixed(1)} mm`);
    expect(dentroIlPiede).toEqual([]);
  });

  it("niente scende sotto il piede", async () => {
    const troppoInBasso = (await scritteDelReferto(paziente, visitaPiena))
      .filter((s) => s.y > FOOT_Y + 6)
      .map((s) => `"${s.testo}" a ${s.y.toFixed(1)} mm`);
    expect(troppoInBasso).toEqual([]);
  });

  it("un cognome lunghissimo non sfonda comunque il margine", async () => {
    const scritte = await scritteDelReferto(
      {
        ...paziente,
        cognome: "Vandenbroucke Della Rovere Di Santa Maria",
        nome: "Massimiliano Alessandro Bartolomeo",
      },
      visitaPiena,
    );
    expect(scritte.filter((s) => s.destra > MR + 0.5)).toEqual([]);
  });
});

describe("referto di visita: prosa con il grassetto", () => {
  // Il testo con i marcatori non passa da `splitTextToSize`: il ritorno a capo
  // lo fa il PDF misurando parola per parola, perche' le parole in grassetto
  // sono piu' larghe delle stesse in tondo. E' esattamente il punto in cui una
  // riga puo' uscire dal margine senza che il testo estratto lo mostri.
  const conGrassetto: Visit = {
    ...visitaPiena,
    visita: {
      ...visitaPiena.visita!,
      esameObiettivo: (
        prosa.esameObiettivo.replace("soffio sistolico", "**soffio sistolico**") + " "
      ).repeat(4),
    },
  };

  it("nessuna riga in grassetto sfonda il margine destro", async () => {
    const fuori = (await scritteDelReferto(paziente, conGrassetto))
      .filter((s) => s.destra > MR + 0.5)
      .map((s) => `"${s.testo}" arriva a ${s.destra.toFixed(1)} mm`);
    expect(fuori).toEqual([]);
  });

  it("le parole in grassetto restano nella loro riga", async () => {
    // Ogni parola e' disegnata da sola: quelle della stessa riga devono stare
    // alla stessa quota, se no il grassetto scalerebbe il testo in verticale.
    const scritte = await scritteDelReferto(paziente, conGrassetto);
    const soffio = scritte.filter((s) => s.testo === "soffio");
    expect(soffio.length).toBeGreaterThan(0);
    for (const parola of soffio) {
      const sistolico = scritte.find(
        (s) => s.testo === "sistolico" && s.y === parola.y,
      );
      expect(sistolico, "\"sistolico\" non e' sulla riga di \"soffio\"").toBeDefined();
      expect(sistolico!.sinistra).toBeGreaterThan(parola.sinistra);
    }
  });
});

describe("referto di visita: la casella del nome", () => {
  /** La quota della riga in cui e' stata scritta l'etichetta indicata. */
  function rigaDi(scritte: Scritta[], etichetta: string): number {
    const scritta = scritte.find((s) => s.testo === etichetta);
    expect(scritta, `"${etichetta}" non compare nel referto`).toBeDefined();
    return scritta!.y;
  }

  it("un nome che ci sta non fa scendere il campo accanto", async () => {
    // L'anagrafica ha quattro celle per riga: paziente, nascita, sesso e data
    // della visita ci stanno tutte insieme, e "PROVA Mario" in 43 millimetri
    // sta larghissimo. Il nome si allarga a due colonne solo quando serve.
    const scritte = await scritteDelReferto(paziente, visitaPiena);
    expect(rigaDi(scritte, "Data visita")).toBe(rigaDi(scritte, "Paziente"));
  });

  it("un nome che non ci sta prende due colonne e manda a capo il resto", async () => {
    // Il caso opposto: il nome non si stringe e non si tronca, e il campo
    // accanto scende. Costa una riga, e un referto che tronca il cognome e' un
    // referto sbagliato.
    const scritte = await scritteDelReferto(
      {
        ...paziente,
        cognome: "Vandenbroucke Della Rovere",
        nome: "Massimiliano Alessandro",
      },
      visitaPiena,
    );
    expect(rigaDi(scritte, "Data visita")).toBeGreaterThan(
      rigaDi(scritte, "Paziente"),
    );
  });
});
