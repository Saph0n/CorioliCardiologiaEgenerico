import React, { useState, useEffect } from 'react';
import {
  Button,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Tabs,
  Tab,
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Input,
  Tooltip,
  Chip,
  Pagination,
  Spinner,
  Card,
  CardBody,
  Textarea,
  Progress
} from '@nextui-org/react';
import {
  Trash2,
  Edit,
  FileDown,
  Search,
  RefreshCw,
  Database,
  Users,
  FileText,
  Stethoscope,
  Download,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  Save,
  History,
  ArrowRight
} from 'lucide-react';
import { BackupImportMode, VisitRevision } from '../types/Storage';
import {
  BackupService,
  PatientService,
  VisitService,
  DocumentService
} from '../services/OfflineServices';
import { CsvImportService, CsvImportProgress } from '../services/CsvImportService';
import { CodiceFiscaleValue } from './CodiceFiscaleValue';
import { ConfirmDangerModal } from './ConfirmDangerModal';
import { AppModal } from "./AppModal";
import AutoBackupPanel from "./AutoBackupPanel";

const BackupManager: React.FC = () => {
  const { isOpen, onOpen, onOpenChange, onClose: closeManager } = useDisclosure();
  const {
    isOpen: isResetModalOpen,
    onOpen: onResetModalOpen,
    onClose: onResetModalClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteItemOpen,
    onOpen: onDeleteItemOpen,
    onClose: onDeleteItemClose,
  } = useDisclosure();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const patientsCsvInputRef = React.useRef<HTMLInputElement>(null);
  const appointmentsCsvInputRef = React.useRef<HTMLInputElement>(null);
  const doctorlibCsvInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedTab, setSelectedTab] = useState("patients");
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [patientsCsvFile, setPatientsCsvFile] = useState<File | null>(null);
  const [appointmentsCsvFile, setAppointmentsCsvFile] = useState<File | null>(null);
  const [doctorlibCsvFile, setDoctorlibCsvFile] = useState<File | null>(null);
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null);
  const [backupImportMode, setBackupImportMode] = useState<BackupImportMode>('merge');
  const [isImportModeModalOpen, setIsImportModeModalOpen] = useState(false);
  const rowsPerPage = 5;

  // Edit State
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // Feedback state
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Progress for CSV import (bar instead of spinner)
  const [csvImportProgress, setCsvImportProgress] = useState<CsvImportProgress | null>(null);

  // Load data when tab or modal status changes
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, selectedTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let result: any[] = [];
      switch (selectedTab) {
        case "patients":
          result = await PatientService.getAllPatients();
          break;
        case "visits":
          result = await VisitService.getAllVisits();
          break;
        case "documents":
          result = await DocumentService.getAllDocuments();
          break;
        case "history":
          result = await VisitService.getAllRevisions();
          break;
      }
      setData(result);
    } catch (error) {
      console.error("Errore caricamento dati:", error);
      setMessage({ text: "Errore nel caricamento dei dati", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmResetTotal = async () => {
    setIsResetting(true);
    try {
      // La cronologia delle modifiche non va mai cancellata, nemmeno col reset totale.
      const preservedRevisions = await VisitService.getAllRevisions();
      const revisionsKey = "AppDottori_visit_revisions";

      if (window.electronAPI?.kvClearAppDottori) {
        await window.electronAPI.kvClearAppDottori();
        if (preservedRevisions.length > 0 && window.electronAPI?.kvSet) {
          await window.electronAPI.kvSet(
            revisionsKey,
            JSON.stringify(preservedRevisions),
          );
        }
      } else {
        localStorage.clear();
        if (preservedRevisions.length > 0) {
          localStorage.setItem(revisionsKey, JSON.stringify(preservedRevisions));
        }
      }
      window.location.reload();
    } catch (error) {
      console.error("Errore reset totale:", error);
      setMessage({ text: "Errore durante il reset dei dati.", type: "error" });
      setIsResetting(false);
      onResetModalClose();
    }
  };

  const getDeleteItemConfig = () => {
    switch (selectedTab) {
      case "patients":
        return {
          title: "Elimina paziente",
          confirmLabel: "Elimina paziente",
          message:
            "Sei sicuro di voler eliminare questo paziente? Verranno eliminate anche le visite collegate.",
        };
      case "visits":
        return {
          title: "Elimina visita",
          confirmLabel: "Elimina visita",
          message:
            "Sei sicuro di voler eliminare questa visita? Questa azione è irreversibile.",
        };
      default:
        return {
          title: "Elimina documento",
          confirmLabel: "Elimina documento",
          message: "Sei sicuro di voler eliminare questo documento?",
        };
    }
  };

  const requestDelete = (id: string) => {
    setItemToDelete(id);
    onDeleteItemOpen();
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      setIsDeletingItem(true);
      switch (selectedTab) {
        case "patients":
          await PatientService.deletePatient(itemToDelete);
          break;
        case "visits":
          await VisitService.deleteVisit(itemToDelete);
          break;
        case "documents":
          await DocumentService.deleteDocument(itemToDelete);
          break;
      }
      setMessage({ text: "Elemento eliminato con successo", type: "success" });
      onDeleteItemClose();
      setItemToDelete(null);
      loadData();
    } catch (error) {
      console.error("Errore eliminazione:", error);
      setMessage({ text: "Errore durante l'eliminazione", type: "error" });
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleEdit = (item: any) => {
    setEditingItem({ ...item }); // Clone to avoid direct mutation
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      switch (selectedTab) {
        case "patients":
          await PatientService.updatePatient(editingItem.id, editingItem);
          break;
        case "visits":
          await VisitService.updateVisit(editingItem.id, editingItem);
          break;
        case "documents":
          await DocumentService.updateDocument(editingItem.id, editingItem);
          break;
      }
      setMessage({ text: "Modifiche salvate con successo", type: "success" });
      setEditingItem(null);
      loadData();
    } catch (error) {
      console.error("Errore salvataggio:", error);
      setMessage({ text: "Errore durante il salvataggio", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    setIsLoading(true);
    try {
      await BackupService.downloadBackup();
      setMessage({ text: 'Backup esportato con successo!', type: 'success' });
    } catch (error) {
      console.error('Errore durante l\'export:', error);
      setMessage({ text: 'Errore durante l\'export del backup', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value to allow selecting the same file again if needed
    event.target.value = '';
    setPendingBackupFile(file);
    setBackupImportMode('merge');
    setIsImportModeModalOpen(true);
  };

  const executeBackupImport = async () => {
    if (!pendingBackupFile) return;
    setIsLoading(true);
    try {
      await BackupService.uploadBackup(pendingBackupFile, backupImportMode);
      setMessage({
        text:
          backupImportMode === 'replace'
            ? 'Backup importato in modalità sostituzione totale. Ricarica l\'app per applicare tutto.'
            : 'Backup importato in modalità unione (dati aggiunti ai dati attuali). Ricarica l\'app per applicare tutto.',
        type: 'success'
      });
      setIsImportModeModalOpen(false);
      setPendingBackupFile(null);
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Errore durante l\'import:', error);
      // Il messaggio della validazione dice *cosa* non va nel file: va mostrato al medico.
      const detail = error instanceof Error ? error.message : '';
      setMessage({
        text: detail
          ? `Import annullato: ${detail} I dati attuali non sono stati modificati.`
          : 'Errore import: file non valido o corrotto. I dati attuali non sono stati modificati.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPatientsCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setPatientsCsvFile(file);
    event.target.value = '';
  };

  const handleSelectAppointmentsCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setAppointmentsCsvFile(file);
    event.target.value = '';
  };

  const handleImportCsvData = async () => {
    if (!patientsCsvFile || !appointmentsCsvFile) {
      setMessage({ text: "Seleziona entrambi i file CSV (pazienti e appuntamenti).", type: "error" });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setCsvImportProgress({ phase: 'Avvio...', current: 0, total: 1 });

    try {
      const importResult = await CsvImportService.importPatientsAndAppointments(
        patientsCsvFile,
        appointmentsCsvFile,
        (p) => setCsvImportProgress(p)
      );

      setPatientsCsvFile(null);
      setAppointmentsCsvFile(null);
      setCsvImportProgress(null);

      setMessage({
        text:
          `Import completato. Pazienti nuovi: ${importResult.patientsImported}, ` +
          `aggiornati: ${importResult.patientsUpdated}, saltati: ${importResult.patientsSkipped}. ` +
          `Visite importate: ${importResult.visitsImported}, note cliniche: ${importResult.notesImported}, ` +
          `visite saltate: ${importResult.visitsSkipped}.`,
        type: "success",
      });
    } catch (error) {
      console.error("Errore durante import CSV:", error);
      setCsvImportProgress(null);
      setMessage({
        text: "Errore durante l'import CSV. Verifica il formato dei file selezionati.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDoctorlibCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setDoctorlibCsvFile(file);
    event.target.value = '';
  };

  const handleImportDoctorlibData = async () => {
    if (!doctorlibCsvFile) {
      setMessage({ text: "Seleziona il file CSV esportato da Doctorlib.", type: "error" });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setCsvImportProgress({ phase: 'Avvio...', current: 0, total: 1 });

    try {
      const importResult = await CsvImportService.importDoctorlibPatients(
        doctorlibCsvFile,
        (p) => setCsvImportProgress(p)
      );
      setDoctorlibCsvFile(null);
      setCsvImportProgress(null);
      setMessage({
        text:
          `Import Doctorlib completato. Pazienti nuovi: ${importResult.patientsImported}, ` +
          `aggiornati: ${importResult.patientsUpdated}, saltati/doppioni: ${importResult.patientsSkipped}.`,
        type: "success",
      });
    } catch (error) {
      console.error("Errore durante import Doctorlib:", error);
      setCsvImportProgress(null);
      setMessage({
        text: "Errore durante l'import Doctorlib. Verifica che il CSV sia valido.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter and Pagination logic
  const filteredData = React.useMemo(() => {
    if (!searchQuery) return data;
    const lowerQuery = searchQuery.toLowerCase();
    return data.filter(item =>
      Object.values(item).some(val =>
        String(val).toLowerCase().includes(lowerQuery)
      )
    );
  }, [data, searchQuery]);

  const items = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredData.slice(start, end);
  }, [page, filteredData]);

  // Render Functions
  const renderPatientsTable = () => (
    <Table aria-label="Tabella Pazienti">
      <TableHeader>
        <TableColumn>NOME COMPLETO</TableColumn>
        <TableColumn>CODICE FISCALE</TableColumn>
        <TableColumn>CONTATTI</TableColumn>
        <TableColumn>AZIONI</TableColumn>
      </TableHeader>
      <TableBody emptyContent={"Nessun paziente trovato."} items={items}>
        {(item: any) => (
          <TableRow key={item.id}>
            <TableCell>{item.nome} {item.cognome}</TableCell>
            <TableCell>
              <CodiceFiscaleValue
                value={item.codiceFiscale}
                generatedFromImport={Boolean(item.codiceFiscaleGenerato)}
              />
            </TableCell>
            <TableCell>
              <div className="text-xs">
                <div>{item.telefono}</div>
                <div className="text-gray-500">{item.email}</div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                <Tooltip content="Modifica">
                  <span className="text-lg text-default-500 cursor-pointer active:opacity-50" onClick={() => handleEdit(item)}>
                    <Edit size={18} />
                  </span>
                </Tooltip>
                <Tooltip content="Elimina">
                  <span className="text-lg text-danger cursor-pointer active:opacity-50" onClick={() => requestDelete(item.id)}>
                    <Trash2 size={18} />
                  </span>
                </Tooltip>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  const renderVisitsTable = () => (
    <Table aria-label="Tabella Visite">
      <TableHeader>
        <TableColumn>DATA</TableColumn>
        <TableColumn>PAZIENTE ID</TableColumn>
        <TableColumn>DESCRIZIONE</TableColumn>
        <TableColumn>AZIONI</TableColumn>
      </TableHeader>
      <TableBody emptyContent={"Nessuna visita trovata."} items={items}>
        {(item: any) => (
          <TableRow key={item.id}>
            <TableCell>{new Date(item.dataVisita).toLocaleDateString()}</TableCell>
            <TableCell>
              <Chip size="sm" variant="flat">{item.patientId?.substring(0, 8)}...</Chip>
            </TableCell>
            <TableCell className="truncate max-w-xs">{item.descrizioneClinica}</TableCell>
            <TableCell>
              <div className="flex gap-2">
                <Tooltip content="Modifica">
                  <span className="text-lg text-default-500 cursor-pointer active:opacity-50" onClick={() => handleEdit(item)}>
                    <Edit size={18} />
                  </span>
                </Tooltip>
                <Tooltip content="Elimina">
                  <span className="text-lg text-danger cursor-pointer active:opacity-50" onClick={() => requestDelete(item.id)}>
                    <Trash2 size={18} />
                  </span>
                </Tooltip>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  const renderDocumentsTable = () => (
    <Table aria-label="Tabella Documenti">
      <TableHeader>
        <TableColumn>NOME FILE</TableColumn>
        <TableColumn>CATEGORIA</TableColumn>
        <TableColumn>DATA UPLOAD</TableColumn>
        <TableColumn>AZIONI</TableColumn>
      </TableHeader>
      <TableBody emptyContent={"Nessun documento trovato."} items={items}>
        {(item: any) => (
          <TableRow key={item.id}>
            <TableCell>{item.fileName}</TableCell>
            <TableCell>
              <Chip size="sm" color="primary" variant="flat">{item.category}</Chip>
            </TableCell>
            <TableCell>{new Date(item.uploadDate).toLocaleDateString()}</TableCell>
            <TableCell>
              <div className="flex gap-3">
                <Tooltip content="Scarica">
                  <span className="text-lg text-primary cursor-pointer active:opacity-50" onClick={() => DocumentService.downloadDocument(item)}>
                    <FileDown size={18} />
                  </span>
                </Tooltip>
                <Tooltip content="Modifica">
                  <span className="text-lg text-default-500 cursor-pointer active:opacity-50" onClick={() => handleEdit(item)}>
                    <Edit size={18} />
                  </span>
                </Tooltip>
                <Tooltip content="Elimina">
                  <span className="text-lg text-danger cursor-pointer active:opacity-50" onClick={() => requestDelete(item.id)}>
                    <Trash2 size={18} />
                  </span>
                </Tooltip>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const renderHistory = () => {
    // Filtra solo voci di cronologia valide: al cambio tab `items` può contenere
    // ancora dati della tab precedente (es. visite) prima che loadData aggiorni lo stato.
    const revisions = (items as VisitRevision[]).filter(
      (r) => r && Array.isArray(r.changes),
    );
    if (revisions.length === 0) {
      return (
        <div className="text-center text-default-500 py-10">
          Nessuna modifica registrata. La cronologia si popola quando una visita
          viene modificata.
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {revisions.map((rev) => (
          <Card key={rev.id} className="border border-default-200">
            <CardBody className="gap-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <div className="flex items-center gap-2">
                  <History size={16} className="text-primary" />
                  <span className="text-xs text-default-500">
                    Visita del{" "}
                    <span className="font-semibold text-default-700">
                      {formatDateTime(rev.visitDate)}
                    </span>
                  </span>
                </div>
                <span className="text-xs text-default-500">
                  Modificata il{" "}
                  <span className="font-semibold text-default-700">
                    {formatDateTime(rev.modifiedAt)}
                  </span>
                </span>
              </div>
              <ul className="space-y-2">
                {rev.changes.map((change, ci) => (
                  <li
                    key={`${rev.id}-${change.field}-${ci}`}
                    className="bg-default-50 rounded-lg px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-default-700 mb-1">
                      {change.label}
                    </p>
                    <div className="flex items-start gap-2 text-xs">
                      <span className="flex-1 text-danger-600 line-through whitespace-pre-wrap break-words">
                        {change.previousValue}
                      </span>
                      <ArrowRight
                        size={14}
                        className="text-default-500 mt-0.5 shrink-0"
                      />
                      <span className="flex-1 text-success-700 whitespace-pre-wrap break-words">
                        {change.newValue}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  };

  const renderEditModal = () => (
    <AppModal isOpen={!!editingItem} onClose={() => setEditingItem(null)}>
      <ModalContent>
        <ModalHeader>Modifica {selectedTab === 'patients' ? 'Paziente' : selectedTab === 'visits' ? 'Visita' : 'Documento'}</ModalHeader>
        <ModalBody>
          {editingItem && selectedTab === 'patients' && (
            <div className="space-y-4">
              <Input label="Nome" value={editingItem.nome} onChange={(e) => setEditingItem({ ...editingItem, nome: e.target.value })} />
              <Input label="Cognome" value={editingItem.cognome} onChange={(e) => setEditingItem({ ...editingItem, cognome: e.target.value })} />
              <Input label="Codice Fiscale" value={editingItem.codiceFiscale} onChange={(e) => setEditingItem({ ...editingItem, codiceFiscale: e.target.value })} />
              <Input label="Telefono" value={editingItem.telefono || ''} onChange={(e) => setEditingItem({ ...editingItem, telefono: e.target.value })} />
              <Input label="Email" value={editingItem.email || ''} onChange={(e) => setEditingItem({ ...editingItem, email: e.target.value })} />
            </div>
          )}
          {editingItem && selectedTab === 'visits' && (
            <div className="space-y-4">
              <Input type="date" label="Data Visita" value={editingItem.dataVisita} onChange={(e) => setEditingItem({ ...editingItem, dataVisita: e.target.value })} />
              <Textarea label="Descrizione Clinica" value={editingItem.descrizioneClinica} onChange={(e) => setEditingItem({ ...editingItem, descrizioneClinica: e.target.value })} />
              <Textarea label="Terapie" value={editingItem.terapie} onChange={(e) => setEditingItem({ ...editingItem, terapie: e.target.value })} />
            </div>
          )}
          {editingItem && selectedTab === 'documents' && (
            <div className="space-y-4">
              <Input label="Nome File" value={editingItem.fileName} onChange={(e) => setEditingItem({ ...editingItem, fileName: e.target.value })} />
              <Input label="Descrizione" value={editingItem.description || ''} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} />
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="danger" variant="light" onPress={() => setEditingItem(null)}>Annulla</Button>
          <Button color="primary" onPress={handleSaveEdit} isLoading={isSaving} startContent={<Save size={18} />}>Salva</Button>
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );

  return (
    <>
      <Button onPress={onOpen} color="primary" variant="shadow">
        Gestione Dati Completa
      </Button>

      <AppModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="5xl"
        scrollBehavior="inside"
        backdrop="blur"
        shouldBlockScroll={false}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Database className="text-primary" />
                  <h2 className="text-xl">Pannello di Controllo Dati</h2>
                </div>
                <p className="text-sm font-normal text-gray-500">
                  Gestisci visute, pazienti, documenti e backup centralizzati.
                </p>
              </ModalHeader>
              <ModalBody className="py-6">

                {message && (
                  <div className={`p-3 mb-4 rounded-md flex items-center gap-2 ${message.type === 'success'
                    ? 'corioli-feedback-success'
                    : 'bg-danger-50 text-danger-700 border border-danger-200'
                    }`}>
                    {message.text}
                  </div>
                )}

                <Tabs
                  aria-label="Opzioni Dati"
                  color="primary"
                  variant="underlined"
                  selectedKey={selectedTab}
                  onSelectionChange={(key) => {
                    setSelectedTab(key as string);
                    setPage(1);
                    setSearchQuery("");
                    setMessage(null);
                    setEditingItem(null);
                  }}
                >
                  <Tab key="patients" title={
                    <div className="flex items-center gap-2">
                      <Users size={18} />
                      <span>Pazienti</span>
                    </div>
                  }>
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <Input
                          placeholder="Cerca paziente..."
                          startContent={<Search size={18} />}
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                          className="max-w-xs"
                        />
                        <Button isIconOnly variant="light" onPress={loadData}>
                          <RefreshCw size={18} />
                        </Button>
                      </div>
                      {isLoading ? <Spinner /> : renderPatientsTable()}
                    </div>
                  </Tab>

                  <Tab key="visits" title={
                    <div className="flex items-center gap-2">
                      <Stethoscope size={18} />
                      <span>Visite</span>
                    </div>
                  }>
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <Input
                          placeholder="Cerca nelle visite..."
                          startContent={<Search size={18} />}
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                          className="max-w-xs"
                        />
                        <Button isIconOnly variant="light" onPress={loadData}>
                          <RefreshCw size={18} />
                        </Button>
                      </div>
                      {isLoading ? <Spinner /> : renderVisitsTable()}
                    </div>
                  </Tab>

                  <Tab key="documents" title={
                    <div className="flex items-center gap-2">
                      <FileText size={18} />
                      <span>Documenti</span>
                    </div>
                  }>
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <Input
                          placeholder="Cerca documento..."
                          startContent={<Search size={18} />}
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                          className="max-w-xs"
                        />
                        <Button isIconOnly variant="light" onPress={loadData}>
                          <RefreshCw size={18} />
                        </Button>
                      </div>
                      {isLoading ? <Spinner /> : renderDocumentsTable()}
                    </div>
                  </Tab>

                  <Tab key="backup" title={
                    <div className="flex items-center gap-2">
                      <Database size={18} />
                      <span>Backup & Ripristino</span>
                    </div>
                  }>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6">
                      <div className="md:col-span-2">
                        <AutoBackupPanel />
                      </div>

                      <Card className="bg-primary-50">
                        <CardBody className="gap-4">
                          <div className="flex items-center gap-3 text-primary">
                            <Download size={24} />
                            <h3 className="text-lg font-semibold">Esporta Backup</h3>
                          </div>
                          <p className="text-sm text-gray-600">
                            Scarica un file JSON contenente tutti i dati (Pazienti, Visite, Documenti).
                            Conservalo in un luogo sicuro.
                          </p>
                          <Button
                            color="primary"
                            onPress={handleExport}
                            isLoading={isLoading}
                            startContent={<Download size={18} />}
                          >
                            Scarica Dati
                          </Button>
                        </CardBody>
                      </Card>

                      <Card className="bg-brand-100">
                        <CardBody className="gap-4">
                          <div className="flex items-center gap-3 text-primary">
                            <Upload size={24} />
                            <h3 className="text-lg font-semibold">Importa Backup</h3>
                          </div>
                          <p className="text-sm text-gray-600">
                            Ripristina i dati da un file di backup precedente.
                            Dopo la selezione potrai scegliere se sostituire tutto o unire ai dati attuali.
                          </p>
                          <div className="w-full">
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".json"
                              onChange={handleImport}
                              className="hidden"
                              disabled={isLoading}
                            />
                            <Button
                              color="primary"
                              className="w-full"
                              startContent={<Upload size={18} />}
                              onPress={() => fileInputRef.current?.click()}
                              isLoading={isLoading}
                            >
                              Seleziona File
                            </Button>
                          </div>
                        </CardBody>
                      </Card>

                      <Card className="md:col-span-2 border-danger border">
                        <CardBody className="gap-4 flex-row items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-danger font-semibold mb-1">
                              <AlertTriangle size={20} />
                              <h3>Zona Pericolo</h3>
                            </div>
                            <p className="text-xs text-gray-500">
                              Cancellazione irreversibile di tutti i dati locali.
                            </p>
                          </div>
                          <Button
                            color="danger"
                            variant="flat"
                            onPress={onResetModalOpen}
                          >
                            Reset Totale
                          </Button>
                        </CardBody>
                      </Card>

                      <Card className="md:col-span-2 bg-brand-50">
                        <CardBody className="gap-4">
                          <div className="flex items-center gap-3 corioli-text-brand">
                            <FileSpreadsheet size={24} />
                            <h3 className="text-lg font-semibold">Import CSV Pazienti + Appuntamenti</h3>
                          </div>
                          <p className="text-sm text-gray-600">
                            Importa i dati dai file CSV sorgente. Vengono mantenuti solo i campi essenziali,
                            con pulizia automatica dei dati e salto degli appuntamenti cancellati.
                          </p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                              ref={patientsCsvInputRef}
                              type="file"
                              accept=".csv,text/csv"
                              onChange={handleSelectPatientsCsv}
                              className="hidden"
                              disabled={isLoading}
                            />
                            <input
                              ref={appointmentsCsvInputRef}
                              type="file"
                              accept=".csv,text/csv"
                              onChange={handleSelectAppointmentsCsv}
                              className="hidden"
                              disabled={isLoading}
                            />

                            <Button
                              color="primary"
                              variant="flat"
                              onPress={() => patientsCsvInputRef.current?.click()}
                              isDisabled={isLoading}
                            >
                              {patientsCsvFile ? `Pazienti: ${patientsCsvFile.name}` : "Seleziona CSV Pazienti"}
                            </Button>

                            <Button
                              color="primary"
                              variant="flat"
                              onPress={() => appointmentsCsvInputRef.current?.click()}
                              isDisabled={isLoading}
                            >
                              {appointmentsCsvFile
                                ? `Appuntamenti: ${appointmentsCsvFile.name}`
                                : "Seleziona CSV Appuntamenti"}
                            </Button>
                          </div>

                          <Button
                            color="primary"
                            onPress={handleImportCsvData}
                            isLoading={isLoading && !csvImportProgress}
                            isDisabled={!patientsCsvFile || !appointmentsCsvFile}
                            startContent={!csvImportProgress ? <Upload size={18} /> : undefined}
                          >
                            {csvImportProgress
                              ? `${csvImportProgress.phase}: ${csvImportProgress.current} / ${csvImportProgress.total}`
                              : "Importa Dati CSV"}
                          </Button>
                          {csvImportProgress && (
                            <Progress
                              size="md"
                              value={(csvImportProgress.current / Math.max(1, csvImportProgress.total)) * 100}
                              color="primary"
                              className="max-w-full"
                              aria-label={`Import in corso: ${csvImportProgress.phase} ${csvImportProgress.current}/${csvImportProgress.total}`}
                            />
                          )}
                        </CardBody>
                      </Card>

                      <Card className="md:col-span-2 bg-warning-50">
                        <CardBody className="gap-4">
                          <div className="flex items-center gap-3 text-warning-700">
                            <FileSpreadsheet size={24} />
                            <h3 className="text-lg font-semibold">Import CSV Doctorlib</h3>
                          </div>
                          <p className="text-sm text-gray-600">
                            Importa anagrafica pazienti da export Doctorlib (file unico).
                            I doppioni vengono gestiti automaticamente con match su CF, dati anagrafici, email e telefono.
                          </p>

                          <input
                            ref={doctorlibCsvInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            onChange={handleSelectDoctorlibCsv}
                            className="hidden"
                            disabled={isLoading}
                          />

                          <Button
                            color="warning"
                            variant="flat"
                            onPress={() => doctorlibCsvInputRef.current?.click()}
                            isDisabled={isLoading}
                          >
                            {doctorlibCsvFile
                              ? `Doctorlib: ${doctorlibCsvFile.name}`
                              : "Seleziona CSV Doctorlib"}
                          </Button>

                          <Button
                            color="warning"
                            onPress={handleImportDoctorlibData}
                            isLoading={isLoading && !csvImportProgress}
                            isDisabled={!doctorlibCsvFile}
                            startContent={!csvImportProgress ? <Upload size={18} /> : undefined}
                          >
                            {csvImportProgress
                              ? `${csvImportProgress.phase}: ${csvImportProgress.current} / ${csvImportProgress.total}`
                              : "Importa Dati Doctorlib"}
                          </Button>
                          {csvImportProgress && (
                            <Progress
                              size="md"
                              value={(csvImportProgress.current / Math.max(1, csvImportProgress.total)) * 100}
                              color="warning"
                              className="max-w-full"
                              aria-label={`Import in corso: ${csvImportProgress.phase} ${csvImportProgress.current}/${csvImportProgress.total}`}
                            />
                          )}
                        </CardBody>
                      </Card>
                    </div>
                  </Tab>

                  <Tab key="history" title={
                    <div className="flex items-center gap-2">
                      <History size={18} />
                      <span>Cronologia visite</span>
                    </div>
                  }>
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <Input
                          placeholder="Cerca per data..."
                          startContent={<Search size={18} />}
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                          className="max-w-xs"
                        />
                        <Button isIconOnly variant="light" onPress={loadData}>
                          <RefreshCw size={18} />
                        </Button>
                      </div>
                      <p className="text-xs text-default-500">
                        Storico di tutte le modifiche alle visite. Questi dati non
                        vengono mai cancellati, nemmeno eliminando la visita, il
                        paziente o eseguendo il reset totale.
                      </p>
                      {isLoading ? <Spinner /> : renderHistory()}
                    </div>
                  </Tab>
                </Tabs>

                {filteredData.length > 0 && selectedTab !== 'backup' && (
                  <div className="flex justify-center mt-4">
                    <Pagination
                      total={Math.ceil(filteredData.length / rowsPerPage)}
                      page={page}
                      onChange={setPage}
                    />
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  variant="light"
                  onPress={() => {
                    closeManager();
                  }}
                >
                  Chiudi
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </AppModal>
      <AppModal isOpen={isImportModeModalOpen} onOpenChange={setIsImportModeModalOpen} shouldBlockScroll={false}>
        <ModalContent>
          <ModalHeader>Scegli modalità import backup</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              File selezionato: <span className="font-medium">{pendingBackupFile?.name || "—"}</span>
            </p>
            <div className="grid grid-cols-1 gap-3">
              <Card
                className={`cursor-pointer border ${backupImportMode === 'merge' ? 'border-primary bg-primary-50' : 'border-default-200'}`}
                isPressable
                onPress={() => setBackupImportMode('merge')}
              >
                <CardBody className="py-3">
                  <p className="font-medium">Unisci ai dati attuali</p>
                  <p className="text-xs text-gray-600">Aggiunge i dati del backup senza cancellare quelli già presenti.</p>
                </CardBody>
              </Card>
              <Card
                className={`cursor-pointer border ${backupImportMode === 'replace' ? 'border-danger bg-danger-50' : 'border-default-200'}`}
                isPressable
                onPress={() => setBackupImportMode('replace')}
              >
                <CardBody className="py-3">
                  <p className="font-medium text-danger">Sostituisci tutto</p>
                  <p className="text-xs text-gray-600">Cancella i dati attuali e importa solo quelli presenti nel backup.</p>
                </CardBody>
              </Card>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => {
                setIsImportModeModalOpen(false);
                setPendingBackupFile(null);
              }}
              isDisabled={isLoading}
            >
              Annulla
            </Button>
            <Button
              color={backupImportMode === 'replace' ? 'danger' : 'primary'}
              onPress={executeBackupImport}
              isLoading={isLoading}
            >
              Importa backup
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>
      {renderEditModal()}

      <ConfirmDangerModal
        isOpen={isResetModalOpen}
        onClose={onResetModalClose}
        title="Reset totale"
        confirmLabel="Reset totale"
        onConfirm={() => void confirmResetTotal()}
        isLoading={isResetting}
      >
        <p className="text-sm text-default-600">
          Stai per cancellare <strong>tutti i dati locali</strong> (pazienti, visite, documenti e
          impostazioni). L&apos;operazione è irreversibile. Sei sicuro di voler procedere?
        </p>
      </ConfirmDangerModal>

      <ConfirmDangerModal
        isOpen={isDeleteItemOpen}
        onClose={() => {
          if (isDeletingItem) return;
          onDeleteItemClose();
          setItemToDelete(null);
        }}
        title={getDeleteItemConfig().title}
        confirmLabel={getDeleteItemConfig().confirmLabel}
        onConfirm={() => void confirmDelete()}
        isLoading={isDeletingItem}
      >
        <p className="text-sm text-default-600">{getDeleteItemConfig().message}</p>
      </ConfirmDangerModal>
    </>
  );
};

export default BackupManager;
