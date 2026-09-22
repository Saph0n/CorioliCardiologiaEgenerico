import type { Patient } from "../types/Storage";

/**
 * Il nome del paziente come si scrive in elenco, o `null` se non ce n'e' uno.
 *
 * Nome e cognome sono facoltativi in anagrafica — un paziente si puo' creare
 * col solo codice fiscale — e chi mostra l'elenco deve poter distinguere "non
 * ha un nome" da una stringa vuota, per scrivere "Paziente senza nome" invece
 * di una riga muta.
 */
export function formatPatientDisplayName(patient: Patient): string | null {
  const nome = `${patient.nome ?? ""} ${patient.cognome ?? ""}`.trim();
  return nome || null;
}
