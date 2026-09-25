import { StorageService, Patient, Visit, VisitRevision, Doctor, Document, AppData, MedicalTemplate, BackupImportMode, RichiestaEsameComplementare, CertificatoPaziente, RicettaPaziente } from '../types/Storage';
import { MedicalTemplates } from '../data/medicalTemplates';
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
    };
  }
}

function isSqliteAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.kvGet;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = '0123456789abcdef';
  const r = (n: number) => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return `${r(8)}-${r(4)}-4${r(3)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${r(3)}-${r(12)}`;
}

class LocalStorageFallbackService implements StorageService {
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  private getStorageKey(key: string): string {
    return `AppDottori_${key}`;
  }

  private async getFromStorage<T>(key: string): Promise<T[]> {
    try {
      const fullKey = this.getStorageKey(key);
      let data: string | null;
      if (isSqliteAvailable()) {
        data = await window.electronAPI!.kvGet(fullKey);
      } else {
        data = localStorage.getItem(fullKey);
      }
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Errore nel recupero dei dati per ${key}:`, error);
      return [];
    }
  }

  private async saveToStorage<T>(key: string, data: T[]): Promise<void> {
    try {
      const fullKey = this.getStorageKey(key);
      const value = JSON.stringify(data);
      if (isSqliteAvailable()) {
        await window.electronAPI!.kvSet(fullKey, value);
      } else {
        localStorage.setItem(fullKey, value);
      }
    } catch (error) {
      console.error(`Errore nel salvataggio dei dati per ${key}:`, error);
      throw error;
    }
  }

  /** Chiave/valore per preferenze e altri dati (in Electron usa il db). */
  async getPreference(key: string): Promise<string | null> {
    const fullKey = this.getStorageKey(key);
    if (isSqliteAvailable()) {
      return await window.electronAPI!.kvGet(fullKey);
    }
    return localStorage.getItem(fullKey);
  }

  async setPreference(key: string, value: string): Promise<void> {
    const fullKey = this.getStorageKey(key);
    if (isSqliteAvailable()) {
      await window.electronAPI!.kvSet(fullKey, value);
    } else {
      localStorage.setItem(fullKey, value);
    }
  }

  // Pazienti
  async getPatients(): Promise<Patient[]> {
    return await this.getFromStorage<Patient>('patients');
  }

  async getPatientById(id: string): Promise<Patient | null> {
    const patients = await this.getPatients();
    return patients.find(p => p.id === id) || null;
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
    const patients = await this.getPatients();
    const cfValue = patientData.codiceFiscale != null ? String(patientData.codiceFiscale).trim() : '';
    const normalizedCf = cfValue ? cfValue.toUpperCase() : '';
    if (normalizedCf) {
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

    patients.push(patient);
    await this.saveToStorage('patients', patients);
    return patient;
  }

  async updatePatient(id: string, patientData: Partial<Patient>): Promise<Patient> {
    const patients = await this.getPatients();
    const index = patients.findIndex(p => p.id === id);

    if (index === -1) {
      throw new Error('Paziente non trovato');
    }

    const rawNextCf = patientData.codiceFiscale ?? patients[index].codiceFiscale;
    const nextCf = rawNextCf != null ? String(rawNextCf).trim().toUpperCase() : '';
    if (nextCf) {
      const duplicate = patients.some(
        (p) => p.id !== id && String(p.codiceFiscale || '').trim().toUpperCase() === nextCf
      );
      if (duplicate) throw new Error('Codice fiscale già presente');
    }

    patients[index] = {
      ...patients[index],
      ...patientData,
      codiceFiscale: nextCf || undefined,
      id,
      updatedAt: this.getCurrentTimestamp()
    };

    await this.saveToStorage('patients', patients);
    return patients[index];
  }

  async deletePatient(id: string): Promise<void> {
    const patients = await this.getPatients();
    const visits = await this.getVisits();
    const richiesteEsami = await this.getFromStorage<RichiestaEsameComplementare>('richieste_esami');
    const certificati = await this.getFromStorage<CertificatoPaziente>('certificati_paziente');
    const ricette = await this.getFromStorage<RicettaPaziente>('ricette_paziente');

    const filteredVisits = visits.filter(v => v.patientId !== id);
    await this.saveToStorage('visits', filteredVisits);

    const filteredRichieste = richiesteEsami.filter(r => r.patientId !== id);
    await this.saveToStorage('richieste_esami', filteredRichieste);

    const filteredCertificati = certificati.filter(c => c.patientId !== id);
    await this.saveToStorage('certificati_paziente', filteredCertificati);

    const filteredRicette = ricette.filter(r => r.patientId !== id);
    await this.saveToStorage('ricette_paziente', filteredRicette);

    const documents = await this.getDocuments();
    const filteredDocuments = documents.filter(d => d.patientId !== id);
    await this.saveToStorage('documents', filteredDocuments);

    const filteredPatients = patients.filter(p => p.id !== id);
    await this.saveToStorage('patients', filteredPatients);
  }

  // Richieste esami complementari
  async getRichiesteEsamiByPatientId(patientId: string): Promise<RichiestaEsameComplementare[]> {
    const list = await this.getFromStorage<RichiestaEsameComplementare>('richieste_esami');
    return list.filter(r => r.patientId === patientId).sort((a, b) => new Date(b.dataRichiesta).getTime() - new Date(a.dataRichiesta).getTime());
  }

  async getRichiestaEsameById(id: string): Promise<RichiestaEsameComplementare | null> {
    const list = await this.getFromStorage<RichiestaEsameComplementare>('richieste_esami');
    return list.find(r => r.id === id) || null;
  }

  async addRichiestaEsame(data: Omit<RichiestaEsameComplementare, 'id' | 'createdAt' | 'updatedAt'>): Promise<RichiestaEsameComplementare> {
    const list = await this.getFromStorage<RichiestaEsameComplementare>('richieste_esami');
    const richiesta: RichiestaEsameComplementare = {
      ...data,
      id: this.generateId(),
      createdAt: this.getCurrentTimestamp(),
      updatedAt: this.getCurrentTimestamp(),
    };
    list.push(richiesta);
    await this.saveToStorage('richieste_esami', list);
    return richiesta;
  }

  async updateRichiestaEsame(id: string, data: Partial<RichiestaEsameComplementare>): Promise<RichiestaEsameComplementare> {
    const list = await this.getFromStorage<RichiestaEsameComplementare>('richieste_esami');
    const index = list.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Richiesta esame non trovata');
    list[index] = {
      ...list[index],
      ...data,
      id,
      updatedAt: this.getCurrentTimestamp(),
    };
    await this.saveToStorage('richieste_esami', list);
    return list[index];
  }

  async deleteRichiestaEsame(id: string): Promise<void> {
    const list = await this.getFromStorage<RichiestaEsameComplementare>('richieste_esami');
    const filtered = list.filter(r => r.id !== id);
    await this.saveToStorage('richieste_esami', filtered);
  }

  // Certificati paziente
  async getCertificatiByPatientId(patientId: string): Promise<CertificatoPaziente[]> {
    const list = await this.getFromStorage<CertificatoPaziente>('certificati_paziente');
    return list.filter(c => c.patientId === patientId).sort((a, b) => new Date(b.dataCertificato).getTime() - new Date(a.dataCertificato).getTime());
  }

  async getCertificatoById(id: string): Promise<CertificatoPaziente | null> {
    const list = await this.getFromStorage<CertificatoPaziente>('certificati_paziente');
    return list.find(c => c.id === id) || null;
  }

  async addCertificato(data: Omit<CertificatoPaziente, 'id' | 'createdAt' | 'updatedAt'>): Promise<CertificatoPaziente> {
    const list = await this.getFromStorage<CertificatoPaziente>('certificati_paziente');
    const cert: CertificatoPaziente = {
      ...data,
      id: this.generateId(),
      createdAt: this.getCurrentTimestamp(),
      updatedAt: this.getCurrentTimestamp(),
    };
    list.push(cert);
    await this.saveToStorage('certificati_paziente', list);
    return cert;
  }

  async updateCertificato(id: string, data: Partial<CertificatoPaziente>): Promise<CertificatoPaziente> {
    const list = await this.getFromStorage<CertificatoPaziente>('certificati_paziente');
    const index = list.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Certificato non trovato');
    list[index] = {
      ...list[index],
      ...data,
      id,
      updatedAt: this.getCurrentTimestamp(),
    };
    await this.saveToStorage('certificati_paziente', list);
    return list[index];
  }

  async deleteCertificato(id: string): Promise<void> {
    const list = await this.getFromStorage<CertificatoPaziente>('certificati_paziente');
    const filtered = list.filter(c => c.id !== id);
    await this.saveToStorage('certificati_paziente', filtered);
  }

  // Ricette paziente
  async getRicetteByPatientId(patientId: string): Promise<RicettaPaziente[]> {
    const list = await this.getFromStorage<RicettaPaziente>('ricette_paziente');
    return list.filter(r => r.patientId === patientId).sort((a, b) => new Date(b.dataRicetta).getTime() - new Date(a.dataRicetta).getTime());
  }

  async getRicettaById(id: string): Promise<RicettaPaziente | null> {
    const list = await this.getFromStorage<RicettaPaziente>('ricette_paziente');
    return list.find(r => r.id === id) || null;
  }

  async addRicetta(data: Omit<RicettaPaziente, 'id' | 'createdAt' | 'updatedAt'>): Promise<RicettaPaziente> {
    const list = await this.getFromStorage<RicettaPaziente>('ricette_paziente');
    const ricetta: RicettaPaziente = {
      ...data,
      id: this.generateId(),
      createdAt: this.getCurrentTimestamp(),
      updatedAt: this.getCurrentTimestamp(),
    };
    list.push(ricetta);
    await this.saveToStorage('ricette_paziente', list);
    return ricetta;
  }

  async updateRicetta(id: string, data: Partial<RicettaPaziente>): Promise<RicettaPaziente> {
    const list = await this.getFromStorage<RicettaPaziente>('ricette_paziente');
    const index = list.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Ricetta non trovata');
    list[index] = {
      ...list[index],
      ...data,
      id,
      updatedAt: this.getCurrentTimestamp(),
    };
    await this.saveToStorage('ricette_paziente', list);
    return list[index];
  }

  async deleteRicetta(id: string): Promise<void> {
    const list = await this.getFromStorage<RicettaPaziente>('ricette_paziente');
    const filtered = list.filter(r => r.id !== id);
    await this.saveToStorage('ricette_paziente', filtered);
  }

  // Visite
  async getVisits(): Promise<Visit[]> {
    return await this.getFromStorage<Visit>('visits');
  }

  async getVisitsByPatientId(patientId: string): Promise<Visit[]> {
    const visits = await this.getVisits();
    return visits.filter(v => v.patientId === patientId);
  }

  async getVisitById(id: string): Promise<Visit | null> {
    const visits = await this.getVisits();
    return visits.find(v => v.id === id) || null;
  }

  async addVisit(visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<Visit> {
    const visits = await this.getVisits();
    const visit: Visit = {
      ...visitData,
      id: this.generateId(),
      createdAt: this.getCurrentTimestamp(),
      updatedAt: this.getCurrentTimestamp()
    };

    visits.push(visit);
    await this.saveToStorage('visits', visits);
    return visit;
  }

  async updateVisit(id: string, visitData: Partial<Visit>): Promise<Visit> {
    const visits = await this.getVisits();
    const index = visits.findIndex(v => v.id === id);

    if (index === -1) {
      throw new Error('Visita non trovata');
    }

    const previousVisit = visits[index];
    const updatedVisit: Visit = {
      ...previousVisit,
      ...visitData,
      id,
      updatedAt: this.getCurrentTimestamp()
    };

    // Registra la cronologia in uno store dedicato e indipendente:
    // data/ora + campi modificati con valore precedente. Non viene mai cancellata.
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
      await this.appendVisitRevision(revision);
    }

    visits[index] = updatedVisit;

    await this.saveToStorage('visits', visits);
    return visits[index];
  }

  // Cronologia modifiche visite (store dedicato, mai cancellato)
  async getVisitRevisions(): Promise<VisitRevision[]> {
    const list = await this.getFromStorage<VisitRevision>('visit_revisions');
    return list.sort(
      (a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
    );
  }

  private async appendVisitRevision(revision: VisitRevision): Promise<void> {
    const list = await this.getFromStorage<VisitRevision>('visit_revisions');
    list.push(revision);
    await this.saveToStorage('visit_revisions', list);
  }

  async deleteVisit(id: string): Promise<void> {
    const visits = await this.getVisits();
    const filteredVisits = visits.filter(v => v.id !== id);
    await this.saveToStorage('visits', filteredVisits);
  }

  // Documenti
  async getDocuments(): Promise<Document[]> {
    return await this.getFromStorage<Document>('documents');
  }

  async getDocumentById(id: string): Promise<Document | null> {
    const documents = await this.getDocuments();
    return documents.find(d => d.id === id) || null;
  }

  async addDocument(documentData: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    const documents = await this.getDocuments();
    const document: Document = {
      ...documentData,
      id: this.generateId(),
      createdAt: this.getCurrentTimestamp(),
      updatedAt: this.getCurrentTimestamp()
    };

    documents.push(document);
    await this.saveToStorage('documents', documents);
    return document;
  }

  async updateDocument(id: string, documentData: Partial<Document>): Promise<Document> {
    const documents = await this.getDocuments();
    const index = documents.findIndex(d => d.id === id);

    if (index === -1) {
      throw new Error('Documento non trovato');
    }

    documents[index] = {
      ...documents[index],
      ...documentData,
      id,
      updatedAt: this.getCurrentTimestamp()
    };

    await this.saveToStorage('documents', documents);
    return documents[index];
  }

  async deleteDocument(id: string): Promise<void> {
    const documents = await this.getDocuments();
    const filteredDocuments = documents.filter(d => d.id !== id);
    await this.saveToStorage('documents', filteredDocuments);
  }

  // Dottore
  async getDoctor(): Promise<Doctor | null> {
    try {
      const fullKey = this.getStorageKey('doctor');
      let data: string | null;
      if (isSqliteAvailable()) {
        data = await window.electronAPI!.kvGet(fullKey);
      } else {
        data = localStorage.getItem(fullKey);
      }
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
      const fullKey = this.getStorageKey('doctor');
      const value = JSON.stringify(doctor);
      if (isSqliteAvailable()) {
        await window.electronAPI!.kvSet(fullKey, value);
      } else {
        localStorage.setItem(fullKey, value);
      }
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
    // visita: gli schemi dietetici stanno fra i modelli di terapia, e senza
    // questo non arriverebbero a chi ha gia' lo store popolato.
    const nota = (t: { note?: string }) => (t.note ? { note: t.note } : {});
    const piatte: Omit<MedicalTemplate, 'id'>[] = [
      ...MedicalTemplates.terapie.map((t) => ({
        category: 'terapie' as const, section: 'generale' as const,
        label: t.label, text: t.text, isDefault: true,
      })),
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
    const firmeSeminate = new Set(await this.getFromStorage<string>('templates_seeded'));
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
    await this.saveToStorage('templates_seeded', [
      ...new Set([
        ...firmeSeminate,
        ...firmePresenti,
        ...mancanti.map((t) => this.firmaModello(t)),
      ]),
    ]);

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

    // Fix: aggiorna template predefiniti (note esami, formato ricette testo libero)
    let needsUpdate = false;
    const fixedTemplates = templates.map(t => {
      if (t.category === 'esame_complementare' && t.isDefault && (!t.note || t.note === "")) {
        const original = MedicalTemplates.esami_complementari.find(m => m.label === t.label);
        if (original?.note) {
          needsUpdate = true;
          return { ...t, note: original.note };
        }
      }
      if (t.category === 'ricette' && t.isDefault) {
        const original = MedicalTemplates.ricette.find(m => m.label === t.label);
        if (
          original &&
          (original.text !== t.text || (original.note ?? "") !== (t.note ?? ""))
        ) {
          needsUpdate = true;
          return { ...t, text: original.text, note: original.note };
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
      this.getFromStorage<VisitRevision>('visit_revisions'),
      this.getFromStorage<RichiestaEsameComplementare>('richieste_esami'),
      this.getFromStorage<CertificatoPaziente>('certificati_paziente'),
      this.getFromStorage<RicettaPaziente>('ricette_paziente'),
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

  /** Tutte le chiavi gestite dall'app, usate per snapshot e rollback dell'import. */
  private static readonly MANAGED_KEYS = [
    'patients',
    'visits',
    'visit_revisions',
    'richieste_esami',
    'certificati_paziente',
    'ricette_paziente',
    'doctor',
    'documents',
    'templates',
    'preferences',
    'recent_patient_searches',
  ] as const;

  /**
   * Copia in memoria dei dati grezzi correnti, presa **prima** di un'operazione
   * distruttiva. Serve a rimettere tutto com'era se l'import fallisce a metà.
   */
  private async readRawSnapshot(): Promise<Map<string, string | null>> {
    const snapshot = new Map<string, string | null>();
    for (const key of LocalStorageFallbackService.MANAGED_KEYS) {
      const fullKey = this.getStorageKey(key);
      const value = isSqliteAvailable()
        ? await window.electronAPI!.kvGet(fullKey)
        : localStorage.getItem(fullKey);
      snapshot.set(fullKey, value);
    }
    return snapshot;
  }

  /** Riscrive i dati grezzi salvati da `readRawSnapshot`. */
  private async restoreRawSnapshot(snapshot: Map<string, string | null>): Promise<void> {
    for (const [fullKey, value] of snapshot) {
      if (value === null) {
        if (isSqliteAvailable()) await window.electronAPI!.kvRemove(fullKey);
        else localStorage.removeItem(fullKey);
      } else if (isSqliteAvailable()) {
        await window.electronAPI!.kvSet(fullKey, value);
      } else {
        localStorage.setItem(fullKey, value);
      }
    }
  }

  /** Unisce le cronologie in ingresso con quelle presenti, senza duplicati e senza cancellare nulla. */
  private async mergeVisitRevisions(incoming?: VisitRevision[]): Promise<void> {
    if (!incoming || incoming.length === 0) return;
    const existing = await this.getFromStorage<VisitRevision>('visit_revisions');
    const existingIds = new Set(existing.map((r) => r.id));
    let changed = false;
    for (const rev of incoming) {
      if (rev && rev.id && !existingIds.has(rev.id)) {
        existing.push(rev);
        existingIds.add(rev.id);
        changed = true;
      }
    }
    if (changed) {
      await this.saveToStorage('visit_revisions', existing);
    }
  }

  async importData(data: AppData, mode: BackupImportMode = 'replace'): Promise<void> {
    if (mode === 'replace') {
      // La sostituzione totale cancella l'archivio prima di riscriverlo: senza una
      // copia in memoria, un errore a metà strada lascerebbe il medico senza dati.
      const rollback = await this.readRawSnapshot();
      try {
        await this.replaceAllData(data);
      } catch (error) {
        console.error('Import fallito: ripristino dei dati precedenti.', error);
        await this.restoreRawSnapshot(rollback);
        throw error;
      }
      return;
    }


    // Modalità merge: mantiene i dati attuali e aggiunge solo quelli non presenti.
    const [currentPatients, currentVisits, currentRichiesteEsami, currentCertificati, currentRicette, currentDocuments, currentTemplates, currentDoctor] = await Promise.all([
      this.getPatients(),
      this.getVisits(),
      this.getFromStorage<RichiestaEsameComplementare>('richieste_esami'),
      this.getFromStorage<CertificatoPaziente>('certificati_paziente'),
      this.getFromStorage<RicettaPaziente>('ricette_paziente'),
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

    const mergedPatients = [...currentPatients];
    const mergedVisits = [...currentVisits];
    const mergedRichiesteEsami = [...currentRichiesteEsami];
    const mergedCertificati = [...currentCertificati];
    const mergedRicette = [...currentRicette];
    const mergedDocuments = [...currentDocuments];
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
      mergedPatients.push(patientToAdd);
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
      mergedVisits.push({ ...v, id: nextId, patientId: mappedPatientId });
      existingVisitKeys.add(visitKey);
    }

    const existingRichiestaIds = new Set(currentRichiesteEsami.map((r) => r.id));
    for (const r of incomingRichiesteEsami) {
      const mappedPatientId = patientIdMap.get(r.patientId) || r.patientId;
      if (!existingPatientIds.has(mappedPatientId)) continue;
      const nextId = existingRichiestaIds.has(r.id) ? this.generateId() : r.id;
      existingRichiestaIds.add(nextId);
      mergedRichiesteEsami.push({ ...r, id: nextId, patientId: mappedPatientId });
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
      mergedDocuments.push({ ...d, id: nextId });
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
      mergedCertificati.push({ ...c, id: nextId, patientId: newPatientId });
    }

    const existingRicettaIds = new Set(currentRicette.map((r) => r.id));
    for (const r of incomingRicette) {
      const newPatientId = patientIdMap.get(r.patientId) ?? r.patientId;
      if (!newPatientId) continue;
      const nextId = existingRicettaIds.has(r.id) ? this.generateId() : r.id;
      existingRicettaIds.add(nextId);
      mergedRicette.push({ ...r, id: nextId, patientId: newPatientId });
    }

    await Promise.all([
      this.saveToStorage('patients', mergedPatients),
      this.saveToStorage('visits', mergedVisits),
      this.saveToStorage('richieste_esami', mergedRichiesteEsami),
      this.saveToStorage('certificati_paziente', mergedCertificati),
      this.saveToStorage('ricette_paziente', mergedRicette),
      this.saveToStorage('documents', mergedDocuments),
      this.saveToStorage('templates', mergedTemplates),
    ]);

    await this.mergeVisitRevisions(data.visitRevisions);

    if (data.doctor) {
      const incomingDoctor = data.doctor;

      if (!currentDoctor) {
        const fullKey = this.getStorageKey('doctor');
        const value = JSON.stringify(incomingDoctor);
        if (isSqliteAvailable()) {
          await window.electronAPI!.kvSet(fullKey, value);
        } else {
          localStorage.setItem(fullKey, value);
        }
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
          profileImage: currentDoctor.profileImage || incomingDoctor.profileImage,
          signatureStampImage: currentDoctor.signatureStampImage || incomingDoctor.signatureStampImage,
          ambulatori: mergedAmbulatori,
          updatedAt: this.getCurrentTimestamp(),
        };

        const fullKey = this.getStorageKey('doctor');
        const value = JSON.stringify(mergedDoctor);
        if (isSqliteAvailable()) {
          await window.electronAPI!.kvSet(fullKey, value);
        } else {
          localStorage.setItem(fullKey, value);
        }
      }
    }
  }

  /** Sostituzione totale dell'archivio con il contenuto del backup. */
  private async replaceAllData(data: AppData): Promise<void> {
    // clearAllData preserva la cronologia esistente; uniamo poi quella del backup.
    await this.clearAllData();
    await this.mergeVisitRevisions(data.visitRevisions);

    if (data.patients && data.patients.length > 0) {
      await this.saveToStorage('patients', data.patients);
    }

    if (data.visits && data.visits.length > 0) {
      await this.saveToStorage('visits', data.visits);
    }

    if (data.richiesteEsami && data.richiesteEsami.length > 0) {
      await this.saveToStorage('richieste_esami', data.richiesteEsami);
    }

    if (data.certificatiPaziente && data.certificatiPaziente.length > 0) {
      await this.saveToStorage('certificati_paziente', data.certificatiPaziente);
    }

    if (data.ricettePaziente && data.ricettePaziente.length > 0) {
      await this.saveToStorage('ricette_paziente', data.ricettePaziente);
    }

    if (data.doctor) {
      const fullKey = this.getStorageKey('doctor');
      const value = JSON.stringify(data.doctor);
      if (isSqliteAvailable()) {
        await window.electronAPI!.kvSet(fullKey, value);
      } else {
        localStorage.setItem(fullKey, value);
      }
    }

    if (data.documents && data.documents.length > 0) {
      await this.saveToStorage('documents', data.documents);
    }

    if (data.templates && data.templates.length > 0) {
      await this.saveToStorage('templates', data.templates);
    }
  }


  async clearAllData(): Promise<void> {
    // La cronologia delle modifiche non va mai cancellata, nemmeno col reset totale.
    const preservedRevisions = await this.getFromStorage<VisitRevision>('visit_revisions');

    if (isSqliteAvailable()) {
      await window.electronAPI!.kvClearAppDottori();
    } else {
      localStorage.removeItem(this.getStorageKey('patients'));
      localStorage.removeItem(this.getStorageKey('visits'));
      localStorage.removeItem(this.getStorageKey('richieste_esami'));
      localStorage.removeItem(this.getStorageKey('certificati_paziente'));
      localStorage.removeItem(this.getStorageKey('ricette_paziente'));
      localStorage.removeItem(this.getStorageKey('doctor'));
      localStorage.removeItem(this.getStorageKey('documents'));
      localStorage.removeItem(this.getStorageKey('templates'));
      localStorage.removeItem(this.getStorageKey('preferences'));
      localStorage.removeItem(this.getStorageKey('recent_patient_searches'));
    }

    // Ripristina la cronologia preservata (kvClearAppDottori cancella anche questa chiave).
    if (preservedRevisions.length > 0) {
      await this.saveToStorage('visit_revisions', preservedRevisions);
    }
  }
}

// Usa sempre localStorage per semplicità in Electron
export const storageService = new LocalStorageFallbackService();
