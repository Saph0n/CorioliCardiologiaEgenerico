import { describe, expect, it } from "vitest";
import {
  FASCE_ETA_CONFERMA_ACUTO,
  FENOTIPI_SCOMPENSO,
  FENOTIPO_DA_DEFINIRE,
  INCREMENTO_MINIMO_HFIMPEF,
  SOGLIA_FE_HFIMPEF,
  SOGLIA_FE_RIDOTTA,
  confondentiNtProBnp,
  fenotipoConStorico,
  fenotipoDaFe,
  riferimentoNtProBnp,
  sogliaConfermaAcuto,
  valutaNtProBnp,
} from "../scompenso";

describe("fenotipo per frazione di eiezione", () => {
  it("separa ridotta e conservata al 50% (ESC 2026)", () => {
    expect(fenotipoDaFe(30)?.chiave).toBe("HFrEF");
    expect(fenotipoDaFe(45)?.chiave).toBe("HFrEF");
    expect(fenotipoDaFe(60)?.chiave).toBe("HFpEF");
  });

  it("il confine è il 50: sotto ridotta, da 50 conservata", () => {
    // ESC 2026 ha eliminato l'HFmrEF: la fascia 41-49% non e' piu' separata e
    // rientra in HFrEF. Il 49 sta con il 30, non con il 50.
    expect(fenotipoDaFe(40)?.chiave).toBe("HFrEF");
    expect(fenotipoDaFe(41)?.chiave).toBe("HFrEF");
    expect(fenotipoDaFe(49)?.chiave).toBe("HFrEF");
    expect(fenotipoDaFe(50)?.chiave).toBe("HFpEF");
  });

  it("spiega il cambio di etichetta a chi era HFmrEF", () => {
    // Un paziente con FE 45% in archivio prima leggeva HFmrEF: senza questa
    // nota l'etichetta cambiata sembrerebbe un errore dell'applicazione.
    expect(fenotipoDaFe(45)?.avvertenza).toContain("ESC 2021");
    expect(fenotipoDaFe(45)?.avvertenza).toContain("HFrEF");
    // Sotto il 41 non c'e' nessun cambiamento da spiegare.
    expect(fenotipoDaFe(35)?.avvertenza).toBeUndefined();
  });

  it("l'HFpEF porta con sé l'avvertenza che la sola FE non basta", () => {
    expect(fenotipoDaFe(60)?.avvertenza).toContain("non definisce");
    expect(fenotipoDaFe(30)?.avvertenza).toBeUndefined();
  });

  it("rifiuta i valori non plausibili invece di inventare un fenotipo", () => {
    expect(fenotipoDaFe(undefined)).toBeNull();
    expect(fenotipoDaFe(0)).toBeNull();
    expect(fenotipoDaFe(-10)).toBeNull();
    expect(fenotipoDaFe(120)).toBeNull();
    expect(fenotipoDaFe(Number.NaN)).toBeNull();
  });
});

describe("soglia di conferma in urgenza", () => {
  it("è stratificata per età", () => {
    expect(sogliaConfermaAcuto(40)).toBe(450);
    expect(sogliaConfermaAcuto(49)).toBe(450);
    expect(sogliaConfermaAcuto(50)).toBe(900);
    expect(sogliaConfermaAcuto(75)).toBe(900);
    expect(sogliaConfermaAcuto(76)).toBe(1800);
  });

  it("senza età non restituisce una soglia", () => {
    expect(sogliaConfermaAcuto(undefined)).toBeNull();
  });
});

describe("NT-proBNP", () => {
  it("senza contesto non da' un giudizio", () => {
    // 200 pg/mL e' sopra soglia in ambulatorio e sotto in urgenza: senza
    // sapere da dove viene il prelievo, qualsiasi risposta sarebbe un caso.
    expect(valutaNtProBnp(200, undefined)).toBeNull();
  });

  it("usa 125 pg/mL in ambulatorio e 300 in urgenza", () => {
    expect(valutaNtProBnp(100, "ambulatoriale")?.livello).toBe("esclusione");
    expect(valutaNtProBnp(200, "ambulatoriale")?.livello).toBe("indeterminato");
    expect(valutaNtProBnp(200, "acuto", 60)?.livello).toBe("esclusione");
    expect(valutaNtProBnp(400, "acuto", 60)?.livello).toBe("indeterminato");
  });

  it("in ambulatorio non conferma mai: manda all'ecocardiogramma", () => {
    const esito = valutaNtProBnp(5000, "ambulatoriale", 80);
    expect(esito?.livello).toBe("indeterminato");
    expect(esito?.nota).toContain("ecocardiogramma");
  });

  it("in urgenza conferma solo oltre la soglia della fascia d'età", () => {
    // Lo stesso valore cambia esito secondo l'eta': 1000 pg/mL conferma a 60
    // anni, resta in fascia grigia a 80.
    expect(valutaNtProBnp(1000, "acuto", 60)?.livello).toBe("conferma");
    expect(valutaNtProBnp(1000, "acuto", 80)?.livello).toBe("indeterminato");
    expect(valutaNtProBnp(2000, "acuto", 80)?.livello).toBe("conferma");
  });

  it("in urgenza senza età si ferma all'esclusione", () => {
    const esito = valutaNtProBnp(1000, "acuto");
    expect(esito?.livello).toBe("indeterminato");
    expect(esito?.nota).toContain("età");
  });

  it("i confini appartengono alla fascia superiore", () => {
    expect(valutaNtProBnp(124, "ambulatoriale")?.livello).toBe("esclusione");
    expect(valutaNtProBnp(125, "ambulatoriale")?.livello).toBe("indeterminato");
    expect(valutaNtProBnp(299, "acuto", 60)?.livello).toBe("esclusione");
    expect(valutaNtProBnp(300, "acuto", 60)?.livello).toBe("indeterminato");
    // La conferma e' "oltre" la soglia: il valore esatto resta in fascia grigia.
    expect(valutaNtProBnp(900, "acuto", 60)?.livello).toBe("indeterminato");
    expect(valutaNtProBnp(901, "acuto", 60)?.livello).toBe("conferma");
  });

  it("scarta i valori assenti o negativi", () => {
    expect(valutaNtProBnp(undefined, "acuto", 60)).toBeNull();
    expect(valutaNtProBnp(-5, "acuto", 60)).toBeNull();
  });
});

describe("confondenti dell'NT-proBNP", () => {
  it("sull'obesità avvisa che un valore basso non esclude", () => {
    const avvisi = confondentiNtProBnp({ bmi: 34 });
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0]).toContain("non esclude");
  });

  it("segnala insufficienza renale, fibrillazione ed età avanzata", () => {
    expect(confondentiNtProBnp({ egfr: 45 })[0]).toContain("eGFR");
    expect(confondentiNtProBnp({ ritmo: "Fibrillazione atriale" })[0]).toContain(
      "Fibrillazione",
    );
    expect(confondentiNtProBnp({ eta: 80 })[0]).toContain("Età");
  });

  it("riconosce il flutter e la sigla FA nel campo ritmo", () => {
    expect(confondentiNtProBnp({ ritmo: "flutter atriale" })).toHaveLength(1);
    expect(confondentiNtProBnp({ ritmo: "FA permanente" })).toHaveLength(1);
    expect(confondentiNtProBnp({ ritmo: "ritmo sinusale" })).toHaveLength(0);
  });

  it("non inventa avvisi quando il quadro è pulito", () => {
    expect(confondentiNtProBnp({ bmi: 24, egfr: 90, ritmo: "sinusale", eta: 50 })).toEqual(
      [],
    );
  });

  it("accumula più avvisi quando i confondenti coesistono", () => {
    expect(confondentiNtProBnp({ bmi: 32, egfr: 40, eta: 80 })).toHaveLength(3);
  });
});

describe("HFimpEF - frazione di eiezione migliorata", () => {
  it("riconosce il miglioramento da FE ridotta a FE oltre il 40%", () => {
    const f = fenotipoConStorico(52, [{ valore: 30, data: "2024-03-12" }]);
    expect(f?.chiave).toBe("HFimpEF");
    expect(f?.riferimento).toContain("30%");
    expect(f?.riferimento).toContain("12/03/2024");
    expect(f?.riferimento).toContain("+22 punti");
  });

  it("richiede tutti e tre i criteri", () => {
    // Incremento insufficiente: 38 -> 45 sono 7 punti, non 10.
    expect(fenotipoConStorico(45, [{ valore: 38, data: "2024-01-01" }])?.chiave).toBe(
      "HFrEF",
    );
    // La FE attuale deve superare il 40%: 30 -> 40 resta HFrEF.
    expect(fenotipoConStorico(40, [{ valore: 25, data: "2024-01-01" }])?.chiave).toBe(
      "HFrEF",
    );
    // La FE di partenza deve essere <= 40%: 45 -> 60 non e' un HFimpEF.
    expect(fenotipoConStorico(60, [{ valore: 45, data: "2024-01-01" }])?.chiave).toBe(
      "HFpEF",
    );
  });

  it("cerca la FE più bassa e non solo l'ultima misura", () => {
    // 30 -> 45 -> 48: guardando solo il 45 il miglioramento sparirebbe dal
    // referto proprio quando si consolida.
    const f = fenotipoConStorico(48, [
      { valore: 30, data: "2023-05-10" },
      { valore: 45, data: "2024-06-01" },
    ]);
    expect(f?.chiave).toBe("HFimpEF");
    expect(f?.riferimento).toContain("30%");
  });

  it("avverte di non sospendere la terapia di fondo", () => {
    const f = fenotipoConStorico(52, [{ valore: 30, data: "2024-03-12" }]);
    expect(f?.avvertenza).toContain("non va sospesa in automatico");
  });

  it("senza storico si comporta come il calcolo sulla sola FE", () => {
    expect(fenotipoConStorico(52)?.chiave).toBe("HFpEF");
    expect(fenotipoConStorico(35, [])?.chiave).toBe("HFrEF");
    expect(fenotipoConStorico(undefined, [{ valore: 30, data: "2024-01-01" }])).toBeNull();
  });

  it("scarta le misure precedenti non plausibili", () => {
    expect(
      fenotipoConStorico(55, [
        { valore: 0, data: "2024-01-01" },
        { valore: Number.NaN, data: "2024-02-01" },
      ])?.chiave,
    ).toBe("HFpEF");
  });
});

describe("fenotipo non attribuibile", () => {
  it("dichiara il motivo invece di lasciare il campo vuoto", () => {
    expect(FENOTIPO_DA_DEFINIRE.label).toBe("Da definire");
    expect(FENOTIPO_DA_DEFINIRE.motivo).toContain("ecocardiogramma");
  });
});

describe("valori di riferimento dell'NT-proBNP", () => {
  it("senza contesto non nomina nessuna soglia", () => {
    // Chi ha scritto un valore senza contesto ha gia' il suo avviso nella
    // maschera: due frasi che dicono la stessa cosa sono una di troppo.
    expect(riferimentoNtProBnp(undefined)).toBeNull();
  });

  it("in ambulatorio dice la sola esclusione", () => {
    const testo = riferimentoNtProBnp("ambulatoriale") ?? "";
    expect(testo).toContain("125");
    expect(testo).toContain("ecocardiogramma");
    expect(testo).not.toContain("300");
  });

  it("in urgenza dice esclusione e conferma per l'eta'", () => {
    const testo = riferimentoNtProBnp("acuto", 80) ?? "";
    expect(testo).toContain("300");
    expect(testo).toContain("1800");
  });

  it("in urgenza senza eta' non inventa la soglia di conferma", () => {
    const testo = riferimentoNtProBnp("acuto") ?? "";
    expect(testo).toContain("300");
    expect(testo).not.toContain("900");
  });

  it("la tabella delle fasce d'eta' da' le soglie della funzione", () => {
    expect(
      FASCE_ETA_CONFERMA_ACUTO.map((f) => sogliaConfermaAcuto(f.etaRappresentativa)),
    ).toEqual([450, 900, 1800]);
  });
});

describe("tabella dei fenotipi per il prontuario", () => {
  it("elenca i tre fenotipi", () => {
    expect(FENOTIPI_SCOMPENSO.map((f) => f.chiave)).toEqual([
      "HFrEF",
      "HFpEF",
      "HFimpEF",
    ]);
  });

  it("scrive gli stessi confini che applica fenotipoDaFe", () => {
    // Una tabella che dicesse 45 mentre il codice taglia a 50 sarebbe peggio
    // di nessuna tabella.
    expect(
      FENOTIPI_SCOMPENSO.find((f) => f.chiave === "HFrEF")?.intervallo,
    ).toContain(String(SOGLIA_FE_RIDOTTA));
    expect(
      FENOTIPI_SCOMPENSO.find((f) => f.chiave === "HFpEF")?.intervallo,
    ).toContain(String(SOGLIA_FE_RIDOTTA));
    expect(fenotipoDaFe(SOGLIA_FE_RIDOTTA - 1)?.chiave).toBe("HFrEF");
    expect(fenotipoDaFe(SOGLIA_FE_RIDOTTA)?.chiave).toBe("HFpEF");
  });

  it("l'HFimpEF porta la soglia e l'incremento che lo definiscono", () => {
    const imp = FENOTIPI_SCOMPENSO.find((f) => f.chiave === "HFimpEF");
    expect(imp?.intervallo).toContain(String(SOGLIA_FE_HFIMPEF));
    expect(imp?.intervallo).toContain(String(INCREMENTO_MINIMO_HFIMPEF));
    // E sono le soglie che la funzione applica davvero.
    expect(
      fenotipoConStorico(SOGLIA_FE_HFIMPEF + INCREMENTO_MINIMO_HFIMPEF, [
        { valore: SOGLIA_FE_HFIMPEF, data: "2026-01-01" },
      ])?.chiave,
    ).toBe("HFimpEF");
    expect(
      fenotipoConStorico(SOGLIA_FE_HFIMPEF, [{ valore: 30, data: "2026-01-01" }])
        ?.chiave,
    ).toBe("HFrEF");
  });
});
