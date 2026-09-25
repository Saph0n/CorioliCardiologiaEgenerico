import type { Patient } from "../types/Storage";

/**
 * Il nome del paziente come si scrive in elenco, o `null` se non ce n'e' uno.
 *
 * Nome e cognome sono facoltativi in anagrafica — un paziente si puo' creare
 * col solo codice fiscale — e chi mostra l'elenco deve poter distinguere "non
 * ha un nome" da una stringa vuota, per scrivere "Paziente senza nome" invece
 * di una riga muta.
 *
 * Cognome in maiuscolo e poi il nome, come nel referto stampato ("ROSSI
 * Mario"): e' la convenzione clinica, e prima l'applicazione ne usava tre
 * ("Mario Rossi" negli elenchi, "Rossi Mario" nei suggerimenti, "ROSSI Mario"
 * sul foglio). Il maiuscolo toglie il dubbio su quale sia il cognome quando
 * entrambi potrebbero esserlo.
 */
export function formatPatientDisplayName(
  patient: Pick<Patient, "nome" | "cognome">,
): string | null {
  const cognome = (patient.cognome ?? "").trim().toLocaleUpperCase("it-IT");
  const nome = (patient.nome ?? "").trim();
  const completo = `${cognome} ${nome}`.trim();
  return completo || null;
}

/** Iniziali nello stesso ordine del nome: prima il cognome. */
export function patientInitials(patient: Pick<Patient, "nome" | "cognome">): string {
  const c = (patient.cognome ?? "").trim()[0] ?? "";
  const n = (patient.nome ?? "").trim()[0] ?? "";
  return `${c}${n}`.toLocaleUpperCase("it-IT") || "?";
}
