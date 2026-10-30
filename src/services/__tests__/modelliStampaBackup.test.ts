import { beforeEach, describe, expect, it } from "vitest";
import { duplicaModello, modelloPredefinito } from "../../utils/modelliStampa";

/**
 * I modelli di stampa nel backup: escono con l'esportazione, tornano con la
 * sostituzione totale (che cancella le chiavi dell'app, loro comprese) e
 * nell'unione si aggiungono senza cambiare il modello in uso.
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

const { BackupService, ModelliStampaService } = await import("../OfflineServices");

const fileDi = (contenuto: unknown) =>
  new File([JSON.stringify(contenuto)], "backup.json", { type: "application/json" });

async function esporta() {
  return JSON.parse(await (await BackupService.exportData()).text());
}

const studio = duplicaModello(modelloPredefinito("referto"), [], "Studio");
const clinica = duplicaModello(modelloPredefinito("referto"), [], "Clinica");

beforeEach(async () => {
  store.clear();
  await ModelliStampaService.salvaArchivio({ modelli: [studio], inUso: { referto: studio.id } });
});

describe("modelli di stampa nel backup", () => {
  it("escono con il backup", async () => {
    const backup = await esporta();
    expect(backup.modelliStampa.modelli.map((m: { nome: string }) => m.nome)).toEqual(["Studio"]);
    expect(backup.modelliStampa.inUso.referto).toBe(studio.id);
  });

  it("senza modelli il backup porta la voce vuota", async () => {
    await ModelliStampaService.salvaArchivio({ modelli: [], inUso: {} });
    expect((await esporta()).modelliStampa).toEqual({ modelli: [], inUso: {} });
  });

  it("un backup di prima dei modelli non cancella quelli che ci sono", async () => {
    const vecchio = await esporta();
    delete vecchio.modelliStampa;
    await BackupService.importData(fileDi(vecchio), "replace");
    expect((await ModelliStampaService.getArchivio()).modelli.map((m) => m.nome)).toEqual(["Studio"]);
  });

  it("un backup con i modelli vuoti li toglie", async () => {
    const backup = await esporta();
    backup.modelliStampa = { modelli: [], inUso: {} };
    await BackupService.importData(fileDi(backup), "replace");
    expect((await ModelliStampaService.getArchivio()).modelli).toEqual([]);
  });

  it("la sostituzione totale li rimette com'erano nel backup", async () => {
    const backup = await esporta();
    await ModelliStampaService.salvaArchivio({ modelli: [clinica], inUso: { referto: clinica.id } });
    await BackupService.importData(fileDi(backup), "replace");
    const archivio = await ModelliStampaService.getArchivio();
    expect(archivio.modelli.map((m) => m.nome)).toEqual(["Studio"]);
    expect((await ModelliStampaService.getModelloInUso("referto")).id).toBe(studio.id);
  });

  it("l'unione aggiunge quelli nuovi e lascia il modello in uso", async () => {
    const backup = await esporta();
    backup.modelliStampa = { modelli: [studio, clinica], inUso: { referto: clinica.id } };
    await BackupService.importData(fileDi(backup), "merge");
    const archivio = await ModelliStampaService.getArchivio();
    expect(archivio.modelli.map((m) => m.nome)).toEqual(["Studio", "Clinica"]);
    expect(archivio.inUso.referto).toBe(studio.id);
  });
});
