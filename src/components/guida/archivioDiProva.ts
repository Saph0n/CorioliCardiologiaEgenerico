/**
 * L'archivio della prova guidata: dodici pazienti inventati, con le visite
 * degli ultimi anni.
 *
 * Serve a far vedere l'app com'e' dopo qualche mese di lavoro, non il primo
 * giorno: la colonna dei pazienti a rischio piena, il valore della visita
 * precedente accanto ai campi, l'andamento degli esami nel grafico. Vive solo
 * in memoria finche' la guida e' aperta (`apriArchivioDiProva`): uscendo, il
 * medico ritrova il suo archivio com'era.
 *
 * Sono gli stessi pazienti delle immagini della scheda sul Microsoft Store.
 * Le date si contano da oggi, cosi' la dashboard ha sempre visite recenti.
 * Il paziente della prova e' Martelli: quattro controlli in tre anni, con gli
 * esami di ognuno, e l'ultimo sei mesi fa diceva "controllo a sei mesi".
 */

import type {
  Patient,
  RicettaPaziente,
  RichiestaEsameComplementare,
  Visit,
} from "../../types/Storage";
import type { ContenutoArchivioDiProva } from "../../services/StorageServiceFallback";
import { toLocalIsoDate } from "../../utils/dateUtils";

/** Il paziente che la guida fa cercare e visitare. */
export const PAZIENTE_DELLA_PROVA = { id: "prova-martelli", cognome: "Martelli" } as const;

type DatiVisita = NonNullable<Visit["visita"]>;

const EO_NORMALE =
  "Toni cardiaci validi e ritmici, pause libere. Murmure vescicolare fisiologico su tutto " +
  "l'ambito polmonare. Non edemi declivi. Polsi periferici presenti e simmetrici.";

export function creaArchivioDiProva(oggi: Date = new Date()): ContenutoArchivioDiProva {
  /** La data di `n` giorni fa, `aaaa-mm-gg`. */
  const fa = (n: number) => {
    const d = new Date(oggi);
    d.setDate(d.getDate() - n);
    return toLocalIsoDate(d);
  };
  const istante = (data: string, ora: string) => new Date(`${data}T${ora}:00`).toISOString();

  const patients: Patient[] = [];
  const visits: Visit[] = [];

  const paziente = (
    id: string,
    cognome: string,
    nome: string,
    sesso: "M" | "F",
    dataNascita: string,
    luogoNascita: string,
    codiceFiscale: string,
    altezza: number,
    peso: number,
  ) => {
    patients.push({
      id,
      codiceFiscale,
      nome,
      cognome,
      dataNascita,
      luogoNascita,
      sesso,
      altezza,
      peso,
      // Si aggiustano sulla prima e sull'ultima visita.
      createdAt: "",
      updatedAt: "",
    });
  };

  const visita = (
    id: string,
    patientId: string,
    giorniFa: number,
    ora: string,
    clinica: Partial<DatiVisita>,
  ) => {
    const data = fa(giorniFa);
    const quando = istante(data, ora);
    visits.push({
      id,
      patientId,
      dataVisita: data,
      descrizioneClinica: "",
      anamnesi: "",
      esamiObiettivo: "",
      conclusioniDiagnostiche: "",
      terapie: "",
      tipo: "generale",
      visita: {
        problemaClinico: "",
        prestazione: "",
        esameObiettivo: "",
        accertamenti: "",
        terapiaSpecifica: "",
        ...clinica,
      },
      createdAt: quando,
      updatedAt: quando,
    });
    const p = patients.find((x) => x.id === patientId);
    if (p) {
      if (!p.createdAt || quando < p.createdAt) p.createdAt = quando;
      if (!p.updatedAt || quando > p.updatedAt) p.updatedAt = quando;
    }
  };

  // 1. Martelli, il paziente della prova: prevenzione secondaria, quattro
  //    controlli in tre anni. L'LDL scende con la terapia ma resta lontano
  //    dall'obiettivo: e' in cima ai pazienti a rischio.
  paziente("prova-martelli", "Martelli", "Giorgio", "M", "1951-03-18", "Lucca", "MRTGRG51C18E715N", 175, 84);
  const anamnesiMartelli =
    "Ipertensione arteriosa nota da quindici anni, in trattamento con ACE-inibitore.\n" +
    "Dislipidemia in terapia con statina.\n" +
    "Pregresso infarto miocardico inferiore, trattato con angioplastica e impianto di stent " +
    "medicato su coronaria destra.\n" +
    "Nega diabete mellito. Familiarità paterna per cardiopatia ischemica precoce.\n" +
    "Ex fumatore. Attività fisica saltuaria.";
  const fattoriMartelli = {
    ipertensione: true,
    dislipidemia: true,
    familiaritaCad: true,
    sedentarieta: true,
    eventoCvPregresso: true,
  };
  const terapiaMartelli = (atorvastatina: number) =>
    "Acido acetilsalicilico 100 mg, 1 cp al mattino.\nRamipril 5 mg, 1 cp al mattino.\n" +
    `Bisoprololo 2,5 mg, 1 cp al mattino.\nAtorvastatina ${atorvastatina} mg, 1 cp la sera.`;

  visita("prova-martelli-1", "prova-martelli", 1080, "09:40", {
    problemaClinico:
      "Prima valutazione presso lo studio, su indicazione del medico curante, per il controllo " +
      "periodico dopo l'evento coronarico. Asintomatico per angor e dispnea.",
    prestazione: anamnesiMartelli,
    terapiaInAtto: terapiaMartelli(20),
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Cardiopatia ischemica cronica in paziente a rischio cardiovascolare molto alto.\n" +
      "Profilo lipidico lontano dall'obiettivo: si incrementa atorvastatina a 40 mg la sera.\n" +
      "Controllo cardiologico tra un anno con profilo lipidico.",
    pesoCorporeo: 88,
    pressioneArteriosa: "152/88",
    frequenzaCardiaca: "74",
    fumatore: "no",
    categoriaRischioCv: "molto-alto",
    fattoriRischio: fattoriMartelli,
    ecg: {
      pr: 176, qrs: 94, qt: 396, asse: 30,
      referto:
        "Ritmo sinusale a frequenza 74/min. Onde Q di necrosi nelle derivazioni inferiori. " +
        "Non alterazioni acute della ripolarizzazione ventricolare.",
    },
    laboratorio: {
      dataPrelievo: fa(1094), colesteroloTotale: 246, hdl: 39, trigliceridi: 196, apoB: 121,
      lpa: 60, glicemia: 104, creatinina: 1.05, emoglobina: 14.6,
    },
  });
  visita("prova-martelli-2", "prova-martelli", 730, "11:10", {
    problemaClinico: "Controllo annuale. Riferisce buona tolleranza allo sforzo, nega dolore toracico.",
    prestazione: anamnesiMartelli,
    terapiaInAtto: terapiaMartelli(40),
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Quadro clinico stabile. LDL in calo ma ancora sopra l'obiettivo della classe di rischio.\n" +
      "Si rinforzano le indicazioni dietetiche e l'attività fisica aerobica regolare.",
    pesoCorporeo: 86,
    pressioneArteriosa: "146/86",
    frequenzaCardiaca: "70",
    fumatore: "no",
    categoriaRischioCv: "molto-alto",
    fattoriRischio: fattoriMartelli,
    ecg: {
      pr: 178, qrs: 96, qt: 402, asse: 30,
      referto: "Ritmo sinusale a frequenza 70/min. Esiti di necrosi inferiore, quadro invariato.",
    },
    laboratorio: {
      dataPrelievo: fa(744), colesteroloTotale: 224, hdl: 41, trigliceridi: 182, apoB: 108,
      glicemia: 101, creatinina: 1.1, emoglobina: 14.4,
    },
  });
  visita("prova-martelli-3", "prova-martelli", 365, "10:20", {
    problemaClinico:
      "Controllo annuale. Riferisce lieve riduzione della tolleranza agli sforzi intensi.",
    prestazione: anamnesiMartelli,
    terapiaInAtto: terapiaMartelli(40),
    esameObiettivo: EO_NORMALE,
    accertamenti: "TC coronarica con calcium score. Ecocolordoppler dei tronchi sovraortici.",
    terapiaSpecifica:
      "Quadro stabile. Si programmano TC coronarica ed ecocolordoppler dei tronchi sovraortici " +
      "per completare la stratificazione del rischio.",
    pesoCorporeo: 85,
    pressioneArteriosa: "148/84",
    frequenzaCardiaca: "76",
    fumatore: "no",
    categoriaRischioCv: "molto-alto",
    fattoriRischio: fattoriMartelli,
    ecg: {
      pr: 180, qrs: 96, qt: 398, asse: 30,
      referto: "Ritmo sinusale a frequenza 76/min. Esiti di necrosi inferiore invariati.",
    },
    laboratorio: {
      dataPrelievo: fa(379), colesteroloTotale: 214, hdl: 42, trigliceridi: 176, apoB: 100,
      glicemia: 103, creatinina: 1.15, emoglobina: 14.3,
    },
  });
  visita("prova-martelli-4", "prova-martelli", 182, "16:30", {
    problemaClinico:
      "Il paziente riferisce dispnea da sforzo comparsa da circa due mesi, con progressiva " +
      "riduzione della tolleranza all'esercizio. Nega dolore toracico a riposo, cardiopalmo, " +
      "sincopi o lipotimie.",
    prestazione: anamnesiMartelli,
    terapiaInAtto: terapiaMartelli(40),
    esameObiettivo:
      "Paziente vigile, orientato, eupnoico a riposo. Toni cardiaci validi e ritmici, soffio " +
      "sistolico 2/6 sul focolaio aortico irradiato ai vasi del collo. Murmure vescicolare " +
      "presente su tutto l'ambito polmonare, non rumori aggiunti. Addome trattabile. Non edemi " +
      "declivi. Polsi periferici validi e simmetrici.",
    accertamenti:
      "Si richiede ecocardiogramma color-Doppler di controllo a sei mesi e nuovo profilo " +
      "lipidico completo a tre mesi dall'ottimizzazione della terapia ipolipemizzante.",
    terapiaSpecifica:
      "Quadro compatibile con cardiopatia ischemica cronica in paziente a rischio " +
      "cardiovascolare molto alto, attualmente in compenso emodinamico, classe NYHA II.\n" +
      "Si conferma la terapia antiaggregante e antipertensiva in atto.\n" +
      "Si incrementa atorvastatina a 80 mg per il mancato raggiungimento dell'obiettivo " +
      "lipidico previsto dalla classe di rischio.\n" +
      "Si raccomanda attività fisica aerobica regolare e controllo cardiologico a sei mesi, o " +
      "prima in caso di comparsa di sintomi.",
    pesoCorporeo: 84,
    pressioneArteriosa: "150/85",
    frequenzaCardiaca: "78",
    fumatore: "no",
    categoriaRischioCv: "molto-alto",
    fattoriRischio: fattoriMartelli,
    ecg: {
      pr: 180, qrs: 96, qt: 384, asse: 30,
      referto:
        "Ritmo sinusale a frequenza 78/min. Onde Q di necrosi nelle derivazioni inferiori. " +
        "Non alterazioni acute della ripolarizzazione ventricolare.",
    },
    ecocardiogramma: {
      ddvs: 54, dsvs: 36, siv: 12, pp: 11, fe: 48, atrioSinistro: 42,
      gradienteAorticoMedio: 18, gradienteAorticoMassimo: 32, areaValvolareAortica: 1.9,
      radiceAortica: 34, aortaAscendente: 41, tapse: 20, paps: 30, rapportoEA: 0.8,
      referto:
        "Ventricolo sinistro di dimensioni conservate, con lieve ipertrofia parietale e " +
        "ipocinesia della parete inferiore in sede basale e media. Funzione sistolica globale " +
        "lievemente ridotta. Disfunzione diastolica di grado I. Atrio sinistro lievemente " +
        "dilatato. Sclerosi valvolare aortica con gradiente non significativo. Lieve ectasia " +
        "dell'aorta ascendente. Non versamento pericardico.",
    },
    tcCoronarica: {
      dataEsame: fa(318),
      struttura: "Servizio di radiodiagnostica",
      metodica: "TC multistrato 128 strati con mezzo di contrasto iodato",
      cacScore: 460,
      cadRads: "3",
      cadRadsModificatori: ["HRP"],
      burdenPlacca: "P3",
      referto:
        "Placca mista con componente fibrolipidica prevalente sul tratto medio del ramo " +
        "interventricolare anteriore, con stenosi stimata del 55%. Stent pervio sulla " +
        "coronaria destra.",
    },
    dopplerTsa: {
      dataEsame: fa(265),
      imtMax: 1.1,
      stenosiCarotidea: 45,
      sedeStenosi: "bulbo carotideo destro",
      placche: "Placca fibrocalcifica al bulbo carotideo destro, superficie regolare",
      vertebrali: "Pervie, flusso anterogrado bilateralmente",
      referto:
        "Spessore medio-intimale aumentato su entrambi gli assi. Placca fibrocalcifica al bulbo " +
        "carotideo destro con stenosi stimata del 45%, emodinamicamente non significativa. " +
        "Asse controlaterale indenne.",
    },
    laboratorio: {
      dataPrelievo: fa(190), colesteroloTotale: 210, hdl: 42, trigliceridi: 180, apoB: 95,
      lpa: 60, glicemia: 102, insulina: 12, hba1c: 5.8, creatinina: 1.2, albuminuria: 45,
      emoglobina: 14.2, ast: 28, alt: 32, uricemia: 6.1, tsh: 2.4,
    },
    sintesiRischio:
      "Prevenzione secondaria dopo evento coronarico, con calcium score in fascia severa: il " +
      "paziente resta sopra l'obiettivo lipidico nonostante la terapia in atto.",
  });

  // 2. Ipertesa e dislipidemica, classe alta, LDL sopra l'obiettivo.
  paziente("prova-marchetti", "Marchetti", "Elena", "F", "1959-06-02", "Pisa", "MRCLNE59H42G702V", 164, 71);
  const anamnesiMarchetti =
    "Ipertensione arteriosa da circa dieci anni. Dislipidemia. Menopausa a 51 anni.\n" +
    "Non fumatrice. Madre con ictus ischemico a 70 anni.";
  const fattoriMarchetti = { ipertensione: true, dislipidemia: true };
  visita("prova-marchetti-1", "prova-marchetti", 382, "15:00", {
    problemaClinico: "Prima visita per ipertensione arteriosa, su invio del medico curante.",
    prestazione: anamnesiMarchetti,
    terapiaInAtto: "Olmesartan 20 mg, 1 cp al mattino.",
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Ipertensione arteriosa non a target: si passa all'associazione olmesartan/amlodipina " +
      "20/5 mg. Si introduce rosuvastatina 10 mg la sera.",
    pesoCorporeo: 72, pressioneArteriosa: "152/92", frequenzaCardiaca: "72", fumatore: "no",
    categoriaRischioCv: "alto", fattoriRischio: fattoriMarchetti,
    ecg: {
      pr: 158, qrs: 86, qt: 388, asse: 25,
      referto:
        "Ritmo sinusale a frequenza 72/min. Conduzione atrioventricolare e intraventricolare " +
        "nei limiti. Non alterazioni della ripolarizzazione.",
    },
    laboratorio: {
      dataPrelievo: fa(394), colesteroloTotale: 248, hdl: 55, trigliceridi: 160, glicemia: 97,
      creatinina: 0.8,
    },
  });
  visita("prova-marchetti-2", "prova-marchetti", 4, "15:30", {
    problemaClinico:
      "Controllo annuale. Riferisce buon controllo pressorio domiciliare e occasionali cefalee " +
      "mattutine.",
    prestazione: anamnesiMarchetti,
    terapiaInAtto: "Olmesartan/amlodipina 20/5 mg, 1 cp al mattino.\nRosuvastatina 10 mg, 1 cp la sera.",
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Ipertensione arteriosa in buon compenso.\nProfilo lipidico non a obiettivo per la classe " +
      "di rischio alta: si incrementa rosuvastatina a 20 mg. Controllo del profilo lipidico tra " +
      "tre mesi.",
    pesoCorporeo: 71, pressioneArteriosa: "138/84", frequenzaCardiaca: "66", fumatore: "no",
    categoriaRischioCv: "alto", fattoriRischio: fattoriMarchetti,
    ecg: {
      pr: 160, qrs: 88, qt: 390, asse: 20,
      referto:
        "Ritmo sinusale a frequenza 66/min. Conduzione atrioventricolare e intraventricolare " +
        "nei limiti. Non alterazioni della ripolarizzazione.",
    },
    laboratorio: {
      dataPrelievo: fa(22), colesteroloTotale: 205, hdl: 58, trigliceridi: 145, apoB: 104,
      glicemia: 96, creatinina: 0.82,
    },
  });

  // 3. Diabetico con cardiopatia ischemica, molto alto, LDL poco sopra.
  paziente("prova-deangelis", "De Angelis", "Roberto", "M", "1956-11-21", "Roma", "DNGRRT56S21H501C", 178, 90);
  const anamnesiDeAngelis =
    "Diabete mellito tipo 2 da dodici anni in terapia orale.\n" +
    "Cardiopatia ischemica cronica: angioplastica con stent sul ramo interventricolare anteriore.\n" +
    "Ipertensione arteriosa. Ex fumatore.";
  const terapiaDeAngelis =
    "Acido acetilsalicilico 100 mg, 1 cp al pranzo.\nMetformina 1000 mg, 1 cp due volte al giorno.\n" +
    "Empagliflozin 10 mg, 1 cp al mattino.\nBisoprololo 5 mg, 1 cp al mattino.\n" +
    "Rosuvastatina/ezetimibe 20/10 mg, 1 cp la sera.";
  const fattoriDeAngelis = { ipertensione: true, dislipidemia: true, diabete: true, eventoCvPregresso: true };
  visita("prova-deangelis-1", "prova-deangelis", 558, "11:00", {
    problemaClinico: "Controllo periodico. Asintomatico per angor e dispnea.",
    prestazione: anamnesiDeAngelis, terapiaInAtto: terapiaDeAngelis, esameObiettivo: EO_NORMALE,
    terapiaSpecifica: "Quadro clinico stabile. Prosegue la terapia in atto.",
    pesoCorporeo: 92, pressioneArteriosa: "136/80", frequenzaCardiaca: "64", fumatore: "no",
    categoriaRischioCv: "molto-alto", fattoriRischio: fattoriDeAngelis,
    ecg: {
      pr: 168, qrs: 102, qt: 408, asse: -35,
      referto: "Ritmo sinusale a frequenza 64/min. Emiblocco anteriore sinistro. Ripolarizzazione nei limiti.",
    },
    laboratorio: {
      dataPrelievo: fa(572), colesteroloTotale: 150, hdl: 43, trigliceridi: 140, apoB: 74,
      glicemia: 134, hba1c: 7.1, creatinina: 1.02,
    },
  });
  visita("prova-deangelis-2", "prova-deangelis", 5, "10:00", {
    problemaClinico: "Controllo periodico. Asintomatico per angor e dispnea.",
    prestazione: anamnesiDeAngelis, terapiaInAtto: terapiaDeAngelis, esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Cardiopatia ischemica cronica stabile.\nLDL non ancora a obiettivo (< 55 mg/dL): si " +
      "valuta con il paziente l'associazione di acido bempedoico. Prosegue la terapia in atto.",
    pesoCorporeo: 90, pressioneArteriosa: "132/78", frequenzaCardiaca: "62", fumatore: "no",
    categoriaRischioCv: "molto-alto", fattoriRischio: fattoriDeAngelis,
    ecg: {
      pr: 170, qrs: 104, qt: 410, asse: -35,
      referto: "Ritmo sinusale a frequenza 62/min. Emiblocco anteriore sinistro. Ripolarizzazione nei limiti.",
    },
    laboratorio: {
      dataPrelievo: fa(15), colesteroloTotale: 142, hdl: 44, trigliceridi: 130, apoB: 70,
      glicemia: 128, hba1c: 6.9, creatinina: 1.05,
    },
  });

  // 4. Ipercolesterolemia familiare, classe alta, a obiettivo.
  paziente("prova-lombardo", "Lombardo", "Chiara", "F", "1964-02-14", "Livorno", "LMBCHR64B54E625P", 168, 63);
  visita("prova-lombardo-1", "prova-lombardo", 8, "12:00", {
    problemaClinico: "Controllo dopo modifica della terapia ipolipemizzante.",
    prestazione: "Ipertensione arteriosa. Ipercolesterolemia familiare eterozigote. Non fumatrice.",
    terapiaInAtto: "Ramipril 5 mg, 1 cp al mattino.\nRosuvastatina/ezetimibe 20/10 mg, 1 cp la sera.",
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Obiettivo lipidico raggiunto, terapia ben tollerata. Prosegue la terapia in atto, " +
      "controllo tra dodici mesi.",
    pesoCorporeo: 63, pressioneArteriosa: "128/80", frequenzaCardiaca: "70", fumatore: "no",
    categoriaRischioCv: "alto",
    fattoriRischio: { ipertensione: true, dislipidemia: true, familiaritaCad: true },
    ecg: { pr: 150, qrs: 84, qt: 380, asse: 45, referto: "Ritmo sinusale a frequenza 70/min. Tracciato nei limiti della norma." },
    laboratorio: {
      dataPrelievo: fa(19), colesteroloTotale: 150, hdl: 62, trigliceridi: 100, glicemia: 92,
      creatinina: 0.78,
    },
  });

  // 5. Pregresso bypass, molto alto, a obiettivo.
  paziente("prova-bellini", "Bellini", "Franco", "M", "1948-07-30", "Firenze", "BLLFNC48L30D612N", 170, 76);
  const anamnesiBellini =
    "Pregresso bypass aortocoronarico (tre graft).\nIpertensione arteriosa. Dislipidemia.\nEx fumatore.";
  const terapiaBellini =
    "Acido acetilsalicilico 100 mg, 1 cp al giorno.\nMetoprololo 100 mg, 1/2 cp due volte al giorno.\n" +
    "Atorvastatina 80 mg, 1 cp la sera.\nEzetimibe 10 mg, 1 cp la sera.";
  const fattoriBellini = { ipertensione: true, dislipidemia: true, eventoCvPregresso: true };
  visita("prova-bellini-1", "prova-bellini", 390, "09:30", {
    problemaClinico: "Controllo annuale.", prestazione: anamnesiBellini, terapiaInAtto: terapiaBellini,
    esameObiettivo: EO_NORMALE, terapiaSpecifica: "Quadro stabile. Prosegue la terapia in atto.",
    pesoCorporeo: 77, pressioneArteriosa: "136/78", frequenzaCardiaca: "60", fumatore: "no",
    categoriaRischioCv: "molto-alto", fattoriRischio: fattoriBellini,
    ecg: {
      pr: 190, qrs: 98, qt: 420, asse: 10,
      referto: "Ritmo sinusale a frequenza 60/min. Alterazioni aspecifiche della ripolarizzazione in sede laterale.",
    },
    laboratorio: {
      dataPrelievo: fa(403), colesteroloTotale: 126, hdl: 44, trigliceridi: 120, glicemia: 99,
      creatinina: 1.08,
    },
  });
  visita("prova-bellini-2", "prova-bellini", 11, "09:30", {
    problemaClinico:
      "Controllo annuale. Riferisce dispnea per sforzi importanti, invariata rispetto al " +
      "controllo precedente.",
    prestazione: anamnesiBellini, terapiaInAtto: terapiaBellini, esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Cardiopatia ischemica cronica stabile, obiettivo lipidico raggiunto.\nProsegue la terapia " +
      "in atto. Controllo tra dodici mesi con ecocardiogramma.",
    pesoCorporeo: 76, pressioneArteriosa: "134/76", frequenzaCardiaca: "58", fumatore: "no",
    categoriaRischioCv: "molto-alto", fattoriRischio: fattoriBellini,
    ecg: {
      pr: 192, qrs: 98, qt: 424, asse: 10,
      referto:
        "Ritmo sinusale a frequenza 58/min. Alterazioni aspecifiche della ripolarizzazione in " +
        "sede laterale, invariate.",
    },
    laboratorio: {
      dataPrelievo: fa(26), colesteroloTotale: 118, hdl: 45, trigliceridi: 110, glicemia: 101,
      creatinina: 1.1,
    },
  });

  // 6. Familiarita' e fumo, moderato, LDL sopra l'obiettivo.
  paziente("prova-serafini", "Serafini", "Paola", "F", "1970-05-09", "Siena", "SRFPLA70E49I726Y", 166, 68);
  visita("prova-serafini-1", "prova-serafini", 16, "17:00", {
    problemaClinico: "Valutazione del rischio cardiovascolare su richiesta del medico curante.",
    prestazione:
      "Familiarità per cardiopatia ischemica (padre, infarto miocardico a 58 anni).\n" +
      "Ipercolesterolemia non trattata. Fumatrice, circa 10 sigarette al giorno.",
    terapiaInAtto: "Nessuna terapia in atto.",
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Rischio cardiovascolare moderato.\nSi consigliano sospensione del fumo e dieta " +
      "ipolipidica; si rivaluta il profilo lipidico tra tre mesi prima di introdurre una statina.",
    pesoCorporeo: 68, pressioneArteriosa: "126/82", frequenzaCardiaca: "76", fumatore: "si",
    categoriaRischioCv: "moderato", fattoriRischio: { dislipidemia: true, familiaritaCad: true },
    ecg: { pr: 148, qrs: 82, qt: 376, asse: 50, referto: "Ritmo sinusale a frequenza 76/min. Tracciato nei limiti della norma." },
    laboratorio: {
      dataPrelievo: fa(25), colesteroloTotale: 214, hdl: 56, trigliceridi: 150, glicemia: 90,
      creatinina: 0.76,
    },
  });

  // 7. Cardiopalmo, basso rischio.
  paziente("prova-ferraro", "Ferraro", "Luca", "M", "1978-10-03", "Milano", "FRRLCU78R03F205H", 182, 78);
  visita("prova-ferraro-1", "prova-ferraro", 19, "18:00", {
    problemaClinico: "Cardiopalmo a riposo, episodico e di breve durata, da circa un mese.",
    prestazione:
      "Nessuna patologia di rilievo. Corsa amatoriale tre volte a settimana. Consumo di caffè: " +
      "quattro tazzine al giorno.",
    terapiaInAtto: "Nessuna terapia in atto.",
    esameObiettivo: EO_NORMALE,
    accertamenti: "ECG dinamico secondo Holter delle 24 ore.",
    terapiaSpecifica:
      "Cardiopalmo verosimilmente da extrasistolia sopraventricolare.\nSi consiglia di ridurre " +
      "la caffeina. Rivalutazione con l'esito dell'Holter ECG.",
    pesoCorporeo: 78, pressioneArteriosa: "124/78", frequenzaCardiaca: "64", fumatore: "no",
    categoriaRischioCv: "basso",
    ecg: { pr: 152, qrs: 90, qt: 392, asse: 60, referto: "Ritmo sinusale a frequenza 64/min. Tracciato nei limiti della norma." },
    laboratorio: {
      dataPrelievo: fa(28), colesteroloTotale: 186, hdl: 54, trigliceridi: 120, glicemia: 88,
      creatinina: 0.95,
    },
  });

  // 8. Dolore toracico atipico.
  paziente("prova-gentile", "Gentile", "Silvia", "F", "1985-01-26", "Napoli", "GNTSLV85A66F839X", 160, 55);
  visita("prova-gentile-1", "prova-gentile", 2, "16:00", {
    problemaClinico: "Dolore toracico atipico, puntorio, di pochi secondi, non correlato allo sforzo.",
    prestazione: "Nessuna patologia di rilievo. Non fumatrice. Nessuna terapia continuativa.",
    terapiaInAtto: "Nessuna terapia in atto.",
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Dolore toracico a bassa probabilità di origine ischemica, con esame obiettivo ed ECG " +
      "nella norma. Non indicati ulteriori accertamenti cardiologici.",
    pesoCorporeo: 55, pressioneArteriosa: "112/70", frequenzaCardiaca: "72", fumatore: "no",
    categoriaRischioCv: "basso",
    ecg: { pr: 140, qrs: 80, qt: 370, asse: 70, referto: "Ritmo sinusale a frequenza 72/min. Tracciato nei limiti della norma." },
  });

  // 9. Iperteso obeso, classe alta, esami ancora da fare.
  paziente("prova-pellegrino", "Pellegrino", "Marco", "M", "1962-08-17", "Bologna", "PLLMRC62M17A944X", 176, 99);
  visita("prova-pellegrino-1", "prova-pellegrino", 9, "11:30", {
    problemaClinico: "Prima visita cardiologica per ipertensione arteriosa non controllata.",
    prestazione:
      "Ipertensione arteriosa. Obesità. Sindrome delle apnee ostruttive del sonno in CPAP.\nEx fumatore.",
    terapiaInAtto: "Amlodipina 10 mg, 1 cp al mattino.",
    esameObiettivo: EO_NORMALE,
    accertamenti:
      "Profilo lipidico completo, glicemia, emoglobina glicata, creatinina, esame urine. " +
      "Ecocardiogramma color-Doppler.",
    terapiaSpecifica:
      "Ipertensione arteriosa non controllata: si associa olmesartan 20 mg al mattino.\n" +
      "Monitoraggio pressorio domiciliare e controllo con gli esami richiesti.",
    pesoCorporeo: 99, pressioneArteriosa: "158/96", frequenzaCardiaca: "80", fumatore: "no",
    categoriaRischioCv: "alto",
    fattoriRischio: { ipertensione: true, obesita: true, sedentarieta: true },
    ecg: { pr: 164, qrs: 92, qt: 384, asse: 0, referto: "Ritmo sinusale a frequenza 80/min. Segni di sovraccarico ventricolare sinistro." },
  });

  // 10. Anziana diabetica con insufficienza renale lieve, alto, LDL sopra.
  paziente("prova-ricciardi", "Ricciardi", "Anna", "F", "1946-12-05", "Bari", "RCCNNA46T45A662Q", 158, 66);
  visita("prova-ricciardi-1", "prova-ricciardi", 12, "10:00", {
    problemaClinico: "Controllo. Riferisce astenia nelle ultime settimane.",
    prestazione:
      "Ipertensione arteriosa. Diabete mellito tipo 2 in terapia dietetica.\nInsufficienza renale cronica lieve.",
    terapiaInAtto:
      "Valsartan/idroclorotiazide 160/12,5 mg, 1 cp al mattino.\nAtorvastatina 20 mg, 1 cp la sera.",
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Si incrementa atorvastatina a 40 mg.\nControllo della funzione renale e del profilo " +
      "lipidico tra tre mesi.",
    pesoCorporeo: 66, pressioneArteriosa: "142/80", frequenzaCardiaca: "72", fumatore: "no",
    categoriaRischioCv: "alto",
    fattoriRischio: { ipertensione: true, diabete: true, dislipidemia: true },
    ecg: { pr: 172, qrs: 90, qt: 404, asse: 0, referto: "Ritmo sinusale a frequenza 72/min. Non alterazioni della ripolarizzazione." },
    laboratorio: {
      dataPrelievo: fa(24), colesteroloTotale: 180, hdl: 52, trigliceridi: 160, glicemia: 118,
      hba1c: 6.6, creatinina: 1.1,
    },
  });

  // 11. Valutazione prima dello sport.
  paziente("prova-orlandi", "Orlandi", "Davide", "M", "1992-04-22", "Torino", "RLNDVD92D22L219A", 180, 74);
  visita("prova-orlandi-1", "prova-orlandi", 18, "17:30", {
    problemaClinico: "Valutazione cardiologica prima di iniziare attività sportiva non agonistica.",
    prestazione: "Nessuna patologia di rilievo. Non fumatore. Familiarità negativa per morte improvvisa.",
    terapiaInAtto: "Nessuna terapia in atto.",
    esameObiettivo: EO_NORMALE,
    terapiaSpecifica: "Non controindicazioni cardiologiche all'attività sportiva non agonistica.",
    pesoCorporeo: 74, pressioneArteriosa: "118/74", frequenzaCardiaca: "58", fumatore: "no",
    categoriaRischioCv: "basso",
    ecg: { pr: 150, qrs: 88, qt: 396, asse: 75, referto: "Bradicardia sinusale a frequenza 58/min. Tracciato nei limiti della norma." },
  });

  // 12. Pregresso ictus, molto alto, LDL sopra; stenosi carotidea che cresce.
  paziente("prova-valentini", "Valentini", "Teresa", "F", "1940-09-12", "Genova", "VLNTRS40P52D969D", 155, 60);
  const anamnesiValentini =
    "Pregresso ictus ischemico, senza esiti motori.\nIpertensione arteriosa.\nStenosi carotidea sinistra.";
  const terapiaValentini =
    "Clopidogrel 75 mg, 1 cp al giorno.\nPerindopril/amlodipina 5/5 mg, 1 cp al mattino.\n" +
    "Simvastatina 20 mg, 1 cp la sera.";
  const fattoriValentini = { ipertensione: true, eventoCvPregresso: true };
  visita("prova-valentini-1", "prova-valentini", 395, "10:30", {
    problemaClinico: "Controllo annuale. Asintomatica.", prestazione: anamnesiValentini,
    terapiaInAtto: terapiaValentini, esameObiettivo: EO_NORMALE,
    terapiaSpecifica: "Quadro stabile. Prosegue la terapia in atto.",
    pesoCorporeo: 61, pressioneArteriosa: "148/80", frequenzaCardiaca: "70", fumatore: "no",
    categoriaRischioCv: "molto-alto", fattoriRischio: fattoriValentini,
    ecg: { pr: 182, qrs: 92, qt: 412, asse: -10, referto: "Ritmo sinusale a frequenza 70/min. Non alterazioni della ripolarizzazione." },
    laboratorio: {
      dataPrelievo: fa(409), colesteroloTotale: 176, hdl: 49, trigliceridi: 170, glicemia: 99,
      creatinina: 0.92,
    },
    dopplerTsa: {
      dataEsame: fa(444), stenosiCarotidea: 50, sedeStenosi: "bulbo carotideo sinistro",
      referto: "Placca fibrocalcifica al bulbo carotideo sinistro con stenosi stimata del 50%.",
    },
  });
  visita("prova-valentini-2", "prova-valentini", 23, "10:30", {
    problemaClinico: "Controllo annuale. Asintomatica.", prestazione: anamnesiValentini,
    terapiaInAtto: terapiaValentini, esameObiettivo: EO_NORMALE,
    terapiaSpecifica:
      "Si sostituisce simvastatina con atorvastatina 40 mg per il mancato raggiungimento " +
      "dell'obiettivo lipidico.\nEcocolordoppler dei tronchi sovraortici di controllo tra dodici mesi.",
    pesoCorporeo: 60, pressioneArteriosa: "146/78", frequenzaCardiaca: "68", fumatore: "no",
    categoriaRischioCv: "molto-alto", fattoriRischio: fattoriValentini,
    ecg: { pr: 184, qrs: 92, qt: 414, asse: -10, referto: "Ritmo sinusale a frequenza 68/min. Non alterazioni della ripolarizzazione." },
    laboratorio: {
      dataPrelievo: fa(33), colesteroloTotale: 170, hdl: 50, trigliceridi: 160, glicemia: 101,
      creatinina: 0.95,
    },
    dopplerTsa: {
      dataEsame: fa(40), stenosiCarotidea: 55, sedeStenosi: "bulbo carotideo sinistro",
      referto:
        "Placca fibrocalcifica al bulbo carotideo sinistro con stenosi stimata del 55%, in lieve " +
        "aumento rispetto al controllo precedente.",
    },
  });

  // Ricetta e richiesta dell'ultimo controllo di Martelli: la scheda del
  // paziente non e' vuota nemmeno a destra.
  const ultimaMartelli = fa(182);
  const ricettePaziente: RicettaPaziente[] = [
    {
      id: "prova-ricetta-martelli",
      patientId: "prova-martelli",
      tipo: "bianca",
      dataRicetta: ultimaMartelli,
      testo: "Atorvastatina 80 mg\n1 cp la sera, dopo cena.\n\nControllo di transaminasi e CPK a otto settimane.",
      createdAt: istante(ultimaMartelli, "16:50"),
      updatedAt: istante(ultimaMartelli, "16:50"),
    },
  ];
  const richiesteEsami: RichiestaEsameComplementare[] = [
    {
      id: "prova-richiesta-martelli",
      patientId: "prova-martelli",
      nome: "Ecocardiogramma color-Doppler",
      note: "Controllo a sei mesi, cardiopatia ischemica cronica.",
      dataRichiesta: ultimaMartelli,
      createdAt: istante(ultimaMartelli, "16:52"),
      updatedAt: istante(ultimaMartelli, "16:52"),
    },
  ];

  return { patients, visits, ricettePaziente, richiesteEsami };
}
