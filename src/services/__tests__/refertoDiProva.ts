import type { Patient, Visit } from "../../types/Storage";

/**
 * Un paziente e una visita compilati dappertutto.
 *
 * Servono a due cose che hanno lo stesso bisogno: l'anteprima del referto
 * (`npm run anteprima`), che permette di guardare il foglio senza doversi
 * inventare una visita nell'applicazione, e il test di impaginazione, che
 * verifica che niente esca dai margini — e a sbordare e' il referto pieno, non
 * quello vuoto.
 *
 * I valori sono scelti perche' facciano vedere il referto al lavoro: pressione
 * e LDL fuori norma per il grassetto, calcium score in fascia severa, classe di
 * rischio dichiarata con i fattori che la giustificano, tutti i moduli
 * strumentali compilati.
 */

export const pazienteDiProva: Patient = {
  id: "p1",
  nome: "Mario",
  cognome: "Prova",
  dataNascita: "1950-04-12",
  luogoNascita: "Bergamo",
  sesso: "M",
  altezza: 175,
  codiceFiscale: "PRVMRA50D12A794K",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

export const visitaDiProva: Visit = {
  id: "v1a2b3c4",
  patientId: "p1",
  dataVisita: "2026-09-07",
  descrizioneClinica: "",
  anamnesi: "",
  esamiObiettivo: "",
  conclusioniDiagnostiche: "",
  terapie: "",
  createdAt: "2026-09-07",
  updatedAt: "2026-09-07",
  visita: {
    problemaClinico:
      "Il paziente riferisce dispnea da sforzo comparsa da circa due mesi, con progressiva riduzione della tolleranza all'esercizio. Nega dolore toracico a riposo, cardiopalmo, sincopi o lipotimie.",
    prestazione:
      "Ipertensione arteriosa nota da quindici anni, in trattamento con ACE-inibitore.\nDislipidemia in terapia con statina a media intensita'.\nPregresso infarto miocardico inferiore nel 2019, trattato con angioplastica e impianto di stent medicato su coronaria destra.\nNega diabete mellito. Familiarita' paterna per cardiopatia ischemica precoce.\nEx fumatore, sospensione nel 2019. Attivita' fisica saltuaria.",
    terapiaInAtto:
      "Acido acetilsalicilico 100 mg, 1 cp al mattino.\nRamipril 5 mg, 1 cp al mattino.\nBisoprololo 2,5 mg, 1 cp al mattino.\nAtorvastatina 40 mg, 1 cp la sera.",
    esameObiettivo:
      "Paziente vigile, orientato, eupnoico a riposo. Toni cardiaci validi e ritmici, soffio sistolico 2/6 sul focolaio aortico irradiato ai vasi del collo. Murmure vescicolare presente su tutto l'ambito polmonare, non rumori aggiunti. Addome trattabile. Non edemi declivi. Polsi periferici validi e simmetrici.",
    accertamenti:
      "Si richiede ecocardiogramma color-Doppler di controllo a sei mesi e nuovo profilo lipidico completo a tre mesi dall'ottimizzazione della terapia ipolipemizzante.",
    terapiaSpecifica:
      "Quadro compatibile con cardiopatia ischemica cronica in paziente a rischio cardiovascolare molto alto, attualmente in compenso emodinamico, classe NYHA II.\nSi conferma la terapia antiaggregante e antipertensiva in atto.\nSi incrementa la statina ad alta intensita' per il mancato raggiungimento dell'obiettivo lipidico previsto dalla classe di rischio.\nSi raccomanda attivita' fisica aerobica regolare e controllo cardiologico a sei mesi, o prima in caso di comparsa di sintomi.",
    pesoCorporeo: 84,
    pressioneArteriosa: "150/85",
    frequenzaCardiaca: "78",
    fumatore: "no",
    categoriaRischioCv: "molto-alto",
    fattoriRischio: {
      ipertensione: true,
      dislipidemia: true,
      familiaritaCad: true,
      sedentarieta: true,
      eventoCvPregresso: true,
    },
    ecg: {
      pr: 180,
      qrs: 96,
      qt: 400,
      asse: 30,
      referto:
        "Ritmo sinusale a frequenza 78/min. Onde Q di necrosi nelle derivazioni inferiori. Non alterazioni acute della ripolarizzazione ventricolare.",
    },
    ecocardiogramma: {
      ddvs: 54,
      dsvs: 36,
      siv: 12,
      pp: 11,
      fe: 48,
      atrioSinistro: 42,
      gradienteAorticoMedio: 18,
      gradienteAorticoMassimo: 32,
      areaValvolareAortica: 1.9,
      gradienteMitralicoMedio: 3,
      gradienteMitralicoMassimo: 7,
      radiceAortica: 34,
      aortaAscendente: 41,
      tapse: 20,
      paps: 30,
      rapportoEA: 0.8,
      referto:
        "Ventricolo sinistro di dimensioni conservate, con ipocinesia della parete inferiore in sede basale e media. Funzione sistolica globale lievemente ridotta. Disfunzione diastolica di grado I. Sclerosi valvolare aortica con gradiente non significativo. Non versamento pericardico.",
    },
    tcCoronarica: {
      dataEsame: "2026-05-04",
      struttura: "Policlinico universitario, servizio di radiodiagnostica",
      metodica: "TC multistrato 128 strati con mezzo di contrasto iodato",
      cacScore: 460,
      cadRads: "3",
      cadRadsModificatori: ["HRP"],
      burdenPlacca: "P3",
      componenteCalcifica: 70,
      componenteNonCalcifica: 30,
      stenosiMassima: 55,
      stenosiMassimaSegmento: 7,
      segmenti: [1, 2, 7],
      referto:
        "Placca mista con componente fibrolipidica prevalente sul tratto medio del ramo interventricolare anteriore, con stenosi stimata del 55%. Stent pervio sulla coronaria destra. Si concorda con il collega radiologo sull'indicazione a test funzionale.",
    },
    testErgometrico: {
      dataEsame: "2026-06-10",
      protocollo: "Bruce",
      durataMin: 8,
      caricoWatt: 125,
      mets: 9,
      fcMax: 142,
      paMax: "190/95",
      motivoInterruzione: "Esaurimento muscolare degli arti inferiori",
      esito: "Negativo per ischemia inducibile",
      referto:
        "Test massimale interrotto per esaurimento muscolare. Risposta pressoria di tipo ipertensivo al picco dello sforzo. Non alterazioni del tratto ST significative ne' aritmie da sforzo.",
    },
    holterEcg: {
      dataEsame: "2026-06-20",
      durataOre: 24,
      ritmoPrevalente: "Sinusale",
      fcMedia: 68,
      fcMin: 48,
      fcMax: 132,
      besv: 320,
      bev: 1450,
      pausaMaxSec: 2.1,
      referto:
        "Ritmo sinusale per tutta la durata della registrazione. Rari battiti ectopici sopraventricolari isolati. Extrasistolia ventricolare monomorfa a bassa densita'. Nessuna pausa patologica.",
    },
    holterPressorio: {
      dataEsame: "2026-06-21",
      media24Sist: 138,
      media24Diast: 82,
      mediaDiurnaSist: 142,
      mediaDiurnaDiast: 86,
      mediaNotturnaSist: 128,
      mediaNotturnaDiast: 74,
      caricoPressorioPct: 42,
      referto:
        "Profilo pressorio delle 24 ore di tipo non dipper, con insufficiente calo notturno. Controllo pressorio subottimale nelle ore diurne.",
    },
    laboratorio: {
      dataPrelievo: "2026-08-20",
      colesteroloTotale: 210,
      hdl: 42,
      trigliceridi: 180,
      apoB: 95,
      lpa: 60,
      glicemia: 102,
      insulina: 12,
      hba1c: 5.8,
      creatinina: 1.2,
      albuminuria: 45,
      emoglobina: 14.2,
      ast: 28,
      alt: 32,
      uricemia: 6.1,
      tsh: 2.4,
      hsPcr: 2.8,
      oxLdl: 70,
      fibrinogeno: 380,
    },
    dopplerTsa: {
      dataEsame: "2026-07-02",
      struttura: "Ambulatorio di chirurgia vascolare",
      imtMax: 1.1,
      stenosiCarotidea: 45,
      sedeStenosi: "bulbo carotideo destro",
      placche: "Placca fibrocalcifica al bulbo carotideo destro, superficie regolare",
      vertebrali: "Pervie, flusso anterogrado bilateralmente",
      referto:
        "Spessore medio-intimale aumentato su entrambi gli assi. Placca fibrocalcifica al bulbo carotideo destro con stenosi stimata del 45%, emodinamicamente non significativa. Asse controlaterale indenne. Il reperto documenta malattia aterosclerotica ed entra nella definizione della classe di rischio.",
    },
    scompenso: {
      nyha: "II",
      ntProBnp: 420,
      dataBnp: "2026-08-20",
      contestoBnp: "ambulatoriale",
      referto:
        "Compenso emodinamico stabile in terapia. Si mantiene il dosaggio attuale del diuretico.",
    },
    fibrillazioneAtriale: {
      attivo: true,
      cvScompenso: true,
      cvVascolare: true,
      referto:
        "Non documentati episodi di fibrillazione atriale al monitoraggio delle 24 ore. Si mantiene la sorveglianza clinica.",
    },
    sintesiRischio:
      "Prevenzione secondaria dopo evento coronarico, con calcium score in fascia severa: il paziente resta sopra l'obiettivo lipidico nonostante la terapia in atto.",
  },
};
