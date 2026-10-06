import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doctor, Patient, Visit } from "../../types/Storage";

/**
 * La firma in calce al referto della visita.
 *
 * Il cardiologo ha tolto dal referto il blocco firma vuoto (luogo, data, riga
 * per firmare a penna): quella regola resta, e la tiene `refertoVisita.test`.
 * Qui c'e' l'altro caso: il medico che ha caricato l'immagine della sua firma
 * la ritrova in calce, a meno di averla spenta nelle impostazioni.
 */

/** PNG di un pixel: basta a far disegnare l'immagine a jsPDF. */
const FIRMA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let medico: Partial<Doctor>;
let preferenze: Record<string, unknown>;

vi.mock("../OfflineServices", () => ({
  DoctorService: { getDoctor: async () => medico },
  PreferenceService: { getPreferences: async () => preferenze },
  VisitService: { getVisitsByPatientId: async () => [] },
}));

// Il ritaglio a 3:1 passa da un canvas, che fuori dal browser non c'e'.
vi.mock("../../utils/signatureStamp", async (originale) => ({
  ...(await originale<typeof import("../../utils/signatureStamp")>()),
  normalizeSignatureStampImage: async (src: string) => src,
}));

const { PdfService } = await import("../PdfService");

const paziente: Patient = {
  id: "p1",
  nome: "Mario",
  cognome: "Prova",
  dataNascita: "1950-04-12",
  luogoNascita: "Bergamo",
  sesso: "M",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const visita: Visit = {
  id: "v1",
  patientId: "p1",
  dataVisita: "2026-09-07",
  descrizioneClinica: "",
  anamnesi: "",
  esamiObiettivo: "",
  conclusioniDiagnostiche: "",
  terapie: "",
  createdAt: "2026-09-07",
  updatedAt: "2026-09-07",
  visita: {
    problemaClinico: "Cardiopalmo",
    prestazione: "",
    esameObiettivo: "Nei limiti",
    accertamenti: "",
    terapiaSpecifica: "Nessuna variazione della terapia.",
    immagini: [FIRMA],
  },
};

/**
 * L'immagine della firma disegnata sulla pagina: e' il segno del blocco firma,
 * perche' nome e qualifica del medico stanno anche nell'intestazione.
 */
const FIRMA_DISEGNATA = /\/I\d+ Do\b/;
/** Luogo e data in calce: su ricetta e certificato si', sul referto no. */
const CALCE = "Bergamo, 07/09/2026";
const posizioneFirma = (t: string) => t.search(FIRMA_DISEGNATA);

async function testo(opzioni?: { includeImages?: boolean }): Promise<string> {
  const blob = await PdfService.generateVisitPDF(paziente, visita, opzioni);
  expect(blob).toBeDefined();
  return await blob!.text();
}

beforeEach(() => {
  medico = {
    nome: "Vincenzo",
    cognome: "Trani",
    specializzazione: "Cardiologia",
    ambulatori: [{
      id: "a1", isPrimario: true, nome: "Studio", indirizzo: "Via Garibaldi 14",
      citta: "Bergamo", cap: "24122", telefono: "",
    }],
  };
  preferenze = {};
});

describe("referto di visita: firma del medico", () => {
  it("senza immagine della firma non chiude con il blocco firma", async () => {
    const t = await testo();
    expect(t).not.toMatch(FIRMA_DISEGNATA);
    expect(t).not.toContain(CALCE);
  });

  it("con l'immagine della firma la stampa in calce", async () => {
    medico.signatureStampImage = FIRMA;
    expect(await testo()).toMatch(FIRMA_DISEGNATA);
  });

  it("non ripete luogo e data accanto alla firma", async () => {
    // La data della visita e' gia' nell'intestazione e in cima a ogni pagina.
    medico.signatureStampImage = FIRMA;
    expect(await testo()).not.toContain(CALCE);
  });

  it("non la stampa se il medico l'ha spenta per il referto", async () => {
    medico.signatureStampImage = FIRMA;
    preferenze = { firmaSulReferto: false };
    const t = await testo();
    expect(t).not.toMatch(FIRMA_DISEGNATA);
    expect(t).not.toContain("/Subtype /Image");
  });

  it("firma prima delle immagini allegate", async () => {
    medico.signatureStampImage = FIRMA;
    const t = await testo({ includeImages: true });
    expect(posizioneFirma(t)).toBeGreaterThan(t.indexOf("Nessuna variazione"));
    expect(t).toContain("IMMAGINI ALLEGATE");
    expect(posizioneFirma(t)).toBeLessThan(t.indexOf("IMMAGINI ALLEGATE"));
  });
});

/**
 * Il contenuto di ogni pagina, in ordine. Il PDF e' senza compressione e
 * jsPDF scrive un flusso per pagina: quelli con del testo sono le pagine,
 * l'altro e' l'immagine della firma.
 */
function pagine(pdf: string): string[] {
  return [...pdf.matchAll(/stream\r?\n([\s\S]*?)endstream/g)]
    .map((m) => m[1])
    .filter((flusso) => flusso.includes(" Tj"));
}

/** Conclusioni di `righe` righe, ognuna riconoscibile nel PDF. */
function conRighe(righe: number): Visit {
  const testo = Array.from(
    { length: righe },
    (_, i) => `Riga ${String(i + 1).padStart(2, "0")} delle conclusioni.`,
  ).join("\n");
  return { ...visita, visita: { ...visita.visita!, terapiaSpecifica: testo, immagini: [] } };
}

const righeDi = (pagina: string) => pagina.match(/Riga \d\d delle conclusioni/g)?.length ?? 0;

describe("referto di visita: la firma non resta sola su una pagina", () => {
  // Conclusioni di ogni lunghezza fino a oltre la prima pagina: per qualcuna
  // la pagina finisce proprio dove dovrebbe cominciare la firma.
  const lunghezze = Array.from({ length: 45 }, (_, i) => i + 1);

  it("con la firma passano sempre almeno due righe delle conclusioni", async () => {
    medico.signatureStampImage = FIRMA;
    for (const righe of lunghezze) {
      const blob = await PdfService.generateVisitPDF(paziente, conRighe(righe));
      const conFirma = pagine(await blob!.text()).find((p) => FIRMA_DISEGNATA.test(p));
      expect(conFirma, `${righe} righe`).toBeDefined();
      expect(righeDi(conFirma!), `${righe} righe`).toBeGreaterThanOrEqual(Math.min(2, righe));
    }
  });

  it("il titolo delle conclusioni non resta in fondo alla pagina con una riga sola", async () => {
    medico.signatureStampImage = FIRMA;
    for (const righe of lunghezze) {
      const blob = await PdfService.generateVisitPDF(paziente, conRighe(righe));
      const conTitolo = pagine(await blob!.text()).find((p) => p.includes("CONCLUSIONI E TERAPIA"));
      expect(righeDi(conTitolo!), `${righe} righe`).toBeGreaterThanOrEqual(Math.min(2, righe));
    }
  });

  it("succede davvero: per qualche lunghezza la firma andava a capo da sola", async () => {
    // Senza questo i due test sopra passerebbero anche se nessuna lunghezza
    // arrivasse al bordo della pagina.
    medico.signatureStampImage = FIRMA;
    const impaginazioni = contaImpaginazioni();
    let rifatti = 0;
    for (const righe of lunghezze) {
      impaginazioni.mockClear();
      await PdfService.generateVisitPDF(paziente, conRighe(righe));
      // Una o due impaginazioni (con e senza controllo degli orfani), piu'
      // quella rifatta per la firma.
      if (impaginazioni.mock.calls.length > 2) rifatti++;
    }
    impaginazioni.mockRestore();
    expect(rifatti).toBeGreaterThan(0);
  });

  it("senza firma il referto non si rifa' mai", async () => {
    const impaginazioni = contaImpaginazioni();
    for (const righe of lunghezze) {
      impaginazioni.mockClear();
      await PdfService.generateVisitPDF(paziente, conRighe(righe));
      expect(impaginazioni.mock.calls.length, `${righe} righe`).toBeLessThanOrEqual(2);
    }
    impaginazioni.mockRestore();
  });
});

/** Spia su ogni impaginazione del referto (metodo privato di `PdfService`). */
function contaImpaginazioni() {
  return vi.spyOn(
    PdfService as unknown as { impaginaReferto: (...a: unknown[]) => Promise<unknown> },
    "impaginaReferto",
  );
}
