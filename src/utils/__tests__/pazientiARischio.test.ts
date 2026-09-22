import { describe, expect, it } from "vitest";
import type { Visit } from "../../types/Storage";
import { pazientiDaTenereDOcchio, riempimentoBarra } from "../pazientiARischio";

/**
 * La colonna "Da tenere d'occhio" della dashboard. Le regole che contano sono
 * due: chi ci entra e in che ordine. Il rischio non lo calcola l'app — la
 * classe e' quella dichiarata dal medico — quindi un paziente senza classe non
 * deve comparire, per quanto brutti siano i suoi esami.
 */

function visita(
  patientId: string,
  dataVisita: string,
  contenuto: Partial<NonNullable<Visit["visita"]>>,
): Visit {
  return {
    id: `${patientId}-${dataVisita}`,
    patientId,
    dataVisita,
    descrizioneClinica: "",
    anamnesi: "",
    esamiObiettivo: "",
    conclusioniDiagnostiche: "",
    terapie: "",
    createdAt: dataVisita,
    updatedAt: dataVisita,
    visita: {
      problemaClinico: "",
      prestazione: "",
      esameObiettivo: "",
      accertamenti: "",
      terapiaSpecifica: "",
      ...contenuto,
    },
  };
}

describe("pazienti da tenere d'occhio", () => {
  it("mette per primo chi ha la classe piu' grave", () => {
    const voci = pazientiDaTenereDOcchio([
      visita("alto", "2026-09-01", { categoriaRischioCv: "alto" }),
      visita("moltoAlto", "2026-09-01", { categoriaRischioCv: "molto-alto" }),
    ]);
    expect(voci.map((v) => v.patientId)).toEqual(["moltoAlto", "alto"]);
  });

  it("a parita' di classe mette per primo chi e' piu' lontano dall'obiettivo", () => {
    const voci = pazientiDaTenereDOcchio([
      visita("vicino", "2026-09-01", {
        categoriaRischioCv: "alto",
        laboratorio: { ldlMisurato: 80 },
      }),
      visita("lontano", "2026-09-01", {
        categoriaRischioCv: "alto",
        laboratorio: { ldlMisurato: 150 },
      }),
    ]);
    expect(voci.map((v) => v.patientId)).toEqual(["lontano", "vicino"]);
    expect(voci[0].scostamento).toBe(80);
    expect(voci[0].obiettivo).toBe(70);
  });

  it("non fa comparire chi non ha una classe dichiarata", () => {
    // L'LDL e' altissimo, ma il rischio lo attribuisce il medico.
    const voci = pazientiDaTenereDOcchio([
      visita("senzaClasse", "2026-09-01", { laboratorio: { ldlMisurato: 220 } }),
    ]);
    expect(voci).toEqual([]);
  });

  it("tiene un rischio basso solo se e' sopra il suo obiettivo", () => {
    const fuori = pazientiDaTenereDOcchio([
      visita("p1", "2026-09-01", {
        categoriaRischioCv: "basso",
        laboratorio: { ldlMisurato: 130 },
      }),
    ]);
    expect(fuori).toHaveLength(1);

    const dentro = pazientiDaTenereDOcchio([
      visita("p1", "2026-09-01", {
        categoriaRischioCv: "basso",
        laboratorio: { ldlMisurato: 90 },
      }),
    ]);
    expect(dentro).toEqual([]);
  });

  it("tiene la classe alta anche quando e' gia' a obiettivo", () => {
    const voci = pazientiDaTenereDOcchio([
      visita("p1", "2026-09-01", {
        categoriaRischioCv: "molto-alto",
        laboratorio: { ldlMisurato: 48 },
      }),
    ]);
    expect(voci).toHaveLength(1);
    expect(voci[0].aTarget).toBe(true);
    expect(voci[0].scostamento).toBeUndefined();
    expect(riempimentoBarra(voci[0])).toBe(0);
  });

  it("prende la classe dall'ultima visita e l'LDL dall'ultimo prelievo", () => {
    // Il controllo di settembre non ha esami: il pannello di marzo e' ancora
    // quello su cui il medico sta ragionando, e non deve sparire.
    const voci = pazientiDaTenereDOcchio([
      visita("p1", "2026-03-10", {
        categoriaRischioCv: "moderato",
        laboratorio: { ldlMisurato: 140, dataPrelievo: "2026-03-01" },
      }),
      visita("p1", "2026-09-10", { categoriaRischioCv: "molto-alto" }),
    ]);
    expect(voci).toHaveLength(1);
    expect(voci[0].categoria).toBe("molto-alto");
    expect(voci[0].dataClasse).toBe("2026-09-10");
    expect(voci[0].ldl).toBe(140);
    expect(voci[0].dataLdl).toBe("2026-03-01");
  });

  it("stima l'LDL con Friedewald quando non e' dosato", () => {
    const voci = pazientiDaTenereDOcchio([
      visita("p1", "2026-09-01", {
        categoriaRischioCv: "alto",
        laboratorio: { colesteroloTotale: 200, hdl: 50, trigliceridi: 150 },
      }),
    ]);
    expect(voci[0].fonteLdl).toBe("stimato");
    expect(Math.round(voci[0].ldl!)).toBe(120);
  });

  it("non taglia fuori chi non ha esami, se la classe e' alta", () => {
    const voci = pazientiDaTenereDOcchio([
      visita("p1", "2026-09-01", { categoriaRischioCv: "alto" }),
    ]);
    expect(voci).toHaveLength(1);
    expect(voci[0].ldl).toBeUndefined();
    expect(riempimentoBarra(voci[0])).toBe(0);
  });

  it("si ferma al numero di righe che la colonna puo' mostrare", () => {
    const visite = Array.from({ length: 9 }, (_, i) =>
      visita(`p${i}`, "2026-09-01", {
        categoriaRischioCv: "alto",
        laboratorio: { ldlMisurato: 100 + i },
      }),
    );
    expect(pazientiDaTenereDOcchio(visite)).toHaveLength(5);
    expect(pazientiDaTenereDOcchio(visite, 3)).toHaveLength(3);
  });
});
