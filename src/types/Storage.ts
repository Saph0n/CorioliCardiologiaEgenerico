// Tipi per i dati dell'applicazione offline
export interface Patient {
  /** Identificativo univoco del paziente (UUID). Non usare il codice fiscale come id. */
  id: string;
  /** Codice fiscale, opzionale (non tutti i pazienti lo hanno). */
  codiceFiscale?: string;
  /** True se il CF è stato generato automaticamente in fase di import */
  codiceFiscaleGenerato?: boolean;
  nome: string;
  cognome: string;
  dataNascita: string;
  luogoNascita: string;
  /**
   * Facoltativo, come in Cardiologia: senza scelta prima si salvava "M", e il
   * dato inventato finiva nel referto e nelle soglie della circonferenza vita.
   */
  sesso?: 'M' | 'F';
  indirizzo?: string;
  telefono?: string;
  email?: string;
  /** Campi clinici opzionali nel profilo */
  gruppoSanguigno?: string;
  allergie?: string;
  altezza?: number; // in cm
  peso?: number; // in kg (utile per BMI iniziale)
  /** Note rapide del medico (visibili in scheda paziente, modificabili al volo) */
  notaBene?: string;
  createdAt: string;
  updatedAt: string;
}

/** Richiesta di esame complementare: entità separata dalla visita, foglio dedicato */
export interface RichiestaEsameComplementare {
  id: string;
  patientId: string;
  nome: string;
  note?: string;
  dataRichiesta: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

/** Certificato medico rilasciato al paziente (assenze, idoneità, malattia, altro) */
export interface CertificatoPaziente {
  id: string;
  patientId: string;
  /** Tipo: assenza lavoro, idoneità, malattia, altro */
  tipo: 'assenza_lavoro' | 'idoneita' | 'malattia' | 'altro';
  dataCertificato: string; // ISO date
  descrizione: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Anamnesi suddivisa per categorie (referto strutturato in stile specialistico).
 * Tutti i campi sono facoltativi. Se valorizzata, sostituisce l'anamnesi singola
 * (`visita.prestazione`) nel referto PDF.
 */
export interface AnamnesiStrutturata {
  familiare?: string;
  fisiologica?: string;
  patologica?: string;
  /** Interventi chirurgici e ricoveri pregressi */
  chirurgica?: string;
  farmacologica?: string;
  allergica?: string;
  /** Abitudini di vita: fumo, alcol, attivita' fisica, lavoro */
  abitudini?: string;
  /**
   * Sezioni personalizzate aggiunte dal medico (chiave generata, es. "custom_xxx").
   * Il contenuto è indicizzato per chiave; le etichette stanno in `anamnesiConfig`.
   */
  [key: string]: string | undefined;
}

/** Singolo farmaco in una ricetta */
export interface RicettaFarmaco {
  nome: string;
  posologia: string;
  durata?: string;
}

/** Ricetta / promemoria terapia rilasciato al paziente (PDF cartaceo) */
export interface RicettaPaziente {
  id: string;
  patientId: string;
  /** SSN dematerializzata (promemoria), bianca fuori SSN, promemoria terapia */
  tipo: 'ssn' | 'bianca' | 'promemoria';
  dataRicetta: string; // ISO date
  /** Testo libero della prescrizione (farmaci, posologie e indicazioni insieme). */
  testo?: string;
  /** @deprecated Vecchio formato a elenco; conservato per retrocompatibilità in lettura. */
  farmaci?: RicettaFarmaco[];
  /** @deprecated Confluito in `testo`; conservato per retrocompatibilità in lettura. */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Singolo campo modificato in una revisione della visita. I valori sono già formattati per la lettura. */
export interface VisitFieldChange {
  /** Chiave tecnica del campo (eventualmente con prefisso sezione, es. "visita.pesoCorporeo"). */
  field: string;
  /** Etichetta leggibile in italiano (es. "Visita · Peso corporeo"). */
  label: string;
  /** Valore precedente, formattato come stringa per la visualizzazione. */
  previousValue: string;
  /** Nuovo valore, formattato come stringa per la visualizzazione. */
  newValue: string;
}

/**
 * Una voce della cronologia delle modifiche di una visita.
 * Viene salvata in uno store dedicato e indipendente dalla visita/paziente:
 * non deve mai essere eliminata (né eliminando il paziente, né la visita, né col reset totale).
 * Per questo include uno snapshot dei dati di contesto (nome paziente, data visita...).
 */
export interface VisitRevision {
  id: string;
  /** Id della visita a cui si riferisce la modifica. */
  visitId: string;
  /** Id del paziente. */
  patientId: string;
  /** Nome del paziente al momento della modifica (resta leggibile anche se il paziente viene eliminato). */
  patientName?: string;
  /** Data della visita al momento della modifica (snapshot ISO). */
  visitDate: string;
  /** Tipo di visita al momento della modifica. */
  visitType?: string;
  /** Data e ora in cui la modifica è stata salvata (ISO). */
  modifiedAt: string;
  /** Elenco dei campi modificati con il relativo valore precedente. */
  changes: VisitFieldChange[];
}

export interface Visit {
  id: string;
  patientId: string;
  dataVisita: string;
  descrizioneClinica: string;
  anamnesi: string;
  esamiObiettivo: string;
  conclusioniDiagnostiche: string;
  terapie: string;
  /**
   * Tipo di visita. L'edizione generale ha un solo tipo (`generale`); il campo
   * resta per compatibilità con i backup e per eventuali estensioni future.
   */
  tipo?: 'generale';
  /**
   * Anamnesi strutturata (familiare, fisiologica, patologica, farmacologica,
   * allergica + sezioni personalizzate). Presente solo se il medico usa la
   * modalità "anamnesi strutturata". Se valorizzata, ha priorità sull'anamnesi
   * singola (`visita.prestazione`) nella stampa del referto.
   */
  anamnesiStrutturata?: AnamnesiStrutturata;
  /** Contenuto clinico della visita (referto specialistico generale). */
  visita?: {
    /** Descrizione del problema / dati clinici riferiti dal paziente. */
    problemaClinico: string;
    /** Anamnesi in campo unico (usata quando l'anamnesi strutturata è disattivata). */
    prestazione: string;
    /** Esame obiettivo. */
    esameObiettivo: string;
    /** Accertamenti / esami visionati o richiesti. */
    accertamenti: string;
    /** Conclusioni diagnostiche e terapia consigliata. */
    terapiaSpecifica: string;
    /** Peso corporeo (kg) — usato per il calcolo del BMI. */
    pesoCorporeo?: number;
    /** Pressione arteriosa (es. "120/80"). */
    pressioneArteriosa?: string;
    /**
     * Posizione della prima misurazione, come su Corioli Cardiologia.
     * Assente vale "clino".
     */
    posizionePa?: "clino" | "orto";
    /** Frequenza cardiaca (bpm). */
    frequenzaCardiaca?: string;
    /**
     * Seconda misurazione, facoltativa: con una delle due in clino e l'altra
     * in orto e' la prova ortostatica (vedi `utils/parametriVitali`).
     * Campi semplici e non un oggetto, perche' la cronologia delle revisioni
     * confronta la visita campo per campo.
     */
    pressioneArteriosa2?: string;
    /** Posizione della seconda misurazione; assente vale "orto". */
    posizionePa2?: "clino" | "orto";
    frequenzaCardiaca2?: string;
    /** Circonferenza vita (cm). */
    circonferenzaVita?: number;
    /** Data URL (base64) delle immagini allegate al referto. */
    immagini?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface Ambulatorio {
  id: string;
  nome: string;
  indirizzo: string;
  citta: string;
  cap: string;
  telefono: string;
  email?: string;
  isPrimario: boolean;
}

/** Come il medico vuole essere chiamato, nel saluto e nell'intestazione dei PDF. */
export type TitoloMedico = "Dott." | "Dott.ssa" | "Prof." | "Prof.ssa";

export interface Doctor {
  id: string;
  /** Assente nei profili creati prima del campo: vale "Dott.". */
  titolo?: TitoloMedico;
  nome: string;
  cognome: string;
  email: string;
  telefono?: string;
  specializzazione?: string;
  ambulatori?: Ambulatorio[];
  /** Data URL (base64) della foto profilo */
  profileImage?: string;
  /** Data URL (base64) immagine timbro e/o firma per i PDF */
  signatureStampImage?: string;
  /**
   * Partita IVA, solo le 11 cifre. Facoltativa: quando c'e' si stampa
   * nell'intestazione di referti e documenti.
   */
  partitaIva?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  title: string;
  description?: string;
  /** Se valorizzato, documento associato a uno specifico paziente */
  patientId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: 'corso_aggiornamento' | 'certificato' | 'altro';
  uploadDate: string;
  expiryDate?: string;
  credits?: number; // Crediti ECM se applicabile
  fileData: string; // Base64 encoded file data
  createdAt: string;
  updatedAt: string;
}

export interface MedicalTemplate {
  id: string;
  category: 'visita' | 'terapie' | 'ricette' | 'esame_complementare' | 'certificato';
  section:
    | 'prestazione'
    | 'esameObiettivo'
    | 'conclusioni'
    | 'generale'
    | 'nome'
    | 'note'
    // Sotto-sezioni dell'anamnesi strutturata
    | 'anamnesiFamiliare'
    | 'anamnesiFisiologica'
    | 'anamnesiPatologica'
    | 'anamnesiChirurgica'
    | 'anamnesiFarmacologica'
    | 'anamnesiAllergica'
    | 'anamnesiAbitudini'
    // Sezioni personalizzate dell'anamnesi: chiave generata (es. "custom_xxx").
    // `string & {}` mantiene i suggerimenti sui valori noti pur accettando chiavi custom.
    | (string & {});
  label: string;
  text: string;
  note?: string;
  isDefault?: boolean;
}

export interface AppData {
  /** Versione dello schema del backup (assente nei backup prodotti prima della 1.3.2). */
  schemaVersion?: number;
  /** Versione dell'app che ha generato il backup. */
  appVersion?: string;
  /** Data/ora di generazione (ISO). */
  exportedAt?: string;
  patients: Patient[];
  visits: Visit[];
  /** Cronologia delle modifiche delle visite (store indipendente, non viene mai cancellata). */
  visitRevisions?: VisitRevision[];
  richiesteEsami?: RichiestaEsameComplementare[];
  certificatiPaziente?: CertificatoPaziente[];
  ricettePaziente?: RicettaPaziente[];
  doctor: Doctor;
  documents: Document[];
  templates?: MedicalTemplate[];
  lastSync?: string;
}

export type BackupImportMode = 'replace' | 'merge';

export interface StorageService {
  // Pazienti
  getPatients(): Promise<Patient[]>;
  getPatientById(id: string): Promise<Patient | null>;
  getPatientByCF(cf: string): Promise<Patient | null>;
  addPatient(patient: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Patient>;
  updatePatient(id: string, patient: Partial<Patient>): Promise<Patient>;
  deletePatient(id: string): Promise<void>;

  // Visite
  getVisits(): Promise<Visit[]>;
  getVisitsByPatientId(patientId: string): Promise<Visit[]>;
  getVisitById(id: string): Promise<Visit | null>;
  addVisit(visit: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<Visit>;
  updateVisit(id: string, visit: Partial<Visit>): Promise<Visit>;
  deleteVisit(id: string): Promise<void>;

  /** Cronologia modifiche visite (store dedicato, mai cancellato dalle eliminazioni o dal reset). */
  getVisitRevisions(): Promise<VisitRevision[]>;

  // Richieste esami complementari (entità separata dalla visita)
  getRichiesteEsamiByPatientId(patientId: string): Promise<RichiestaEsameComplementare[]>;
  getRichiestaEsameById(id: string): Promise<RichiestaEsameComplementare | null>;
  addRichiestaEsame(data: Omit<RichiestaEsameComplementare, 'id' | 'createdAt' | 'updatedAt'>): Promise<RichiestaEsameComplementare>;
  updateRichiestaEsame(id: string, data: Partial<RichiestaEsameComplementare>): Promise<RichiestaEsameComplementare>;
  deleteRichiestaEsame(id: string): Promise<void>;

  // Certificati paziente
  getCertificatiByPatientId(patientId: string): Promise<CertificatoPaziente[]>;
  getCertificatoById(id: string): Promise<CertificatoPaziente | null>;
  addCertificato(data: Omit<CertificatoPaziente, 'id' | 'createdAt' | 'updatedAt'>): Promise<CertificatoPaziente>;
  updateCertificato(id: string, data: Partial<CertificatoPaziente>): Promise<CertificatoPaziente>;
  deleteCertificato(id: string): Promise<void>;

  // Ricette paziente
  getRicetteByPatientId(patientId: string): Promise<RicettaPaziente[]>;
  getRicettaById(id: string): Promise<RicettaPaziente | null>;
  addRicetta(data: Omit<RicettaPaziente, 'id' | 'createdAt' | 'updatedAt'>): Promise<RicettaPaziente>;
  updateRicetta(id: string, data: Partial<RicettaPaziente>): Promise<RicettaPaziente>;
  deleteRicetta(id: string): Promise<void>;

  // Dottore
  getDoctor(): Promise<Doctor | null>;
  updateDoctor(doctor: Partial<Doctor>): Promise<Doctor>;

  // Documenti
  getDocuments(): Promise<Document[]>;
  getDocumentById(id: string): Promise<Document | null>;
  addDocument(document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document>;
  updateDocument(id: string, document: Partial<Document>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;

  // Template
  getTemplates(): Promise<MedicalTemplate[]>;
  addTemplate(template: Omit<MedicalTemplate, 'id'>): Promise<MedicalTemplate>;
  updateTemplate(id: string, template: Partial<MedicalTemplate>): Promise<MedicalTemplate>;
  deleteTemplate(id: string): Promise<void>;

  // Backup/Export
  exportData(): Promise<AppData>;
  importData(data: AppData, mode?: BackupImportMode): Promise<void>;
  clearAllData(): Promise<void>;
}
