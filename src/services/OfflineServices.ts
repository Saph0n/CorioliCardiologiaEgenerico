import { storageService } from './StorageServiceFallback';
import { todayIsoDate } from '../utils/dateUtils';
import { validateBackupData } from '../utils/backupValidation';
import { createBackupFile } from './BackupFileService';
import { Patient, Visit, VisitRevision, Doctor, Document, AppData, BackupImportMode, RichiestaEsameComplementare, CertificatoPaziente, RicettaPaziente } from '../types/Storage';

// Servizio per gestire i pazienti offline
export class PatientService {
  static async getAllPatients(): Promise<Patient[]> {
    return await storageService.getPatients();
  }

  static async getPatientById(id: string): Promise<Patient | null> {
    return await storageService.getPatientById(id);
  }

  static async getPatientByCF(cf: string): Promise<Patient | null> {
    return await storageService.getPatientByCF(cf);
  }

  static async addPatient(
    patientData: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Patient> {
    return await storageService.addPatient(patientData);
  }

  static async updatePatient(id: string, patientData: Partial<Patient>): Promise<Patient> {
    return await storageService.updatePatient(id, patientData);
  }

  static async deletePatient(id: string): Promise<void> {
    return await storageService.deletePatient(id);
  }

  static async searchPatients(searchTerm: string): Promise<Patient[]> {
    const patients = await this.getAllPatients();
    const term = searchTerm.toLowerCase();

    return patients.filter(patient =>
      patient.nome.toLowerCase().includes(term) ||
      patient.cognome.toLowerCase().includes(term) ||
      (patient.codiceFiscale && patient.codiceFiscale.toLowerCase().includes(term))
    );
  }
}

// Servizio per gestire le visite offline
export class VisitService {
  static async getAllVisits(): Promise<Visit[]> {
    return await storageService.getVisits();
  }

  static async getVisitsByPatientId(patientId: string): Promise<Visit[]> {
    return await storageService.getVisitsByPatientId(patientId);
  }

  static async getVisitById(id: string): Promise<Visit | null> {
    return await storageService.getVisitById(id);
  }

  /**
   * Il tipo deriva da `Visit`: una firma scritta a mano perdeva silenziosamente
   * `tipo`, `visita` e `anamnesiStrutturata`.
   */
  static async addVisit(
    visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Visit> {
    return await storageService.addVisit(visitData);
  }

  static async updateVisit(id: string, visitData: Partial<Visit>): Promise<Visit> {
    return await storageService.updateVisit(id, visitData);
  }

  static async deleteVisit(id: string): Promise<void> {
    return await storageService.deleteVisit(id);
  }

  static async getVisitsByDateRange(startDate: string, endDate: string): Promise<Visit[]> {
    const visits = await this.getAllVisits();
    return visits.filter(visit =>
      visit.dataVisita >= startDate && visit.dataVisita <= endDate
    );
  }

  /** Cronologia di tutte le modifiche alle visite (store dedicato, mai cancellato). */
  static async getAllRevisions(): Promise<VisitRevision[]> {
    return await storageService.getVisitRevisions();
  }
}

// Richieste esami complementari (entità separata dalla visita)
export class RichiestaEsameService {
  static async getAll(): Promise<RichiestaEsameComplementare[]> {
    // Recupera tutti i pazienti e unisce i loro esami
    const patients = await storageService.getPatients();
    const all = await Promise.all(patients.map(p => storageService.getRichiesteEsamiByPatientId(p.id)));
    return all.flat().sort((a, b) => new Date(b.dataRichiesta).getTime() - new Date(a.dataRichiesta).getTime());
  }

  static async getByPatientId(patientId: string): Promise<RichiestaEsameComplementare[]> {
    return await storageService.getRichiesteEsamiByPatientId(patientId);
  }

  static async getById(id: string): Promise<RichiestaEsameComplementare | null> {
    return await storageService.getRichiestaEsameById(id);
  }

  static async add(data: {
    patientId: string;
    nome: string;
    note?: string;
    dataRichiesta: string;
  }): Promise<RichiestaEsameComplementare> {
    return await storageService.addRichiestaEsame(data);
  }

  static async update(id: string, data: Partial<Pick<RichiestaEsameComplementare, 'nome' | 'note' | 'dataRichiesta'>>): Promise<RichiestaEsameComplementare> {
    return await storageService.updateRichiestaEsame(id, data);
  }

  static async delete(id: string): Promise<void> {
    return await storageService.deleteRichiestaEsame(id);
  }
}

// Certificati paziente (certificati medici: assenza, idoneità, malattia, altro)
export class CertificatoService {
  static async getByPatientId(patientId: string): Promise<CertificatoPaziente[]> {
    return await storageService.getCertificatiByPatientId(patientId);
  }

  static async getById(id: string): Promise<CertificatoPaziente | null> {
    return await storageService.getCertificatoById(id);
  }

  static async add(data: {
    patientId: string;
    tipo: CertificatoPaziente['tipo'];
    dataCertificato: string;
    descrizione: string;
  }): Promise<CertificatoPaziente> {
    return await storageService.addCertificato(data);
  }

  static async update(id: string, data: Partial<Pick<CertificatoPaziente, 'tipo' | 'dataCertificato' | 'descrizione'>>): Promise<CertificatoPaziente> {
    return await storageService.updateCertificato(id, data);
  }

  static async delete(id: string): Promise<void> {
    return await storageService.deleteCertificato(id);
  }
}

// Ricette paziente (PDF cartaceo / promemoria terapia)
export class RicettaService {
  static async getByPatientId(patientId: string): Promise<RicettaPaziente[]> {
    return await storageService.getRicetteByPatientId(patientId);
  }

  static async getById(id: string): Promise<RicettaPaziente | null> {
    return await storageService.getRicettaById(id);
  }

  static async add(data: {
    patientId: string;
    tipo: RicettaPaziente['tipo'];
    dataRicetta: string;
    testo?: string;
    farmaci?: RicettaPaziente['farmaci'];
    note?: string;
  }): Promise<RicettaPaziente> {
    return await storageService.addRicetta(data);
  }

  static async update(id: string, data: Partial<Pick<RicettaPaziente, 'tipo' | 'dataRicetta' | 'testo' | 'farmaci' | 'note'>>): Promise<RicettaPaziente> {
    return await storageService.updateRicetta(id, data);
  }

  static async delete(id: string): Promise<void> {
    return await storageService.deleteRicetta(id);
  }
}

// Servizio per gestire il dottore offline
export class DoctorService {
  static async getDoctor(): Promise<Doctor | null> {
    return await storageService.getDoctor();
  }

  static async updateDoctor(doctorData: {
    titolo?: Doctor["titolo"];
    nome?: string;
    cognome?: string;
    email?: string;
    telefono?: string;
    specializzazione?: string;
    ambulatori?: any[];
    profileImage?: string;
    signatureStampImage?: string;
  }): Promise<Doctor> {
    return await storageService.updateDoctor(doctorData);
  }

  static async initializeDefaultDoctor(): Promise<Doctor> {
    const existingDoctor = await this.getDoctor();
    if (existingDoctor) {
      const isLegacyStockProfile =
        (existingDoctor.nome || "").trim() === "Dottore" &&
        (existingDoctor.cognome || "").trim() === "Default" &&
        (existingDoctor.email || "").trim() === "dottore@example.com" &&
        !(existingDoctor.telefono || "").trim() &&
        (((existingDoctor.specializzazione || "").trim() === "Medicina Generale") ||
          !(existingDoctor.specializzazione || "").trim());

      if (isLegacyStockProfile) {
        return await this.updateDoctor({
          nome: "",
          cognome: "",
          email: "",
          telefono: "",
          specializzazione: "",
        });
      }

      return existingDoctor;
    }

    return await this.updateDoctor({
      nome: "",
      cognome: "",
      email: "",
      telefono: "",
      specializzazione: "",
    });
  }
}

/** Preferenze app e ricerche recenti (in Electron salvate nel db). */
export class PreferenceService {
  static async getPreferences(): Promise<Record<string, unknown> | null> {
    const raw = await storageService.getPreference('preferences');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  static async savePreferences(prefs: Record<string, unknown>): Promise<void> {
    await storageService.setPreference('preferences', JSON.stringify(prefs));
  }

  static async recordLastBackup(): Promise<string> {
    const now = new Date().toISOString();
    const prefs = (await this.getPreferences()) ?? {};
    await this.savePreferences({ ...prefs, lastBackupDate: now });
    return now;
  }

  static async getRecentPatientSearches(): Promise<string | null> {
    return await storageService.getPreference('recent_patient_searches');
  }

  static async setRecentPatientSearches(json: string): Promise<void> {
    await storageService.setPreference('recent_patient_searches', json);
  }
}

// Servizio per backup e export
export class BackupService {
  static async exportData(): Promise<Blob> {
    const data = await storageService.exportData();
    const jsonString = JSON.stringify(data, null, 2);
    return new Blob([jsonString], { type: 'application/json' });
  }

  /**
   * Importa un backup JSON.
   *
   * Ordine obbligato: prima si valida il file, poi si crea una copia di sicurezza
   * del database, e solo allora si tocca l'archivio. In modalità "replace" lo
   * storage esegue comunque un rollback in memoria se la scrittura fallisce.
   */
  static async importData(file: File, mode: BackupImportMode = 'replace'): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('Il file non è un JSON leggibile: potrebbe essere danneggiato o incompleto.');
    }

    const validation = validateBackupData(parsed);
    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    // Punto di ritorno prima di modificare l'archivio.
    const backup = await createBackupFile('pre-import');
    if (backup && !backup.ok) {
      console.warn('Backup pre-import non riuscito:', backup.error);
    }

    await storageService.importData(parsed as AppData, mode);
  }

  static async downloadBackup(): Promise<void> {
    const blob = await this.exportData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-corioli-${todayIsoDate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const lastBackupDate = await PreferenceService.recordLastBackup();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('corioli-backup-completed', { detail: { lastBackupDate } }),
      );
    }
  }

  static async uploadBackup(file: File, mode: BackupImportMode = 'replace'): Promise<void> {
    await this.importData(file, mode);
  }
}

// Servizio per gestire i documenti offline
export class DocumentService {
  // ... (rimane uguale)
  static async getAllDocuments(): Promise<Document[]> {
    return await storageService.getDocuments();
  }

  static async getDocumentById(id: string): Promise<Document | null> {
    return await storageService.getDocumentById(id);
  }

  static async addDocument(documentData: {
    title: string;
    description?: string;
    patientId?: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    category: 'corso_aggiornamento' | 'certificato' | 'altro';
    uploadDate: string;
    expiryDate?: string;
    credits?: number;
    fileData: string;
  }): Promise<Document> {
    return await storageService.addDocument(documentData);
  }

  static async updateDocument(id: string, documentData: Partial<Document>): Promise<Document> {
    return await storageService.updateDocument(id, documentData);
  }

  static async deleteDocument(id: string): Promise<void> {
    return await storageService.deleteDocument(id);
  }

  static async getDocumentsByCategory(category: string): Promise<Document[]> {
    const documents = await this.getAllDocuments();
    return documents.filter(doc => doc.category === category);
  }

  static async searchDocuments(searchTerm: string): Promise<Document[]> {
    const documents = await this.getAllDocuments();
    const term = searchTerm.toLowerCase();

    return documents.filter(doc =>
      doc.title.toLowerCase().includes(term) ||
      doc.description?.toLowerCase().includes(term) ||
      doc.fileName.toLowerCase().includes(term)
    );
  }

  static convertFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Rimuovi il prefisso data:mime/type;base64,
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }

  static downloadDocument(doc: Document): void {
    try {
      const byteCharacters = atob(doc.fileData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: doc.mimeType });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Errore nel download del documento:', error);
    }
  }
}

// Servizio per gestire i template
import { MedicalTemplate } from '../types/Storage';

export class TemplateService {
  static async getAllTemplates(): Promise<MedicalTemplate[]> {
    return await storageService.getTemplates();
  }

  static async getTemplatesByCategoryAndSection(
    category: 'visita' | 'terapie',
    section: 'prestazione' | 'esameObiettivo' | 'conclusioni' | 'generale'
  ): Promise<MedicalTemplate[]> {
    const templates = await this.getAllTemplates();
    return templates.filter(t => t.category === category && t.section === section);
  }

  static async addTemplate(templateData: Omit<MedicalTemplate, 'id' | 'isDefault'>): Promise<MedicalTemplate> {
    return await storageService.addTemplate(templateData);
  }

  static async updateTemplate(id: string, templateData: Partial<MedicalTemplate>): Promise<MedicalTemplate> {
    return await storageService.updateTemplate(id, templateData);
  }

  static async deleteTemplate(id: string): Promise<void> {
    return await storageService.deleteTemplate(id);
  }
}
