import { describe, expect, it } from "vitest";
import type { Visit } from "../../types/Storage";
import { pazientiDaTenereDOcchio, segmentiLdl } from "../pazientiARischio";

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
    // 48 su 55: la meta' dell'obiettivo quasi piena, niente oltre la tacca.
    expect(segmentiLdl(voci[0])).toEqual({ entro: 9, oltre: 0 });
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
    expect(segmentiLdl(voci[0])).toBeNull();
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

describe("segmentiLdl", () => {
  // Obiettivo a meta' di 20 segmenti: ognuno vale un decimo dell'obiettivo.
  it("accende la meta' dell'obiettivo e, oltre la tacca, lo scostamento", () => {
    // Molto alto, 100 contro 55: +45 sono 8 segmenti da 5,5 mg/dL.
    expect(segmentiLdl({ ldl: 100, obiettivo: 55, scostamento: 45 })).toEqual({
      entro: 10,
      oltre: 8,
    });
  });

  it("da' almeno un segmento oltre la tacca a chi e' sopra di poco", () => {
    // 56 contro 55: arrotondando sarebbero zero segmenti, e il disegno
    // direbbe "a obiettivo" accanto a un +1.
    expect(segmentiLdl({ ldl: 56, obiettivo: 55, scostamento: 1 })).toEqual({
      entro: 10,
      oltre: 1,
    });
  });

  it("si ferma al doppio dell'obiettivo", () => {
    expect(segmentiLdl({ ldl: 300, obiettivo: 70, scostamento: 230 })).toEqual({
      entro: 10,
      oltre: 10,
    });
  });

  it("segue il numero di segmenti chiesto", () => {
    expect(segmentiLdl({ ldl: 105, obiettivo: 70, scostamento: 35 }, 40)).toEqual({
      entro: 20,
      oltre: 10,
    });
  });
});
