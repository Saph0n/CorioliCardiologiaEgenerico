import { describe, expect, it } from "vitest";
import type { Visit } from "../../types/Storage";
import { decodeCfToPatientFields } from "../codiceFiscale";
import { costruisciSerie } from "../confrontoMisure";
import { pazientiDaTenereDOcchio } from "../pazientiARischio";
import { CF_PAZIENTE_DA_CERCARE, pazientiProva } from "../pazientiProva";

const OGGI = new Date(2026, 8, 27);
const prova = pazientiProva(OGGI);

/** Le visite come le avrebbe l'archivio: id del paziente = cognome. */
function visiteInArchivio(): Visit[] {
  return prova.flatMap(({ paziente, visite }) =>
    visite.map((v, i) => ({
      ...v,
      id: `${paziente.cognome}-${i}`,
      patientId: paziente.cognome,
      createdAt: "",
      updatedAt: "",
    })),
  );
}

describe("pazienti di prova della guida", () => {
  it("fa cercare Mario Rossi, il primo", () => {
    expect(prova[0].paziente.cognome).toBe("Rossi");
    expect(prova[0].paziente.codiceFiscale).toBe(CF_PAZIENTE_DA_CERCARE);
  });

  // La scheda ricava data, luogo e sesso dal codice fiscale: se non
  // tornassero con l'anagrafica, il paziente di prova sembrerebbe sbagliato.
  it("ha codici fiscali validi e coerenti con l'anagrafica, riserve comprese", async () => {
    for (const { paziente, riserve } of prova) {
      for (const identita of [paziente, ...(riserve ?? [])]) {
        const dati = await decodeCfToPatientFields(identita.codiceFiscale!);
        expect(dati.dataNascita, identita.codiceFiscale).toBe(identita.dataNascita);
        expect(dati.sesso, identita.codiceFiscale).toBe(paziente.sesso);
        expect(dati.luogoNascita.toLowerCase()).toBe(paziente.luogoNascita.toLowerCase());
      }
    }
  });

  it("mette le visite nel passato, dalla piu' vecchia, con il prelievo prima della visita", () => {
    const oggi = "2026-09-27";
    for (const { visite } of prova) {
      const date = visite.map((v) => v.dataVisita);
      expect([...date].sort()).toEqual(date);
      for (const v of visite) {
        expect(v.dataVisita < oggi).toBe(true);
        const prelievo = v.visita?.laboratorio?.dataPrelievo;
        if (prelievo) expect(prelievo <= v.dataVisita).toBe(true);
      }
    }
  });

  // Nella ricerca aperta i "Visti di recente" vanno dall'ultima visita: con
  // Mario in cima, anche Invio senza scrivere niente apre lui.
  it("da' a Mario la visita piu' recente", () => {
    const ultima = (i: number) => prova[i].visite[prova[i].visite.length - 1].dataVisita;
    for (let i = 1; i < prova.length; i++) expect(ultima(0) > ultima(i)).toBe(true);
  });

  it("disegna l'andamento dell'LDL di Mario: tre prelievi, in discesa", () => {
    const mario = visiteInArchivio().filter((v) => v.patientId === "Rossi");
    const ldl = costruisciSerie(mario)["laboratorio.ldlMisurato"];
    expect(ldl.map((p) => p.valore)).toEqual([182, 146, 121]);
  });

  it("riempie la colonna dei pazienti a rischio, dal piu' grave", () => {
    const voci = pazientiDaTenereDOcchio(visiteInArchivio());
    expect(voci.map((v) => [v.patientId, v.categoria])).toEqual([
      ["Bianchi", "molto-alto"],
      ["Rossi", "alto"],
      ["Verdi", "moderato"],
    ]);
    // Tutti sopra l'obiettivo: e' la cosa che la guida fa vedere.
    for (const v of voci) expect(v.scostamento).toBeGreaterThan(0);
  });
});
