import { beforeEach, describe, expect, it } from "vitest";

/**
 * L'archivio di prova della guida di primo avvio: pazienti inventati che
 * esistono solo finche' la guida e' aperta. La cosa da verificare e' che
 * l'archivio vero non veda mai niente di loro, e che quello che il medico
 * sistema durante la guida (preferenze, modelli) resti.
 *
 * Fuori da Electron l'app usa localStorage: qui e' una mappa.
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

const {
  apriArchivioDiProva,
  chiudiArchivioDiProva,
  archivioDiProvaAperto,
  conteggiArchivioReale,
  storageService,
} = await import("../StorageServiceFallback");
const { PatientService, VisitService, PreferenceService, TemplateService } = await import(
  "../OfflineServices"
);
const { creaArchivioDiProva, PAZIENTE_DELLA_PROVA } = await import(
  "../../components/guida/archivioDiProva"
);
const { cercaPazienti } = await import("../../utils/ricercaPazienti");
const { pazientiDaTenereDOcchio } = await import("../../utils/pazientiARischio");
const { chiaveBozzaVisita, leggiBozzaVisita, scriviBozzaVisita } = await import(
  "../../utils/bozzaVisita"
);

const OGGI = new Date(2026, 8, 28, 10, 0);

const visitaVuota = (patientId: string) => ({
  patientId,
  dataVisita: "2026-09-28",
  descrizioneClinica: "",
  anamnesi: "",
  esamiObiettivo: "",
  conclusioniDiagnostiche: "",
  terapie: "",
});

/** Le chiavi cliniche dell'archivio vero, come stanno sul disco. */
const archivioVeroGrezzo = () =>
  [...store.entries()].filter(([k]) => /patients|visits|ricette|richieste|bozza/.test(k));

beforeEach(async () => {
  chiudiArchivioDiProva();
  store.clear();
  await PatientService.addPatient({
    nome: "Anna", cognome: "Neri", dataNascita: "1985-12-10", luogoNascita: "Milano", sesso: "F",
  });
});

describe("archivio di prova", () => {
  it("mostra i pazienti inventati al posto di quelli veri, e alla chiusura li toglie", async () => {
    apriArchivioDiProva(creaArchivioDiProva(OGGI));
    expect(archivioDiProvaAperto()).toBe(true);
    const cognomi = (await PatientService.getAllPatients()).map((p) => p.cognome);
    expect(cognomi).toContain("Martelli");
    expect(cognomi).not.toContain("Neri");

    chiudiArchivioDiProva();
    expect((await PatientService.getAllPatients()).map((p) => p.cognome)).toEqual(["Neri"]);
  });

  it("non scrive niente nell'archivio vero: visite, ricette, bozze restano in memoria", async () => {
    const prima = JSON.stringify(archivioVeroGrezzo());
    apriArchivioDiProva(creaArchivioDiProva(OGGI));

    const visita = await VisitService.addVisit(visitaVuota(PAZIENTE_DELLA_PROVA.id));
    await VisitService.updateVisit(visita.id, { esamiObiettivo: "Nella norma" });
    const nuovo = await PatientService.addPatient({
      nome: "Mario", cognome: "Rossi", dataNascita: "1980-01-01", luogoNascita: "Roma", sesso: "M",
    });
    await PatientService.deletePatient(nuovo.id);
    const chiave = chiaveBozzaVisita(undefined, PAZIENTE_DELLA_PROVA.id);
    await scriviBozzaVisita(chiave, {
      salvataIl: new Date().toISOString(),
      visitData: {},
      visitaData: {},
      anamnesiStrutturata: {},
    });
    expect(await leggiBozzaVisita(chiave)).not.toBeNull();

    chiudiArchivioDiProva();
    expect(JSON.stringify(archivioVeroGrezzo())).toBe(prima);
    expect(await leggiBozzaVisita(chiave)).toBeNull();
    expect(await VisitService.getAllRevisions()).toEqual([]);
  });

  // Il medico sistema lo studio durante la guida: quello resta suo.
  it("tiene nell'archivio vero preferenze e modelli toccati durante la prova", async () => {
    apriArchivioDiProva(creaArchivioDiProva(OGGI));
    await PreferenceService.savePreferences({ moduliVisita: { ecocardiogramma: true } });
    const modello = await TemplateService.addTemplate({
      category: "visita", section: "esameObiettivo", label: "Mio modello", text: "Testo",
    });
    chiudiArchivioDiProva();

    expect(await PreferenceService.getPreferences()).toEqual({ moduliVisita: { ecocardiogramma: true } });
    expect((await TemplateService.getAllTemplates()).some((t) => t.id === modello.id)).toBe(true);
  });

  // Una scrittura partita nella prova non deve finire nell'archivio vero
  // perche' la guida si e' chiusa mentre era in corso.
  it("finisce nella prova l'operazione cominciata nella prova", async () => {
    apriArchivioDiProva(creaArchivioDiProva(OGGI));
    const inCorso = VisitService.addVisit(visitaVuota(PAZIENTE_DELLA_PROVA.id));
    chiudiArchivioDiProva();
    await inCorso;
    expect(await VisitService.getAllVisits()).toEqual([]);
  });

  it("rifiuta backup e reset durante la prova", async () => {
    apriArchivioDiProva(creaArchivioDiProva(OGGI));
    await expect(storageService.exportData()).rejects.toThrow(/guida/);
    await expect(storageService.clearAllData()).rejects.toThrow(/guida/);
    chiudiArchivioDiProva();
    expect((await storageService.exportData()).patients).toHaveLength(1);
  });

  it("conta per la telemetria solo l'archivio vero", async () => {
    apriArchivioDiProva(creaArchivioDiProva(OGGI));
    expect(await conteggiArchivioReale()).toEqual({ pazienti: 1, visite: 0 });
  });
});

describe("pazienti dell'archivio di prova", () => {
  const { patients, visits } = creaArchivioDiProva(OGGI);
  const visiteDi = (id: string) => visits.filter((v) => v.patientId === id);

  it("si trovano per cognome, come li cerca il medico", () => {
    const trovati = cercaPazienti(patients, "Mart");
    expect(trovati.map((p) => p.id)).toEqual([PAZIENTE_DELLA_PROVA.id]);
  });

  // Il grafico dell'andamento compare da due prelievi in su.
  it("danno al paziente della prova piu' prelievi, per il grafico", () => {
    const conColesterolo = visiteDi(PAZIENTE_DELLA_PROVA.id).filter(
      (v) => v.visita?.laboratorio?.colesteroloTotale,
    );
    expect(conColesterolo.length).toBeGreaterThanOrEqual(2);
  });

  it("riempiono la colonna dei pazienti a rischio, col paziente della prova in cima", () => {
    const voci = pazientiDaTenereDOcchio(visits);
    expect(voci.length).toBeGreaterThanOrEqual(3);
    expect(voci[0].patientId).toBe(PAZIENTE_DELLA_PROVA.id);
    expect(voci[0].aTarget).toBe(false);
  });

  // La visita di oggi e' quella che il medico scrive nella prova.
  it("hanno visite tutte passate, nessuna di oggi", () => {
    for (const v of visits) expect(v.dataVisita < "2026-09-28").toBe(true);
    for (const p of patients) {
      expect(p.createdAt).not.toBe("");
      expect(visiteDi(p.id).length).toBeGreaterThan(0);
    }
  });

  it("non ripetono id ne' codici fiscali", () => {
    expect(new Set(patients.map((p) => p.id)).size).toBe(patients.length);
    expect(new Set(visits.map((v) => v.id)).size).toBe(visits.length);
    expect(new Set(patients.map((p) => p.codiceFiscale)).size).toBe(patients.length);
  });
});
