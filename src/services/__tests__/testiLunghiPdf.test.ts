import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelloStampa, Patient } from "../../types/Storage";
import { STILI_PRONTI, VARIANTI, modelloPronto } from "../../utils/modelliStampa";
import { pazienteDiProva, visitaDiProva } from "./refertoDiProva";

/**
 * Testi lunghissimi su ogni documento e ogni modello pronto: nessuna scritta
 * deve uscire dai margini o dal fondo del foglio ("controlla che nel
 * template non sbordino i testi fuori dalla pagina", Pablo, 29 ottobre 2026,
 * guardando una richiesta di esame).
 *
 * Come negli altri test del PDF, si intercetta `doc.text` avvolgendo il
 * costruttore di jsPDF; qui con la pagina e l'altezza del foglio.
 */

interface Scritta {
  testo: string;
  y: number;
  sinistra: number;
  destra: number;
  altezzaFoglio: number;
}

const { scritte } = vi.hoisted(() => ({ scritte: [] as Scritta[] }));

vi.mock("jspdf", async () => {
  const reale = await vi.importActual<{ default: new (...args: unknown[]) => object }>("jspdf");
  class Spia extends reale.default {
    constructor(...args: unknown[]) {
      super(...args);
      const doc = this as unknown as {
        text(t: unknown, x: number, y: number, o?: { align?: string; charSpace?: number }): unknown;
        getTextWidth(t: string): number;
        internal: { pageSize: { getHeight(): number } };
      };
      const originale = doc.text.bind(doc);
      doc.text = (testo, x, y, opzioni) => {
        const stringa = Array.isArray(testo) ? testo.join(" ") : String(testo);
        let larghezza = doc.getTextWidth(stringa);
        const charSpace = opzioni?.charSpace ?? 0;
        if (charSpace) larghezza += charSpace * Math.max(stringa.length - 1, 0);
        const sinistra = opzioni?.align === "right"
          ? x - larghezza
          : opzioni?.align === "center" ? x - larghezza / 2 : x;
        scritte.push({
          testo: stringa, y, sinistra, destra: sinistra + larghezza,
          altezzaFoglio: doc.internal.pageSize.getHeight(),
        });
        return originale(testo, x, y, opzioni);
      };
    }
  }
  return { ...reale, default: Spia, jsPDF: Spia };
});

const DOCTOR = {
  id: "d1",
  titolo: "Dott." as const,
  nome: "Giovanni Battista Maria",
  cognome: "Trani Bartolomei della Gherardesca",
  specializzazione: "Cardiologia e Malattie dell'Apparato Cardiovascolare",
  telefono: "035 123456 / 333 1234567",
  email: "studio.cardiologico.bartolomei.gherardesca@example.it",
  ambulatori: [
    {
      id: "a1", isPrimario: true, nome: "Studio Cardiologico Associato della Valle Brembana",
      indirizzo: "Via Giuseppe Garibaldi 14, scala B, interno 7", cap: "24122",
      citta: "San Giovanni Bianco", telefono: "",
    },
  ],
  createdAt: "", updatedAt: "",
};

vi.mock("../OfflineServices", () => ({
  DoctorService: { getDoctor: async () => DOCTOR },
  PreferenceService: { getPreferences: async () => ({}) },
  VisitService: { getVisitsByPatientId: async () => [] },
}));

const { PdfService } = await import("../PdfService");

// Una parola senza spazi piu' larga del foglio, una riga lunghissima e tante
// righe: le tre cose che un medico puo' incollare in un campo.
const PAROLA = "Ecocolordopplergrafiatranstoracicacompleta".repeat(4);
const RIGA =
  "Ecocardiogramma color-Doppler transtoracico con valutazione della funzione sistolica e diastolica del ventricolo sinistro, ".repeat(4);
const RIGHE = Array.from({ length: 70 }, (_, i) => `${i + 1}. Esame numero ${i + 1} con le indicazioni per il paziente`).join("\n");
const LUNGO = [RIGA, PAROLA, RIGHE].join("\n");

const PAZIENTE: Patient = {
  ...pazienteDiProva,
  nome: "Maria Antonietta Giuseppina",
  cognome: "De Santis Bartolomei della Gherardesca",
  luogoNascita: "San Giovanni in Persiceto (Bologna)",
  indirizzo: "Via del Borgo di San Pietro 128, 40026 San Giovanni in Persiceto (BO)",
};

const richiesta = {
  id: "e1", patientId: "p1", nome: LUNGO, note: LUNGO, dataRichiesta: "2026-10-29",
  createdAt: "", updatedAt: "",
};
const ricetta = {
  id: "r1", patientId: "p1", tipo: "bianca" as const, dataRicetta: "2026-10-29", testo: LUNGO,
  createdAt: "", updatedAt: "",
};
const certificato = {
  id: "c1", patientId: "p1", tipo: "altro" as const, dataCertificato: "2026-10-29", descrizione: LUNGO,
  createdAt: "", updatedAt: "",
};
const visita = {
  ...visitaDiProva,
  visita: {
    ...visitaDiProva.visita!,
    accertamenti: LUNGO,
    terapiaSpecifica: LUNGO,
  },
};

/** Le scritte che escono dal foglio, da leggere nel messaggio dell'errore. */
function fuori(r: { ml: number; mr: number }) {
  return scritte
    .filter((s) => s.sinistra < r.ml - 1 || s.destra > r.mr + 1 || s.y < 3 || s.y > s.altezzaFoglio - 3)
    .map((s) => `${s.testo.slice(0, 50)} [${s.sinistra.toFixed(1)}-${s.destra.toFixed(1)}, y ${s.y.toFixed(1)}]`);
}

const MODELLI = STILI_PRONTI.flatMap((st) => VARIANTI.map((v) => [st.id, v] as const));
const stile = (id: string) => STILI_PRONTI.find((s) => s.id === id)!;

beforeEach(() => {
  scritte.length = 0;
});

describe("testi lunghissimi restano dentro il foglio", () => {
  it.each(MODELLI)("richiesta di esame, %s %s", async (st, v) => {
    const r = await PdfService.impaginaRichiestaEsame(PAZIENTE, richiesta, DOCTOR, modelloPronto(stile(st), v, "richiestaEsame"));
    expect(r.pagine).toBeGreaterThan(1);
    expect(fuori(r)).toEqual([]);
  });

  it.each(MODELLI)("ricetta A4 e A5, %s %s", async (st, v) => {
    const a4 = await PdfService.impaginaRicetta(PAZIENTE, ricetta, DOCTOR, modelloPronto(stile(st), v, "ricetta"));
    expect(fuori(a4)).toEqual([]);
    scritte.length = 0;
    const m = modelloPronto(stile(st), v, "ricetta");
    m.pagina.formato = "A5";
    const a5 = await PdfService.impaginaRicetta(PAZIENTE, ricetta, DOCTOR, m);
    expect(fuori(a5)).toEqual([]);
  });

  it.each(MODELLI)("certificato, %s %s", async (st, v) => {
    const r = await PdfService.impaginaCertificato(PAZIENTE, certificato, DOCTOR, modelloPronto(stile(st), v, "certificato"));
    expect(fuori(r)).toEqual([]);
  });

  it.each(MODELLI)("referto, %s %s", async (st, v) => {
    const r = await PdfService.impaginaVisita(PAZIENTE, visita, { modello: modelloPronto(stile(st), v, "referto") });
    expect(fuori(r!)).toEqual([]);
  });
});

/**
 * Anche i testi che il medico scrive nel modello: titolo, sottotitolo,
 * titoletti, righe sotto i recapiti, piede, titoli delle sezioni. Con tutte
 * le parti accese (paziente con residenza, luogo e data della firma).
 */
function conTestiLunghi(m: ModelloStampa): ModelloStampa {
  m.titolo.testo = "Visita cardiologica di controllo con ecocardiogramma ed elettrocardiogramma";
  m.titolo.sottotitolo = "Ambulatorio di cardiologia preventiva e riabilitativa, ".repeat(3);
  m.testi.principale = "Si richiede cortesemente l'esecuzione degli accertamenti seguenti ".repeat(2);
  m.testi.secondario = "Notizie cliniche, terapia in corso e quesito diagnostico per il collega ".repeat(2);
  m.intestazione.righeAggiuntive = [
    "Iscritto all'Ordine dei Medici Chirurghi e Odontoiatri della Provincia di Bergamo al numero 12345",
    "Riceve su appuntamento dal lunedi' al venerdi' dalle 9 alle 13 e dalle 15 alle 19, sabato mattina",
  ].join("\n");
  m.piede.testo = "Documento riservato al medico curante, da conservare con la documentazione clinica ".repeat(2);
  m.paziente.residenza = true;
  m.paziente.luogoNascita = true;
  m.paziente.data = true;
  m.firma.luogoData = true;
  m.firma.rigaAPenna = true;
  for (const s of m.sezioni) s.titolo = `${s.id} con un titolo scritto per intero dal medico che lo vuole cosi'`;
  return m;
}

describe("testi lunghissimi anche nel modello", () => {
  it.each(MODELLI)("richiesta, ricetta, certificato e referto, %s %s", async (st, v) => {
    const pronto = (d: ModelloStampa["documento"]) => conTestiLunghi(modelloPronto(stile(st), v, d));
    const documenti = [
      () => PdfService.impaginaRichiestaEsame(PAZIENTE, richiesta, DOCTOR, pronto("richiestaEsame")),
      () => PdfService.impaginaRicetta(PAZIENTE, ricetta, DOCTOR, pronto("ricetta")),
      () => {
        const m = pronto("ricetta");
        m.pagina.formato = "A5";
        return PdfService.impaginaRicetta(PAZIENTE, ricetta, DOCTOR, m);
      },
      () => PdfService.impaginaCertificato(PAZIENTE, certificato, DOCTOR, pronto("certificato")),
      async () => (await PdfService.impaginaVisita(PAZIENTE, visita, { modello: pronto("referto") }))!,
    ];
    for (const impagina of documenti) {
      scritte.length = 0;
      const r = await impagina();
      expect(fuori(r)).toEqual([]);
    }
  });
});
