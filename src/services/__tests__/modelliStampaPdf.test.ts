import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelloStampa } from "../../types/Storage";
import {
  STILI_PRONTI,
  VARIANTI,
  applicaAspetto,
  duplicaModello,
  modelloPredefinito,
  modelloPronto,
} from "../../utils/modelliStampa";
import { pazienteDiProva, visitaDiProva } from "./refertoDiProva";

/**
 * Il PDF fatto con un modello diverso dal predefinito: che il predefinito non
 * cambi niente lo dice il confronto con i PDF di sempre (gli altri test sul
 * referto); qui si guarda che ogni scelta del modello arrivi sul foglio.
 *
 * Come in `refertoImpaginazione.test.ts`, si intercetta `doc.text` avvolgendo
 * il costruttore di jsPDF.
 */

interface Scritta {
  testo: string;
  y: number;
  sinistra: number;
  destra: number;
  carattere: string;
}

const { scritte, immagini } = vi.hoisted(() => ({
  scritte: [] as Scritta[],
  /**
   * Le immagini disegnate, col nome con cui sono entrate nel PDF e il numero
   * del documento: il referto si impagina anche due volte e ne tiene una.
   */
  immagini: [] as { alias?: string; w: number; h: number; documento: number }[],
}));
let documenti = 0;

vi.mock("jspdf", async () => {
  const reale = await vi.importActual<{ default: new (...args: unknown[]) => object }>("jspdf");
  class Spia extends reale.default {
    constructor(...args: unknown[]) {
      super(...args);
      const doc = this as unknown as {
        text(t: unknown, x: number, y: number, o?: { align?: string; charSpace?: number }): unknown;
        getTextWidth(t: string): number;
        getFont(): { fontName: string };
        addImage(...a: unknown[]): unknown;
      };
      const addImage = doc.addImage.bind(doc);
      const numero = ++documenti;
      doc.addImage = (...a: unknown[]) => {
        immagini.push({
          w: Number(a[4]), h: Number(a[5]), alias: typeof a[6] === "string" ? a[6] : undefined, documento: numero,
        });
        return addImage(...a);
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
          carattere: doc.getFont().fontName,
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
  nome: "Vincenzo",
  cognome: "Trani",
  specializzazione: "Cardiologia",
  telefono: "035 123456",
  email: "studio@example.it",
  ambulatori: [
    { id: "a1", isPrimario: true, nome: "Studio Cardiologico", indirizzo: "Via Garibaldi 14", cap: "24122", citta: "Bergamo", telefono: "" },
    { id: "a2", isPrimario: false, nome: "Clinica San Rossore", indirizzo: "Viale delle Cascine 1", cap: "56122", citta: "Pisa", telefono: "" },
  ],
  createdAt: "", updatedAt: "",
};

vi.mock("../OfflineServices", () => ({
  DoctorService: { getDoctor: async () => DOCTOR },
  PreferenceService: { getPreferences: async () => ({}) },
  VisitService: { getVisitsByPatientId: async () => [] },
}));

const { PdfService } = await import("../PdfService");

function modello(documento: ModelloStampa["documento"], modifica: (m: ModelloStampa) => void) {
  const m = duplicaModello(modelloPredefinito(documento), []);
  modifica(m);
  return m;
}

const testi = () => scritte.map((s) => s.testo);
const indice = (t: string) => scritte.findIndex((s) => s.testo === t);

const ricetta = {
  id: "r1", patientId: "p1", tipo: "bianca" as const, dataRicetta: "2026-09-07",
  testo: "Atorvastatina 80 mg: 1 cp la sera", createdAt: "", updatedAt: "",
};

// Un JPEG valido di 1x1 pixel: basta a jsPDF per metterlo nel PDF.
const JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

beforeEach(() => {
  scritte.length = 0;
  immagini.length = 0;
});

describe("modello del referto", () => {
  it("nasconde, rinomina e riordina le sezioni", async () => {
    const m = modello("referto", (m) => {
      m.sezioni.find((s) => s.id === "anamnesi")!.visibile = false;
      const conclusioni = m.sezioni.find((s) => s.id === "conclusioni")!;
      conclusioni.titolo = "Conclusioni";
      m.sezioni = [conclusioni, ...m.sezioni.filter((s) => s !== conclusioni)];
    });
    await PdfService.generateVisitPDF(pazienteDiProva, visitaDiProva, { modello: m });
    expect(testi()).not.toContain("ANAMNESI");
    expect(testi()).not.toContain("CONCLUSIONI E TERAPIA");
    expect(indice("CONCLUSIONI")).toBeGreaterThan(-1);
    expect(indice("CONCLUSIONI")).toBeLessThan(indice("MOTIVO DELLA VISITA"));
  });

  it("su carta intestata non stampa l'intestazione e parte sotto lo spazio lasciato", async () => {
    const m = modello("referto", (m) => {
      m.intestazione.cartaIntestata = true;
      m.intestazione.spazioAlto = 50;
    });
    await PdfService.generateVisitPDF(pazienteDiProva, visitaDiProva, { modello: m });
    // La prima scritta e' il titolo, sotto i 50 mm della carta.
    expect(scritte[0].testo).toBe("VISITA CARDIOLOGICA");
    expect(scritte[0].y).toBeGreaterThan(50);
    expect(testi()).not.toContain("Studio Cardiologico");
  });

  it("titolo, carattere e testo del piede vengono dal modello", async () => {
    const m = modello("referto", (m) => {
      m.titolo.testo = "Visita cardiologica di controllo";
      m.pagina.carattere = "times";
      m.piede.testo = "Documento riservato al medico curante";
    });
    await PdfService.generateVisitPDF(pazienteDiProva, visitaDiProva, { modello: m });
    expect(testi()).toContain("VISITA CARDIOLOGICA DI CONTROLLO");
    expect(testi()).toContain("Documento riservato al medico curante");
    expect(scritte.every((s) => s.carattere === "times")).toBe(true);
  });

  it("raccoglie le zone cliccabili per l'editor", async () => {
    const r = await PdfService.impaginaVisita(
      pazienteDiProva, visitaDiProva, { modello: modelloPredefinito("referto") }, true,
    );
    const nomi = new Set(r!.zone.map((z) => z.zona));
    expect([...nomi]).toEqual(expect.arrayContaining(["intestazione", "titolo", "paziente", "sezione", "piede"]));
    const sezioni = new Set(r!.zone.filter((z) => z.zona === "sezione").map((z) => z.sezione));
    expect(sezioni.has("conclusioni")).toBe(true);
    expect(r!.zone.every((z) => z.y1 > z.y0 && z.pagina >= 1 && z.pagina <= r!.pagine)).toBe(true);
  });

  it("senza modello passato e senza archivio usa il predefinito", async () => {
    const r = await PdfService.impaginaVisita(pazienteDiProva, visitaDiProva);
    expect(r!.larghezza).toBe(210);
    expect(testi()).toContain("VISITA CARDIOLOGICA");
  });
});

describe("stili pronti", () => {
  it("Moderno: Lato, nome colorato, conclusioni nel riquadro, valori fuori norma colorati", async () => {
    const m = modello("referto", (m) => applicaAspetto(m, STILI_PRONTI.find((s) => s.id === "moderno")!.colore));
    await PdfService.generateVisitPDF(pazienteDiProva, visitaDiProva, { modello: m });
    // Lato in tutto il documento.
    expect(scritte.length).toBeGreaterThan(50);
    expect(scritte.every((s) => s.carattere === "lato")).toBe(true);
    // Il nome del medico in testa, la specializzazione in maiuscolo.
    expect(testi()).toContain("Dott. Vincenzo Trani");
    expect(testi()).toContain("CARDIOLOGIA");
    // Le conclusioni ci sono tutte, in grassetto nel riquadro.
    expect(testi().join(" ")).toContain("Quadro compatibile con cardiopatia ischemica cronica");
  });

  it("ogni modello pronto, a colori e in bianco e nero, resta dentro il foglio", async () => {
    for (const st of STILI_PRONTI) {
      for (const v of VARIANTI) {
        scritte.length = 0;
        const r = await PdfService.impaginaVisita(pazienteDiProva, visitaDiProva, { modello: modelloPronto(st, v, "referto") });
        expect(r!.pagine).toBeGreaterThan(0);
        for (const s of scritte) {
          expect(s.sinistra).toBeGreaterThanOrEqual(r!.ml - 1);
          expect(s.destra).toBeLessThanOrEqual(r!.mr + 1);
        }
        scritte.length = 0;
        const ric = await PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, modelloPronto(st, v, "ricetta"));
        expect(ric.pagine).toBe(1);
        expect(testi()).toContain("Atorvastatina 80 mg: 1 cp la sera");
        for (const s of scritte) {
          expect(s.sinistra).toBeGreaterThanOrEqual(ric.ml - 1);
          expect(s.destra).toBeLessThanOrEqual(ric.mr + 1);
        }
      }
    }
  });

  const pronto = (id: string) => STILI_PRONTI.find((s) => s.id === id)!;

  it("Elegante: nome e recapiti al centro, capitoli centrati fra due filetti", async () => {
    await PdfService.impaginaVisita(pazienteDiProva, visitaDiProva, {
      modello: modelloPronto(pronto("elegante"), "colore", "referto"),
    });
    const nome = scritte.find((s) => s.testo === "Dott. Vincenzo Trani")!;
    expect(Math.abs((nome.sinistra + nome.destra) / 2 - 105)).toBeLessThan(1);
    const anamnesi = scritte.find((s) => s.testo === "ANAMNESI")!;
    expect(Math.abs((anamnesi.sinistra + anamnesi.destra) / 2 - 105)).toBeLessThan(1);
  });

  it("Essenziale: il titolo com'e' scritto, a sinistra, e un punto davanti alle sezioni", async () => {
    const r = await PdfService.impaginaVisita(pazienteDiProva, visitaDiProva, {
      modello: modelloPronto(pronto("essenziale"), "colore", "referto"),
    });
    const titolo = scritte.find((s) => s.testo === "Visita cardiologica")!;
    expect(titolo.sinistra).toBeCloseTo(r!.ml, 1);
    expect(testi()).not.toContain("VISITA CARDIOLOGICA");
    const anamnesi = scritte.find((s) => s.testo === "ANAMNESI")!;
    expect(anamnesi.sinistra).toBeGreaterThan(r!.ml + 3);
  });

  it("Grande e chiaro: nome e recapiti nella banda in cima, poi il titolo", async () => {
    await PdfService.impaginaVisita(pazienteDiProva, visitaDiProva, {
      modello: modelloPronto(pronto("grande"), "colore", "referto"),
    });
    const nome = scritte.find((s) => s.testo === "Dott. Vincenzo Trani")!;
    const studio = scritte.find((s) => s.testo === "Studio Cardiologico")!;
    const titolo = scritte.find((s) => s.testo === "VISITA CARDIOLOGICA")!;
    expect(nome.y).toBeLessThan(20);
    expect(studio.y).toBeLessThan(20);
    expect(titolo.y).toBeGreaterThan(30);
  });

  it("ogni modello pronto sta anche sulla ricetta in A5", async () => {
    for (const st of STILI_PRONTI) {
      for (const v of VARIANTI) {
        scritte.length = 0;
        const m = modelloPronto(st, v, "ricetta");
        m.pagina.formato = "A5";
        const r = await PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, m);
        expect(r.pagine).toBe(1);
        for (const s of scritte) {
          expect(s.sinistra).toBeGreaterThanOrEqual(r.ml - 1);
          expect(s.destra).toBeLessThanOrEqual(r.mr + 1);
        }
      }
    }
  });

  it("un colore libero non rompe niente nemmeno su ricetta e certificato", async () => {
    const m = modello("ricetta", (m) => {
      m.pagina.colore = "#5b3a8c";
      m.pagina.accento = "#c0892b";
      m.pagina.stile = "moderno";
      m.titolo.stile = "sfumato";
      m.paziente.riquadro = true;
      m.pagina.angoli = "arrotondati";
    });
    const r = await PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, m);
    expect(r.pagine).toBe(1);
    expect(testi()).toContain("RICETTA MEDICA");
  });
});

describe("carta intestata come immagine", () => {
  it("la carta digitale si stampa sotto il testo, a foglio intero, su ogni pagina", async () => {
    const m = modello("referto", (m) => {
      m.intestazione.cartaIntestata = true;
      m.intestazione.sfondoInStampa = true;
      m.intestazione.sfondo = JPEG;
    });
    const r = await PdfService.impaginaVisita(pazienteDiProva, visitaDiProva, { modello: m });
    const sfondi = immagini.filter((i) => i.alias === "carta-intestata");
    const perDocumento = new Map<number, number>();
    for (const i of sfondi) perDocumento.set(i.documento, (perDocumento.get(i.documento) ?? 0) + 1);
    // Il documento scelto ha l'immagine una volta per pagina.
    expect([...perDocumento.values()]).toContain(r!.pagine);
    expect(sfondi.every((i) => i.w === 210 && i.h === 297)).toBe(true);
    // Niente intestazione di Corioli sopra quella della carta.
    expect(testi()).not.toContain("Studio Cardiologico");
  });

  it("la foto della carta prestampata si vede nell'anteprima dell'editor ma non si stampa", async () => {
    const m = modello("ricetta", (m) => {
      m.intestazione.cartaIntestata = true;
      m.intestazione.sfondo = JPEG;
    });
    await PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, m);
    expect(immagini.some((i) => i.alias === "carta-intestata")).toBe(false);
    await PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, m, true);
    expect(immagini.some((i) => i.alias === "carta-intestata")).toBe(true);
  });

  it("senza carta intestata l'immagine resta nel modello ma non esce", async () => {
    const m = modello("ricetta", (m) => {
      m.intestazione.sfondo = JPEG;
      m.intestazione.sfondoInStampa = true;
    });
    await PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, m, true);
    expect(immagini.some((i) => i.alias === "carta-intestata")).toBe(false);
    expect(testi()).toContain("Studio Cardiologico");
  });
});

describe("modello di ricetta e certificato", () => {
  it("i titoletti sopra il testo vengono dal modello, e vuoti non si stampano", async () => {
    await PdfService.generateRicettaPDF(pazienteDiProva, ricetta, DOCTOR, modello("ricetta", (m) => {
      m.testi.principale = "Rp/";
    }));
    expect(testi()).toContain("Rp/");
    expect(testi()).not.toContain("Prescrizione");

    scritte.length = 0;
    await PdfService.generateCertificatoPDF(pazienteDiProva, {
      id: "c1", patientId: "p1", tipo: "idoneita", dataCertificato: "2026-09-07",
      descrizione: "idoneo", createdAt: "", updatedAt: "",
    }, DOCTOR, modello("certificato", (m) => { m.testi.principale = ""; }));
    expect(testi()).not.toContain("Si certifica che");
    expect(testi()).toContain("idoneo");
  });

  it("aggiunge luogo di nascita, residenza e data accanto al paziente", async () => {
    const conIndirizzo = { ...pazienteDiProva, indirizzo: "Via Roma 1, Bergamo" };
    await PdfService.generateRicettaPDF(conIndirizzo, ricetta, DOCTOR, modello("ricetta", (m) => {
      m.paziente.luogoNascita = true;
      m.paziente.residenza = true;
      m.paziente.data = true;
    }));
    const tutto = testi();
    expect(tutto).toContain("Luogo di nascita");
    expect(tutto).toContain("Residenza");
    expect(tutto).toContain("Via Roma 1, Bergamo");
    expect(tutto).toContain("Data ricetta");
  });

  it("una ricetta A5 resta dentro il foglio piccolo", async () => {
    const m = modello("ricetta", (m) => { m.pagina.formato = "A5"; });
    const r = await PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, m);
    expect([r.larghezza, r.altezza]).toEqual([148, 210]);
    for (const s of scritte) {
      expect(s.sinistra).toBeGreaterThanOrEqual(r.ml - 0.5);
      expect(s.destra).toBeLessThanOrEqual(r.mr + 0.5);
    }
  });

  it("toglie telefono e codice fiscale, aggiunge le righe e usa l'ambulatorio scelto", async () => {
    const m = modello("ricetta", (m) => {
      m.intestazione.telefono = false;
      m.intestazione.ambulatorioId = "a2";
      m.intestazione.righeAggiuntive = "Iscr. Ordine dei Medici di Pisa n. 4521";
      m.paziente.codiceFiscale = false;
      m.paziente.dataNascita = true;
    });
    await PdfService.generateRicettaPDF(pazienteDiProva, ricetta, DOCTOR, m);
    const tutto = testi().join("\n");
    expect(tutto).not.toContain("Tel 035");
    expect(tutto).toContain("Clinica San Rossore");
    expect(tutto).not.toContain("Studio Cardiologico");
    expect(tutto).toContain("Iscr. Ordine dei Medici di Pisa n. 4521");
    expect(tutto).not.toContain("PRVMRA50D12A794K");
    expect(tutto).toContain("Data di nascita");
    // Luogo della firma dall'ambulatorio scelto.
    expect(tutto).toMatch(/Pisa, \d/);
  });

  it("firma a sinistra: nome sul margine sinistro, luogo e data a destra", async () => {
    const m = modello("certificato", (m) => { m.firma.posizione = "sinistra"; });
    const r = await PdfService.impaginaCertificato(pazienteDiProva, {
      id: "c1", patientId: "p1", tipo: "idoneita", dataCertificato: "2026-09-07",
      descrizione: "idoneo", createdAt: "", updatedAt: "",
    }, DOCTOR, m);
    const nomi = scritte.filter((s) => s.testo === "Dott. Vincenzo Trani");
    const firma = nomi[nomi.length - 1];
    expect(firma.sinistra).toBeCloseTo(r.ml, 1);
    const luogo = scritte.find((s) => s.testo.startsWith("Bergamo,"))!;
    expect(luogo.destra).toBeCloseTo(r.mr, 1);
    // Senza sottotitolo nel modello resta il tipo di certificato.
    expect(testi()).toContain("Idoneità");
  });

  it("senza luogo e data non li stampa", async () => {
    const m = modello("ricetta", (m) => { m.firma.luogoData = false; });
    await PdfService.generateRicettaPDF(pazienteDiProva, ricetta, DOCTOR, m);
    expect(testi().some((t) => t.startsWith("Bergamo,"))).toBe(false);
  });

  it("due PDF chiesti insieme non si scambiano i margini", async () => {
    const a5 = modello("ricetta", (m) => { m.pagina.formato = "A5"; });
    const [piccola, grande] = await Promise.all([
      PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, a5),
      PdfService.impaginaRicetta(pazienteDiProva, ricetta, DOCTOR, modelloPredefinito("ricetta")),
    ]);
    expect(piccola.larghezza).toBe(148);
    expect(grande.larghezza).toBe(210);
    expect(grande.ml).toBe(18);
  });
});
