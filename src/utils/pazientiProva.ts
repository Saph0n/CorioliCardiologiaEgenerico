/**
 * I pazienti di prova della guida di primo avvio.
 *
 * Con l'archivio vuoto la guida non aveva niente da far vedere: il codice
 * fiscale scritto nella ricerca non trovava nessuno, la visita non aveva esami
 * precedenti (e quindi nessun grafico dell'andamento) e la colonna dei
 * pazienti a rischio restava vuota. Qui ci sono tre pazienti con la loro
 * storia, che la guida mette in archivio all'inizio della prova e toglie alla
 * fine:
 *
 * - **Mario Rossi**, il primo, quello che si cerca per codice fiscale: iperteso e
 *   dislipidemico, classe di rischio alta, tre controlli con l'LDL che scende
 *   sotto statina ma resta sopra l'obiettivo. E' il grafico della guida.
 * - **Anna Bianchi**, infarto pregresso: classe molto alta, in cima alla
 *   colonna dei pazienti a rischio.
 * - **Luigi Verdi**, fumatore di classe moderata ma con l'LDL sopra il suo
 *   obiettivo: in colonna anche se la classe da sola non ce lo porterebbe.
 *
 * Le date si contano da oggi, cosi' la storia e' sempre recente: Mario ha
 * l'ultima visita piu' vicina, e nella ricerca aperta e' il primo fra i
 * "Visti di recente".
 *
 * Qui ci sono solo i dati; li scrive e li cancella `services/pazientiProva`.
 */

import type { Patient, Visit } from "../types/Storage";
import { toLocalIsoDate } from "./dateUtils";

export type DatiPaziente = Omit<Patient, "id" | "createdAt" | "updatedAt">;
export type DatiVisita = Omit<Visit, "id" | "patientId" | "createdAt" | "updatedAt">;

export interface PazienteProva {
  paziente: DatiPaziente;
  /**
   * La stessa persona nata un giorno dopo, con il suo codice fiscale: se
   * l'archivio ha gia' un paziente vero col primo codice, la guida non deve
   * aprire la visita su di lui.
   */
  riserve?: Pick<DatiPaziente, "codiceFiscale" | "dataNascita">[];
  /** Dalla piu' vecchia alla piu' recente. */
  visite: DatiVisita[];
}

/**
 * Codice fiscale di Mario Rossi (Roma, 1 gennaio 1980): l'esempio di scuola,
 * valido anche nel carattere di controllo. E' quello che la guida fa cercare.
 */
export const CF_PAZIENTE_DA_CERCARE = "RSSMRA80A01H501U";

/** Il giorno `mesi` mesi e `giorni` giorni prima di `oggi`, come `YYYY-MM-DD`. */
function fa(oggi: Date, mesi: number, giorni = 0): string {
  const d = new Date(oggi.getFullYear(), oggi.getMonth() - mesi, oggi.getDate() - giorni);
  return toLocalIsoDate(d);
}

/** Una visita con i campi di testo che la maschera salva sempre. */
function visita(dataVisita: string, contenuto: NonNullable<Visit["visita"]>): DatiVisita {
  return {
    dataVisita,
    descrizioneClinica: "",
    anamnesi: "",
    esamiObiettivo: "",
    conclusioniDiagnostiche: "",
    terapie: "",
    tipo: "generale",
    visita: { immagini: [], ...contenuto },
  };
}

const ESAME_OBIETTIVO_NELLA_NORMA =
  "Toni cardiaci validi, ritmici, pause libere. Murmure vescicolare fisiologico su tutto l'ambito polmonare. Polsi periferici presenti e simmetrici. Non edemi declivi.";

const ANAMNESI_ROSSI =
  "Padre con infarto miocardico a 58 anni. Non fumatore. Lavoro sedentario, attività fisica saltuaria. Nessun sintomo cardiovascolare riferito.";

export function pazientiProva(oggi: Date = new Date()): PazienteProva[] {
  return [
    {
      paziente: {
        codiceFiscale: CF_PAZIENTE_DA_CERCARE,
        nome: "Mario",
        cognome: "Rossi",
        dataNascita: "1980-01-01",
        luogoNascita: "Roma",
        sesso: "M",
        altezza: 176,
      },
      riserve: [
        { codiceFiscale: "RSSMRA80A02H501Z", dataNascita: "1980-01-02" },
        { codiceFiscale: "RSSMRA80A03H501B", dataNascita: "1980-01-03" },
      ],
      visite: [
        visita(fa(oggi, 26), {
          problemaClinico:
            "Inviato dal medico curante per valori pressori elevati e colesterolo alto agli esami di controllo.",
          prestazione: ANAMNESI_ROSSI,
          esameObiettivo: ESAME_OBIETTIVO_NELLA_NORMA,
          accertamenti: "Esami ematochimici in visione.",
          terapiaSpecifica:
            "Ipertensione arteriosa di grado 1. Ipercolesterolemia in paziente a rischio cardiovascolare alto. Dieta ipolipidica e attività fisica aerobica regolare. Si avviano atorvastatina 20 mg la sera e ramipril 5 mg al mattino. Controllo con esami ematochimici.",
          pesoCorporeo: 89,
          pressioneArteriosa: "150/95",
          frequenzaCardiaca: "78",
          fumatore: "no",
          categoriaRischioCv: "alto",
          fattoriRischio: { ipertensione: true, dislipidemia: true, familiaritaCad: true },
          ecg: {
            pr: 160,
            qrs: 92,
            qt: 390,
            asse: 30,
            referto:
              "Ritmo sinusale a 78 bpm. Conduzione atrioventricolare e intraventricolare nei limiti. Non alterazioni della ripolarizzazione.",
          },
          laboratorio: {
            dataPrelievo: fa(oggi, 26, 6),
            colesteroloTotale: 262,
            hdl: 41,
            trigliceridi: 195,
            ldlMisurato: 182,
            glicemia: 104,
            creatinina: 0.95,
          },
        }),
        visita(fa(oggi, 14), {
          problemaClinico: "Controllo dopo l'avvio della terapia. Buona tolleranza, nessun sintomo.",
          prestazione: ANAMNESI_ROSSI,
          terapiaInAtto: "Atorvastatina 20 mg, 1 cp la sera\nRamipril 5 mg, 1 cp al mattino",
          esameObiettivo: ESAME_OBIETTIVO_NELLA_NORMA,
          accertamenti: "Esami ematochimici in visione.",
          terapiaSpecifica:
            "Pressione arteriosa a target. Colesterolo LDL in riduzione ma ancora sopra l'obiettivo per la classe di rischio. Si prosegue la terapia in atto, rinforzando la dieta. Controllo con esami ematochimici.",
          pesoCorporeo: 86,
          pressioneArteriosa: "135/85",
          frequenzaCardiaca: "72",
          fumatore: "no",
          categoriaRischioCv: "alto",
          fattoriRischio: { ipertensione: true, dislipidemia: true, familiaritaCad: true },
          ecg: {
            pr: 158,
            qrs: 90,
            qt: 392,
            asse: 30,
            referto: "Ritmo sinusale a 72 bpm. Tracciato sovrapponibile al precedente.",
          },
          laboratorio: {
            dataPrelievo: fa(oggi, 14, 5),
            colesteroloTotale: 221,
            hdl: 43,
            trigliceridi: 160,
            ldlMisurato: 146,
            glicemia: 99,
            creatinina: 0.97,
          },
        }),
        visita(fa(oggi, 3), {
          problemaClinico: "Controllo periodico. Asintomatico, buona aderenza alla terapia.",
          prestazione: ANAMNESI_ROSSI,
          terapiaInAtto: "Atorvastatina 20 mg, 1 cp la sera\nRamipril 5 mg, 1 cp al mattino",
          esameObiettivo: ESAME_OBIETTIVO_NELLA_NORMA,
          accertamenti: "Esami ematochimici in visione.",
          terapiaSpecifica:
            "Pressione arteriosa a target. LDL ancora sopra l'obiettivo (< 70 mg/dL): si aumenta atorvastatina a 40 mg la sera. Controllo con esami ematochimici.",
          pesoCorporeo: 85,
          pressioneArteriosa: "130/80",
          frequenzaCardiaca: "68",
          fumatore: "no",
          categoriaRischioCv: "alto",
          fattoriRischio: { ipertensione: true, dislipidemia: true, familiaritaCad: true },
          ecg: {
            pr: 160,
            qrs: 90,
            qt: 396,
            asse: 30,
            referto: "Ritmo sinusale a 68 bpm. Tracciato sovrapponibile al precedente.",
          },
          laboratorio: {
            dataPrelievo: fa(oggi, 3, 7),
            colesteroloTotale: 196,
            hdl: 45,
            trigliceridi: 150,
            ldlMisurato: 121,
            glicemia: 98,
            creatinina: 0.96,
          },
        }),
      ],
    },
    {
      paziente: {
        codiceFiscale: "BNCNNA56C55F205M",
        nome: "Anna",
        cognome: "Bianchi",
        dataNascita: "1956-03-15",
        luogoNascita: "Milano",
        sesso: "F",
        altezza: 162,
      },
      visite: [
        visita(fa(oggi, 11), {
          problemaClinico: "Controllo annuale in cardiopatia ischemica. Nessun dolore toracico, dispnea per sforzi intensi.",
          prestazione:
            "Infarto miocardico anteriore nel 2019, trattato con angioplastica e stent sulla discendente anteriore. Ipertensione arteriosa. Ex fumatrice dal 2019.",
          terapiaInAtto:
            "Acido acetilsalicilico 100 mg, 1 cp a pranzo\nRosuvastatina 20 mg, 1 cp la sera\nBisoprololo 2,5 mg, 1 cp al mattino\nRamipril 5 mg, 1 cp al mattino",
          esameObiettivo: ESAME_OBIETTIVO_NELLA_NORMA,
          accertamenti: "Ecocardiogramma eseguito in corso di visita.",
          terapiaSpecifica:
            "Cardiopatia ischemica cronica in paziente a rischio cardiovascolare molto alto. LDL sopra l'obiettivo (< 55 mg/dL): si associa ezetimibe 10 mg. Prosegue il resto della terapia.",
          pesoCorporeo: 64,
          pressioneArteriosa: "135/80",
          frequenzaCardiaca: "62",
          fumatore: "no",
          categoriaRischioCv: "molto-alto",
          fattoriRischio: { ipertensione: true, dislipidemia: true, eventoCvPregresso: true },
          ecocardiogramma: {
            fe: 50,
            referto:
              "Ventricolo sinistro di normali dimensioni con ipocinesia dei segmenti apicali. Funzione sistolica globale lievemente ridotta.",
          },
          laboratorio: {
            dataPrelievo: fa(oggi, 11, 4),
            colesteroloTotale: 170,
            hdl: 52,
            trigliceridi: 110,
            ldlMisurato: 96,
            glicemia: 101,
            creatinina: 0.88,
          },
        }),
        visita(fa(oggi, 5), {
          problemaClinico: "Controllo dopo l'aggiunta di ezetimibe. Asintomatica.",
          prestazione:
            "Infarto miocardico anteriore nel 2019, trattato con angioplastica e stent sulla discendente anteriore. Ipertensione arteriosa. Ex fumatrice dal 2019.",
          terapiaInAtto:
            "Acido acetilsalicilico 100 mg, 1 cp a pranzo\nRosuvastatina 20 mg + ezetimibe 10 mg, 1 cp la sera\nBisoprololo 2,5 mg, 1 cp al mattino\nRamipril 5 mg, 1 cp al mattino",
          esameObiettivo: ESAME_OBIETTIVO_NELLA_NORMA,
          accertamenti: "Esami ematochimici in visione.",
          terapiaSpecifica:
            "LDL in riduzione ma ancora sopra l'obiettivo. Si valuta l'aumento della rosuvastatina a 40 mg. Controllo con esami ematochimici.",
          pesoCorporeo: 63,
          pressioneArteriosa: "130/80",
          frequenzaCardiaca: "60",
          fumatore: "no",
          categoriaRischioCv: "molto-alto",
          fattoriRischio: { ipertensione: true, dislipidemia: true, eventoCvPregresso: true },
          laboratorio: {
            dataPrelievo: fa(oggi, 5, 3),
            colesteroloTotale: 152,
            hdl: 54,
            trigliceridi: 90,
            ldlMisurato: 82,
            glicemia: 99,
            creatinina: 0.9,
          },
        }),
      ],
    },
    {
      paziente: {
        codiceFiscale: "VRDLGU71L22L219R",
        nome: "Luigi",
        cognome: "Verdi",
        dataNascita: "1971-07-22",
        luogoNascita: "Torino",
        sesso: "M",
        altezza: 180,
      },
      visite: [
        visita(fa(oggi, 8), {
          problemaClinico: "Palpitazioni occasionali a riposo, di breve durata.",
          prestazione: "Fumatore di 15 sigarette al giorno. Nessuna patologia di rilievo. Nessun farmaco.",
          esameObiettivo: ESAME_OBIETTIVO_NELLA_NORMA,
          accertamenti: "Si richiede ECG dinamico secondo Holter.",
          terapiaSpecifica:
            "Palpitazioni verosimilmente da extrasistolia, da documentare con Holter. Rischio cardiovascolare moderato con LDL sopra l'obiettivo (< 100 mg/dL): dieta ipolipidica, sospensione del fumo. Rivalutazione con esami fra tre mesi.",
          pesoCorporeo: 82,
          pressioneArteriosa: "125/80",
          frequenzaCardiaca: "76",
          fumatore: "si",
          categoriaRischioCv: "moderato",
          ecg: {
            pr: 150,
            qrs: 88,
            qt: 380,
            asse: 45,
            referto: "Ritmo sinusale a 76 bpm. Rare extrasistoli sopraventricolari isolate.",
          },
          laboratorio: {
            dataPrelievo: fa(oggi, 8, 5),
            colesteroloTotale: 218,
            hdl: 48,
            trigliceridi: 160,
            ldlMisurato: 138,
            glicemia: 92,
            creatinina: 1.02,
          },
        }),
      ],
    },
  ];
}
