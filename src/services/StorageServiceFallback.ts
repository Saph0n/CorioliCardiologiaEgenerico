import { StorageService, Patient, Visit, VisitRevision, Doctor, Document, AppData, MedicalTemplate, BackupImportMode, RichiestaEsameComplementare, CertificatoPaziente, RicettaPaziente } from '../types/Storage';
import { MedicalTemplates } from '../data/medicalTemplates';
import { MODELLI_RISCRITTI, TERAPIE_RITIRATE, type ModelloPrecedente } from '../data/modelliRiscritti';
import { computeVisitChanges } from '../utils/visitHistory';
import { BACKUP_SCHEMA_VERSION } from '../utils/backupValidation';
import { correggiAccenti } from '../utils/accenti';

declare global {
  interface Window {
    electronAPI?: {
      kvGet: (key: string) => Promise<string | null>;
      kvSet: (key: string, value: string) => Promise<void>;
      kvRemove: (key: string) => Promise<void>;
      kvClearAppDottori: () => Promise<void>;
      recordsGetAll?: (collection: string, options?: { withoutImages?: boolean }) => Promise<string[]>;
      recordsGetById?: (collection: string, id: string) => Promise<string | null>;
      recordsGetByPatient?: (collection: string, patientId: string) => Promise<string[]>;
      recordsCount?: (collection: string) => Promise<number>;
      recordsBatch?: (ops: StoreOp[]) => Promise<void>;
    };
  }
}

function isSqliteAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.kvGet;
}

/**
 * Dove stanno fisicamente le chiavi dei dati piccoli (profilo, modelli,
 * preferenze, bozze): il database locale (tabella chiave/valore) in Electron,
 * localStorage nel browser e nei test. I record clinici stanno invece in un
 * `RecordBackend`, uno per record.
 */
interface ArchivioChiavi {
  leggi(chiave: string): Promise<string | null>;
  scrivi(chiave: string, valore: string): Promise<void>;
  togli(chiave: string): Promise<void>;
}

const chiaviReali: ArchivioChiavi = {
  async leggi(chiave) {
    return isSqliteAvailable()
      ? await window.electronAPI!.kvGet(chiave)
      : localStorage.getItem(chiave);
  },
  async scrivi(chiave, valore) {
    if (isSqliteAvailable()) await window.electronAPI!.kvSet(chiave, valore);
    else localStorage.setItem(chiave, valore);
  },
  async togli(chiave) {
    if (isSqliteAvailable()) await window.electronAPI!.kvRemove(chiave);
    else localStorage.removeItem(chiave);
  },
};

/**
 * Le chiavi dell'archivio clinico: pazienti, visite e tutto quello che ne
 * dipende. Sono quelle che l'archivio di prova della guida tiene in memoria.
 */
const CHIAVI_CLINICHE = new Set(
  [
    'patients',
    'visits',
    'visit_revisions',
    'richieste_esami',
    'certificati_paziente',
    'ricette_paziente',
    'documents',
    'recent_patient_searches',
  ].map((k) => `AppDottori_${k}`),
);
/** Bozze delle visite: una per visita o per paziente, quindi a prefisso. */
const PREFISSI_CLINICI = ['AppDottori_bozza_visita_'];

function chiaveClinica(chiave: string): boolean {
  return CHIAVI_CLINICHE.has(chiave) || PREFISSI_CLINICI.some((p) => chiave.startsWith(p));
}

const NON_NELLA_PROVA =
  'Non disponibile durante la guida: esci dalla guida e riprova.';

/**
 * L'archivio della guida: le chiavi cliniche in memoria, tutto il resto
 * (profilo, preferenze, modelli) nell'archivio vero. Quello che il medico
 * sistema durante la guida — lo studio, i moduli, un modello nuovo — resta;
 * i pazienti inventati e le visite scritte su di loro spariscono con la
 * memoria, senza niente da cancellare dopo e senza passare dal database, dal
 * backup automatico o dalla copia su file.
 */
function chiaviDiProva(memoria: Map<string, string>): ArchivioChiavi {
  return {
    async leggi(chiave) {
      return chiaveClinica(chiave) ? (memoria.get(chiave) ?? null) : chiaviReali.leggi(chiave);
    },
    async scrivi(chiave, valore) {
      if (chiaveClinica(chiave)) memoria.set(chiave, valore);
      else await chiaviReali.scrivi(chiave, valore);
    },
    async togli(chiave) {
      if (chiaveClinica(chiave)) memoria.delete(chiave);
      else await chiaviReali.togli(chiave);
    },
  };
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = '0123456789abcdef';
  const r = (n: number) => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return `${r(8)}-${r(4)}-4${r(3)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${r(3)}-${r(12)}`;
}

/** Collezioni salvate una riga per record (vedi electron/recordStore.js). */
type RecordCollection =
  | 'patients'
  | 'visits'
  | 'visit_revisions'
  | 'richieste_esami'
  | 'certificati_paziente'
  | 'ricette_paziente'
  | 'documents';

const RECORD_COLLECTIONS: RecordCollection[] = [
  'patients',
  'visits',
  'visit_revisions',
  'richieste_esami',
  'certificati_paziente',
  'ricette_paziente',
  'documents',
];

/** Collezioni legate a un paziente, da eliminare con lui (la cronologia resta). */
const PATIENT_OWNED_COLLECTIONS: RecordCollection[] = [
  'visits',
  'richieste_esami',
  'certificati_paziente',
  'ricette_paziente',
  'documents',
];

type StoredRecord = { id: string; patientId?: string };

/** Operazione di scrittura: un gruppo di operazioni è applicato tutto o niente. */
type StoreOp =
  | { type: 'put'; collection: RecordCollection; records: StoredRecord[] }
  | { type: 'delete'; collection: RecordCollection; id: string }
  | { type: 'deleteByPatient'; collection: RecordCollection; patientId: string }
  | { type: 'replaceCollection'; collection: RecordCollection; records: StoredRecord[] }
  | { type: 'kvSet'; key: string; value: string }
  | { type: 'kvRemove'; key: string }
  /** Reset dei dati dell'app: la cronologia delle modifiche non viene toccata. */
  | { type: 'clearAppData' };

/**
 * Dove stanno i record clinici: una riga per record nel database SQLite
 * dell'app desktop, un array JSON per collezione nel browser, nei test e
 * nell'archivio di prova della guida.
 *
 * Prima ogni collezione era un unico blob letto e riscritto per intero a ogni
 * operazione: con qualche migliaio di pazienti salvare una visita costava
 * secondi (lo stesso problema corretto in Corioli Ginecologia 1.4.0).
 */
interface RecordBackend {
  getAll<T>(collection: RecordCollection, options?: { withoutImages?: boolean }): Promise<T[]>;
  getById<T>(collection: RecordCollection, id: string): Promise<T | null>;
  getByPatient<T>(collection: RecordCollection, patientId: string): Promise<T[]>;
  count(collection: RecordCollection): Promise<number>;
  batch(ops: StoreOp[]): Promise<void>;
}

/** Copia della visita senza le immagini allegate (per gli elenchi). */
function stripVisitImages(visit: Visit): Visit {
  if (!visit.visita || !('immagini' in visit.visita)) return visit;
  const { immagini: _omit, ...rest } = visit.visita;
  return { ...visit, visita: rest };
}

function parseRows<T>(rows: string[] | null | undefined): T[] {
  const out: T[] = [];
  for (const row of rows ?? []) {
    try {
      out.push(JSON.parse(row) as T);
    } catch (error) {
      console.error('Record illeggibile ignorato:', error);
    }
  }
  return out;
}

/** App desktop: un record per riga nel database SQLite del main process. */
class ElectronRecordBackend implements RecordBackend {
  private get api() {
    return window.electronAPI!;
  }

  async getAll<T>(collection: RecordCollection, options?: { withoutImages?: boolean }): Promise<T[]> {
    return parseRows<T>(await this.api.recordsGetAll!(collection, options));
  }

  async getById<T>(collection: RecordCollection, id: string): Promise<T | null> {
    const row = await this.api.recordsGetById!(collection, id);
    return row ? parseRows<T>([row])[0] ?? null : null;
  }

  async getByPatient<T>(collection: RecordCollection, patientId: string): Promise<T[]> {
    return parseRows<T>(await this.api.recordsGetByPatient!(collection, patientId));
  }

  async count(collection: RecordCollection): Promise<number> {
    return await this.api.recordsCount!(collection);
  }

  async batch(ops: StoreOp[]): Promise<void> {
    if (ops.length === 0) return;
    await this.api.recordsBatch!(ops);
  }
}

/** Chiavi lette e scritte senza attese: localStorage, o la memoria della prova. */
interface ChiaviSincrone {
  leggi(chiave: string): string | null;
  scrivi(chiave: string, valore: string): void;
  togli(chiave: string): void;
}

/**
 * Browser (sviluppo), test e archivio di prova: ogni collezione è un array
 * JSON sotto `AppDottori_<collezione>`, come nelle versioni precedenti. Un
 * gruppo di operazioni viene calcolato per intero e poi scritto; se una
 * scrittura fallisce si ripristinano i valori precedenti, così anche qui vale
 * il "tutto o niente".
 */
class ArrayRecordBackend implements RecordBackend {
  /** Chiavi kv rimosse dal reset (oltre alle collezioni). */
  private static readonly CLEARED_KV_KEYS = ['doctor', 'templates', 'preferences', 'recent_patient_searches'];

  /**
   * @param conChiaviKv falso nell'archivio di prova: lì profilo, modelli e
   *   preferenze restano nell'archivio vero, e import e reset sono vietati.
   */
  constructor(
    private readonly chiavi: ChiaviSincrone,
    private readonly conChiaviKv = true,
  ) {}

  private key(collection: RecordCollection): string {
    return `AppDottori_${collection}`;
  }

  private read<T>(collection: RecordCollection): T[] {
    try {
      const raw = this.chiavi.leggi(this.key(collection));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(`Errore nel recupero dei dati per ${collection}:`, error);
      return [];
    }
  }

  async getAll<T>(collection: RecordCollection, options?: { withoutImages?: boolean }): Promise<T[]> {
    const list = this.read<T>(collection);
    if (options?.withoutImages && collection === 'visits') {
      return (list as unknown as Visit[]).map(stripVisitImages) as unknown as T[];
    }
    return list;
  }

  async getById<T>(collection: RecordCollection, id: string): Promise<T | null> {
    return this.read<T & StoredRecord>(collection).find((r) => r.id === id) ?? null;
  }

  async getByPatient<T>(collection: RecordCollection, patientId: string): Promise<T[]> {
    return this.read<T & StoredRecord>(collection).filter((r) => r.patientId === patientId);
  }

  async count(collection: RecordCollection): Promise<number> {
    return this.read(collection).length;
  }

  async batch(ops: StoreOp[]): Promise<void> {
    const lists = new Map<RecordCollection, StoredRecord[]>();
    const kv = new Map<string, string | null>();
    const list = (collection: RecordCollection) => {
      if (!lists.has(collection)) lists.set(collection, this.read<StoredRecord>(collection));
      return lists.get(collection)!;
    };
    const soloArchivioVero = () => {
      if (!this.conChiaviKv) throw new Error(NON_NELLA_PROVA);
    };

    for (const op of ops) {
      switch (op.type) {
        case 'put': {
          const arr = list(op.collection);
          for (const record of op.records) {
            const index = arr.findIndex((r) => r.id === record.id);
            if (index === -1) arr.push(record);
            else arr[index] = record;
          }
          break;
        }
        case 'delete':
          lists.set(op.collection, list(op.collection).filter((r) => r.id !== op.id));
          break;
        case 'deleteByPatient':
          lists.set(op.collection, list(op.collection).filter((r) => r.patientId !== op.patientId));
          break;
        case 'replaceCollection':
          lists.set(op.collection, [...op.records]);
          break;
        case 'kvSet':
          soloArchivioVero();
          kv.set(op.key, op.value);
          break;
        case 'kvRemove':
          soloArchivioVero();
          kv.set(op.key, null);
          break;
        case 'clearAppData':
          soloArchivioVero();
          for (const collection of RECORD_COLLECTIONS) {
            if (collection !== 'visit_revisions') lists.set(collection, []);
          }
          for (const key of ArrayRecordBackend.CLEARED_KV_KEYS) kv.set(`AppDottori_${key}`, null);
          break;
      }
    }

    const writes: [string, string | null][] = [
      ...[...lists].map(([collection, arr]): [string, string] => [this.key(collection), JSON.stringify(arr)]),
      ...kv,
    ];
    const previous = writes.map(([key]): [string, string | null] => [key, this.chiavi.leggi(key)]);
    try {
      for (const [key, value] of writes) {
        if (value === null) this.chiavi.togli(key);
        else this.chiavi.scrivi(key, value);
      }
    } catch (error) {
      for (const [key, value] of previous) {
        try {
          if (value === null) this.chiavi.togli(key);
          else this.chiavi.scrivi(key, value);
        } catch (restoreError) {
          console.error(`Ripristino di ${key} non riuscito:`, restoreError);
        }
      }
      throw error;
    }
  }
}

const recordElectron = new ElectronRecordBackend();
const recordLocalStorage = new ArrayRecordBackend({
  leggi: (chiave) => localStorage.getItem(chiave),
  scrivi: (chiave, valore) => localStorage.setItem(chiave, valore),
  togli: (chiave) => localStorage.removeItem(chiave),
});

/** Record dell'archivio vero: SQLite nell'app desktop, localStorage nel browser e nei test. */
function recordReali(): RecordBackend {
  return typeof window !== 'undefined' && window.electronAPI?.recordsBatch
    ? recordElectron
    : recordLocalStorage;
}

class LocalStorageFallbackService implements StorageService {
  constructor(
    private readonly chiavi: ArchivioChiavi,
    private readonly scegliRecord: () => RecordBackend,
  ) {}

  /** Record clinici: SQLite nell'app desktop, localStorage nel browser e nei test. */
  private get records(): RecordBackend {
    return this.scegliRecord();
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  private getStorageKey(key: string): string {
    return `AppDottori_${key}`;
  }

  /** Liste piccole salvate come un unico valore kv (modelli e firme dei seminati). */
  private async getFromStorage<T>(key: string): Promise<T[]> {
    try {
      const data = await this.chiavi.leggi(this.getStorageKey(key));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Errore nel recupero dei dati per ${key}:`, error);
      return [];
    }
  }

  private async saveToStorage<T>(key: string, data: T[]): Promise<void> {
    try {
      await this.chiavi.scrivi(this.getStorageKey(key), JSON.stringify(data));
    } catch (error) {
      console.error(`Errore nel salvataggio dei dati per ${key}:`, error);
      throw error;
    }
  }

  /** Chiave/valore per preferenze e altri dati (in Electron usa il db). */
  async getPreference(key: string): Promise<string | null> {
    return await this.chiavi.leggi(this.getStorageKey(key));
  }

  async setPreference(key: string, value: string): Promise<void> {
    await this.chiavi.scrivi(this.getStorageKey(key), value);
  }

  // Pazienti
  async getPatients(): Promise<Patient[]> {
    return await this.records.getAll<Patient>('patients');
  }

  async countPatients(): Promise<number> {
    return await this.records.count('patients');
  }

  async getPatientById(id: string): Promise<Patient | null> {
    return await this.records.getById<Patient>('patients', id);
  }

  async getPatientByCF(cf: string): Promise<Patient | null> {
    const normalizedCf = String(cf || "").trim().toUpperCase();
    const patients = await this.getPatients();
    return (
      patients.find(
        (p) => String(p.codiceFiscale || "").trim().toUpperCase() === normalizedCf
      ) || null
    );
  }

  async addPatient(patientData: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Patient> {
    const cfValue = patientData.codiceFiscale != null ? String(patientData.codiceFiscale).trim() : '';
    const normalizedCf = cfValue ? cfValue.toUpperCase() : '';
    if (normalizedCf) {
      const patients = await this.getPatients();
      const duplicate = patients.some(
        (p) => String(p.codiceFiscale || '').trim().toUpperCase() === normalizedCf
      );
      if (duplicate) throw new Error('Codice fiscale già presente');
    }
    const patient: Patient = {
      ...patientData,
      codiceFiscale: normalizedCf || undefined,
      id: generateUuid(),
      createdAt: this.getCurrentTimestamp(),
      updatedAt: this.getCurrentTimestamp()
    };

    await this.records.batch([{ type: 'put', collection: 'patients', records: [patient] }]);
    return patient;
  }

  async updatePatient(id: string, patientData: Partial<Patient>): Promise<Patient> {
    const patients = await this.getPatients();
    const current = patients.find(p => p.id === id);

    if (!current) {
      throw new Error('Paziente non trovato');
    }

    const rawNextCf = patientData.codiceFiscale ?? current.codiceFiscale;
    const nextCf = rawNextCf != null ? String(rawNextCf).trim().toUpperCase() : '';
    if (nextCf) {
      const duplicate = patients.some(
        (p) => p.id !== id && String(p.codiceFiscale || '').trim().toUpperCase() === nextCf
      );
      if (duplicate) throw new Error('Codice fiscale già presente');
    }

    const updated: Patient = {
      ...current,
      ...patientData,
      codiceFiscale: nextCf || undefined,
      id,
      updatedAt: this.getCurrentTimestamp()
    };

    await this.records.batch([{ type: 'put', collection: 'patients', records: [updated] }]);
    return updated;
  }

  async deletePatient(id: string): Promise<void> {
    // Paziente e dati collegati spariscono insieme, in un'unica transazione.
    // La cronologia delle modifiche alle visite resta.
    await this.records.batch([
      ...PATIENT_OWNED_COLLECTIONS.map((collection): StoreOp => ({ type: 'deleteByPatient', collection, patientId: id })),
      { type: 'delete', collection: 'patients', id },
    ]);
  }

  /** Aggiorna un record esistente della collezione, o lancia `notFound`. */
  private async updateRecord<T extends StoredRecord & { updatedAt: string }>(
    collection: RecordCollection,
    id: string,
    data: Partial<T>,
    notFound: string,
  ): Promise<T> {
    const current = await this.records.getById<T>(collection, id);
    if (!current) throw new Error(notFound);
    const updated: T = {
      ...current,
      ...data,
      id,
      updatedAt: this.getCurrentTimestamp(),
    };
    await this.records.batch([{ type: 'put', collection, records: [updated] }]);
    return updated;
  }

  private async addRecord<T extends StoredRecord>(
    collection: RecordCollection,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<T> {
    const record = {
      ...data,
      id: this.generateId(),
      createdAt: this.getCurrentTimestamp(),
      updatedAt: this.getCurrentTimestamp(),
    } as unknown as T;
    await this.records.batch([{ type: 'put', collection, records: [record] }]);
    return record;
  }

  private async deleteRecord(collection: RecordCollection, id: string): Promise<void> {
    await this.records.batch([{ type: 'delete', collection, id }]);
  }

  // Richieste esami complementari
  async getAllRichiesteEsami(): Promise<RichiestaEsameComplementare[]> {
    const list = await this.records.getAll<RichiestaEsameComplementare>('richieste_esami');
    return list.sort((a, b) => new Date(b.dataRichiesta).getTime() - new Date(a.dataRichiesta).getTime());
  }

  async getRichiesteEsamiByPatientId(patientId: string): Promise<RichiestaEsameComplementare[]> {
    const list = await this.records.getByPatient<RichiestaEsameComplementare>('richieste_esami', patientId);
    return list.sort((a, b) => new Date(b.dataRichiesta).getTime() - new Date(a.dataRichiesta).getTime());
  }

  async getRichiestaEsameById(id: string): Promise<RichiestaEsameComplementare | null> {
    return await this.records.getById<RichiestaEsameComplementare>('richieste_esami', id);
  }

  async addRichiestaEsame(data: Omit<RichiestaEsameComplementare, 'id' | 'createdAt' | 'updatedAt'>): Promise<RichiestaEsameComplementare> {
    return await this.addRecord<RichiestaEsameComplementare>('richieste_esami', data);
  }

  async updateRichiestaEsame(id: string, data: Partial<RichiestaEsameComplementare>): Promise<RichiestaEsameComplementare> {
    return await this.updateRecord<RichiestaEsameComplementare>('richieste_esami', id, data, 'Richiesta esame non trovata');
  }

  async deleteRichiestaEsame(id: string): Promise<void> {
    await this.deleteRecord('richieste_esami', id);
  }

  // Certificati paziente
  async getCertificatiByPatientId(patientId: string): Promise<CertificatoPaziente[]> {
    const list = await this.records.getByPatient<CertificatoPaziente>('certificati_paziente', patientId);
    return list.sort((a, b) => new Date(b.dataCertificato).getTime() - new Date(a.dataCertificato).getTime());
  }

  async getCertificatoById(id: string): Promise<CertificatoPaziente | null> {
    return await this.records.getById<CertificatoPaziente>('certificati_paziente', id);
  }

  async addCertificato(data: Omit<CertificatoPaziente, 'id' | 'createdAt' | 'updatedAt'>): Promise<CertificatoPaziente> {
    return await this.addRecord<CertificatoPaziente>('certificati_paziente', data);
  }

  async updateCertificato(id: string, data: Partial<CertificatoPaziente>): Promise<CertificatoPaziente> {
    return await this.updateRecord<CertificatoPaziente>('certificati_paziente', id, data, 'Certificato non trovato');
  }

  async deleteCertificato(id: string): Promise<void> {
    await this.deleteRecord('certificati_paziente', id);
  }

  // Ricette paziente
  async getRicetteByPatientId(patientId: string): Promise<RicettaPaziente[]> {
    const list = await this.records.getByPatient<RicettaPaziente>('ricette_paziente', patientId);
    return list.sort((a, b) => new Date(b.dataRicetta).getTime() - new Date(a.dataRicetta).getTime());
  }

  async getRicettaById(id: string): Promise<RicettaPaziente | null> {
    return await this.records.getById<RicettaPaziente>('ricette_paziente', id);
  }

  async addRicetta(data: Omit<RicettaPaziente, 'id' | 'createdAt' | 'updatedAt'>): Promise<RicettaPaziente> {
    return await this.addRecord<RicettaPaziente>('ricette_paziente', data);
  }

  async updateRicetta(id: string, data: Partial<RicettaPaziente>): Promise<RicettaPaziente> {
    return await this.updateRecord<RicettaPaziente>('ricette_paziente', id, data, 'Ricetta non trovata');
  }

  async deleteRicetta(id: string): Promise<void> {
    await this.deleteRecord('ricette_paziente', id);
  }

  // Visite
  async getVisits(): Promise<Visit[]> {
    return await this.records.getAll<Visit>('visits');
  }

  /**
   * Tutte le visite senza le immagini allegate: per elenchi e statistiche.
   * Non vanno salvate così come sono, le immagini andrebbero perse.
   */
  async getVisitsWithoutImages(): Promise<Visit[]> {
    return await this.records.getAll<Visit>('visits', { withoutImages: true });
  }

  async countVisits(): Promise<number> {
    return await this.records.count('visits');
  }

  async getVisitsByPatientId(patientId: string): Promise<Visit[]> {
    return await this.records.getByPatient<Visit>('visits', patientId);
  }

  async getVisitById(id: string): Promise<Visit | null> {
    return await this.records.getById<Visit>('visits', id);
  }

  async addVisit(visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<Visit> {
    return await this.addRecord<Visit>('visits', visitData);
  }

  async updateVisit(id: string, visitData: Partial<Visit>): Promise<Visit> {
    const previousVisit = await this.getVisitById(id);

    if (!previousVisit) {
      throw new Error('Visita non trovata');
    }

    const updatedVisit: Visit = {
      ...previousVisit,
      ...visitData,
      id,
      updatedAt: this.getCurrentTimestamp()
    };

    const ops: StoreOp[] = [];

    // Registra la cronologia in uno store dedicato e indipendente:
    // data/ora + campi modificati con valore precedente. Non viene mai cancellata.
    // Visita e cronologia sono scritte nella stessa transazione.
    const changes = computeVisitChanges(previousVisit, updatedVisit);
    if (changes.length > 0) {
      const patient = await this.getPatientById(updatedVisit.patientId);
      const revision: VisitRevision = {
        id: this.generateId(),
        visitId: id,
        patientId: updatedVisit.patientId,
        patientName: patient
          ? `${patient.cognome} ${patient.nome}`.trim()
          : undefined,
        visitDate: updatedVisit.dataVisita,
        visitType: updatedVisit.tipo,
        modifiedAt: updatedVisit.updatedAt,
        changes,
      };
      ops.push({ type: 'put', collection: 'visit_revisions', records: [revision] });
    }

    ops.push({ type: 'put', collection: 'visits', records: [updatedVisit] });
    await this.records.batch(ops);
    return updatedVisit;
  }

  // Cronologia modifiche visite (store dedicato, mai cancellato)
  async getVisitRevisions(): Promise<VisitRevision[]> {
    const list = await this.records.getAll<VisitRevision>('visit_revisions');
    return list.sort(
      (a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
    );
  }

  async deleteVisit(id: string): Promise<void> {
    await this.deleteRecord('visits', id);
  }

  // Documenti
  async getDocuments(): Promise<Document[]> {
    return await this.records.getAll<Document>('documents');
  }

  async countDocuments(): Promise<number> {
    return await this.records.count('documents');
  }

  async getDocumentsByPatientId(patientId: string): Promise<Document[]> {
    return await this.records.getByPatient<Document>('documents', patientId);
  }

  async getDocumentById(id: string): Promise<Document | null> {
    return await this.records.getById<Document>('documents', id);
  }

  async addDocument(documentData: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    return await this.addRecord<Document>('documents', documentData);
  }

  async updateDocument(id: string, documentData: Partial<Document>): Promise<Document> {
    return await this.updateRecord<Document>('documents', id, documentData, 'Documento non trovato');
  }

  async deleteDocument(id: string): Promise<void> {
    await this.deleteRecord('documents', id);
  }

  // Dottore
  async getDoctor(): Promise<Doctor | null> {
    try {
      const data = await this.chiavi.leggi(this.getStorageKey('doctor'));
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Errore nel recupero dei dati del dottore:', error);
      return null;
    }
  }

  async updateDoctor(doctorData: Partial<Doctor>): Promise<Doctor> {
    const existingDoctor = await this.getDoctor();

    const doctor: Doctor = existingDoctor ? {
      ...existingDoctor,
      ...doctorData,
      updatedAt: this.getCurrentTimestamp()
    } : {
      id: this.generateId(),
      nome: '',
      cognome: '',
      email: '',
      createdAt: this.getCurrentTimestamp(),
      updatedAt: this.getCurrentTimestamp(),
      ...doctorData
    };

    try {
      await this.chiavi.scrivi(this.getStorageKey('doctor'), JSON.stringify(doctor));
    } catch (error) {
      console.error('Errore nel salvataggio dei dati del dottore:', error);
      throw error;
    }

    return doctor;
  }

  /**
   * Tutti i modelli predefiniti, appiattiti da `MedicalTemplates`.
   *
   * Ricavati dalle chiavi dell'oggetto invece che da un elenco scritto a mano:
   * era la riga a mano a lasciare indietro i modelli di test ergometrico e
   * Holter, presenti nel file ma mai seminati, e quindi con il selettore
   * "Modello" vuoto in quei tre moduli.
   */
  private modelliPredefiniti(): Omit<MedicalTemplate, 'id'>[] {
    const sezioni = Object.keys(MedicalTemplates.visita) as (keyof typeof MedicalTemplates.visita)[];
    const visita = sezioni.flatMap((sezione) =>
      MedicalTemplates.visita[sezione].map((t) => ({
        category: 'visita' as const,
        section: sezione as MedicalTemplate['section'],
        label: t.label,
        text: t.text,
        isDefault: true,
      })),
    );

    // Le altre categorie sono piatte. Rientrano nel riallineamento come la
    // visita, e senza questo non arriverebbero a chi ha gia' lo store
    // popolato. La categoria "terapie" non c'e' piu': i suoi modelli sono
    // conclusioni della visita (vedi `terapieInConclusioni`).
    const nota = (t: { note?: string }) => (t.note ? { note: t.note } : {});
    const piatte: Omit<MedicalTemplate, 'id'>[] = [
      ...MedicalTemplates.ricette.map((t) => ({
        category: 'ricette' as const, section: 'generale' as const,
        label: t.label, text: t.text, ...nota(t), isDefault: true,
      })),
      ...MedicalTemplates.esami_complementari.map((t) => ({
        category: 'esame_complementare' as const, section: 'nome' as const,
        label: t.label, text: t.text, ...nota(t), isDefault: true,
      })),
      ...(MedicalTemplates.certificati ?? []).map((t) => ({
        category: 'certificato' as const, section: 'generale' as const,
        label: t.label, text: t.text, ...nota(t as { note?: string }), isDefault: true,
      })),
    ];

    return [...visita, ...piatte];
  }

  /**
   * La vecchia scheda "Terapie" dei modelli dentro le conclusioni della visita.
   *
   * I modelli "terapie" comparivano gia' nel menu di "Conclusioni e terapia",
   * insieme alle conclusioni: nelle impostazioni erano due schede per la
   * stessa cosa ("non capisco perche' terapie ha una sua scheda", Pablo, 6
   * ottobre 2026). Ogni modello "terapie" diventa una conclusione, compresi
   * quelli scritti o modificati dal medico; i quattro predefiniti che
   * ripetevano le conclusioni (`TERAPIE_RITIRATE`) se ne vanno, ma solo se il
   * testo e' ancora quello seminato.
   *
   * Gira a ogni lettura e non una volta sola: un backup di prima, importato
   * piu' avanti, riporta modelli "terapie", e senza scheda resterebbero
   * invisibili nelle impostazioni. Senza modelli "terapie" non fa niente.
   *
   * Restituisce true se ha cambiato qualcosa.
   */
  private terapieInConclusioni(templates: MedicalTemplate[]): boolean {
    if (!templates.some((t) => t.category === 'terapie')) return false;
    const ritirato = (t: MedicalTemplate) => {
      const m = TERAPIE_RITIRATE.find((r) => r.label === correggiAccenti(t.label ?? ''));
      return Boolean(
        m && t.isDefault &&
        correggiAccenti(t.text ?? '') === correggiAccenti(m.vecchio),
      );
    };
    const nuovi = templates
      .filter((t) => t.category !== 'terapie' || !ritirato(t))
      .map((t) =>
        t.category === 'terapie'
          ? { ...t, category: 'visita' as const, section: 'conclusioni' as const }
          : t,
      );
    templates.length = 0;
    templates.push(...nuovi);
    return true;
  }

  /**
   * Le firme dei predefiniti "terapie" gia' seminati, riscritte come
   * conclusioni. Senza, un modello che il medico aveva cancellato dalla vecchia
   * scheda risulterebbe mai seminato con la firma nuova, e il riallineamento
   * lo rimetterebbe.
   */
  private firmeTerapieComeConclusioni(firme: Set<string>): void {
    const VECCHIA = 'terapie|generale|';
    for (const firma of [...firme]) {
      if (firma.startsWith(VECCHIA)) {
        firme.add(`visita|conclusioni|${firma.slice(VECCHIA.length)}`);
      }
    }
  }

  /** Identita' di un modello predefinito, per riconoscerlo fra un avvio e l'altro. */
  private firmaModello(t: { category: string; section: string; label: string }): string {
    return `${t.category}|${t.section}|${t.label}`;
  }

  // Template
  async getTemplates(): Promise<MedicalTemplate[]> {
    const templates = await this.getFromStorage<MedicalTemplate>('templates');
    const generateId = () => this.generateId();

    if (templates.length === 0) {
      // Initialize with defaults if empty
      const defaultTemplates: MedicalTemplate[] = [];

      // Tutti i modelli predefiniti, di ogni categoria: `modelliPredefiniti`
      // le raccoglie gia' tutte, e ripeterle qui per categoria — come si faceva
      // finche' la funzione copriva la sola visita — le duplicherebbe.
      this.modelliPredefiniti().forEach(t => defaultTemplates.push({ id: generateId(), ...t }));

      await this.saveToStorage('templates', defaultTemplates);
      await this.saveToStorage(
        'templates_seeded',
        this.modelliPredefiniti().map((t) => this.firmaModello(t)),
      );
      return defaultTemplates;
    }

    // Modelli predefiniti aggiunti dopo l'installazione.
    //
    // Il seed iniziale scatta solo a store vuoto, quindi senza questo passaggio
    // un modello nuovo non raggiungerebbe mai chi ha gia' l'applicazione: ne
    // arrivano dal cardiologo a ogni giro, e finora ogni categoria si e' dovuta
    // ripescare a mano (vedi i blocchi certificato / ricette / esami qui sotto).
    //
    // Un predefinito viene aggiunto solo se non e' **ne' gia' seminato ne' gia'
    // presente**. Servono tutte e due le condizioni:
    //  - l'elenco dei seminati fa restare cancellato un modello che il medico
    //    ha cancellato, che altrimenti ricomparirebbe a ogni avvio;
    //  - il confronto con quelli presenti evita i doppioni quando l'elenco dei
    //    seminati e' piu' vecchio dell'insieme dei predefiniti. E' successo:
    //    un marker scritto quando si seminava la sola categoria "visita" non
    //    conosceva terapie e ricette, e al primo avvio le duplicava tutte.
    // Prima del riallineamento: i modelli spostati devono gia' avere la firma
    // di conclusione, se no il riallineamento li vedrebbe mancanti e ne
    // aggiungerebbe una seconda copia.
    if (this.terapieInConclusioni(templates)) {
      await this.saveToStorage('templates', templates);
    }
    const firmeLette = await this.getFromStorage<string>('templates_seeded');
    const firmeSeminate = new Set(firmeLette);
    this.firmeTerapieComeConclusioni(firmeSeminate);
    const firmePresenti = new Set(templates.map((t) => this.firmaModello(t)));
    const mancanti = this.modelliPredefiniti().filter((t) => {
      const firma = this.firmaModello(t);
      return !firmeSeminate.has(firma) && !firmePresenti.has(firma);
    });
    if (mancanti.length > 0) {
      // `templates` viene mutato di proposito: i blocchi qui sotto continuano a
      // leggerlo e a salvarlo, e devono vedere anche i modelli appena aggiunti.
      templates.push(...mancanti.map((t) => ({ id: generateId(), ...t })));
      await this.saveToStorage('templates', templates);
    }
    // L'elenco dei seminati assorbe anche cio' che era gia' nello store: da qui
    // in avanti cancellare uno di quei modelli lo tiene cancellato.
    const firmeDaSalvare = [
      ...new Set([
        ...firmeSeminate,
        ...firmePresenti,
        ...mancanti.map((t) => this.firmaModello(t)),
      ]),
    ];
    // Si riscrive solo se l'elenco cambia: i modelli si leggono a ogni
    // apertura di visita e di scheda, e una scrittura a ogni lettura costava
    // una riscrittura dell'archivio (vedi electron/recordStore.js).
    const giaLette = new Set(firmeLette);
    if (firmeDaSalvare.length !== firmeLette.length || firmeDaSalvare.some((f) => !giaLette.has(f))) {
      await this.saveToStorage('templates_seeded', firmeDaSalvare);
    }

    // Accenti nei modelli gia' in archivio: migrazione una-tantum.
    //
    // I predefiniti erano scritti con l'apostrofo ASCII ("attivita'"), nella
    // convinzione che il PDF non sapesse stampare gli accenti (li stampa, vedi
    // `san()` in PdfService). Si legge male a schermo e sul foglio, e i modelli
    // seminati prima di questa correzione conservano la vecchia grafia.
    //
    // Cambia **solo la tipografia**, mai il contenuto: per questo si applica
    // anche ai modelli che il medico ha modificato, senza sovrascriverne il
    // testo. Il marcatore la fa girare una volta sola.
    if (!(await this.getPreference('templates_accenti_v1'))) {
      let toccati = 0;
      const corretti = templates.map((t) => {
        const testo = correggiAccenti(t.text ?? '');
        const nota = t.note ? correggiAccenti(t.note) : t.note;
        const label = correggiAccenti(t.label ?? '');
        if (testo === t.text && nota === t.note && label === t.label) return t;
        toccati++;
        return { ...t, text: testo, note: nota, label };
      });
      if (toccati > 0) {
        templates.length = 0;
        templates.push(...corretti);
        await this.saveToStorage('templates', templates);
      }
      await this.setPreference('templates_accenti_v1', '1');
    }

    // Certificato non agonistico: riferimento normativo incompleto.
    //
    // Il modello seminato citava il solo D.M. 24/04/2013. Il decreto che detta
    // le linee guida di quel certificato e' pero' il D.M. 8 agosto 2014, ed e'
    // quello che va richiamato perche' il certificato regga.
    //
    // La firma di un predefinito e' `categoria|sezione|etichetta`: cambiando il
    // solo testo, la correzione non raggiungerebbe mai chi ha gia' il modello
    // in archivio. Si sostituisce percio' **la sola frase del riferimento**,
    // lasciando intatto tutto il resto: se il medico ha riscritto il
    // certificato a modo suo, si ritrova la citazione giusta dentro il proprio
    // testo invece di vederselo sovrascritto. Il marcatore la fa girare una
    // volta sola.
    if (!(await this.getPreference('templates_certificato_dm2014_v1'))) {
      const CITAZIONE_VECCHIA = 'D.M. 24/04/2013 e successive modifiche';
      const CITAZIONE_NUOVA =
        "D.M. 24 aprile 2013 e del D.M. 8 agosto 2014, recante le linee guida " +
        "di indirizzo in materia di certificati medici per l'attività sportiva " +
        'non agonistica';
      let toccati = 0;
      const aggiornati = templates.map((t) => {
        if (t.category !== 'certificato') return t;
        if (!t.text?.includes(CITAZIONE_VECCHIA)) return t;
        toccati++;
        return {
          ...t,
          text: t.text.replace(CITAZIONE_VECCHIA, CITAZIONE_NUOVA),
        };
      });
      if (toccati > 0) {
        templates.length = 0;
        templates.push(...aggiornati);
        await this.saveToStorage('templates', templates);
      }
      await this.setPreference('templates_certificato_dm2014_v1', '1');
    }

    // Predefiniti riscritti il 28 settembre 2026 (vedi
    // `data/modelliRiscritti.ts`): arrivano solo dove il medico non ha
    // toccato il modello, cioe' dove il testo e' ancora quello di prima, anche
    // con gli accenti gia' corretti dalla migrazione qui sopra. Una volta sola.
    if (!(await this.getPreference('templates_revisione_20260928'))) {
      const stesso = (
        t: Pick<MedicalTemplate, 'category' | 'section' | 'label'>,
        m: ModelloPrecedente,
      ) => t.category === 'visita' && t.section === m.section && t.label === m.label;
      const intatto = (t: MedicalTemplate, m: ModelloPrecedente) =>
        Boolean(t.isDefault) && (t.text === m.vecchio || t.text === correggiAccenti(m.vecchio));
      const attuali = this.modelliPredefiniti();
      let toccati = 0;
      const rivisti = templates.map((t) => {
        const riscritto = MODELLI_RISCRITTI.find((m) => stesso(t, m) && intatto(t, m));
        const nuovo = riscritto && attuali.find((a) => stesso(a, riscritto));
        if (nuovo && nuovo.text !== t.text) {
          toccati++;
          return { ...t, text: nuovo.text };
        }
        return t;
      });
      if (toccati > 0) {
        templates.length = 0;
        templates.push(...rivisti);
        await this.saveToStorage('templates', templates);
      }
      await this.setPreference('templates_revisione_20260928', '1');
    }

    // For existing users: seed certificato if not yet present
    if (MedicalTemplates.certificati && !templates.some(t => t.category === 'certificato')) {
      const certDefaults: MedicalTemplate[] = MedicalTemplates.certificati.map(t => ({
        id: generateId(),
        category: 'certificato' as const,
        section: 'generale' as const,
        label: t.label,
        text: t.text,
        note: (t as { note?: string }).note,
        isDefault: true,
      }));
      templates.push(...certDefaults);
      await this.saveToStorage('templates', templates);
    }

    // For existing users: seed ricette if not yet present (categoria separata da terapie)
    if (MedicalTemplates.ricette && !templates.some(t => t.category === 'ricette')) {
      const ricetteDefaults: MedicalTemplate[] = MedicalTemplates.ricette.map(t => ({
        id: generateId(),
        category: 'ricette' as const,
        section: 'generale' as const,
        label: t.label,
        text: t.text,
        note: t.note,
        isDefault: true,
      }));
      templates.push(...ricetteDefaults);
      await this.saveToStorage('templates', templates);
    }

    // For existing users: seed esame_complementare if not yet present
    if (!templates.some(t => t.category === 'esame_complementare')) {
      const examDefaults: MedicalTemplate[] = MedicalTemplates.esami_complementari.map(t => ({
        id: generateId(),
        category: 'esame_complementare' as const,
        section: 'nome' as const,
        label: t.label,
        text: t.text,
        note: t.note,
        isDefault: true,
      }));
      const updated = [...templates, ...examDefaults];
      await this.saveToStorage('templates', updated);
      return updated;
    }

    // Fix: note mancanti degli esami predefiniti.
    //
    // Qui c'era anche il riallineamento delle ricette predefinite al testo
    // del file, a ogni avvio: era servito a portare tutti al formato a testo
    // libero, ma riscriveva anche le ricette predefinite che il medico aveva
    // modificato, e la sua versione spariva alla prima apertura. Tolto il 28
    // settembre 2026, quando aveva gia' girato per tutti; un testo nuovo di un
    // predefinito arriva ora con `data/modelliRiscritti.ts`, e solo a chi non
    // l'ha toccato.
    let needsUpdate = false;
    const fixedTemplates = templates.map(t => {
      if (t.category === 'esame_complementare' && t.isDefault && (!t.note || t.note === "")) {
        const original = MedicalTemplates.esami_complementari.find(m => m.label === t.label);
        if (original?.note) {
          needsUpdate = true;
          return { ...t, note: original.note };
        }
      }
      return t;
    });

    if (needsUpdate) {
      await this.saveToStorage('templates', fixedTemplates);
      return fixedTemplates;
    }

    return templates;
  }


  async addTemplate(templateData: Omit<MedicalTemplate, 'id'>): Promise<MedicalTemplate> {
    const templates = await this.getTemplates();
    const template: MedicalTemplate = {
      ...templateData,
      id: this.generateId(),
      isDefault: false
    };
    templates.push(template);
    await this.saveToStorage('templates', templates);
    return template;
  }

  async updateTemplate(id: string, templateData: Partial<MedicalTemplate>): Promise<MedicalTemplate> {
    const templates = await this.getTemplates();
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) throw new Error('Template non trovato');

    // Prevent modification of isDefault property if it was true (optional logic)
    // but allow user to change text even of defaults if needed, or maybe clone.
    // For now, allow edit.

    templates[index] = { ...templates[index], ...templateData };
    await this.saveToStorage('templates', templates);
    return templates[index];
  }

  async deleteTemplate(id: string): Promise<void> {
    const templates = await this.getTemplates();
    const filtered = templates.filter(t => t.id !== id);
    await this.saveToStorage('templates', filtered);
  }

  // Backup/Export
  async exportData(): Promise<AppData> {
    const [patients, visits, visitRevisions, richiesteEsami, certificatiPaziente, ricettePaziente, doctor, documents, templates] = await Promise.all([
      this.getPatients(),
      this.getVisits(),
      this.records.getAll<VisitRevision>('visit_revisions'),
      this.records.getAll<RichiestaEsameComplementare>('richieste_esami'),
      this.records.getAll<CertificatoPaziente>('certificati_paziente'),
      this.records.getAll<RicettaPaziente>('ricette_paziente'),
      this.getDoctor(),
      this.getDocuments(),
      this.getTemplates()
    ]);

    return {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: import.meta.env?.VITE_APP_VERSION,
      exportedAt: this.getCurrentTimestamp(),
      patients,
      visits,
      visitRevisions,
      richiesteEsami,
      certificatiPaziente,
      ricettePaziente,
      documents,
      templates,
      doctor: doctor || {
        id: this.generateId(),
        nome: '',
        cognome: '',
        email: '',
        telefono: '',
        specializzazione: '',
        createdAt: this.getCurrentTimestamp(),
        updatedAt: this.getCurrentTimestamp()
      },
      lastSync: this.getCurrentTimestamp()
    };
  }

  /**
   * Cronologie in ingresso non ancora presenti: si aggiungono senza duplicati
   * e senza toccare quelle esistenti.
   */
  private async newVisitRevisions(incoming?: VisitRevision[]): Promise<VisitRevision[]> {
    if (!incoming || incoming.length === 0) return [];
    const existing = await this.records.getAll<VisitRevision>('visit_revisions');
    const existingIds = new Set(existing.map((r) => r.id));
    const added: VisitRevision[] = [];
    for (const rev of incoming) {
      if (rev && rev.id && !existingIds.has(rev.id)) {
        added.push(rev);
        existingIds.add(rev.id);
      }
    }
    return added;
  }

  async importData(data: AppData, mode: BackupImportMode = 'replace'): Promise<void> {
    if (mode === 'replace') {
      // La sostituzione totale cancella l'archivio prima di riscriverlo: tutte le
      // scritture formano un'unica transazione, così un errore a metà strada
      // lascia l'archivio com'era invece che dimezzato.
      await this.records.batch(await this.replaceAllDataOps(data));
      return;
    }


    // Modalità merge: mantiene i dati attuali e aggiunge solo quelli non presenti.
    const [currentPatients, currentVisits, currentRichiesteEsami, currentCertificati, currentRicette, currentDocuments, currentTemplates, currentDoctor] = await Promise.all([
      this.getPatients(),
      this.getVisits(),
      this.records.getAll<RichiestaEsameComplementare>('richieste_esami'),
      this.records.getAll<CertificatoPaziente>('certificati_paziente'),
      this.records.getAll<RicettaPaziente>('ricette_paziente'),
      this.getDocuments(),
      this.getTemplates(),
      this.getDoctor(),
    ]);

    const incomingPatients = data.patients || [];
    const incomingVisits = data.visits || [];
    const incomingRichiesteEsami = data.richiesteEsami || [];
    const incomingCertificati = data.certificatiPaziente || [];
    const incomingRicette = data.ricettePaziente || [];
    const incomingDocuments = data.documents || [];
    const incomingTemplates = data.templates || [];

    const addedPatients: Patient[] = [];
    const addedVisits: Visit[] = [];
    const addedRichiesteEsami: RichiestaEsameComplementare[] = [];
    const addedCertificati: CertificatoPaziente[] = [];
    const addedRicette: RicettaPaziente[] = [];
    const addedDocuments: Document[] = [];
    const mergedTemplates = [...currentTemplates];

    const patientIdMap = new Map<string, string>();
    const existingPatientIds = new Set(currentPatients.map((p) => p.id));
    const patientByCf = new Map<string, Patient>();
    for (const p of currentPatients) {
      const cf = String(p.codiceFiscale || '').trim().toUpperCase();
      if (cf) patientByCf.set(cf, p);
    }
    const patientById = new Map(currentPatients.map((p) => [p.id, p]));

    for (const p of incomingPatients) {
      const existingById = patientById.get(p.id);
      if (existingById) {
        patientIdMap.set(p.id, existingById.id);
        continue;
      }
      const cf = String(p.codiceFiscale || '').trim().toUpperCase();
      const existingByCf = cf ? patientByCf.get(cf) : undefined;
      if (existingByCf) {
        patientIdMap.set(p.id, existingByCf.id);
        continue;
      }

      const nextId = existingPatientIds.has(p.id) ? generateUuid() : p.id;
      existingPatientIds.add(nextId);
      const patientToAdd: Patient = { ...p, id: nextId };
      addedPatients.push(patientToAdd);
      patientById.set(nextId, patientToAdd);
      if (cf) patientByCf.set(cf, patientToAdd);
      patientIdMap.set(p.id, nextId);
    }

    const existingVisitIds = new Set(currentVisits.map((v) => v.id));
    const existingVisitKeys = new Set(
      currentVisits.map((v) => `${v.patientId}::${v.dataVisita}::${(v.descrizioneClinica || '').trim().toLowerCase()}`)
    );
    for (const v of incomingVisits) {
      const mappedPatientId = patientIdMap.get(v.patientId) || v.patientId;
      const visitKey = `${mappedPatientId}::${v.dataVisita}::${(v.descrizioneClinica || '').trim().toLowerCase()}`;
      if (existingVisitKeys.has(visitKey)) continue;
      const nextId = existingVisitIds.has(v.id) ? this.generateId() : v.id;
      existingVisitIds.add(nextId);
      addedVisits.push({ ...v, id: nextId, patientId: mappedPatientId });
      existingVisitKeys.add(visitKey);
    }

    const existingRichiestaIds = new Set(currentRichiesteEsami.map((r) => r.id));
    for (const r of incomingRichiesteEsami) {
      const mappedPatientId = patientIdMap.get(r.patientId) || r.patientId;
      if (!existingPatientIds.has(mappedPatientId)) continue;
      const nextId = existingRichiestaIds.has(r.id) ? this.generateId() : r.id;
      existingRichiestaIds.add(nextId);
      addedRichiesteEsami.push({ ...r, id: nextId, patientId: mappedPatientId });
    }

    const existingDocumentIds = new Set(currentDocuments.map((d) => d.id));
    const existingDocumentKeys = new Set(
      currentDocuments.map((d) => `${d.fileName}::${d.uploadDate}::${d.fileSize}`)
    );
    for (const d of incomingDocuments) {
      const docKey = `${d.fileName}::${d.uploadDate}::${d.fileSize}`;
      if (existingDocumentKeys.has(docKey)) continue;
      const nextId = existingDocumentIds.has(d.id) ? this.generateId() : d.id;
      existingDocumentIds.add(nextId);
      addedDocuments.push({ ...d, id: nextId });
      existingDocumentKeys.add(docKey);
    }

    const existingTemplateIds = new Set(currentTemplates.map((t) => t.id));
    const existingTemplateKeys = new Set(
      currentTemplates.map((t) => `${t.category}::${t.section}::${t.label}::${t.text}`)
    );
    for (const t of incomingTemplates) {
      const tplKey = `${t.category}::${t.section}::${t.label}::${t.text}`;
      if (existingTemplateKeys.has(tplKey)) continue;
      const nextId = existingTemplateIds.has(t.id) ? this.generateId() : t.id;
      existingTemplateIds.add(nextId);
      mergedTemplates.push({ ...t, id: nextId });
      existingTemplateKeys.add(tplKey);
    }

    const existingCertificatoIds = new Set(currentCertificati.map((c) => c.id));
    for (const c of incomingCertificati) {
      const newPatientId = patientIdMap.get(c.patientId) ?? c.patientId;
      if (!newPatientId) continue;
      const nextId = existingCertificatoIds.has(c.id) ? this.generateId() : c.id;
      existingCertificatoIds.add(nextId);
      addedCertificati.push({ ...c, id: nextId, patientId: newPatientId });
    }

    const existingRicettaIds = new Set(currentRicette.map((r) => r.id));
    for (const r of incomingRicette) {
      const newPatientId = patientIdMap.get(r.patientId) ?? r.patientId;
      if (!newPatientId) continue;
      const nextId = existingRicettaIds.has(r.id) ? this.generateId() : r.id;
      existingRicettaIds.add(nextId);
      addedRicette.push({ ...r, id: nextId, patientId: newPatientId });
    }

    // Tutto in un'unica transazione: un errore a metà non lascia l'unione dimezzata.
    const ops: StoreOp[] = [
      { type: 'put', collection: 'patients', records: addedPatients },
      { type: 'put', collection: 'visits', records: addedVisits },
      { type: 'put', collection: 'richieste_esami', records: addedRichiesteEsami },
      { type: 'put', collection: 'certificati_paziente', records: addedCertificati },
      { type: 'put', collection: 'ricette_paziente', records: addedRicette },
      { type: 'put', collection: 'documents', records: addedDocuments },
      { type: 'put', collection: 'visit_revisions', records: await this.newVisitRevisions(data.visitRevisions) },
      { type: 'kvSet', key: this.getStorageKey('templates'), value: JSON.stringify(mergedTemplates) },
    ];

    if (data.doctor) {
      const incomingDoctor = data.doctor;

      if (!currentDoctor) {
        ops.push({ type: 'kvSet', key: this.getStorageKey('doctor'), value: JSON.stringify(incomingDoctor) });
      } else {
        const currentAmbulatori = currentDoctor.ambulatori || [];
        const incomingAmbulatori = incomingDoctor.ambulatori || [];
        const mergedAmbulatori = [...currentAmbulatori];
        const keyOf = (a: any) =>
          `${String(a?.nome || '').trim().toLowerCase()}::${String(a?.indirizzo || '').trim().toLowerCase()}::${String(a?.citta || '').trim().toLowerCase()}`;
        const existingKeys = new Set(mergedAmbulatori.map((a) => keyOf(a)));

        for (const amb of incomingAmbulatori) {
          const k = keyOf(amb);
          if (!existingKeys.has(k)) {
            mergedAmbulatori.push(amb);
            existingKeys.add(k);
          }
        }

        // Mantieni "In uso" esistente se presente; altrimenti usa quello del backup.
        const hasPrimary = mergedAmbulatori.some((a) => a.isPrimario);
        if (!hasPrimary) {
          const incomingPrimaryKey = keyOf(incomingAmbulatori.find((a) => a.isPrimario));
          if (incomingPrimaryKey) {
            for (const amb of mergedAmbulatori) {
              amb.isPrimario = keyOf(amb) === incomingPrimaryKey;
            }
          } else if (mergedAmbulatori.length > 0) {
            mergedAmbulatori[0].isPrimario = true;
          }
        }

        const mergedDoctor: Doctor = {
          ...currentDoctor,
          nome: currentDoctor.nome || incomingDoctor.nome,
          cognome: currentDoctor.cognome || incomingDoctor.cognome,
          email: currentDoctor.email || incomingDoctor.email,
          telefono: currentDoctor.telefono || incomingDoctor.telefono,
          specializzazione: currentDoctor.specializzazione || incomingDoctor.specializzazione,
          partitaIva: currentDoctor.partitaIva || incomingDoctor.partitaIva,
          profileImage: currentDoctor.profileImage || incomingDoctor.profileImage,
          signatureStampImage: currentDoctor.signatureStampImage || incomingDoctor.signatureStampImage,
          ambulatori: mergedAmbulatori,
          updatedAt: this.getCurrentTimestamp(),
        };

        ops.push({ type: 'kvSet', key: this.getStorageKey('doctor'), value: JSON.stringify(mergedDoctor) });
      }
    }

    await this.records.batch(ops);
  }

  /** Operazioni per la sostituzione totale dell'archivio con il contenuto del backup. */
  private async replaceAllDataOps(data: AppData): Promise<StoreOp[]> {
    // Il reset preserva la cronologia esistente; si aggiunge poi quella del backup.
    const ops: StoreOp[] = [
      { type: 'clearAppData' },
      { type: 'put', collection: 'visit_revisions', records: await this.newVisitRevisions(data.visitRevisions) },
      { type: 'replaceCollection', collection: 'patients', records: data.patients ?? [] },
      { type: 'replaceCollection', collection: 'visits', records: data.visits ?? [] },
      { type: 'replaceCollection', collection: 'richieste_esami', records: data.richiesteEsami ?? [] },
      { type: 'replaceCollection', collection: 'certificati_paziente', records: data.certificatiPaziente ?? [] },
      { type: 'replaceCollection', collection: 'ricette_paziente', records: data.ricettePaziente ?? [] },
      { type: 'replaceCollection', collection: 'documents', records: data.documents ?? [] },
    ];

    if (data.doctor) {
      ops.push({ type: 'kvSet', key: this.getStorageKey('doctor'), value: JSON.stringify(data.doctor) });
    }

    if (data.templates && data.templates.length > 0) {
      ops.push({ type: 'kvSet', key: this.getStorageKey('templates'), value: JSON.stringify(data.templates) });
    }
    return ops;
  }


  async clearAllData(): Promise<void> {
    // La cronologia delle modifiche non va mai cancellata, nemmeno col reset totale:
    // `clearAppData` la lascia al suo posto.
    await this.records.batch([{ type: 'clearAppData' }]);
  }
}

const archivioReale = new LocalStorageFallbackService(chiaviReali, recordReali);
let archivioProva: LocalStorageFallbackService | null = null;

/** Quello che l'archivio di prova contiene appena aperto. */
export type ContenutoArchivioDiProva = Pick<AppData, 'patients' | 'visits'> &
  Partial<Pick<AppData, 'ricettePaziente' | 'richiesteEsami' | 'certificatiPaziente'>>;

/**
 * Apre l'archivio di prova della guida: da qui ogni lettura e scrittura di
 * pazienti, visite, ricette, richieste, certificati, documenti e bozze passa
 * dalla memoria, a partire da `contenuto`. Chi apre deve anche chiudere.
 */
export function apriArchivioDiProva(contenuto: ContenutoArchivioDiProva): void {
  const memoria = new Map<string, string>();
  const metti = (chiave: string, elenco: unknown[] | undefined) =>
    memoria.set(`AppDottori_${chiave}`, JSON.stringify(elenco ?? []));
  metti('patients', contenuto.patients);
  metti('visits', contenuto.visits);
  metti('ricette_paziente', contenuto.ricettePaziente);
  metti('richieste_esami', contenuto.richiesteEsami);
  metti('certificati_paziente', contenuto.certificatiPaziente);
  // I record della prova stanno nella stessa memoria, un array per collezione.
  const recordProva = new ArrayRecordBackend(
    {
      leggi: (chiave) => memoria.get(chiave) ?? null,
      scrivi: (chiave, valore) => void memoria.set(chiave, valore),
      togli: (chiave) => void memoria.delete(chiave),
    },
    false,
  );
  archivioProva = new LocalStorageFallbackService(chiaviDiProva(memoria), () => recordProva);
}

/** Chiude l'archivio di prova: si torna a quello vero, e la memoria si butta. */
export function chiudiArchivioDiProva(): void {
  archivioProva = null;
}

export function archivioDiProvaAperto(): boolean {
  return archivioProva !== null;
}

/**
 * Quanti pazienti e visite ha l'archivio vero, anche a guida aperta: la
 * telemetria di licenza non deve contare i pazienti inventati.
 */
export async function conteggiArchivioReale(): Promise<{ pazienti: number; visite: number }> {
  const [pazienti, visite] = await Promise.all([
    archivioReale.countPatients(),
    archivioReale.countVisits(),
  ]);
  return { pazienti, visite };
}

/**
 * Operazioni che nella prova non hanno senso: un backup esportato conterrebbe
 * i pazienti inventati, uno importato finirebbe nella memoria e sparirebbe.
 */
const VIETATE_NELLA_PROVA = new Set<PropertyKey>(['exportData', 'importData', 'clearAllData']);

/**
 * L'archivio in uso: quello vero, o quello di prova finche' la guida e'
 * aperta. Ogni operazione si lega all'archivio del momento in cui parte e ci
 * resta fino alla fine: una scrittura cominciata nella prova non puo' finire
 * nell'archivio vero perche' nel frattempo la guida si e' chiusa.
 */
export const storageService: LocalStorageFallbackService = new Proxy(archivioReale, {
  get(reale, nome) {
    const attivo = archivioProva ?? reale;
    if (archivioProva && VIETATE_NELLA_PROVA.has(nome)) {
      return () => Promise.reject(new Error(NON_NELLA_PROVA));
    }
    const valore = Reflect.get(attivo, nome);
    return typeof valore === 'function' ? valore.bind(attivo) : valore;
  },
});
