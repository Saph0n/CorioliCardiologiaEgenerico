import { PatientService, VisitService, DoctorService } from './OfflineServices';
import { Patient, Visit, Doctor } from '../types/Storage';
import jsPDF from 'jspdf';
import { todayIsoDate } from "../utils/dateUtils";
import { titoloMedico } from "../utils/doctorProfile";

export interface ExportData {
  doctor: Doctor | null;
  patients: Patient[];
  visits: Visit[];
  exportDate: string;
  totalPatients: number;
  totalVisits: number;
}

/** Export strutturato per esercizio del diritto di accesso (art. 15 GDPR). */
export interface DataAccessExportPackage {
  schema: "corioli.data-access";
  version: "1.0";
  exportedAt: string;
  purpose: "gdpr_article_15_access";
  doctor: Doctor | null;
  patients: Patient[];
  visits: Visit[];
  metadata: {
    patientCount: number;
    visitCount: number;
    note: string;
  };
}

export class ExportService {
  /** Pacchetto JSON versionato per richieste di accesso ai dati (medico titolare, dati in locale). */
  static async exportDataAccessPackage(): Promise<void> {
    try {
      const [doctor, patients, visits] = await Promise.all([
        DoctorService.getDoctor(),
        PatientService.getAllPatients(),
        VisitService.getAllVisits(),
      ]);

      const payload: DataAccessExportPackage = {
        schema: "corioli.data-access",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        purpose: "gdpr_article_15_access",
        doctor,
        patients,
        visits,
        metadata: {
          patientCount: patients.length,
          visitCount: visits.length,
          note:
            "Export generato dall'app desktop Corioli Cardiologia. I dati sanitari restano sotto responsabilità del medico titolare.",
        },
      };

      const jsonString = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `corioli_accesso_dati_${todayIsoDate()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Errore export accesso dati:", error);
      }
      throw error;
    }
  }

  // Export completo in JSON
  static async exportAllDataAsJSON(): Promise<void> {
    try {
      const [doctor, patients, visits] = await Promise.all([
        DoctorService.getDoctor(),
        PatientService.getAllPatients(),
        VisitService.getAllVisits()
      ]);

      const exportData: ExportData = {
        doctor,
        patients,
        visits,
        exportDate: new Date().toISOString(),
        totalPatients: patients.length,
        totalVisits: visits.length
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_completo_${todayIsoDate()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Errore nell\'export JSON:', error);
      throw error;
    }
  }

  // Export in formato CSV
  static async exportPatientsAsCSV(): Promise<void> {
    try {
      const patients = await PatientService.getAllPatients();
      
      const csvHeaders = [
        'Nome',
        'Cognome', 
        'Codice Fiscale',
        'Data Nascita',
        'Luogo Nascita',
        'Sesso',
        'Email',
        'Telefono',
        'Indirizzo',
        'Data Registrazione'
      ];

      const csvRows = patients.map(patient => [
        patient.nome,
        patient.cognome,
        patient.codiceFiscale,
        patient.dataNascita,
        patient.luogoNascita,
        patient.sesso || '',
        patient.email || '',
        patient.telefono || '',
        patient.indirizzo || '',
        new Date(patient.createdAt).toLocaleDateString('it-IT')
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pazienti_${todayIsoDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Errore nell\'export CSV:', error);
      throw error;
    }
  }

  // Export visite come CSV
  static async exportVisitsAsCSV(): Promise<void> {
    try {
      const [visits, patients] = await Promise.all([
        VisitService.getAllVisits(),
        PatientService.getAllPatients()
      ]);

      // Crea mappa paziente per nome
      const patientMap = new Map(patients.map(p => [p.id, `${p.nome} ${p.cognome}`]));

      const csvHeaders = [
        'Paziente',
        'Data Visita',
        'Tipo Visita',
        'Descrizione Clinica',
        'Diagnosi',
        'Terapie',
        'Data Creazione'
      ];

      const csvRows = visits.map(visit => [
        patientMap.get(visit.patientId) || 'Paziente Sconosciuto',
        new Date(visit.dataVisita).toLocaleDateString('it-IT'),
        visit.tipo || 'generale',
        visit.descrizioneClinica.substring(0, 100) + '...',
        visit.conclusioniDiagnostiche.substring(0, 100) + '...',
        visit.terapie.substring(0, 100) + '...',
        new Date(visit.createdAt).toLocaleDateString('it-IT')
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visite_${todayIsoDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Errore nell\'export visite CSV:', error);
      throw error;
    }
  }

  // Export report PDF completo
  static async exportCompleteReportAsPDF(): Promise<void> {
    try {
      const [doctor, patients, visits] = await Promise.all([
        DoctorService.getDoctor(),
        PatientService.getAllPatients(),
        VisitService.getAllVisits()
      ]);

      const doc = new jsPDF();
      const primaryColor: [number, number, number] = [41, 128, 185];
      const secondaryColor: [number, number, number] = [52, 73, 94];

      // Header
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 30, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("REPORT COMPLETO PAZIENTI E VISITE", 105, 16, { align: "center" });
      
      if (doctor) {
        doc.setFontSize(12);
        doc.text(`${titoloMedico(doctor)} ${doctor.nome} ${doctor.cognome}`, 105, 24, { align: "center" });
      }

      // Reset colori
      doc.setTextColor(...secondaryColor);
      
      let yPos = 45;

      // Statistiche generali
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("STATISTICHE GENERALI", 20, yPos);
      yPos += 10;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Totale Pazienti: ${patients.length}`, 20, yPos);
      doc.text(`Totale Visite: ${visits.length}`, 100, yPos);
      yPos += 6;
      doc.text(`Data Export: ${new Date().toLocaleDateString('it-IT')}`, 20, yPos);
      yPos += 15;

      // Lista pazienti con visite
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("ELENCO PAZIENTI E VISITE", 20, yPos);
      yPos += 10;

      for (const patient of patients.slice(0, 10)) { // Primi 10 pazienti
        // Check se siamo vicini al fondo pagina
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        // Dati paziente
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`${patient.nome} ${patient.cognome}`, 20, yPos);
        yPos += 5;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const datiPaziente = [
          `CF: ${patient.codiceFiscale}`,
          `Nato: ${new Date(patient.dataNascita).toLocaleDateString('it-IT')}`,
          // Senza sesso indicato la voce non si scrive: stampava "undefined".
          patient.sesso,
        ].filter(Boolean).join(' | ');
        doc.text(datiPaziente, 20, yPos);
        yPos += 8;

        // Visite del paziente
        const patientVisits = visits.filter(v => v.patientId === patient.id);
        if (patientVisits.length > 0) {
          doc.text(`Visite (${patientVisits.length}):`, 25, yPos);
          yPos += 4;

          patientVisits.slice(0, 3).forEach(visit => { // Prime 3 visite
            const visitDate = new Date(visit.dataVisita).toLocaleDateString('it-IT');
            const visitType = visit.tipo || 'generale';
            doc.text(`• ${visitDate} - ${visitType}: ${visit.descrizioneClinica.substring(0, 60)}...`, 30, yPos);
            yPos += 4;
          });

          if (patientVisits.length > 3) {
            doc.text(`  ... e altre ${patientVisits.length - 3} visite`, 30, yPos);
            yPos += 4;
          }
        } else {
          doc.text(`Nessuna visita registrata`, 25, yPos);
          yPos += 4;
        }
        
        yPos += 5; // Spazio tra pazienti
      }

      if (patients.length > 10) {
        yPos += 5;
        doc.text(`... e altri ${patients.length - 10} pazienti`, 20, yPos);
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Pagina ${i} di ${pageCount}`, 105, 290, { align: "center" });
      }

      doc.save(`report_completo_${todayIsoDate()}.pdf`);
    } catch (error) {
      console.error('Errore nell\'export PDF:', error);
      throw error;
    }
  }

  // Export statistiche
  static async getStatistics() {
    try {
      const [patients, visits] = await Promise.all([
        PatientService.getAllPatients(),
        VisitService.getAllVisits()
      ]);

      const stats = {
        totalPatients: patients.length,
        totalVisits: visits.length,
        malePatients: patients.filter(p => p.sesso === 'M').length,
        femalePatients: patients.filter(p => p.sesso === 'F').length,
        visitsThisMonth: visits.filter(v => {
          const visitDate = new Date(v.dataVisita);
          const now = new Date();
          return visitDate.getMonth() === now.getMonth() && 
                 visitDate.getFullYear() === now.getFullYear();
        }).length,
        visitsPerType: {
          generale: visits.filter(v => v.tipo === 'generale' || !v.tipo).length
        },
        averageAge: Math.round(
          patients.reduce((sum, p) => {
            const age = new Date().getFullYear() - new Date(p.dataNascita).getFullYear();
            return sum + age;
          }, 0) / patients.length
        )
      };

      return stats;
    } catch (error) {
      console.error('Errore nel calcolo statistiche:', error);
      throw error;
    }
  }
}
