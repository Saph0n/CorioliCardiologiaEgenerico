// TEMPORANEO: confronto byte per byte con PdfService.prima.ts. Da cancellare.
import { describe, expect, it, vi } from "vitest";
import type { ModelloStampa } from "../../types/Storage";
import { STILI_PRONTI, VARIANTI, modelloPredefinito, modelloPronto } from "../../utils/modelliStampa";
import { CERTIFICATO_ESEMPIO, PAZIENTE_ESEMPIO, RICETTA_ESEMPIO, RICHIESTA_ESEMPIO, VISITA_ESEMPIO } from "../../data/esempiStampa";
import { pazienteDiProva, visitaDiProva } from "./refertoDiProva";

const DOCTOR = {
  id: "d1", titolo: "Dott." as const, nome: "Vincenzo", cognome: "Trani",
  specializzazione: "Cardiologia", telefono: "035 123456", email: "studio@example.it",
  ambulatori: [{ id: "a1", isPrimario: true, nome: "Studio", indirizzo: "Via Garibaldi 14", cap: "24122", citta: "Bergamo", telefono: "" }],
  createdAt: "", updatedAt: "",
};

vi.mock("../OfflineServices", () => ({
  DoctorService: { getDoctor: async () => DOCTOR },
  PreferenceService: { getPreferences: async () => ({}) },
  VisitService: { getVisitsByPatientId: async () => [] },
}));

const { PdfService: Dopo } = await import("../PdfService");
const { PdfService: Prima } = await import("../PdfService.prima");

async function testo(b: Blob) {
  const t = new TextDecoder("latin1").decode(await b.arrayBuffer());
  return t.split("\n").filter((r) => !/CreationDate|ModDate|\/ID /.test(r)).join("\n");
}

function modelli(documento: ModelloStampa["documento"]): ModelloStampa[] {
  const tutti = [modelloPredefinito(documento)];
  for (const st of STILI_PRONTI) for (const v of VARIANTI) {
    const m = modelloPronto(st, v, documento);
    m.inquadramentoInRiquadri = false;
    tutti.push(m);
  }
  return tutti;
}

describe("confronto", () => {
  it("referti identici senza riquadri", async () => {
    let n = 0;
    for (const m of modelli("referto")) {
      for (const [p, v] of [[pazienteDiProva, visitaDiProva], [PAZIENTE_ESEMPIO, VISITA_ESEMPIO]] as const) {
        const a = await Prima.impaginaVisita(p, v, { modello: m });
        const b = await Dopo.impaginaVisita(p, v, { modello: m });
        expect(await testo(b!.blob), `${m.id} ${v.id}`).toBe(await testo(a!.blob));
        n++;
      }
    }
    expect(n).toBe(22);
  });

  it("ricetta, certificato e richiesta identici", async () => {
    for (const m of modelli("ricetta")) {
      const a = await Prima.impaginaRicetta(PAZIENTE_ESEMPIO, RICETTA_ESEMPIO, DOCTOR, m);
      const b = await Dopo.impaginaRicetta(PAZIENTE_ESEMPIO, RICETTA_ESEMPIO, DOCTOR, m);
      expect(await testo(b.blob), m.id).toBe(await testo(a.blob));
    }
    for (const m of modelli("certificato")) {
      const a = await Prima.impaginaCertificato(PAZIENTE_ESEMPIO, CERTIFICATO_ESEMPIO, DOCTOR, m);
      const b = await Dopo.impaginaCertificato(PAZIENTE_ESEMPIO, CERTIFICATO_ESEMPIO, DOCTOR, m);
      expect(await testo(b.blob), m.id).toBe(await testo(a.blob));
    }
    for (const m of modelli("richiestaEsame")) {
      const a = await Prima.impaginaRichiestaEsame(PAZIENTE_ESEMPIO, RICHIESTA_ESEMPIO, DOCTOR, m);
      const b = await Dopo.impaginaRichiestaEsame(PAZIENTE_ESEMPIO, RICHIESTA_ESEMPIO, DOCTOR, m);
      expect(await testo(b.blob), m.id).toBe(await testo(a.blob));
    }
  });
});

describe("anteprime", () => {
  it("scrive i PDF del Moderno", async () => {
    const fs = await import("node:fs");
    const dir = process.env.ANTEPRIME_DIR!;
    const moderno = STILI_PRONTI.find((s) => s.id === "moderno")!;
    const soloDue = {
      ...VISITA_ESEMPIO,
      visita: { ...VISITA_ESEMPIO.visita!, fibrillazioneAtriale: undefined },
    };
    const casi: [string, ModelloStampa, typeof VISITA_ESEMPIO][] = [
      ["moderno-colori", modelloPronto(moderno, "colore", "referto"), VISITA_ESEMPIO],
      ["moderno-bn", modelloPronto(moderno, "biancoNero", "referto"), VISITA_ESEMPIO],
      ["moderno-due", modelloPronto(moderno, "colore", "referto"), soloDue],
    ];
    for (const [nome, m, v] of casi) {
      const r = await Dopo.impaginaVisita(PAZIENTE_ESEMPIO, v, { modello: m });
      fs.writeFileSync(`${dir}/${nome}.pdf`, Buffer.from(await r!.blob.arrayBuffer()));
    }
  });
});
