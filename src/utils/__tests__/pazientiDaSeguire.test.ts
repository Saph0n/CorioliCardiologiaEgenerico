import { describe, expect, it } from "vitest";
import type { Patient, Visit } from "../../types/Storage";
import { pazientiDaSeguire, valutaPaziente } from "../pazientiDaSeguire";

function paziente(id: string, extra: Partial<Patient> = {}): Patient {
  return {
    id,
    nome: "Mario",
    cognome: id,
    dataNascita: "1960-01-01",
    luogoNascita: "Siena",
    sesso: "M",
    altezza: 175,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

let n = 0;
function visita(patientId: string, data: string, v: Partial<NonNullable<Visit["visita"]>>): Visit {
  n += 1;
  return {
    id: `v${n}`,
    patientId,
    dataVisita: data,
    descrizioneClinica: "",
    anamnesi: "",
    esamiObiettivo: "",
    conclusioniDiagnostiche: "",
    terapie: "",
    tipo: "generale",
    visita: {
      problemaClinico: "",
      prestazione: "",
      esameObiettivo: "",
      accertamenti: "",
      terapiaSpecifica: "",
      ...v,
    },
    createdAt: `${data}T10:00:00.000Z`,
    updatedAt: `${data}T10:00:00.000Z`,
  };
}

describe("pazienti da seguire", () => {
  it("conta solo l'ultima pressione misurata", () => {
    const p = paziente("rossi");
    const visite = [
      visita("rossi", "2025-01-10", { pressioneArteriosa: "165/100" }),
      visita("rossi", "2026-03-10", { pressioneArteriosa: "128/80" }),
    ];
    expect(valutaPaziente(p, visite)).toBeNull();
  });

  it("prende il peso da una visita e la pressione da un'altra", () => {
    const p = paziente("bianchi");
    const visite = [
      visita("bianchi", "2026-01-10", { pesoCorporeo: 100 }),
      visita("bianchi", "2026-05-10", { pressioneArteriosa: "150/92" }),
    ];
    const voce = valutaPaziente(p, visite)!;
    expect(voce.segnalazioni.map((s) => s.motivo)).toEqual(["pressione", "peso"]);
    expect(voce.segnalazioni[1].valore).toBe("BMI 32,7");
    expect(voce.ultimaVisita).toBe("2026-05-10");
  });

  it("senza altezza in anagrafica il peso non basta per il BMI", () => {
    const p = paziente("verdi", { altezza: undefined });
    expect(valutaPaziente(p, [visita("verdi", "2026-01-10", { pesoCorporeo: 120 })])).toBeNull();
  });

  it("segnala l'ipotensione ortostatica dell'ultima prova", () => {
    const p = paziente("neri");
    const voce = valutaPaziente(p, [
      visita("neri", "2026-02-01", {
        pressioneArteriosa: "130/80",
        posizionePa: "clino",
        frequenzaCardiaca: "70",
        pressioneArteriosa2: "105/72",
        posizionePa2: "orto",
        frequenzaCardiaca2: "74",
      }),
    ])!;
    expect(voce.segnalazioni[0]).toMatchObject({
      motivo: "ortostatismo",
      livello: 2,
      valore: "−25/8",
    });
  });

  it("ordina per livello, poi per numero di motivi", () => {
    const pazienti = [paziente("a"), paziente("b"), paziente("c")];
    const visite = [
      visita("a", "2026-01-01", { pressioneArteriosa: "145/90" }),
      visita("b", "2026-01-01", { pressioneArteriosa: "185/112" }),
      visita("c", "2026-01-01", { pressioneArteriosa: "142/88", pesoCorporeo: 95 }),
    ];
    expect(pazientiDaSeguire(pazienti, visite).map((v) => v.patientId)).toEqual(["b", "c", "a"]);
    expect(pazientiDaSeguire(pazienti, visite, 2)).toHaveLength(2);
  });
});

describe("dettaglio del peso", () => {
  it("scrive la classe con il numero romano maiuscolo", () => {
    const p = paziente("gialli", { altezza: 170 });
    const voce = valutaPaziente(p, [visita("gialli", "2026-01-10", { pesoCorporeo: 125 })])!;
    expect(voce.segnalazioni[0].dettaglio).toBe("obesità III");
  });
});

describe("pazienti minorenni", () => {
  it("non entrano per pressione o peso: servono i percentili", () => {
    const p = paziente("piccoli", { dataNascita: "2012-05-01", altezza: 150 });
    const visite = [visita("piccoli", "2026-05-10", { pressioneArteriosa: "145/92", pesoCorporeo: 80 })];
    expect(valutaPaziente(p, visite)).toBeNull();
  });

  it("entrano per la prova ortostatica, con la soglia di FC dei 12-19 anni", () => {
    const p = paziente("ragazzi", { dataNascita: "2010-01-01" });
    const prova = { pressioneArteriosa: "110/70", frequenzaCardiaca: "70", pressioneArteriosa2: "112/74" };
    expect(
      valutaPaziente(p, [visita("ragazzi", "2026-03-01", { ...prova, frequenzaCardiaca2: "105" })]),
    ).toBeNull();
    expect(
      valutaPaziente(p, [visita("ragazzi", "2026-03-01", { ...prova, frequenzaCardiaca2: "112" })])
        ?.segnalazioni[0],
    ).toMatchObject({ motivo: "ortostatismo", valore: "FC +42" });
  });

  it("conta l'eta' alla data della visita, non quella di oggi", () => {
    // 17 anni alla visita del 2025, maggiorenne oggi: la pressione di allora
    // non si giudica con le soglie dell'adulto.
    const p = paziente("cresciuti", { dataNascita: "2008-01-01" });
    expect(
      valutaPaziente(p, [visita("cresciuti", "2025-06-01", { pressioneArteriosa: "150/95" })]),
    ).toBeNull();
    expect(
      valutaPaziente(p, [visita("cresciuti", "2026-06-01", { pressioneArteriosa: "150/95" })]),
    ).not.toBeNull();
  });
});

describe("seconda misurazione nella stessa posizione", () => {
  it("due misure in clino non sono una prova ortostatica", () => {
    const p = paziente("doppie");
    const v = visita("doppie", "2026-04-01", {
      pressioneArteriosa: "130/80",
      pressioneArteriosa2: "100/65",
      posizionePa2: "clino",
    });
    expect(valutaPaziente(p, [v])).toBeNull();
  });
});
