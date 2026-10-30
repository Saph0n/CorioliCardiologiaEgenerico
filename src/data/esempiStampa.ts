import type {
  CertificatoPaziente,
  Patient,
  RichiestaEsameComplementare,
  RicettaPaziente,
  Visit,
} from "../types/Storage";

/**
 * Paziente e documenti inventati per l'anteprima dell'editor dei modelli di
 * stampa. Non stanno nell'archivio e non ci finiscono mai: servono a vedere il
 * foglio con tutte le sezioni piene, che e' l'unico modo di decidere come
 * impaginarle. L'intestazione e la firma invece sono quelle vere del profilo.
 *
 * Il referto di prova e' compilato **tutto**: ogni sezione, ogni modulo
 * strumentale, ogni misura che il PDF sa stampare, qualche valore fuori norma
 * (per vedere come il modello li evidenzia) e un grassetto nelle conclusioni.
 * Un modello si giudica sul referto piu' lungo che dovra' impaginare, non su
 * quello piu' corto: con meta' delle sezioni vuote, titoli, tabelle e salti
 * pagina di quelle mancanti non si vedevano (Pablo, 29 ottobre 2026). Il caso
 * e' uno solo e coerente, perche' lo legge un medico.
 */

const OGGI = new Date().toISOString().slice(0, 10);

/** Una data di qualche giorno fa: gli esami si fanno prima della visita. */
function giorniFa(giorni: number): string {
  return new Date(Date.now() - giorni * 86_400_000).toISOString().slice(0, 10);
}

export const PAZIENTE_ESEMPIO: Patient = {
  id: "esempio-modelli-stampa",
  nome: "Maria",
  cognome: "Rossi",
  dataNascita: "1956-03-12",
  luogoNascita: "Pisa",
  sesso: "F",
  indirizzo: "Via Roma 12, 56126 Pisa",
  telefono: "333 123 4567",
  altezza: 164,
  codiceFiscale: "RSSMRA56C52G702X",
  createdAt: OGGI,
  updatedAt: OGGI,
};

export const VISITA_ESEMPIO: Visit = {
  id: "esempio-visita",
  patientId: PAZIENTE_ESEMPIO.id,
  dataVisita: OGGI,
  descrizioneClinica: "",
  anamnesi: "",
  esamiObiettivo: "",
  conclusioniDiagnostiche: "",
  terapie: "",
  createdAt: OGGI,
  updatedAt: OGGI,
  visita: {
    prestazione:
      "Ipertensione arteriosa nota da dieci anni, in trattamento con ACE-inibitore. Dislipidemia in terapia con statina. Alterata glicemia a digiuno, senza terapia. Padre con infarto miocardico a 52 anni. Ex fumatrice (20 sigarette al giorno fino al 2010). Vita sedentaria. Nega pregressi eventi cardiovascolari.",
    problemaClinico:
      "Cardiopalmo saltuario comparso da circa due mesi, a esordio e fine improvvisi, non associato a sincope o dolore toracico. Dispnea per sforzi moderati, come salire due piani di scale.",
    terapiaInAtto:
      "Ramipril 5 mg, 1 cp al mattino.\nAtorvastatina 20 mg, 1 cp la sera.\nAcido acetilsalicilico 100 mg, 1 cp a pranzo.",
    esameObiettivo:
      "Toni cardiaci validi e ritmici, pause libere. Soffio sistolico 1/6 al focolaio aortico. Murmure vescicolare presente su tutto l'ambito polmonare, non rumori aggiunti. Polsi periferici presenti e simmetrici. Non edemi declivi.",
    accertamenti:
      "Ecocardiogramma di controllo a sei mesi. Profilo lipidico, emocromo, creatinina ed elettroliti a tre mesi, dopo la modifica della terapia.",
    terapiaSpecifica:
      "Fibrillazione atriale parossistica documentata all'Holter, CHA2DS2-VASc 3: si avvia **apixaban 5 mg, 1 cp ogni 12 ore**, e si sospende l'acido acetilsalicilico.\nIpertensione arteriosa non controllata, profilo non-dipper: ramipril portato a 10 mg al mattino.\nRischio cardiovascolare molto alto con LDL e ApoB sopra l'obiettivo: atorvastatina portata a 40 mg la sera.\nControllo cardiologico fra tre mesi, con gli esami richiesti.",
    pesoCorporeo: 68,
    pressioneArteriosa: "146/88",
    posizionePa: "clino",
    pressioneArteriosa2: "138/84",
    posizionePa2: "orto",
    frequenzaCardiaca: "74",
    fumatore: "no",
    categoriaRischioCv: "molto-alto",
    fattoriRischio: {
      ipertensione: true,
      dislipidemia: true,
      familiaritaCad: true,
      sedentarieta: true,
    },
    sintesiRischio:
      "Rischio molto alto per aterosclerosi documentata all'imaging (placca carotidea, calcium score 145) in paziente ipertesa con ipertrofia ventricolare sinistra iniziale.",
    ecg: {
      pr: 170,
      qrs: 96,
      qt: 400,
      asse: 30,
      referto:
        "Ritmo sinusale. Conduzione atrioventricolare e intraventricolare nei limiti. Non alterazioni significative della ripolarizzazione.",
    },
    ecocardiogramma: {
      ddvs: 50,
      dsvs: 32,
      siv: 11,
      pp: 9,
      fe: 58,
      atrioSinistro: 42,
      gradienteAorticoMedio: 8,
      gradienteAorticoMassimo: 15,
      areaValvolareAortica: 2.6,
      gradienteMitralicoMedio: 2,
      gradienteMitralicoMassimo: 5,
      radiceAortica: 32,
      aortaAscendente: 35,
      tapse: 21,
      paps: 30,
      rapportoEA: 0.8,
      referto:
        "Ventricolo sinistro di dimensioni nei limiti, con lieve ipertrofia del setto. Funzione sistolica globale conservata, disfunzione diastolica di I grado. Atrio sinistro lievemente dilatato. Sclerosi dei lembi aortici senza stenosi significativa. Sezioni destre nei limiti.",
    },
    tcCoronarica: {
      dataEsame: giorniFa(45),
      cacScore: 145,
      cadRads: "2",
      burdenPlacca: "P2",
      referto:
        "Placche calcifiche e miste del tratto prossimale dell'interventricolare anteriore e della coronaria destra, con stenosi lieve (25-49%).",
    },
    testErgometrico: {
      dataEsame: giorniFa(20),
      protocollo: "Cicloergometro a rampa",
      durataMin: 10,
      caricoWatt: 125,
      mets: 6.5,
      fcMax: 132,
      paMax: "190/92",
      motivoInterruzione: "Esaurimento muscolare",
      esito: "Negativo per ischemia inducibile",
      referto:
        "Test massimale, clinicamente ed elettrocardiograficamente negativo per ischemia inducibile. Risposta pressoria ipertensiva al picco dello sforzo. Nessuna aritmia significativa.",
    },
    holterEcg: {
      dataEsame: giorniFa(30),
      durataOre: 24,
      ritmoPrevalente: "Sinusale",
      fcMedia: 72,
      fcMin: 52,
      fcMax: 128,
      besv: 1240,
      bev: 85,
      pausaMaxSec: 1.6,
      referto:
        "Frequente ectopia sopraventricolare isolata e in brevi run (fino a 6 battiti). Un episodio di fibrillazione atriale parossistica di circa 3 minuti alle 03:40, asintomatico. Ectopia ventricolare rara e monomorfa.",
    },
    holterPressorio: {
      dataEsame: giorniFa(28),
      media24Sist: 136,
      media24Diast: 81,
      mediaDiurnaSist: 139,
      mediaDiurnaDiast: 84,
      mediaNotturnaSist: 129,
      mediaNotturnaDiast: 75,
      caricoPressorioPct: 42,
      referto:
        "Valori medi sopra i limiti nelle 24 ore e di giorno. Calo notturno ridotto, profilo non-dipper.",
    },
    dopplerTsa: {
      dataEsame: giorniFa(60),
      struttura: "Ambulatorio di angiologia",
      imtMax: 1.1,
      stenosiCarotidea: 30,
      sedeStenosi: "bulbo carotideo destro",
      placche: "Fibrocalcifica, a superficie regolare",
      vertebrali: "Pervie, flusso anterogrado",
      referto:
        "Ispessimento medio-intimale diffuso. Placca del bulbo carotideo destro emodinamicamente non significativa.",
    },
    scompenso: {
      nyha: "II",
      ntProBnp: 210,
      contestoBnp: "ambulatoriale",
      dataBnp: giorniFa(7),
      referto:
        "Dispnea da sforzo con NT-proBNP sopra la soglia di esclusione, ipertrofia ventricolare iniziale e disfunzione diastolica: quadro compatibile con scompenso a frazione di eiezione preservata.",
    },
    fibrillazioneAtriale: {
      attivo: true,
      hbFarmaci: true,
      referto:
        "Fibrillazione atriale parossistica di recente riscontro. Indicazione alla terapia anticoagulante orale.",
    },
    laboratorio: {
      dataPrelievo: giorniFa(7),
      colesteroloTotale: 195,
      hdl: 52,
      trigliceridi: 140,
      apoB: 98,
      lpa: 62,
      hsPcr: 1.8,
      fibrinogeno: 320,
      oxLdl: 58,
      glicemia: 108,
      insulina: 9,
      hba1c: 5.9,
      creatinina: 0.92,
      albuminuria: 18,
      sodio: 140,
      potassio: 4.6,
      emoglobina: 13.2,
      ferritina: 85,
      ast: 22,
      alt: 25,
      uricemia: 5.4,
      azotemia: 38,
      tsh: 2.1,
    },
  },
};

export const RICETTA_ESEMPIO: RicettaPaziente = {
  id: "esempio-ricetta",
  patientId: PAZIENTE_ESEMPIO.id,
  tipo: "bianca",
  dataRicetta: OGGI,
  testo:
    "Apixaban 5 mg: 1 cp ogni 12 ore | 3 mesi\nRamipril 10 mg: 1 cp al mattino | 3 mesi\nAtorvastatina 40 mg: 1 cp la sera | 3 mesi\n\nSospendere l'acido acetilsalicilico dal giorno in cui si inizia l'apixaban.",
  createdAt: OGGI,
  updatedAt: OGGI,
};

export const CERTIFICATO_ESEMPIO: CertificatoPaziente = {
  id: "esempio-certificato",
  patientId: PAZIENTE_ESEMPIO.id,
  tipo: "idoneita",
  dataCertificato: OGGI,
  descrizione:
    "la paziente, visitata in data odierna, può svolgere attività fisica non agonistica di intensità moderata, come camminata e cyclette, evitando gli sport di contatto per la terapia anticoagulante in atto.\nIl presente certificato ha validità di un anno dalla data di rilascio.",
  createdAt: OGGI,
  updatedAt: OGGI,
};

export const RICHIESTA_ESEMPIO: RichiestaEsameComplementare = {
  id: "esempio-richiesta",
  patientId: PAZIENTE_ESEMPIO.id,
  nome: "Ecocardiogramma color-Doppler transtoracico",
  note:
    "Fibrillazione atriale parossistica di recente riscontro, ipertrofia ventricolare sinistra iniziale. Controllo della funzione diastolica e delle dimensioni dell'atrio sinistro.",
  dataRichiesta: OGGI,
  createdAt: OGGI,
  updatedAt: OGGI,
};
