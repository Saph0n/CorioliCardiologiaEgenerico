import { describe, expect, it } from "vitest";
import type { Visit } from "../../types/Storage";
import { esamiDelleVisite, NOME_ESAME } from "../esamiVisita";

const visita = (dati: Partial<NonNullable<Visit["visita"]>>): Pick<Visit, "visita"> => ({
  visita: {
    problemaClinico: "",
    prestazione: "",
    esameObiettivo: "",
    accertamenti: "",
    terapiaSpecifica: "",
    ...dati,
  },
});

describe("esami strumentali di una visita (dashboard)", () => {
  it("elenca quelli compilati, nell'ordine della visita", () => {
    expect(
      esamiDelleVisite([
        visita({ holterEcg: { referto: "Ritmo sinusale" }, ecg: { pr: 160 } }),
      ]),
    ).toEqual(["ecg", "holterEcg"]);
  });

  it("un modulo vuoto o con solo spazi non conta", () => {
    expect(
      esamiDelleVisite([visita({ ecg: {}, ecocardiogramma: { referto: "  " } })]),
    ).toEqual([]);
  });

  it("unisce le visite dello stesso giorno senza doppioni", () => {
    expect(
      esamiDelleVisite([
        visita({ ecg: { qrs: 90 } }),
        visita({ ecg: { referto: "Nella norma" }, ecocardiogramma: { fe: 60 } }),
      ]),
    ).toEqual(["ecg", "ecocardiogramma"]);
  });

  it("laboratorio, scompenso e fibrillazione atriale non sono studi", () => {
    expect(
      esamiDelleVisite([
        visita({
          laboratorio: { colesteroloTotale: 200 },
          scompenso: { nyha: "II" },
          fibrillazioneAtriale: { eta: 70 },
        } as Partial<NonNullable<Visit["visita"]>>),
      ]),
    ).toEqual([]);
  });

  it("una visita vecchia senza blocco visita non rompe niente", () => {
    expect(esamiDelleVisite([{ visita: undefined }])).toEqual([]);
  });

  it("ogni esame ha un nome corto da etichetta", () => {
    for (const nome of Object.values(NOME_ESAME)) {
      expect(nome.length).toBeLessThanOrEqual(10);
    }
  });
});
