import { DoctorService, DocumentService, PatientService } from "./OfflineServices";
import { storageService } from "./StorageServiceFallback";
import { runDailyAutoBackup } from "./BackupFileService";

/**
 * Inizializzazione dati all'avvio.
 *
 * Nota storica: le prime versioni caricavano 10 pazienti demo. La rimozione di quei
 * dati è una **migrazione una-tantum**, non un controllo da ripetere a ogni avvio:
 * girare per sempre significherebbe cancellare senza conferma un paziente reale che
 * per coincidenza abbia uno dei codici fiscali demo.
 */

/** Flag persistente (KV in Electron, localStorage nel browser) della migrazione già eseguita. */
const DEMO_CLEANUP_FLAG = "demo_cleanup_done_v1";

/**
 * Pazienti demo storici: identificati da CF **e** email `@example.com`.
 * Il doppio criterio evita di toccare un paziente reale con lo stesso codice fiscale.
 */
const DEMO_PATIENTS: ReadonlyArray<{ cf: string; email: string }> = [
  { cf: "RSSMRA80A01H501U", email: "mario.rossi@example.com" },
  { cf: "BNCLRA90B10F205Z", email: "laura.bianchi@example.com" },
  { cf: "VRDGPP75C15L219X", email: "giuseppe.verdi@example.com" },
  { cf: "FRRGLI85D20H501T", email: "giulia.ferrari@example.com" },
  { cf: "MRNLCU92E15F839K", email: "luca.marini@example.com" },
  { cf: "CSTFNC88F25L736W", email: "francesca.costa@example.com" },
  { cf: "GRSMTT95G10A662R", email: "matteo.grassi@example.com" },
  { cf: "RCCSLV93H15L219B", email: "silvia.ricci@example.com" },
  { cf: "BRBMRC87I20D612Q", email: "marco.barbieri@example.com" },
  { cf: "PLLCLD91L30F205H", email: "claudia.pellegrini@example.com" },
];

const DEMO_DOCUMENT_TITLES: ReadonlySet<string> = new Set([
  "Corso ECM - Aggiornamenti in Cardiologia 2024",
  "Certificato Specializzazione Medicina Interna",
  "Webinar: Nuove Linee Guida Diabete Tipo 2",
]);

function normalize(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Rimozione dei dati demo storici. Eseguita al massimo una volta per installazione. */
async function runDemoCleanupOnce(): Promise<void> {
  const alreadyDone = await storageService.getPreference(DEMO_CLEANUP_FLAG);
  if (alreadyDone === "true") return;

  const demoByCf = new Map(
    DEMO_PATIENTS.map((d) => [d.cf.toUpperCase(), normalize(d.email)]),
  );

  const patients = await PatientService.getAllPatients();
  for (const p of patients) {
    const cf = String(p.codiceFiscale ?? "").trim().toUpperCase();
    if (!cf) continue;
    const expectedEmail = demoByCf.get(cf);
    // Entrambi i criteri devono corrispondere: mai cancellare un paziente reale.
    if (expectedEmail && normalize(p.email) === expectedEmail) {
      await PatientService.deletePatient(p.id);
    }
  }

  const documents = await DocumentService.getAllDocuments();
  if (Array.isArray(documents)) {
    for (const d of documents) {
      if (DEMO_DOCUMENT_TITLES.has(d.title)) {
        await DocumentService.deleteDocument(d.id);
      }
    }
  }

  await storageService.setPreference(DEMO_CLEANUP_FLAG, "true");
}

/** L'avvio in corso, condiviso fra chi lo lancia e chi lo aspetta. */
let avvio: Promise<void> | null = null;

/**
 * Inizializzazione all'avvio: profilo dottore di default + migrazione dati demo (una tantum).
 * Non lancia mai: un errore qui non deve impedire l'apertura dell'app.
 *
 * La promessa si risolve quando c'e' quello che serve alla prima pagina; il
 * backup giornaliero continua dopo, senza trattenere l'interfaccia.
 */
export function initializeAppData(): Promise<void> {
  const corrente = (async () => {
    try {
      await DoctorService.initializeDefaultDoctor();
    } catch (error) {
      console.error("Inizializzazione profilo dottore non riuscita:", error);
    }

    try {
      await runDemoCleanupOnce();
    } catch (error) {
      console.error("Migrazione dati demo non riuscita:", error);
    }
  })();
  avvio = corrente;

  // Copia di sicurezza giornaliera del database (una sola per giorno).
  void corrente.then(() =>
    runDailyAutoBackup().catch((error) => {
      console.error("Backup automatico non riuscito:", error);
    }),
  );
  return corrente;
}

/** Si risolve quando l'avvio e' finito (subito, se non e' mai partito). */
export function datiPronti(): Promise<void> {
  return avvio ?? Promise.resolve();
}
