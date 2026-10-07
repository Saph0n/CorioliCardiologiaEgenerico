import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doctor, Patient, Visit } from "../../types/Storage";

/**
 * Intestazione e firma del referto di visita: titolo del medico, partita IVA
 * e firma olografica in calce (presa da Corioli Cardiologia).
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
  luogoNascita: "Siena",
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
    problemaClinico: "Controllo",
    prestazione: "",
    esameObiettivo: "Nei limiti",
    accertamenti: "",
    terapiaSpecifica: "Nessuna variazione della terapia.",
    immagini: [FIRMA],
  },
};

/** L'immagine della firma disegnata sulla pagina. */
const FIRMA_DISEGNATA = /\/I\d+ Do\b/;
const posizioneFirma = (t: string) => t.search(FIRMA_DISEGNATA);

async function testo(opzioni?: { includeImages?: boolean }): Promise<string> {
  const blob = await PdfService.generateVisitPDF(paziente, visita, opzioni);
  expect(blob).toBeDefined();
  return await blob!.text();
}

beforeEach(() => {
  medico = {
    nome: "Anna",
    cognome: "Neri",
    specializzazione: "Medicina interna",
    ambulatori: [],
  };
  preferenze = {};
});

describe("referto di visita: intestazione", () => {
  it("senza titolo scelto scrive Dott.", async () => {
    expect(await testo()).toContain("Dott. Anna Neri");
  });

  it("usa il titolo scelto nel profilo", async () => {
    medico.titolo = "Dott.ssa";
    expect(await testo()).toContain("Dott.ssa Anna Neri");
  });

  it("i recapiti stanno nell'intestazione, non nel piede", async () => {
    medico.ambulatori = [{
      id: "a1", isPrimario: true, nome: "Studio Neri", indirizzo: "Via Roma 1",
      citta: "Siena", cap: "53100", telefono: "",
    }];
    const t = await testo();
    expect(t).toContain("Studio Neri");
    expect(t).toContain("Creato con Corioli");
    expect(t).toContain("Pagina 1 di 1");
  });

  it("stampa le lettere accentate, non l'apostrofo", async () => {
    visita.visita!.esameObiettivo = "Attività cardiaca ritmica.";
    const t = await testo();
    expect(t).not.toContain("Attivita'");
    visita.visita!.esameObiettivo = "Nei limiti";
  });

  it("stampa la partita IVA solo se c'e'", async () => {
    expect(await testo()).not.toContain("P.IVA");
    medico.partitaIva = "12345678903";
    expect(await testo()).toContain("P.IVA 12345678903");
  });
});

describe("referto di visita: firma del medico", () => {
  it("senza immagine della firma non chiude con il blocco firma", async () => {
    expect(await testo()).not.toMatch(FIRMA_DISEGNATA);
  });

  it("con l'immagine della firma la stampa in calce", async () => {
    medico.signatureStampImage = FIRMA;
    expect(await testo()).toMatch(FIRMA_DISEGNATA);
  });

  it("non la stampa se il medico l'ha spenta per il referto", async () => {
    medico.signatureStampImage = FIRMA;
    preferenze = { firmaSulReferto: false };
    const t = await testo();
    expect(t).not.toMatch(FIRMA_DISEGNATA);
    expect(t).not.toContain("/Subtype /Image");
  });

  it("firma dopo le conclusioni e prima delle immagini allegate", async () => {
    medico.signatureStampImage = FIRMA;
    const t = await testo({ includeImages: true });
    expect(posizioneFirma(t)).toBeGreaterThan(t.indexOf("Nessuna variazione"));
    expect(t).toContain("IMMAGINI ALLEGATE");
    expect(posizioneFirma(t)).toBeLessThan(t.indexOf("IMMAGINI ALLEGATE"));
  });
});

describe("referto di visita: titolo", () => {
  it("dice che visita e', dalla specializzazione del medico", async () => {
    const t = await testo();
    expect(t).toContain("VISITA INTERNISTICA");
    expect(t).not.toContain("SPECIALISTIC");
  });

  it("usa il titolo scelto nelle impostazioni", async () => {
    preferenze = { titoloReferto: "Visita geriatrica" };
    const t = await testo();
    expect(t).toContain("VISITA GERIATRICA");
    expect(t).not.toContain("VISITA INTERNISTICA");
  });

  it("con il titolo vuoto torna a quello della specializzazione", async () => {
    preferenze = { titoloReferto: "   " };
    expect(await testo()).toContain("VISITA INTERNISTICA");
  });
});
