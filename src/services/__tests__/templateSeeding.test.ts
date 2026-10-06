import { beforeEach, describe, expect, it } from "vitest";

/**
 * I modelli predefiniti venivano seminati **solo a store vuoto**: un modello
 * aggiunto dopo — e il cardiologo ne manda a ogni giro — non raggiungeva mai
 * chi aveva gia' l'applicazione installata.
 */
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
});
Object.defineProperty(globalThis, "window", { configurable: true, value: {} });

const { storageService } = await import("../StorageServiceFallback");
const { MedicalTemplates } = await import("../../data/medicalTemplates");

const sezioniVisita = async () => {
  const t = await storageService.getTemplates();
  return new Set(t.filter((x) => x.category === "visita").map((x) => x.section));
};

const etichette = async (sezione: string) => {
  const t = await storageService.getTemplates();
  return t.filter((x) => x.section === sezione).map((x) => x.label);
};

beforeEach(() => {
  store.clear();
});

describe("seed dei modelli della visita", () => {
  it("semina tutte le sezioni presenti nel file dei modelli", async () => {
    // Le sezioni erano elencate a mano e tre erano rimaste indietro: test
    // ergometrico e i due Holter avevano il selettore "Modello" vuoto.
    const attese = Object.keys(MedicalTemplates.visita);
    const ottenute = await sezioniVisita();
    for (const sezione of attese) expect(ottenute).toContain(sezione);
    expect(ottenute).toContain("testErgometrico");
    expect(ottenute).toContain("holterEcg");
    expect(ottenute).toContain("holterPressorio");
  });

  it("porta un modello nuovo anche a chi ha già lo store popolato", async () => {
    // Store di un'installazione vecchia: un solo modello, nessun elenco dei
    // modelli gia' seminati.
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        {
          id: "1",
          category: "visita",
          section: "ecocardiogramma",
          label: "Ecocardiogramma nella norma",
          text: "vecchio",
          isDefault: true,
        },
      ]),
    );

    const eco = await etichette("ecocardiogramma");
    expect(eco).toContain("Ecocardiogramma normale (referto discorsivo)");
    // Il modello gia' presente non viene duplicato ne' sovrascritto.
    expect(eco.filter((l) => l === "Ecocardiogramma nella norma")).toHaveLength(1);
    const t = await storageService.getTemplates();
    expect(t.find((x) => x.label === "Ecocardiogramma nella norma")?.text).toBe("vecchio");
  });

  it("non ripropone a ogni avvio un modello cancellato dal medico", async () => {
    await storageService.getTemplates(); // seed iniziale
    const tutti = await storageService.getTemplates();
    const daCancellare = tutti.find(
      (t) => t.label === "Ecocardiogramma normale (referto discorsivo)",
    )!;
    await storageService.deleteTemplate(daCancellare.id);

    // Riavvio: il modello resta cancellato perche' risulta gia' seminato.
    const dopo = await etichette("ecocardiogramma");
    expect(dopo).not.toContain("Ecocardiogramma normale (referto discorsivo)");
  });

  it("non duplica i modelli a ogni chiamata", async () => {
    const prima = (await storageService.getTemplates()).length;
    await storageService.getTemplates();
    const dopo = (await storageService.getTemplates()).length;
    expect(dopo).toBe(prima);
  });
});

describe("modelli di ogni categoria", () => {
  it("semina anche ricette, esami e certificati", async () => {
    const t = await storageService.getTemplates();
    const categorie = new Set(t.map((x) => x.category));
    // Le terapie non sono piu' una categoria: stanno fra le conclusioni.
    expect(categorie).not.toContain("terapie");
    expect(categorie).toContain("ricette");
    expect(categorie).toContain("esame_complementare");
    expect(categorie).toContain("certificato");
  });

  it("porta gli schemi dietetici anche a chi ha già lo store popolato", async () => {
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        {
          id: "1",
          category: "terapie",
          section: "generale",
          label: "Controllo periodico",
          text: "vecchio",
          isDefault: true,
        },
      ]),
    );
    const t = await storageService.getTemplates();
    const diete = t.filter((x) => x.section === "conclusioni").map((x) => x.label);
    expect(diete).toContain("Dieta mediterranea — impostazione generale");
    expect(diete).toContain("Dieta iposodica — ipertensione e scompenso");
    // Il modello gia' presente, riscritto dal medico, resta com'e'.
    expect(t.find((x) => x.label === "Controllo periodico")?.text).toBe("vecchio");
  });
});

describe("regressione: elenco dei seminati più vecchio dei predefiniti", () => {
  it("non duplica i modelli che il marker non conosce", async () => {
    // Marker scritto da una versione che seminava la sola categoria "visita":
    // non conosce le terapie, che pero' sono gia' nello store.
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        {
          id: "1",
          category: "terapie",
          section: "generale",
          label: "Controllo periodico",
          text: "vecchio",
          isDefault: true,
        },
      ]),
    );
    store.set(
      "AppDottori_templates_seeded",
      JSON.stringify(["visita|ecg|ECG nella norma"]),
    );

    const t = await storageService.getTemplates();
    const controlli = t.filter((x) => x.label === "Controllo periodico");
    expect(controlli).toHaveLength(1);
    expect(controlli[0].text).toBe("vecchio");
    // I modelli davvero nuovi arrivano lo stesso.
    expect(t.some((x) => x.label === "Dieta mediterranea — impostazione generale")).toBe(true);
  });

  it("dopo il riallineamento una cancellazione resta tale", async () => {
    await storageService.getTemplates();
    const tutti = await storageService.getTemplates();
    const bersaglio = tutti.find(
      (x) => x.label === "Dieta mediterranea — impostazione generale",
    )!;
    await storageService.deleteTemplate(bersaglio.id);

    const dopo = await storageService.getTemplates();
    expect(
      dopo.some((x) => x.label === "Dieta mediterranea — impostazione generale"),
    ).toBe(false);
  });
});

describe("nessun doppione", () => {
  it("un'installazione pulita non semina lo stesso modello due volte", async () => {
    const t = await storageService.getTemplates();
    const firme = t.map((x) => `${x.category}|${x.section}|${x.label}`);
    expect(firme.length).toBe(new Set(firme).size);
  });

  it("né dopo più avvii di seguito", async () => {
    await storageService.getTemplates();
    await storageService.getTemplates();
    const t = await storageService.getTemplates();
    const firme = t.map((x) => `${x.category}|${x.section}|${x.label}`);
    expect(firme.length).toBe(new Set(firme).size);
  });
});

describe("accenti nei modelli già in archivio", () => {
  it("corregge i modelli già in archivio una volta sola", async () => {
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        { id: "1", category: "visita", section: "esameObiettivo",
          label: "Idoneità sportiva", text: "Attività fisica regolare.", isDefault: true },
      ]),
    );
    const t = await storageService.getTemplates();
    const mio = t.find((x) => x.id === "1")!;
    expect(mio.text).toBe("Attività fisica regolare.");
    expect(mio.label).toBe("Idoneità sportiva");
    expect(store.get("AppDottori_templates_accenti_v1")).toBe("1");
  });
});

describe("certificato non agonistico: riferimento normativo", () => {
  it("corregge la citazione anche a chi ha gia' il modello in archivio", async () => {
    // La firma di un predefinito e' categoria|sezione|etichetta: cambiando il
    // solo testo la correzione non arriverebbe mai a chi lo ha gia'.
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        {
          id: "1",
          category: "certificato",
          section: "generale",
          label: "Idoneità all'attività sportiva non agonistica",
          text:
            "Il/La sottoscritto/a attesta che ___ non presenta controindicazioni.\n\n" +
            "Il presente certificato ha validità annuale a partire dalla data di " +
            "rilascio, ai sensi del D.M. 24/04/2013 e successive modifiche.",
          isDefault: true,
        },
      ]),
    );

    const t = await storageService.getTemplates();
    const cert = t.find(
      (x) => x.label === "Idoneità all'attività sportiva non agonistica",
    );
    expect(cert?.text).toContain("D.M. 8 agosto 2014");
    // Solo la frase del riferimento: il resto del testo resta quello del medico.
    expect(cert?.text).toContain("non presenta controindicazioni");
    expect(cert?.text).not.toContain("24/04/2013");
  });

  it("porta la voce per l'attività ludico-motoria", async () => {
    const t = await storageService.getTemplates();
    const etichette = t
      .filter((x) => x.category === "certificato")
      .map((x) => x.label);
    expect(etichette).toContain("Idoneità all'attività ludico-motoria");
  });
});

const { MODELLI_RISCRITTI, TERAPIE_RITIRATE } = await import("../../data/modelliRiscritti");

describe("predefiniti riscritti o ritirati (28 settembre 2026)", () => {
  const vecchio = (label: string) =>
    MODELLI_RISCRITTI.find((m) => m.label === label)!;
  const predefinito = (id: string, label: string, text: string) => ({
    id,
    category: "visita",
    section: vecchio(label).section,
    label,
    text,
    isDefault: true,
  });

  it("aggiorna le conclusioni che il medico non ha toccato, e lascia le sue", async () => {
    const norma = vecchio("Quadro nella norma — controllo periodico");
    const stabile = vecchio("Prosecuzione della terapia in atto");
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        predefinito("1", norma.label, norma.vecchio),
        predefinito("2", stabile.label, "Conclusioni: scritto a modo mio."),
      ]),
    );
    const t = await storageService.getTemplates();
    // Il referto stampa gia' il titolo "Conclusioni e terapia".
    expect(t.find((x) => x.id === "1")?.text.startsWith("Conclusioni:")).toBe(false);
    expect(t.find((x) => x.id === "1")?.text).toContain("nei limiti di norma");
    expect(t.find((x) => x.id === "2")?.text).toBe("Conclusioni: scritto a modo mio.");
  });

  it("toglie la terapia dall'anamnesi predefinita: ha la sua sezione", async () => {
    const ischemica = vecchio("Cardiopatia ischemica nota");
    store.set(
      "AppDottori_templates",
      JSON.stringify([predefinito("1", ischemica.label, ischemica.vecchio)]),
    );
    const t = await storageService.getTemplates();
    expect(t.find((x) => x.id === "1")?.text).not.toContain("Terapia in atto");
  });

  it("riscrive i modelli della TC mai toccati e tiene quelli modificati", async () => {
    const negativa = vecchio("TC coronarica negativa");
    const placche = vecchio("TC coronarica con placche");
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        predefinito("1", negativa.label, negativa.vecchio),
        predefinito("2", placche.label, "La mia TC."),
      ]),
    );
    const t = await storageService.getTemplates();
    expect(t.find((x) => x.id === "1")?.text).not.toContain("Calcium score");
    expect(t.find((x) => x.id === "2")?.text).toBe("La mia TC.");
  });

  it("nessuna conclusione ripete il titolo, e la TC non ripete i suoi campi", () => {
    const visita = MedicalTemplates.visita as Record<string, { text: string }[]>;
    for (const t of visita.conclusioni) expect(t.text.startsWith("Conclusioni")).toBe(false);
    // Calcium score e CAD-RADS il referto li stampa dai campi; data e
    // struttura dell'esame il cardiologo le ha tolte dal referto.
    expect(visita.tcCoronarica.length).toBeGreaterThan(0);
    for (const t of visita.tcCoronarica) {
      expect(t.text).not.toMatch(/Calcium score|CAD-RADS|in data ___|presso ___/);
    }
  });
});

describe("ricette predefinite modificate dal medico", () => {
  // Fino al 28 settembre 2026 venivano riportate al testo del file a ogni
  // avvio: la modifica del medico spariva.
  it("restano come le ha scritte lui", async () => {
    await storageService.getTemplates();
    const ricetta = (await storageService.getTemplates()).find(
      (x) => x.category === "ricette" && x.label === "Terapia antiaggregante",
    )!;
    await storageService.updateTemplate(ricetta.id, { text: "Cardioaspirina 100 mg a pranzo." });
    const dopo = (await storageService.getTemplates()).find((x) => x.id === ricetta.id);
    expect(dopo?.text).toBe("Cardioaspirina 100 mg a pranzo.");
  });
});

describe("scheda Terapie unita alle conclusioni (6 ottobre 2026)", () => {
  const terapia = (id: string, label: string, text: string, isDefault = true) => ({
    id, category: "terapie", section: "generale", label, text, isDefault,
  });
  const testoDi = (label: string) =>
    (MedicalTemplates.visita.conclusioni as { label: string; text: string }[])
      .find((t) => t.label === label)!.text;
  const ritirato = (label: string) => TERAPIE_RITIRATE.find((t) => t.label === label)!.vecchio;

  it("un'installazione nuova ha le diete fra le conclusioni e non i doppioni", async () => {
    const t = await storageService.getTemplates();
    const conclusioni = t.filter((x) => x.section === "conclusioni").map((x) => x.label);
    expect(conclusioni).toContain("Quando rivolgersi al Pronto Soccorso");
    expect(conclusioni).toContain("Scompenso cardiaco — liquidi, sale e peso");
    expect(conclusioni).toContain("Dieta chetogenica - informazioni e cautele");
    for (const { label } of TERAPIE_RITIRATE) expect(conclusioni).not.toContain(label);
  });

  it("chi ha l'app installata ritrova le sue terapie fra le conclusioni, senza doppioni", async () => {
    const dieta = "Dieta mediterranea — impostazione generale";
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        terapia("1", dieta, testoDi(dieta)),
        terapia("2", "La mia dieta", "scritta da me", false),
      ]),
    );
    store.set("AppDottori_templates_seeded", JSON.stringify([`terapie|generale|${dieta}`]));

    const t = await storageService.getTemplates();
    expect(t.some((x) => x.category === "terapie")).toBe(false);
    expect(t.filter((x) => x.label === dieta)).toHaveLength(1);
    expect(t.find((x) => x.label === dieta)?.section).toBe("conclusioni");
    const mia = t.find((x) => x.label === "La mia dieta");
    expect(mia).toMatchObject({ category: "visita", section: "conclusioni", text: "scritta da me" });
  });

  it("toglie i doppioni mai toccati, anche con la vecchia grafia degli accenti", async () => {
    const vecchiaGrafia = ritirato("Controllo periodico").replace(/à/g, "a'");
    store.set(
      "AppDottori_templates",
      JSON.stringify([
        terapia("1", "Controllo periodico", vecchiaGrafia),
        terapia("2", "Automonitoraggio pressorio", ritirato("Automonitoraggio pressorio")),
      ]),
    );
    const t = await storageService.getTemplates();
    expect(t.some((x) => x.label === "Controllo periodico")).toBe(false);
    expect(t.some((x) => x.label === "Automonitoraggio pressorio")).toBe(false);
  });

  it("tiene un doppione che il medico ha riscritto", async () => {
    store.set(
      "AppDottori_templates",
      JSON.stringify([terapia("1", "Automonitoraggio pressorio", "Diario due volte al giorno.")]),
    );
    const t = await storageService.getTemplates();
    expect(t.find((x) => x.label === "Automonitoraggio pressorio")).toMatchObject({
      section: "conclusioni",
      text: "Diario due volte al giorno.",
    });
  });

  it("un modello cancellato dalla vecchia scheda non torna", async () => {
    const chetogenica = "Dieta chetogenica - informazioni e cautele";
    store.set(
      "AppDottori_templates",
      JSON.stringify([terapia("1", "Quando rivolgersi al Pronto Soccorso", "x")]),
    );
    store.set(
      "AppDottori_templates_seeded",
      JSON.stringify([`terapie|generale|${chetogenica}`]),
    );
    const t = await storageService.getTemplates();
    expect(t.some((x) => x.label === chetogenica)).toBe(false);
  });

  it("un backup vecchio importato dopo viene sistemato alla lettura", async () => {
    await storageService.getTemplates();
    const correnti = JSON.parse(store.get("AppDottori_templates")!);
    store.set(
      "AppDottori_templates",
      JSON.stringify([...correnti, terapia("x", "Dal backup", "testo", false)]),
    );
    const t = await storageService.getTemplates();
    expect(t.find((x) => x.label === "Dal backup")?.section).toBe("conclusioni");
    expect(t.some((x) => x.category === "terapie")).toBe(false);
  });
});
