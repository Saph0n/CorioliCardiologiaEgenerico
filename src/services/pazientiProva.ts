/**
 * Scrive in archivio e cancella i pazienti di prova della guida (i dati sono
 * in `utils/pazientiProva.ts`).
 *
 * Esistono solo finche' dura la prova: la guida li scrive quando comincia e li
 * cancella quando finisce o se ne esce. Se l'app si chiude a meta', gli id
 * restano nelle preferenze e all'avvio successivo si cancellano prima del
 * backup giornaliero (`seed.ts`), cosi' non finiscono nemmeno nella copia.
 */

import { PatientService, PreferenceService, VisitService } from "./OfflineServices";
import { pazientiProva } from "../utils/pazientiProva";
import { conPazientiProva, leggiPazientiProva } from "../utils/guidaPrimoAvvio";
import {
  cancellaBozzaVisita,
  chiaveBozzaVisita,
  leggiBozzaVisita,
} from "../utils/bozzaVisita";

/**
 * Le preferenze si salvano come un oggetto unico: due scritture ravvicinate
 * (un interruttore e subito dopo un altro) leggerebbero la stessa copia e la
 * seconda cancellerebbe la prima. In coda, ognuna parte dall'ultima salvata.
 */
let codaPreferenze: Promise<unknown> = Promise.resolve();
export function aggiornaPreferenze(
  modifica: (prefs: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const lavoro = codaPreferenze.then(async () => {
    const prefs = (await PreferenceService.getPreferences()) ?? {};
    await PreferenceService.savePreferences(modifica(prefs));
  });
  codaPreferenze = lavoro.catch(() => {});
  return lavoro;
}

/**
 * Cancella la bozza di una visita solo se c'e': cancellarla scrive una voce
 * vuota, e per ogni visita di prova ne restava una.
 */
async function cancellaBozzaSeC(chiave: string): Promise<void> {
  if (await leggiBozzaVisita(chiave)) await cancellaBozzaVisita(chiave);
}

/** La cancellazione in corso: provider della guida e avvio possono chiederla insieme. */
let cancellazione: Promise<void> | null = null;

/**
 * Cancella i pazienti di prova rimasti in archivio, con visite, documenti e
 * bozze. Senza pazienti di prova non fa niente.
 */
export function cancellaPazientiProva(): Promise<void> {
  cancellazione ??= (async () => {
    try {
      const ids = leggiPazientiProva(await PreferenceService.getPreferences());
      for (const id of ids) {
        const visite = await VisitService.getVisitsByPatientId(id);
        await PatientService.deletePatient(id);
        await cancellaBozzaSeC(chiaveBozzaVisita(undefined, id));
        for (const v of visite) await cancellaBozzaSeC(chiaveBozzaVisita(v.id, id));
      }
      if (ids.length > 0) {
        await aggiornaPreferenze((prefs) =>
          conPazientiProva(
            prefs,
            leggiPazientiProva(prefs).filter((id) => !ids.includes(id)),
          ),
        );
      }
    } finally {
      cancellazione = null;
    }
  })();
  return cancellazione;
}

/**
 * Scrive i pazienti di prova con le loro visite. Restituisce il codice
 * fiscale del primo, Mario Rossi, quello che la guida fa cercare.
 *
 * Ogni paziente finisce nelle preferenze appena scritto, prima delle sue
 * visite: un'app chiusa a meta' non lascia pazienti che nessuno ricorda.
 * Un paziente vero con lo stesso codice fiscale non si tocca: si usa un
 * codice di riserva, o quel paziente di prova si salta. Senza Mario la prova
 * non ha senso, e non si scrive niente.
 */
export async function creaPazientiProva(oggi: Date = new Date()): Promise<{ codiceFiscale: string }> {
  await cancellaPazientiProva();
  const occupati = new Set(
    (await PatientService.getAllPatients())
      .map((p) => (p.codiceFiscale ?? "").trim().toUpperCase())
      .filter(Boolean),
  );

  let codiceFiscale = "";
  for (const [i, prova] of pazientiProva(oggi).entries()) {
    const identita = [prova.paziente, ...(prova.riserve ?? [])].find(
      (r) => r.codiceFiscale && !occupati.has(r.codiceFiscale),
    );
    if (!identita?.codiceFiscale) {
      if (i === 0) throw new Error("Codici fiscali del paziente di prova gia' in archivio");
      continue;
    }
    const paziente = await PatientService.addPatient({
      ...prova.paziente,
      codiceFiscale: identita.codiceFiscale,
      dataNascita: identita.dataNascita,
    });
    await aggiornaPreferenze((prefs) =>
      conPazientiProva(prefs, [...leggiPazientiProva(prefs), paziente.id]),
    );
    for (const visita of prova.visite) {
      await VisitService.addVisit({ ...visita, patientId: paziente.id });
    }
    if (i === 0) codiceFiscale = identita.codiceFiscale;
  }
  return { codiceFiscale };
}
