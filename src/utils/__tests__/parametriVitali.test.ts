import { describe, expect, it } from "vitest";
import {
  calcolaBmi,
  categoriaPa,
  classeBmi,
  eAdulto,
  gradoPa,
  haSecondaMisura,
  normalizzaPressione,
  posizioni,
  parsePressione,
  pressioneDifferenziale,
  pressioneMedia,
  rapportoVitaAltezza,
  rischioCirconferenzaVita,
  superficieCorporea,
  valutaOrtostatismo,
} from "../parametriVitali";

describe("pressione arteriosa", () => {
  it("legge solo valori validi", () => {
    expect(parsePressione("120/80")).toEqual({ sistolica: 120, diastolica: 80 });
    expect(parsePressione(" 135 / 85 ")).toEqual({ sistolica: 135, diastolica: 85 });
    expect(parsePressione("")).toBeNull();
    expect(parsePressione("120")).toBeNull();
    expect(parsePressione("80/120")).toBeNull();
  });

  it("calcola media e differenziale", () => {
    expect(pressioneMedia({ sistolica: 120, diastolica: 80 })).toBe(93);
    expect(pressioneDifferenziale({ sistolica: 150, diastolica: 70 })).toBe(80);
  });

  it("classifica secondo ESH 2023, come la Cardiologia: basta uno dei due valori", () => {
    expect(categoriaPa({ sistolica: 118, diastolica: 72 })).toBe("ottimale");
    expect(categoriaPa({ sistolica: 120, diastolica: 80 })).toBe("normale");
    expect(categoriaPa({ sistolica: 115, diastolica: 82 })).toBe("normale");
    expect(categoriaPa({ sistolica: 129, diastolica: 84 })).toBe("normale");
    expect(categoriaPa({ sistolica: 130, diastolica: 70 })).toBe("normale-alta");
    expect(categoriaPa({ sistolica: 125, diastolica: 85 })).toBe("normale-alta");
    expect(categoriaPa({ sistolica: 139, diastolica: 89 })).toBe("normale-alta");
    expect(categoriaPa({ sistolica: 130, diastolica: 90 })).toBe("grado-1");
    expect(categoriaPa({ sistolica: 140, diastolica: 60 })).toBe("grado-1");
    expect(categoriaPa({ sistolica: 165, diastolica: 80 })).toBe("grado-2");
    expect(categoriaPa({ sistolica: 150, diastolica: 112 })).toBe("grado-3");
  });

  it("segnala l'ipotensione sotto 90 di sistolica", () => {
    expect(categoriaPa({ sistolica: 85, diastolica: 55 })).toBe("ipotensione");
    expect(categoriaPa({ sistolica: 90, diastolica: 60 })).toBe("ottimale");
    // Una diastolica alta conta di piu' della sistolica bassa.
    expect(categoriaPa({ sistolica: 88, diastolica: 86 })).toBe("normale-alta");
  });

  it("gradua l'ipertensione come ESH 2023", () => {
    expect(gradoPa({ sistolica: 138, diastolica: 88 })).toBe(0);
    expect(gradoPa({ sistolica: 150, diastolica: 85 })).toBe(1);
    expect(gradoPa({ sistolica: 150, diastolica: 102 })).toBe(2);
    expect(gradoPa({ sistolica: 182, diastolica: 95 })).toBe(3);
  });
});

describe("prova ortostatica", () => {
  it("serve una seconda misura, in posizione diversa, con due pressioni valide", () => {
    expect(valutaOrtostatismo({ pressioneArteriosa: "130/80" })).toBeNull();
    expect(
      valutaOrtostatismo({ pressioneArteriosa: "130/80", pressioneArteriosa2: "110/70", posizionePa2: "clino" }),
    ).toBeNull();
    expect(valutaOrtostatismo({ pressioneArteriosa: "", pressioneArteriosa2: "110/70" })).toBeNull();
    expect(valutaOrtostatismo({ pressioneArteriosa: "130/80", frequenzaCardiaca2: "90" })).toBeNull();
  });

  it("senza posizioni la prima e' clino e la seconda orto", () => {
    expect(posizioni({})).toEqual({ prima: "clino", seconda: "orto" });
    const esito = valutaOrtostatismo({
      pressioneArteriosa: "140/85",
      frequenzaCardiaca: "68",
      pressioneArteriosa2: "118/78",
      frequenzaCardiaca2: "72",
    });
    expect(esito?.caloSistolico).toBe(22);
    expect(esito?.caloDiastolico).toBe(7);
    expect(esito?.deltaFc).toBe(4);
    expect(esito?.ipotensioneOrtostatica).toBe(true);
    expect(esito?.rapportoFcPas).toBe(0.18);
  });

  it("con la prima in orto e la seconda in clino confronta nel verso giusto", () => {
    const esito = valutaOrtostatismo({
      pressioneArteriosa: "110/70",
      posizionePa: "orto",
      pressioneArteriosa2: "135/80",
      posizionePa2: "clino",
    });
    expect(esito?.clino.pa).toEqual({ sistolica: 135, diastolica: 80 });
    expect(esito?.caloSistolico).toBe(25);
    expect(esito?.ipotensioneOrtostatica).toBe(true);
  });

  it("basta il calo diastolico di 10, ma allora il rapporto FC/PAS non si calcola", () => {
    const esito = valutaOrtostatismo({
      pressioneArteriosa: "130/85",
      frequenzaCardiaca: "70",
      pressioneArteriosa2: "122/74",
      frequenzaCardiaca2: "95",
    });
    expect(esito?.ipotensioneOrtostatica).toBe(true);
    expect(esito?.rapportoFcPas).toBeNull();
  });

  it("un calo di 19/9 non e' ipotensione ortostatica", () => {
    const esito = valutaOrtostatismo({ pressioneArteriosa: "130/85", pressioneArteriosa2: "111/76" });
    expect(esito?.ipotensioneOrtostatica).toBe(false);
  });

  it("segnala la tachicardia senza calo pressorio, con soglia piu' alta fra 12 e 19 anni", () => {
    const v = {
      pressioneArteriosa: "120/75",
      frequenzaCardiaca: "70",
      pressioneArteriosa2: "120/78",
      frequenzaCardiaca2: "104",
    };
    expect(valutaOrtostatismo(v, 35)?.tachicardiaOrtostatica).toBe(true);
    expect(valutaOrtostatismo(v, 16)?.tachicardiaOrtostatica).toBe(false);
    expect(valutaOrtostatismo(v, 35)?.deltaFc).toBe(34);
  });

  it("una pressione che sale in piedi non da' calo negativo", () => {
    const esito = valutaOrtostatismo({ pressioneArteriosa: "120/75", pressioneArteriosa2: "130/85" });
    expect(esito?.caloSistolico).toBe(0);
    expect(esito?.caloDiastolico).toBe(0);
    expect(esito?.deltaSistolica).toBe(10);
  });

  it("segnala la misura in clino da 140/90 in su", () => {
    expect(
      valutaOrtostatismo({ pressioneArteriosa: "150/92", pressioneArteriosa2: "125/85" })?.ipertensioneInClino,
    ).toBe(true);
    expect(
      valutaOrtostatismo({ pressioneArteriosa: "130/80", pressioneArteriosa2: "105/72" })?.ipertensioneInClino,
    ).toBe(false);
  });

  it("sa se la seconda misura e' compilata", () => {
    expect(haSecondaMisura({ pressioneArteriosa2: " " })).toBe(false);
    expect(haSecondaMisura({ frequenzaCardiaca2: "80" })).toBe(true);
    expect(haSecondaMisura(null)).toBe(false);
  });
});

describe("misure corporee", () => {
  it("BMI e classi OMS", () => {
    expect(calcolaBmi(70, 175)).toBe(22.9);
    expect(calcolaBmi(0, 175)).toBeNull();
    expect(classeBmi(18.4)).toBe("sottopeso");
    expect(classeBmi(24.9)).toBe("normopeso");
    expect(classeBmi(29.9)).toBe("sovrappeso");
    expect(classeBmi(30)).toBe("obesita-1");
    expect(classeBmi(35)).toBe("obesita-2");
    expect(classeBmi(40)).toBe("obesita-3");
  });

  it("superficie corporea con Mosteller", () => {
    expect(superficieCorporea(70, 175)).toBe(1.84);
  });

  it("circonferenza vita con le soglie per sesso", () => {
    expect(rischioCirconferenzaVita(95, "M")).toBe("aumentato");
    expect(rischioCirconferenzaVita(102, "M")).toBe("molto-aumentato");
    expect(rischioCirconferenzaVita(85, "F")).toBe("aumentato");
    expect(rischioCirconferenzaVita(88, "F")).toBe("molto-aumentato");
    expect(rischioCirconferenzaVita(79, "F")).toBe("normale");
    expect(rischioCirconferenzaVita(100, undefined)).toBeNull();
    expect(rapportoVitaAltezza(90, 175)).toBe(0.51);
  });
});

describe("scrittura della pressione", () => {
  it("mette la barra se manca", () => {
    expect(normalizzaPressione("12080")).toBe("120/80");
    expect(normalizzaPressione("9060")).toBe("90/60");
    expect(normalizzaPressione("180110")).toBe("180/110");
    expect(normalizzaPressione(" 135 / 85 ")).toBe("135/85");
    expect(normalizzaPressione("")).toBe("");
  });
});

describe("correzioni della revisione", () => {
  it("con cinque cifre sceglie la divisione valida, se no lascia il testo", () => {
    expect(normalizzaPressione("95100")).toBe("95100");
    expect(normalizzaPressione("1009")).toBe("1009");
    expect(normalizzaPressione("15095")).toBe("150/95");
  });

  it("riconosce l'eta' adulta", () => {
    expect(eAdulto(17)).toBe(false);
    expect(eAdulto(18)).toBe(true);
    expect(eAdulto(null)).toBe(true);
  });
});
