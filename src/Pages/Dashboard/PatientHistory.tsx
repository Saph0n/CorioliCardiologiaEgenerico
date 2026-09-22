import { useState, useEffect } from "react";
import {
  Card,
  CardBody,
  Button,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Avatar,
  Chip,
  Divider,
  Spinner,
  Input,
  Textarea,
  Select,
  SelectItem,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  useDisclosure,
} from "@nextui-org/react";
import {
  FlaskConical,
  PlusIcon,
  EditIcon,
  Trash2Icon,
  SaveIcon,
  Printer,
  Maximize2,
  Minimize2,
  ClipboardList,
  ArrowLeftIcon,
  DownloadIcon,
  UserIcon,
  FileTextIcon,
  ChevronDown,
  ChevronUp,
  Award,
  StickyNote,
  Pill,
} from "lucide-react";
import { RefertoTextarea } from "../../components/RefertoTextarea";
import { useParams, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  PatientService,
  VisitService,
  DoctorService,
  RichiestaEsameService,
  CertificatoService,
  RicettaService,
  TemplateService,
  PreferenceService,
} from "../../services/OfflineServices";
import { PdfService } from "../../services/PdfService";
import {
  Patient,
  AppartenenzaGruppo,
  Visit,
  Doctor,
  RichiestaEsameComplementare,
  CertificatoPaziente,
  RicettaPaziente,
  MedicalTemplate,
} from "../../types/Storage";
import type { LucideIcon } from "lucide-react";
import { getRicettaTesto } from "../../utils/ricettaTemplate";
import { senzaMarcatori } from "../../utils/grassettoReferto";
import { useToast } from "../../contexts/ToastContext";
import { Breadcrumb } from "../../components/Breadcrumb";
import { PageLoadingSkeleton } from "../../components/AppStartupSkeleton";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import { useDoctorProfileIncompleteModal } from "../../components/DoctorProfileIncompleteModal";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import {
  MAX_HEIGHT_CM,
  MIN_BIRTH_YEAR,
  MIN_HEIGHT_CM,
  isValidHeightInputDraft,
  parseHeightFieldBlur,
  parseHeightFieldLive,
  parseOptionalHeight,
  todayIsoDate,
  validateBirthDate,
} from "../../utils/formValidation";
import { AppModal } from "../../components/AppModal";
import {
  formattaDurata,
  giorniDa,
  gruppiDelPaziente,
  gruppoKey,
} from "../../utils/gruppiRicerca";

/** Da quanto il paziente è in un gruppo, per il tooltip del chip. */
function dettaglioArruolamento(g: AppartenenzaGruppo): string {
  if (!g.dal) return "data di arruolamento non registrata";
  const quando = new Date(`${g.dal}T12:00:00`).toLocaleDateString("it-IT");
  const giorni = giorniDa(g.dal);
  return giorni == null
    ? `arruolato il ${quando}`
    : `arruolato il ${quando} · da ${formattaDurata(giorni)}`;
}

function calculateAge(birthDateString: string): string {
  if (!birthDateString) return "";
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age.toString();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve(base64 ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sortRichiesteEsamiByDateAndCreation(
  list: RichiestaEsameComplementare[],
): RichiestaEsameComplementare[] {
  return [...list].sort((a, b) => {
    const dateDiff =
      new Date(b.dataRichiesta).getTime() - new Date(a.dataRichiesta).getTime();
    if (dateDiff !== 0) return dateDiff;
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return createdB - createdA;
  });
}

function PatientDocEmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <div className="patient-doc-empty">
      <Icon size={32} className="patient-doc-empty__icon" strokeWidth={1.5} />
      <p className="patient-doc-empty__title">{title}</p>
      <p className="patient-doc-empty__hint">{hint}</p>
    </div>
  );
}

type PendingDelete =
  | { kind: "visita"; id: string }
  | { kind: "paziente" }
  | { kind: "esame"; id: string }
  | { kind: "certificato"; id: string }
  | { kind: "ricetta"; id: string };

export default function PatientHistory() {
  const { patientId: patientIdParam } = useParams<{ patientId: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onClose: onEditClose,
  } = useDisclosure();
  const [editData, setEditData] = useState<Partial<Patient>>({});
  const [altezzaInputDraft, setAltezzaInputDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const [isDeleting, setIsDeleting] = useState(false);
  const [richiesteEsami, setRichiesteEsami] = useState<
    RichiestaEsameComplementare[]
  >([]);
  const {
    isOpen: isEsameOpen,
    onOpen: onEsameOpen,
    onClose: onEsameClose,
  } = useDisclosure();
  const {
    isOpen: isEsamePreviewOpen,
    onOpen: onEsamePreviewOpen,
    onClose: onEsamePreviewClose,
  } = useDisclosure();
  const [selectedRichiestaEsamePreview, setSelectedRichiestaEsamePreview] =
    useState<RichiestaEsameComplementare | null>(null);
  const [editingRichiestaEsame, setEditingRichiestaEsame] =
    useState<RichiestaEsameComplementare | null>(null);
  const [notaBeneLocal, setNotaBeneLocal] = useState("");
  /** Gruppi di ricerca: attivi solo se la funzione e' abilitata in Impostazioni. */
  const [gruppiAbilitati, setGruppiAbilitati] = useState(false);
  const [savingNotaBene, setSavingNotaBene] = useState(false);
  const [isNotaBeneOpen, setIsNotaBeneOpen] = useState(false);
  const [nuovaRichiestaNome, setNuovaRichiestaNome] = useState("");
  const [nuovaRichiestaNote, setNuovaRichiestaNote] = useState("");
  const [nuovaRichiestaData, setNuovaRichiestaData] = useState(() =>
    todayIsoDate(),
  );
  const [savingEsame, setSavingEsame] = useState(false);
  const [isIncludeImagesModalOpen, setIsIncludeImagesModalOpen] =
    useState(false);
  const [includeImagesCount, setIncludeImagesCount] = useState(0);
  const [pendingPrintVisit, setPendingPrintVisit] = useState<Visit | null>(null);
  const [pendingPdfAction, setPendingPdfAction] = useState<"print" | "download" | null>(null);
  /** URL del PDF generato per l’anteprima (stesso contenuto della stampa). Revocare in cleanup. */
  const [previewPdfBlobUrl, setPreviewPdfBlobUrl] = useState<string | null>(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  /** Anteprima esame: PDF in iframe come referto */
  const [esamePreviewPdfBlobUrl, setEsamePreviewPdfBlobUrl] = useState<string | null>(null);
  const [esamePreviewPdfLoading, setEsamePreviewPdfLoading] = useState(false);
  const [esamePreviewFullscreen, setEsamePreviewFullscreen] = useState(false);
  /** Anteprima certificato */
  const [selectedCertificatoPreview, setSelectedCertificatoPreview] = useState<CertificatoPaziente | null>(null);
  const {
    isOpen: isCertificatoPreviewOpen,
    onOpen: onCertificatoPreviewOpen,
    onClose: onCertificatoPreviewClose,
  } = useDisclosure();
  const [certificatoPreviewPdfBlobUrl, setCertificatoPreviewPdfBlobUrl] = useState<string | null>(null);
  const [certificatoPreviewPdfLoading, setCertificatoPreviewPdfLoading] = useState(false);
  const [certificatoPreviewFullscreen, setCertificatoPreviewFullscreen] = useState(false);
  // Gestione Templates Esami e Certificati (via Settings/Storage)
  const [examTemplates, setExamTemplates] = useState<MedicalTemplate[]>([]);
  const [certTemplates, setCertTemplates] = useState<MedicalTemplate[]>([]);
  // Certificati paziente
  const [certificati, setCertificati] = useState<CertificatoPaziente[]>([]);
  const {
    isOpen: isCertificatoOpen,
    onOpen: onCertificatoOpen,
    onClose: onCertificatoClose,
  } = useDisclosure();
  const [editingCertificato, setEditingCertificato] =
    useState<CertificatoPaziente | null>(null);
  const [certTipo, setCertTipo] = useState<CertificatoPaziente["tipo"]>("assenza_lavoro");
  const [certData, setCertData] = useState(() =>
    todayIsoDate(),
  );
  const [certDescrizione, setCertDescrizione] = useState("");
  const [savingCertificato, setSavingCertificato] = useState(false);
  const [ricette, setRicette] = useState<RicettaPaziente[]>([]);
  const [ricetteTemplates, setRicetteTemplates] = useState<MedicalTemplate[]>([]);
  const {
    isOpen: isRicettaOpen,
    onOpen: onRicettaOpen,
    onClose: onRicettaClose,
  } = useDisclosure();
  const {
    isOpen: isRicettaPreviewOpen,
    onOpen: onRicettaPreviewOpen,
    onClose: onRicettaPreviewClose,
  } = useDisclosure();
  const [selectedRicettaPreview, setSelectedRicettaPreview] = useState<RicettaPaziente | null>(null);
  const [ricettaPreviewPdfBlobUrl, setRicettaPreviewPdfBlobUrl] = useState<string | null>(null);
  const [ricettaPreviewPdfLoading, setRicettaPreviewPdfLoading] = useState(false);
  const [ricettaPreviewFullscreen, setRicettaPreviewFullscreen] = useState(false);
  const [editingRicetta, setEditingRicetta] = useState<RicettaPaziente | null>(null);
  const [ricettaData, setRicettaData] = useState(() => todayIsoDate());
  const [ricettaTesto, setRicettaTesto] = useState("");
  const [savingRicetta, setSavingRicetta] = useState(false);
  const [rightColumnTab, setRightColumnTab] = useState<"ricette" | "esami" | "certificati">("ricette");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    ensureComplete: ensureDoctorProfileComplete,
    modal: doctorProfileIncompleteModal,
  } = useDoctorProfileIncompleteModal();

  const loadData = async () => {
    if (!patientIdParam) {
      setError("Identificativo paziente non fornito");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Recupera il paziente per id (UUID) o, per retrocompatibilità, per codice fiscale
      let patientData = await PatientService.getPatientById(patientIdParam);
      if (!patientData) {
        patientData = await PatientService.getPatientByCF(patientIdParam);
      }
      if (!patientData) {
        setError("Paziente non trovato");
        setLoading(false);
        return;
      }
      setPatient(patientData);

      const doc = await DoctorService.getDoctor();
      setDoctor(doc);

      // Recupera le visite del paziente
      const visitsData = await VisitService.getVisitsByPatientId(
        patientData.id,
      );
      // Ordina le visite per data (più recenti prima), usando createdAt come tie-breaker
      const sortedVisits = visitsData.sort((a, b) => {
        const dateDiff =
          new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
      setVisits(sortedVisits);

      const richieste = await RichiestaEsameService.getByPatientId(
        patientData.id,
      );
      setRichiesteEsami(sortRichiesteEsamiByDateAndCreation(richieste));

      const certList = await CertificatoService.getByPatientId(patientData.id);
      setCertificati(certList);

      const ricetteList = await RicettaService.getByPatientId(patientData.id);
      setRicette(ricetteList);
    } catch (error) {
      console.error("Errore durante il recupero dei dati:", error);
      setError("Errore durante il recupero delle visite");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNotaBeneLocal(patient?.notaBene ?? "");
  }, [patient?.id, patient?.notaBene]);

  useEffect(() => {
    const carica = async () => {
      try {
        const prefs = await PreferenceService.getPreferences();
        setGruppiAbilitati(Boolean(prefs?.gruppiRicercaEnabled));
      } catch {
        setGruppiAbilitati(false);
      }
    };
    void carica();
    const onFocus = () => void carica();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    loadData();
    // Carica template esami
    TemplateService.getAllTemplates()
      .then((results) => {
        setExamTemplates(
          results.filter((t) => t.category === "esame_complementare"),
        );
        setCertTemplates(results.filter((t) => t.category === "certificato"));
        setRicetteTemplates(results.filter((t) => t.category === "ricette"));
      })
      .catch(console.error);
  }, [patientIdParam]);

  // Genera il PDF di anteprima (lo stesso della stampa) all'apertura del modale
  useEffect(() => {
    if (!isOpen || !selectedVisit || !patient) {
      setPreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewPdfLoading(false);
      return;
    }
    let revoked = false;
    setPreviewPdfLoading(true);
    (async () => {
      try {
        const blob = await PdfService.generateVisitPDF(patient, selectedVisit, {
          includeImages: true,
        });
        if (blob && !revoked) {
          const url = URL.createObjectURL(blob);
          setPreviewPdfBlobUrl(url);
        }
      } catch (e) {
        console.error("Errore generazione PDF anteprima:", e);
        if (!revoked) setPreviewPdfBlobUrl(null);
      } finally {
        if (!revoked) setPreviewPdfLoading(false);
      }
    })();
    return () => {
      revoked = true;
      setPreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewPdfLoading(false);
    };
  }, [isOpen, selectedVisit?.id, patient?.id]);

  // Anteprima esame: genera PDF e mostra in iframe (come Anteprima Referto)
  useEffect(() => {
    if (!isEsamePreviewOpen || !selectedRichiestaEsamePreview || !patient) {
      setEsamePreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setEsamePreviewPdfLoading(false);
      return;
    }
    let revoked = false;
    setEsamePreviewPdfLoading(true);
    (async () => {
      try {
        const doc = await DoctorService.getDoctor();
        const blob = await PdfService.generateRichiestaEsamePDF(
          patient,
          selectedRichiestaEsamePreview,
          doc ?? null,
        );
        if (blob && !revoked) {
          const url = URL.createObjectURL(blob);
          setEsamePreviewPdfBlobUrl(url);
        }
      } catch (e) {
        console.error("Errore generazione PDF anteprima esame:", e);
        if (!revoked) setEsamePreviewPdfBlobUrl(null);
      } finally {
        if (!revoked) setEsamePreviewPdfLoading(false);
      }
    })();
    return () => {
      revoked = true;
      setEsamePreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setEsamePreviewPdfLoading(false);
    };
  }, [isEsamePreviewOpen, selectedRichiestaEsamePreview?.id, patient?.id]);

  // Anteprima certificato: genera PDF e mostra in iframe
  useEffect(() => {
    if (!isCertificatoPreviewOpen || !selectedCertificatoPreview || !patient) {
      setCertificatoPreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setCertificatoPreviewPdfLoading(false);
      return;
    }
    let revoked = false;
    setCertificatoPreviewPdfLoading(true);
    (async () => {
      try {
        const doc = await DoctorService.getDoctor();
        const blob = await PdfService.generateCertificatoPDF(
          patient,
          selectedCertificatoPreview,
          doc ?? null,
        );
        if (blob && !revoked) {
          const url = URL.createObjectURL(blob);
          setCertificatoPreviewPdfBlobUrl(url);
        }
      } catch (e) {
        console.error("Errore generazione PDF anteprima certificato:", e);
        if (!revoked) setCertificatoPreviewPdfBlobUrl(null);
      } finally {
        if (!revoked) setCertificatoPreviewPdfLoading(false);
      }
    })();
    return () => {
      revoked = true;
      setCertificatoPreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setCertificatoPreviewPdfLoading(false);
    };
  }, [isCertificatoPreviewOpen, selectedCertificatoPreview?.id, patient?.id]);

  // Anteprima ricetta: genera PDF e mostra in iframe
  useEffect(() => {
    if (!isRicettaPreviewOpen || !selectedRicettaPreview || !patient) {
      setRicettaPreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setRicettaPreviewPdfLoading(false);
      return;
    }
    let revoked = false;
    setRicettaPreviewPdfLoading(true);
    (async () => {
      try {
        const doc = await DoctorService.getDoctor();
        const blob = await PdfService.generateRicettaPDF(patient, selectedRicettaPreview, doc ?? null);
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        setRicettaPreviewPdfBlobUrl(url);
      } catch (e) {
        console.error("Errore generazione PDF anteprima ricetta:", e);
        if (!revoked) setRicettaPreviewPdfBlobUrl(null);
      } finally {
        if (!revoked) setRicettaPreviewPdfLoading(false);
      }
    })();
    return () => {
      revoked = true;
      setRicettaPreviewPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setRicettaPreviewPdfLoading(false);
    };
  }, [isRicettaPreviewOpen, selectedRicettaPreview?.id, patient?.id]);

  const handleVisitClick = (visit: Visit) => {
    setSelectedVisit(visit);
    onOpen();
  };

  const handleOpenNuovaRichiestaEsame = () => {
    if (!ensureDoctorProfileComplete(doctor)) return;
    setEditingRichiestaEsame(null);
    setNuovaRichiestaNome("");
    setNuovaRichiestaNote("");
    setNuovaRichiestaData(todayIsoDate());
    onEsameOpen();
  };

  const handleOpenEsamePreview = (r: RichiestaEsameComplementare) => {
    setSelectedRichiestaEsamePreview(r);
    onEsamePreviewOpen();
  };

  const handleOpenEditRichiestaEsame = (r: RichiestaEsameComplementare) => {
    setEditingRichiestaEsame(r);
    setNuovaRichiestaNome(r.nome);
    setNuovaRichiestaNote(r.note ?? "");
    setNuovaRichiestaData(r.dataRichiesta);
    onEsameOpen();
  };

  const handleFromPreviewToEdit = () => {
    const r = selectedRichiestaEsamePreview;
    if (!r) return;
    onEsamePreviewClose();
    setSelectedRichiestaEsamePreview(null);
    handleOpenEditRichiestaEsame(r);
  };

  const handleCloseEsameModal = () => {
    onEsameClose();
    setEditingRichiestaEsame(null);
  };

  const handleSaveRichiestaEsame = async () => {
    if (!ensureDoctorProfileComplete(doctor)) return;
    if (!patient || !nuovaRichiestaNome.trim()) return;
    setSavingEsame(true);
    try {
      if (editingRichiestaEsame) {
        await RichiestaEsameService.update(editingRichiestaEsame.id, {
          nome: nuovaRichiestaNome.trim(),
          note: nuovaRichiestaNote.trim() || undefined,
          dataRichiesta: nuovaRichiestaData,
        });
        showToast("Richiesta esame aggiornata.");
      } else {
        await RichiestaEsameService.add({
          patientId: patient.id,
          nome: nuovaRichiestaNome.trim(),
          note: nuovaRichiestaNote.trim() || undefined,
          dataRichiesta: nuovaRichiestaData,
        });
        showToast("Richiesta esame salvata.");
      }
      const list = await RichiestaEsameService.getByPatientId(patient.id);
      setRichiesteEsami(sortRichiesteEsamiByDateAndCreation(list));
      handleCloseEsameModal();
    } catch (e) {
      console.error(e);
      showToast("Errore nel salvataggio della richiesta.", "error");
    } finally {
      setSavingEsame(false);
    }
  };

  const handlePrintRichiestaEsame = async (
    richiesta: RichiestaEsameComplementare,
  ) => {
    if (!patient) return;
    setPdfLoading(true);
    try {
      const doc = await DoctorService.getDoctor();
      const blob = await PdfService.generateRichiestaEsamePDF(
        patient,
        richiesta,
        doc ?? null,
      );
      const electronAPI = (
        window as unknown as {
          electronAPI?: { openPdfForPrint: (b64: string) => Promise<unknown> };
        }
      ).electronAPI;
      if (electronAPI?.openPdfForPrint) {
        const base64 = await blobToBase64(blob);
        await electronAPI.openPdfForPrint(base64);
        showToast("PDF aperto per la stampa.");
      } else {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) {
          const a = document.createElement("a");
          a.href = url;
          a.download = `Richiesta_esame_${patient.cognome}_${richiesta.dataRichiesta}.pdf`;
          a.click();
          showToast("PDF scaricato.");
        }
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) {
      console.error("Errore generazione PDF:", err);
      showToast("Errore generazione PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const requestDelete = (pending: PendingDelete) => {
    setPendingDelete(pending);
    onDeleteOpen();
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;

    setIsDeleting(true);
    setError(null);
    try {
      switch (pendingDelete.kind) {
        case "visita": {
          const visitId = pendingDelete.id;
          await VisitService.deleteVisit(visitId);
          if (patient) {
            const updatedVisits = await VisitService.getVisitsByPatientId(patient.id);
            const sortedVisits = updatedVisits.sort((a, b) => {
              const dateDiff =
                new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime();
              if (dateDiff !== 0) return dateDiff;
              return (
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
            });
            setVisits(sortedVisits);
          }
          if (selectedVisit && selectedVisit.id === visitId) onClose();
          showToast("Visita eliminata.");
          break;
        }
        case "paziente": {
          if (!patient) return;
          await PatientService.deletePatient(patient.id);
          sessionStorage.setItem(
            "appdottori_toast",
            "Paziente eliminato con successo",
          );
          showToast("Paziente eliminato con successo");
          navigate("/pazienti");
          return;
        }
        case "esame": {
          await RichiestaEsameService.delete(pendingDelete.id);
          if (patient) {
            const list = await RichiestaEsameService.getByPatientId(patient.id);
            setRichiesteEsami(sortRichiesteEsamiByDateAndCreation(list));
          }
          handleCloseEsameModal();
          if (selectedRichiestaEsamePreview?.id === pendingDelete.id) {
            onEsamePreviewClose();
            setSelectedRichiestaEsamePreview(null);
          }
          showToast("Richiesta eliminata.");
          break;
        }
        case "certificato": {
          await CertificatoService.delete(pendingDelete.id);
          if (patient) {
            const list = await CertificatoService.getByPatientId(patient.id);
            setCertificati(list);
          }
          handleCloseCertificatoModal();
          if (selectedCertificatoPreview?.id === pendingDelete.id) {
            handleCloseCertificatoPreview();
          }
          showToast("Certificato eliminato.");
          break;
        }
        case "ricetta": {
          await RicettaService.delete(pendingDelete.id);
          if (patient) {
            const list = await RicettaService.getByPatientId(patient.id);
            setRicette(list);
          }
          handleCloseRicettaModal();
          if (selectedRicettaPreview?.id === pendingDelete.id) {
            handleCloseRicettaPreview();
          }
          showToast("Ricetta eliminata.");
          break;
        }
      }
      onDeleteClose();
      setPendingDelete(null);
    } catch (error) {
      console.error("Errore eliminazione:", error);
      if (pendingDelete.kind === "visita") {
        setError("Errore nell'eliminazione della visita");
        showToast("Errore nell'eliminazione della visita.", "error");
      } else if (pendingDelete.kind === "paziente") {
        setError("Errore durante l'eliminazione del paziente.");
        showToast("Errore durante l'eliminazione del paziente.", "error");
      } else {
        showToast("Errore nell'eliminazione.", "error");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const getDeleteModalConfig = (pending: PendingDelete) => {
    switch (pending.kind) {
      case "visita":
        return {
          title: "Elimina visita",
          confirmLabel: "Elimina visita",
          message:
            "Sei sicuro di voler eliminare questa visita? Questa azione è irreversibile.",
        };
      case "paziente":
        return {
          title: "Elimina paziente",
          confirmLabel: "Elimina paziente",
          message:
            "Sei sicuro di voler eliminare questo paziente? Verranno eliminate anche tutte le visite collegate. Questa azione è irreversibile.",
        };
      case "esame":
        return {
          title: "Elimina richiesta esame",
          confirmLabel: "Elimina richiesta",
          message: "Sei sicuro di voler eliminare questa richiesta esame?",
        };
      case "certificato":
        return {
          title: "Elimina certificato",
          confirmLabel: "Elimina certificato",
          message: "Sei sicuro di voler eliminare questo certificato?",
        };
      case "ricetta":
        return {
          title: "Elimina ricetta",
          confirmLabel: "Elimina ricetta",
          message: "Sei sicuro di voler eliminare questa ricetta?",
        };
    }
  };

  const getCertificatoTipoLabel = (tipo: CertificatoPaziente["tipo"]) => {
    const labels: Record<CertificatoPaziente["tipo"], string> = {
      assenza_lavoro: "Assenza da lavoro",
      idoneita: "Idoneità",
      malattia: "Malattia",
      altro: "Altro",
    };
    return labels[tipo];
  };

  /** Ricava il tipo certificato dal label/note del modello (per aggiornare il Select quando si applica un modello) */
  const getCertificatoTipoFromTemplate = (t: MedicalTemplate): CertificatoPaziente["tipo"] => {
    const raw = `${t.label ?? ""} ${t.note ?? ""}`.toLowerCase();
    if (raw.includes("idoneit")) return "idoneita";
    if (raw.includes("assenza") || raw.includes("astensione")) return "assenza_lavoro";
    if (raw.includes("malattia")) return "malattia";
    return "altro";
  };

  const handleOpenNuovoCertificato = () => {
    if (!ensureDoctorProfileComplete(doctor)) return;
    setEditingCertificato(null);
    setCertTipo("assenza_lavoro");
    setCertData(todayIsoDate());
    setCertDescrizione("");
    onCertificatoOpen();
  };

  const handleOpenEditCertificato = (c: CertificatoPaziente) => {
    setEditingCertificato(c);
    setCertTipo(c.tipo);
    setCertData(c.dataCertificato.slice(0, 10));
    setCertDescrizione(c.descrizione ?? "");
    onCertificatoOpen();
  };

  const handleCloseCertificatoModal = () => {
    onCertificatoClose();
    setEditingCertificato(null);
  };

  const handleSaveCertificato = async () => {
    if (!patient || !certDescrizione.trim()) {
      showToast("Inserisci una descrizione per il certificato.", "warning");
      return;
    }
    setSavingCertificato(true);
    try {
      if (editingCertificato) {
        await CertificatoService.update(editingCertificato.id, {
          tipo: certTipo,
          dataCertificato: certData,
          descrizione: certDescrizione.trim(),
        });
        showToast("Certificato aggiornato.");
      } else {
        await CertificatoService.add({
          patientId: patient.id,
          tipo: certTipo,
          dataCertificato: certData,
          descrizione: certDescrizione.trim(),
        });
        showToast("Certificato salvato.");
      }
      const list = await CertificatoService.getByPatientId(patient.id);
      setCertificati(list);
      handleCloseCertificatoModal();
    } catch (e) {
      console.error(e);
      showToast("Errore nel salvataggio del certificato.", "error");
    } finally {
      setSavingCertificato(false);
    }
  };

  const handleOpenCertificatoPreview = (c: CertificatoPaziente) => {
    setSelectedCertificatoPreview(c);
    onCertificatoPreviewOpen();
  };

  const handleCloseCertificatoPreview = () => {
    onCertificatoPreviewClose();
    setSelectedCertificatoPreview(null);
  };

  const handleFromCertificatoPreviewToEdit = () => {
    const c = selectedCertificatoPreview;
    if (!c) return;
    handleCloseCertificatoPreview();
    handleOpenEditCertificato(c);
  };

  const handlePrintCertificato = async (cert: CertificatoPaziente) => {
    if (!patient) return;
    setPdfLoading(true);
    try {
      const doc = await DoctorService.getDoctor();
      const blob = await PdfService.generateCertificatoPDF(patient, cert, doc ?? null);
      const electronAPI = (window as unknown as { electronAPI?: { openPdfForPrint: (b64: string) => Promise<unknown> } }).electronAPI;
      if (electronAPI?.openPdfForPrint) {
        const base64 = await blobToBase64(blob);
        await electronAPI.openPdfForPrint(base64);
        showToast("PDF aperto per la stampa.");
      } else {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) {
          const a = document.createElement("a");
          a.href = url;
          a.download = `Certificato_${patient.cognome}_${cert.dataCertificato}.pdf`;
          a.click();
          showToast("PDF scaricato.");
        }
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
      showToast("Errore nella generazione del PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const getRicettaTipoLabel = (_tipo?: RicettaPaziente["tipo"]) => "Bianca";

  const getRicettaSummary = (r: RicettaPaziente) => {
    const righe = getRicettaTesto(r)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (righe.length === 0) return "Ricetta vuota";
    if (righe.length === 1) return righe[0];
    return `${righe[0]} +${righe.length - 1}`;
  };

  const resetRicettaForm = () => {
    setRicettaData(todayIsoDate());
    setRicettaTesto("");
  };

  const handleOpenNuovaRicetta = () => {
    if (!ensureDoctorProfileComplete(doctor)) return;
    setEditingRicetta(null);
    resetRicettaForm();
    onRicettaOpen();
  };

  const handleOpenEditRicetta = (r: RicettaPaziente) => {
    setEditingRicetta(r);
    setRicettaData(r.dataRicetta.slice(0, 10));
    setRicettaTesto(getRicettaTesto(r));
    onRicettaOpen();
  };

  const handleCloseRicettaModal = () => {
    onRicettaClose();
    setEditingRicetta(null);
  };

  const handleSaveRicetta = async (openPreviewAfterSave = false) => {
    if (!patient) return;
    const testo = ricettaTesto.trim();
    if (!testo) {
      showToast("Inserisci il testo della prescrizione.", "warning");
      return;
    }
    setSavingRicetta(true);
    try {
      let saved: RicettaPaziente;
      if (editingRicetta) {
        saved = await RicettaService.update(editingRicetta.id, {
          tipo: "bianca",
          dataRicetta: ricettaData,
          testo,
          // Pulisce il vecchio formato a elenco dopo la conversione a testo libero.
          farmaci: [],
          note: undefined,
        });
        showToast("Ricetta aggiornata.");
      } else {
        saved = await RicettaService.add({
          patientId: patient.id,
          tipo: "bianca",
          dataRicetta: ricettaData,
          testo,
        });
        showToast("Ricetta salvata.");
      }
      const list = await RicettaService.getByPatientId(patient.id);
      setRicette(list);
      handleCloseRicettaModal();
      if (openPreviewAfterSave) {
        setSelectedRicettaPreview(saved);
        onRicettaPreviewOpen();
      }
    } catch (e) {
      console.error(e);
      showToast("Errore nel salvataggio della ricetta.", "error");
    } finally {
      setSavingRicetta(false);
    }
  };

  const handleOpenRicettaPreview = (r: RicettaPaziente) => {
    setSelectedRicettaPreview(r);
    onRicettaPreviewOpen();
  };

  const handleCloseRicettaPreview = () => {
    onRicettaPreviewClose();
    setSelectedRicettaPreview(null);
  };

  const handleFromRicettaPreviewToEdit = () => {
    const r = selectedRicettaPreview;
    if (!r) return;
    handleCloseRicettaPreview();
    handleOpenEditRicetta(r);
  };

  const downloadPdfBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdfUrl = (blobUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
  };

  const handleDownloadRicetta = async (ricetta: RicettaPaziente) => {
    if (!patient) return;
    const filename = `Ricetta_${patient.cognome}_${ricetta.dataRicetta}.pdf`;
    if (
      ricettaPreviewPdfBlobUrl &&
      selectedRicettaPreview?.id === ricetta.id
    ) {
      downloadPdfUrl(ricettaPreviewPdfBlobUrl, filename);
      showToast("Ricetta scaricata.");
      return;
    }
    setPdfLoading(true);
    try {
      const doc = await DoctorService.getDoctor();
      const blob = await PdfService.generateRicettaPDF(
        patient,
        ricetta,
        doc ?? null,
      );
      downloadPdfBlob(blob, filename);
      showToast("Ricetta scaricata.");
    } catch (e) {
      console.error(e);
      showToast("Errore nel download della ricetta.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadRichiestaEsame = async (
    richiesta: RichiestaEsameComplementare,
  ) => {
    if (!patient) return;
    const filename = `Richiesta_esame_${patient.cognome}_${richiesta.dataRichiesta}.pdf`;
    if (
      esamePreviewPdfBlobUrl &&
      selectedRichiestaEsamePreview?.id === richiesta.id
    ) {
      downloadPdfUrl(esamePreviewPdfBlobUrl, filename);
      showToast("Richiesta esame scaricata.");
      return;
    }
    setPdfLoading(true);
    try {
      const doc = await DoctorService.getDoctor();
      const blob = await PdfService.generateRichiestaEsamePDF(
        patient,
        richiesta,
        doc ?? null,
      );
      downloadPdfBlob(blob, filename);
      showToast("Richiesta esame scaricata.");
    } catch (e) {
      console.error(e);
      showToast("Errore nel download della richiesta.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadCertificato = async (cert: CertificatoPaziente) => {
    if (!patient) return;
    const filename = `Certificato_${patient.cognome}_${cert.dataCertificato}.pdf`;
    if (
      certificatoPreviewPdfBlobUrl &&
      selectedCertificatoPreview?.id === cert.id
    ) {
      downloadPdfUrl(certificatoPreviewPdfBlobUrl, filename);
      showToast("Certificato scaricato.");
      return;
    }
    setPdfLoading(true);
    try {
      const doc = await DoctorService.getDoctor();
      const blob = await PdfService.generateCertificatoPDF(
        patient,
        cert,
        doc ?? null,
      );
      downloadPdfBlob(blob, filename);
      showToast("Certificato scaricato.");
    } catch (e) {
      console.error(e);
      showToast("Errore nel download del certificato.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrintRicetta = async (ricetta: RicettaPaziente) => {
    if (!patient) return;
    setPdfLoading(true);
    try {
      const doc = await DoctorService.getDoctor();
      const blob = await PdfService.generateRicettaPDF(patient, ricetta, doc ?? null);
      const electronAPI = (window as unknown as { electronAPI?: { openPdfForPrint: (b64: string) => Promise<unknown> } }).electronAPI;
      if (electronAPI?.openPdfForPrint) {
        const base64 = await blobToBase64(blob);
        await electronAPI.openPdfForPrint(base64);
        showToast("PDF aperto per la stampa.");
      } else {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) {
          downloadPdfBlob(
            blob,
            `Ricetta_${patient.cognome}_${ricetta.dataRicetta}.pdf`,
          );
          showToast("Ricetta scaricata.");
        } else {
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      }
    } catch (e) {
      console.error(e);
      showToast("Errore nella generazione del PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Patient Edit ──
  const handleOpenEdit = () => {
    if (!patient) return;
    setEditData({
      nome: patient.nome,
      cognome: patient.cognome,
      dataNascita: patient.dataNascita,
      luogoNascita: patient.luogoNascita,
      sesso: patient.sesso,
      codiceFiscale: patient.codiceFiscale,
      indirizzo: patient.indirizzo || "",
      telefono: patient.telefono || "",
      email: patient.email || "",
      gruppoSanguigno: patient.gruppoSanguigno || "",
      allergie: patient.allergie || "",
      altezza: patient.altezza,
      notaBene: patient.notaBene || "",
    });
    setAltezzaInputDraft(null);
    setSuccessMsg(null);
    onEditOpen();
  };

  const handleSavePatient = async () => {
    if (!patient) return;

    if (!editData.nome?.trim() || !editData.cognome?.trim()) {
      setError("Nome e cognome sono obbligatori.");
      return;
    }
    if (editData.dataNascita) {
      const birthErr = validateBirthDate(editData.dataNascita);
      if (birthErr) {
        setError(birthErr);
        return;
      }
    }
    let altezza: number | undefined;
    const altezzaRaw =
      altezzaInputDraft ??
      (editData.altezza != null ? String(editData.altezza) : "");
    if (altezzaRaw.trim()) {
      const parsed = parseOptionalHeight(altezzaRaw);
      if (parsed == null) {
        setError(`Altezza non valida (${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM} cm)`);
        return;
      }
      altezza = parsed;
    }

    setSaving(true);
    setError(null);
    try {
      await PatientService.updatePatient(patient.id, {
        ...editData,
        altezza,
        codiceFiscaleGenerato: false,
        updatedAt: new Date().toISOString(),
      });
      // Refresh patient data
      const updated = await PatientService.getPatientById(patient.id);
      if (updated) setPatient(updated);
      setSuccessMsg("Paziente aggiornato con successo!");
      setAltezzaInputDraft(null);
      setTimeout(() => {
        onEditClose();
        setSuccessMsg(null);
      }, 1500);
    } catch (error) {
      console.error("Errore aggiornamento paziente:", error);
      setError("Errore durante l'aggiornamento del paziente.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotaBene = async () => {
    if (!patient) return;
    setSavingNotaBene(true);
    try {
      await PatientService.updatePatient(patient.id, {
        notaBene: notaBeneLocal.trim() || undefined,
        updatedAt: new Date().toISOString(),
      });
      const updated = await PatientService.getPatientById(patient.id);
      if (updated) setPatient(updated);
      showToast("Nota salvata.");
    } catch (err) {
      console.error("Errore salvataggio nota:", err);
      showToast("Errore nel salvataggio della nota.", "error");
    } finally {
      setSavingNotaBene(false);
    }
  };

  const getPatientInitials = (patient: Patient) => {
    return `${patient.nome[0]}${patient.cognome[0]}`.toUpperCase();
  };

  const getGenderColor = (_gender?: string): "primary" => {
    return "primary";
  };

  const formatVisitDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), "dd MMMM yyyy", { locale: it });
    } catch {
      return dateString;
    }
  };

  const formatCardDateSubtle = (dateString: string) => {
    try {
      return format(parseISO(dateString), "d MMMM yyyy", {
        locale: it,
      }).toLowerCase();
    } catch {
      return dateString;
    }
  };

  const hasRefertoCompilato = (visit: Visit) => {
    const v = visit.visita;
    const refertoFields = [
      v?.esameObiettivo,
      v?.accertamenti,
      v?.terapiaSpecifica,
      visit.esamiObiettivo,
      visit.conclusioniDiagnostiche,
    ];
    return refertoFields.some((f) => Boolean(f?.trim()));
  };

  const getVisitContextBadges = (
    visit: Visit,
  ): Array<"terapia" | "followup"> => {
    if (!hasRefertoCompilato(visit)) return [];
    const v = visit.visita;
    const badges: Array<"terapia" | "followup"> = [];
    // La terapia in atto e' la prova piu' diretta che il paziente ne abbia
    // una: le conclusioni dicono cosa si consiglia, questa cosa gia' prende.
    if ((v?.terapiaInAtto || v?.terapiaSpecifica || visit.terapie)?.trim()) {
      badges.push("terapia");
    }
    const haystack = [
      v?.terapiaSpecifica,
      v?.accertamenti,
      v?.problemaClinico,
      visit.anamnesi,
      visit.terapie,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/in programma|follow[- ]?up|controllo tra/.test(haystack)) {
      badges.push("followup");
    }
    return badges;
  };

  const handleGeneratePdfFromPreview = async (visit: Visit) => {
    if (!patient) return;
    const imageCount = visit.visita?.immagini?.length ?? 0;
    if (imageCount > 0) {
      setIncludeImagesCount(imageCount);
      setPendingPrintVisit(visit);
      setPendingPdfAction("download");
      setIsIncludeImagesModalOpen(true);
      return;
    }
    await runDownloadPdf(visit, false);
  };

  const handlePrintPdf = async (visit: Visit) => {
    if (!patient) return;
    const imageCount = visit.visita?.immagini?.length ?? 0;
    if (imageCount > 0) {
      setIncludeImagesCount(imageCount);
      setPendingPrintVisit(visit);
      setPendingPdfAction("print");
      setIsIncludeImagesModalOpen(true);
      return;
    }
    await runPrintPdf(visit, false);
  };

  const runDownloadPdf = async (visit: Visit, includeImages: boolean) => {
    if (!patient) return;
    setPdfLoading(true);
    try {
      const blob = await PdfService.generateVisitPDF(patient, visit, {
        includeImages,
      });
      if (blob) {
        downloadPdfBlob(
          blob,
          `Referto_${patient.cognome}_${visit.dataVisita}.pdf`,
        );
        showToast("Referto scaricato.");
      }
    } catch (err) {
      console.error("Errore generazione PDF da anteprima:", err);
      showToast("Errore durante la generazione del PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const runPrintPdf = async (visit: Visit, includeImages: boolean) => {
    if (!patient) return;
    setPdfLoading(true);
    try {
      const blob = await PdfService.generateVisitPDF(patient, visit, {
        includeImages,
      });
      if (!blob) {
        showToast("Impossibile generare il PDF per la stampa.", "error");
        return;
      }
      const electronAPI = (
        window as unknown as {
          electronAPI?: { openPdfForPrint: (b64: string) => Promise<unknown> };
        }
      ).electronAPI;
      if (electronAPI?.openPdfForPrint) {
        const base64 = await blobToBase64(blob);
        await electronAPI.openPdfForPrint(base64);
        showToast("PDF aperto nell'app predefinita. Usa Stampa da lì.");
      } else {
        const pdfUrl = URL.createObjectURL(blob);
        const w = window.open(pdfUrl, "_blank");
        if (w) {
          setTimeout(() => URL.revokeObjectURL(pdfUrl), 5000);
        } else {
          const a = document.createElement("a");
          a.href = pdfUrl;
          a.download = `Referto_${patient.cognome}_${visit.dataVisita}.pdf`;
          a.click();
          URL.revokeObjectURL(pdfUrl);
          showToast("PDF scaricato. Apri il file per visualizzarlo e stampare.");
        }
      }
    } catch (err) {
      console.error("Errore stampa PDF:", err);
      showToast("Errore durante la stampa del PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleIncludeImagesChoice = (include: boolean) => {
    const visit = pendingPrintVisit;
    const action = pendingPdfAction;
    setIsIncludeImagesModalOpen(false);
    setPendingPrintVisit(null);
    setPendingPdfAction(null);
    if (!visit || !action) return;
    if (action === "print") {
      void runPrintPdf(visit, include);
    } else {
      void runDownloadPdf(visit, include);
    }
  };

  if (loading) {
    return <PageLoadingSkeleton variant="patient" />;
  }

  if (error || !patient) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardBody className="text-center py-12">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {error || "Paziente non trovato"}
          </h2>
          <Button
            color="primary"
            onPress={() => navigate("/")}
            startContent={<ArrowLeftIcon size={16} />}
          >
            Torna a Home
          </Button>
        </CardBody>
      </Card>
    );
  }

  const breadcrumbItems = patient
    ? [
        { label: "Dashboard", path: "/" },
        { label: "Pazienti", path: "/pazienti" },
        { label: `${patient.nome} ${patient.cognome}` },
      ]
    : [];

  return (
    <div className="corioli-page space-y-6">
      {breadcrumbItems.length > 0 && <Breadcrumb items={breadcrumbItems} />}

      {/* 1. Profilo Paziente Unificato */}
      <Card className="corioli-card">
        <CardBody className="p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            {/* Avatar & Nome */}
            <div className="flex items-center gap-5 flex-1">
              <Avatar
                name={getPatientInitials(patient)}
                className="w-20 h-20 text-2xl"
                color={getGenderColor(patient.sesso)}
                isBordered
              />
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                  {patient.nome} {patient.cognome}
                </h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
                  <CodiceFiscaleValue
                    value={patient.codiceFiscale}
                    generatedFromImport={Boolean(
                      patient.codiceFiscaleGenerato,
                    )}
                  />
                  <span className="text-default-300">·</span>
                  <span>
                    {formatVisitDate(patient.dataNascita)}
                    <span className="text-default-400 ml-1">
                      ({calculateAge(patient.dataNascita)} anni)
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="patient-clinical-badge">
                    Gruppo {patient.gruppoSanguigno || "—"}
                  </span>
                  <span className="patient-clinical-badge">
                    {patient.altezza != null && patient.altezza > 0
                      ? `${patient.altezza} cm`
                      : "—"}
                  </span>
                </div>
                {(patient.telefono ||
                  patient.email ||
                  patient.luogoNascita) && (
                  <div className="text-sm text-gray-500 pt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {patient.luogoNascita && (
                      <span className="inline-flex items-center">
                        <i
                          className="ti ti-map-pin patient-header-contact-icon"
                          aria-hidden
                        />
                        {patient.luogoNascita}
                      </span>
                    )}
                    {patient.telefono && (
                      <span className="inline-flex items-center">
                        <i
                          className="ti ti-phone patient-header-contact-icon"
                          aria-hidden
                        />
                        {patient.telefono}
                      </span>
                    )}
                    {patient.email && (
                      <span className="inline-flex items-center">
                        <i
                          className="ti ti-mail patient-header-contact-icon"
                          aria-hidden
                        />
                        {patient.email}
                      </span>
                    )}
                  </div>
                )}
                {/* Sola lettura: i gruppi si assegnano dalla pagina del
                    progetto, dove si vede tutta la coorte. Qui il chip dice a
                    cosa partecipa il paziente e ci porta dentro. */}
                {gruppiAbilitati && gruppiDelPaziente(patient).length > 0 && (
                  <div className="flex items-start gap-1.5 mt-1">
                    <FlaskConical
                      size={13}
                      className="text-default-400 shrink-0 mt-1"
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {gruppiDelPaziente(patient).map((g) => (
                        <Chip
                          key={gruppoKey(g.nome)}
                          size="sm"
                          variant="flat"
                          // Tinta brand invece di `secondary`, che in questo
                          // tema è slate quasi bianco: il chip è cliccabile e
                          // deve leggersi come tale, non come testo semplice.
                          classNames={{
                            base: "cursor-pointer border border-brand-200 bg-brand-50 transition-colors hover:bg-brand-100",
                            content: "text-brand-700 font-medium",
                          }}
                          title={`${dettaglioArruolamento(g)} — apri il gruppo`}
                          onClick={() =>
                            navigate(
                              `/gruppi-ricerca?gruppo=${encodeURIComponent(g.nome)}`,
                            )
                          }
                        >
                          {g.nome}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {patient.allergie && patient.allergie.trim() !== "" && (
                  <div className="text-sm text-danger-500 pt-1 flex items-center gap-1">
                    <span className="inline-flex shrink-0 items-center">
                      <i
                        className="ti ti-alert-triangle patient-header-allergy-icon"
                        aria-hidden
                      />
                    </span>
                    <span className="whitespace-pre-line leading-snug">
                      Allergie: {patient.allergie}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Azioni Rapide */}
            <div className="flex flex-col items-stretch md:items-end gap-1 w-full md:w-auto mt-4 md:mt-0">
              <Button
                variant="bordered"
                size="sm"
                onPress={handleOpenEdit}
                startContent={<i className="ti ti-edit text-base" aria-hidden />}
                className="justify-start md:w-44 border-[0.5px] border-default-300 bg-white px-4 py-2 h-auto min-h-0 font-medium"
              >
                Modifica Dati
              </Button>
              <button
                type="button"
                onClick={() => navigate(`/patient-history/${patient.id}/files`)}
                className="patient-header-file-btn md:w-44"
              >
                <i className="ti ti-folder" aria-hidden />
                File
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Nota bene: riga sottile, quasi impercettibile se vuota */}
      <div
        className={`rounded-lg border transition-colors ${
          notaBeneLocal.trim() || isNotaBeneOpen
            ? "border-default-200 bg-default-50/30"
            : "border-dashed border-default-200 bg-transparent hover:bg-default-50/20"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsNotaBeneOpen((prev) => !prev)}
          className="flex items-center gap-2 w-full min-w-0 py-2 px-3 text-left"
        >
          <StickyNote size={14} className="text-default-400 shrink-0" />
          {isNotaBeneOpen ? (
            <span className="text-xs font-medium text-default-600 flex-1 min-w-0">
              Nota bene
            </span>
          ) : (
            <span className="text-xs text-default-500 flex-1 min-w-0 whitespace-pre-wrap break-words">
              {notaBeneLocal.trim()
                ? notaBeneLocal.trim()
                : "Nota bene (amica, prezzi, familiarità…)"}
            </span>
          )}
          <span className="text-default-400 shrink-0">
            {isNotaBeneOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {isNotaBeneOpen && (
          <div className="px-3 pb-3 pt-0 border-t border-default-100">
            <RefertoTextarea
              placeholder="Es. Amica, prezzo speciale · Familiarità cancro · Richiamare al pomeriggio..."
              value={notaBeneLocal}
              onValueChange={setNotaBeneLocal}
              variant="bordered"
              minRows={2}
              size="sm"
              classNames={{
                input: "!text-sm !leading-normal",
                inputWrapper: "bg-white border-default-200",
              }}
              className="w-full"
            />
            <Button
              color="primary"
              size="sm"
              variant="flat"
              onPress={handleSaveNotaBene}
              isLoading={savingNotaBene}
              isDisabled={savingNotaBene}
              startContent={<SaveIcon size={14} />}
              className="mt-2"
            >
              Salva
            </Button>
          </div>
        )}
      </div>

      {/* 2. Layout a Griglia: Visite a sinistra, documenti a destra (stessa altezza) */}
      <div className="patient-history-panels grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLONNA SINISTRA: VISITE (2/3) */}
        <div className="patient-history-panel patient-history-panel--visits corioli-card lg:col-span-2 flex flex-col overflow-hidden">
          <div className="corioli-section-bar flex-shrink-0 rounded-none border-0 border-b border-default-100 bg-default-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-default-100 text-default-600 rounded-lg">
                <FileTextIcon size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Visite</h2>
                <p className="text-xs text-gray-500">
                  {visits.length} registrate
                </p>
              </div>
            </div>
            <Button
              color="primary"
              className="font-medium shadow-sm"
              size="sm"
              onPress={() => {
                if (!ensureDoctorProfileComplete(doctor)) return;
                navigate(`/add-visit?patientId=${patient.id}`);
              }}
              startContent={<PlusIcon size={16} />}
            >
              Nuova Visita
            </Button>
          </div>

          <div className="p-3">
          {visits.length === 0 ? (
            <Card className="bg-default-50 border-dashed border-default-300 shadow-none">
              <CardBody className="text-center py-10">
                <PatientDocEmptyState
                  icon={ClipboardList}
                  title="Nessuna visita"
                  hint="Inizia il percorso clinico."
                />
                <Button
                  color="primary"
                  size="sm"
                  className="mt-4"
                  onPress={() => {
                    if (!ensureDoctorProfileComplete(doctor)) return;
                    navigate(`/add-visit?patientId=${patient.id}`);
                  }}
                >
                  Aggiungi Prima Visita
                </Button>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-3">
              {visits.map((visit) => (
                <Card
                  key={visit.id}
                  isPressable
                  onPress={() => handleVisitClick(visit)}
                  className="w-full hover:shadow-md transition-all border-transparent hover:border-primary-100 group cursor-pointer"
                >
                  <CardBody className="p-5">
                    <div className="flex flex-col md:flex-row gap-5">
                      {/* Data e Icona (Colonna sinistra fissa) */}
                      <div className="flex md:flex-col items-center md:items-start gap-3 min-w-[100px] border-b md:border-b-0 md:border-r border-default-100 pb-3 md:pb-0 md:pr-4">
                        <div className="flex flex-col items-center md:items-start">
                          <span className="text-2xl font-bold text-gray-800 leading-none">
                            {format(parseISO(visit.dataVisita), "dd")}
                          </span>
                          <span className="text-sm font-medium text-gray-500 uppercase">
                            {format(parseISO(visit.dataVisita), "MMM yyyy", {
                              locale: it,
                            })}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip
                            size="sm"
                            variant="flat"
                            color="primary"
                            className="capitalize font-semibold"
                          >
                            Visita
                          </Chip>
                          {getVisitContextBadges(visit).map((badge) => (
                            <span
                              key={badge}
                              className={`visit-context-badge ${
                                badge === "terapia"
                                  ? "visit-context-badge--terapia"
                                  : "visit-context-badge--followup"
                              }`}
                            >
                              {badge === "terapia"
                                ? "Terapia attiva"
                                : "Follow-up"}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Contenuto Principale */}
                      <div className="flex-1 space-y-3">
                        {/* Dettagli specifici per tipo */}
                        <div>
                          <div className="mb-2">
                            <p className="text-gray-700 text-sm font-medium">
                              {senzaMarcatori(
                                visit.visita?.problemaClinico ||
                                  visit.visita?.prestazione ||
                                  visit.descrizioneClinica ||
                                  visit.anamnesi,
                              ) || "Visita"}
                            </p>
                          </div>

                          {/* Estratto note/conclusioni (cosa è stato fatto/trovato) */}
                          {(visit.visita?.terapiaSpecifica ||
                            visit.conclusioniDiagnostiche) && (
                            <div className="text-sm text-gray-600 bg-default-50 p-2 rounded-lg border-l-3 border-default-300">
                              {senzaMarcatori(
                                visit.visita?.terapiaSpecifica ||
                                  visit.conclusioniDiagnostiche,
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Azioni (a destra su desktop) */}
                      <div
                        className="flex md:flex-col gap-2 justify-end md:justify-start border-t md:border-t-0 md:border-l border-default-100 pt-3 md:pt-0 md:pl-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="visit-card-icon-btn"
                          title="Modifica visita"
                          onClick={() => navigate(`/edit-visit/${visit.id}`)}
                        >
                          <i className="ti ti-edit" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="visit-card-icon-btn disabled:opacity-50 disabled:pointer-events-none"
                          title="Stampa"
                          onClick={() => handlePrintPdf(visit)}
                          disabled={pdfLoading}
                        >
                          {pdfLoading ? (
                            <Spinner size="sm" color="current" />
                          ) : (
                            <i className="ti ti-printer" aria-hidden />
                          )}
                        </button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
          </div>
        </div>

        {/* COLONNA DESTRA: documenti paziente (ricette, esami, certificati) */}
        <div className="patient-history-panel patient-history-panel--docs corioli-card lg:col-span-1 lg:self-start flex flex-col overflow-hidden">
          <div className="patient-doc-panel-header">
            <div className="patient-doc-tabs" role="tablist" aria-label="Documenti paziente">
              {(
                [
                  { key: "ricette" as const, label: "Ricette", icon: Pill },
                  { key: "esami" as const, label: "Esami", icon: FlaskConical },
                  { key: "certificati" as const, label: "Certificati", icon: Award },
                ] as const
              ).map(({ key, label, icon: Icon }) => {
                const active = rightColumnTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setRightColumnTab(key)}
                    className={`patient-doc-tab ${active ? "patient-doc-tab--active" : "patient-doc-tab--inactive"}`}
                  >
                    <Icon size={17} strokeWidth={active ? 2.25 : 2} />
                    <span className="patient-doc-tab__label">{label}</span>
                  </button>
                );
              })}
            </div>
            {rightColumnTab === "ricette" ? (
              <Button
                color="primary"
                size="sm"
                variant="flat"
                className="patient-doc-panel-cta"
                onPress={handleOpenNuovaRicetta}
                startContent={<PlusIcon size={16} />}
              >
                Nuova ricetta
              </Button>
            ) : rightColumnTab === "esami" ? (
              <Button
                color="primary"
                size="sm"
                variant="flat"
                className="patient-doc-panel-cta"
                onPress={handleOpenNuovaRichiestaEsame}
                startContent={<PlusIcon size={16} />}
              >
                Nuovo esame
              </Button>
            ) : (
              <Button
                color="primary"
                size="sm"
                variant="flat"
                className="patient-doc-panel-cta"
                onPress={handleOpenNuovoCertificato}
                startContent={<PlusIcon size={16} />}
              >
                Nuovo certificato
              </Button>
            )}
          </div>

          {/* Contenuto lista (solo il tab attivo) */}
          <div className="patient-doc-panel-body">
            {rightColumnTab === "ricette" && (
              <div className="space-y-3">
                {ricette.length === 0 ? (
                  <PatientDocEmptyState
                    icon={Pill}
                    title="Nessuna ricetta emessa"
                    hint="Le ricette create per questa paziente appariranno qui"
                  />
                ) : (
                  ricette.map((r) => (
                    <Card
                      key={r.id}
                      isPressable
                      onPress={() => handleOpenRicettaPreview(r)}
                      className="border border-default-200 shadow-sm hover:border-primary/40 group cursor-pointer w-full min-h-[5rem]"
                    >
                      <CardBody className="p-3 min-h-[5rem] flex flex-col">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="right-col-card-title break-words">
                                {getRicettaSummary(r)}
                              </h4>
                              <Chip size="sm" variant="flat" color="primary" className="h-5">
                                {getRicettaTipoLabel(r.tipo)}
                              </Chip>
                            </div>
                            <p className="right-col-card-date">
                              {formatCardDateSubtle(r.dataRicetta)}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" color="primary" variant="light" isIconOnly className="h-6 w-6 min-w-0" onPress={() => handleOpenEditRicetta(r)} title="Modifica">
                              <EditIcon size={14} />
                            </Button>
                            <Button size="sm" color="primary" variant="light" isIconOnly className="h-6 w-6 min-w-0" onPress={() => handlePrintRicetta(r)} isLoading={pdfLoading} title="Stampa PDF">
                              <Printer size={14} />
                            </Button>
                          </div>
                        </div>
                        {r.note ? (
                          <p className="text-xs text-gray-500 line-clamp-2 break-words">{r.note}</p>
                        ) : null}
                      </CardBody>
                    </Card>
                  ))
                )}
              </div>
            )}
            {rightColumnTab === "esami" && (
              <div className="space-y-3">
                {richiesteEsami.length === 0 ? (
                  <PatientDocEmptyState
                    icon={FlaskConical}
                    title="Nessuna richiesta esame"
                    hint="Le prescrizioni di esami per questa paziente appariranno qui"
                  />
                ) : (
                  richiesteEsami.map((r) => (
                    <Card
                      key={r.id}
                      isPressable
                      onPress={() => handleOpenEsamePreview(r)}
                      className="border border-default-200 shadow-sm hover:border-primary-300 group cursor-pointer w-full min-h-[7.5rem]"
                    >
                      <CardBody className="p-3 min-h-[7.5rem] flex flex-col">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <h4 className="right-col-card-title break-words">
                              {r.nome}
                            </h4>
                            <p className="right-col-card-date">
                              {formatCardDateSubtle(r.dataRichiesta)}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" color="primary" variant="light" isIconOnly className="h-6 w-6 min-w-0" onPress={() => handleOpenEditRichiestaEsame(r)} title="Modifica">
                              <EditIcon size={14} />
                            </Button>
                            <Button size="sm" color="primary" variant="light" isIconOnly className="h-6 w-6 min-w-0" onPress={() => handlePrintRichiestaEsame(r)} isLoading={pdfLoading} title="Stampa PDF">
                              <Printer size={14} />
                            </Button>
                          </div>
                        </div>
                        {r.note ? (
                          <p className="text-xs text-gray-500 bg-gray-50 p-1.5 rounded border border-gray-100 break-words line-clamp-3">{r.note}</p>
                        ) : (
                          <div className="flex-1 min-h-[1.5rem]" />
                        )}
                      </CardBody>
                    </Card>
                  ))
                )}
              </div>
            )}
            {rightColumnTab === "certificati" && (
              <div className="space-y-3">
                {certificati.length === 0 ? (
                  <PatientDocEmptyState
                    icon={Award}
                    title="Nessun certificato emesso"
                    hint="I certificati rilasciati a questa paziente appariranno qui"
                  />
                ) : (
                  certificati.map((c) => (
                    <Card
                      key={c.id}
                      isPressable
                      onPress={() => handleOpenCertificatoPreview(c)}
                      className="border border-default-200 shadow-sm hover:border-warning-300 group cursor-pointer w-full min-h-[5rem]"
                    >
                      <CardBody className="p-3 min-h-[5rem] flex flex-col">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <h4 className="right-col-card-title break-words">
                              {getCertificatoTipoLabel(c.tipo)}
                            </h4>
                            <p className="right-col-card-date">
                              {formatCardDateSubtle(c.dataCertificato)}
                            </p>
                          </div>
                          <div
                            className="flex gap-1 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              color="primary"
                              variant="light"
                              isIconOnly
                              className="h-6 w-6 min-w-0"
                              onPress={() => handleOpenEditCertificato(c)}
                              title="Modifica"
                            >
                              <EditIcon size={14} />
                            </Button>
                            <Button
                              size="sm"
                              color="warning"
                              variant="light"
                              isIconOnly
                              className="h-6 w-6 min-w-0"
                              onPress={() => handlePrintCertificato(c)}
                              isLoading={pdfLoading}
                              title="Stampa PDF"
                            >
                              <Printer size={14} />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-700 line-clamp-2 break-words">{c.descrizione}</p>
                      </CardBody>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visit Details Modal - Anteprima Referto */}
      <AppModal
        isOpen={isOpen}
        onClose={onClose}
        size={previewFullscreen ? "full" : "5xl"}
        scrollBehavior="inside"
        classNames={
          previewFullscreen
            ? { base: "m-0 max-w-[100vw] max-h-[100vh] h-[100vh] rounded-none" }
            : undefined
        }
      >
        <ModalContent
          className={previewFullscreen ? "flex flex-col max-h-[100vh] h-[100vh]" : undefined}
        >
          {selectedVisit && (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center justify-between w-full">
                  <div>
                    <h2 className="text-xl font-bold">Anteprima Referto</h2>
                  </div>
                  <Chip color="primary" variant="flat">
                    Visita
                  </Chip>
                </div>
              </ModalHeader>
              <ModalBody
                className={previewFullscreen ? "flex-1 flex flex-col min-h-0 overflow-hidden" : undefined}
              >
                {previewPdfLoading ? (
                  <div className="flex justify-center items-center min-h-[60vh]">
                    <Spinner size="lg" color="primary" label="Generazione anteprima PDF..." />
                  </div>
                ) : previewPdfBlobUrl ? (
                  <div
                    className={
                      previewFullscreen
                        ? "flex-1 min-h-0 flex flex-col rounded-lg p-2 bg-[#e5e5e5]"
                        : "bg-[#e5e5e5] rounded-lg p-2 flex flex-col min-h-[70vh]"
                    }
                  >
                    <iframe
                      src={previewPdfBlobUrl}
                      title="Anteprima referto"
                      className={
                        previewFullscreen
                          ? "flex-1 w-full min-h-0 rounded border border-gray-300 bg-white"
                          : "flex-1 w-full min-h-[70vh] rounded border border-gray-300 bg-white"
                      }
                    />
                  </div>
                ) : (
                  <div className="flex justify-center items-center min-h-[60vh] text-default-500">
                    Anteprima non disponibile.
                  </div>
                )}
              </ModalBody>
              <ModalFooter className="flex-wrap gap-2">
                <Button
                  color="danger"
                  variant="light"
                  startContent={<Trash2Icon size={16} />}
                  onPress={() =>
                    selectedVisit &&
                    requestDelete({ kind: "visita", id: selectedVisit.id })
                  }
                  className="mr-auto"
                  aria-label="Elimina visita"
                  title="Elimina visita"
                >
                  Elimina visita
                </Button>
                <Button
                  color="default"
                  variant="flat"
                  startContent={
                    previewFullscreen ? (
                      <Minimize2 size={16} />
                    ) : (
                      <Maximize2 size={16} />
                    )
                  }
                  onPress={() => setPreviewFullscreen(!previewFullscreen)}
                >
                  {previewFullscreen ? "Riduci" : "Espandi"}
                </Button>
                <Button
                  color="primary"
                  variant="flat"
                  startContent={<Printer size={16} />}
                  onPress={() => handlePrintPdf(selectedVisit)}
                  isLoading={pdfLoading}
                  isDisabled={pdfLoading}
                >
                  Stampa
                </Button>
                <Button
                  color="default"
                  variant="flat"
                  startContent={<DownloadIcon size={16} />}
                  onPress={() => handleGeneratePdfFromPreview(selectedVisit)}
                  isLoading={pdfLoading}
                  isDisabled={pdfLoading}
                >
                  {pdfLoading ? "Scaricamento..." : "Scarica referto"}
                </Button>
                <Button
                  color="primary"
                  onPress={() => {
                    onClose();
                    navigate(`/edit-visit/${selectedVisit.id}`);
                  }}
                >
                  Modifica Visita
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </AppModal>

      {/* ── Edit Patient Modal ── */}
      <AppModal
        isOpen={isEditOpen}
        onClose={onEditClose}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-warning-100">
              <UserIcon size={20} className="text-warning-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Modifica Paziente</h2>
              <p className="text-sm text-gray-500">
                Aggiorna i dati anagrafici
              </p>
            </div>
          </ModalHeader>
          <ModalBody>
            {successMsg && (
              <div className="corioli-feedback-success px-4 py-3 rounded-lg text-sm font-medium">
                {successMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome"
                value={editData.nome || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({ ...prev, nome: v }))
                }
                variant="bordered"
                isRequired
              />
              <Input
                label="Cognome"
                value={editData.cognome || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({ ...prev, cognome: v }))
                }
                variant="bordered"
                isRequired
              />
              <Input
                label="Codice Fiscale"
                value={editData.codiceFiscale || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({
                    ...prev,
                    codiceFiscale: v.toUpperCase(),
                  }))
                }
                variant="bordered"
                isRequired
                maxLength={16}
              />
              <Input
                label="Data di Nascita"
                type="date"
                value={editData.dataNascita || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({ ...prev, dataNascita: v }))
                }
                min={`${MIN_BIRTH_YEAR}-01-01`}
                max={todayIsoDate()}
                variant="bordered"
                isRequired
              />
              <Input
                label="Luogo di Nascita"
                value={editData.luogoNascita || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({ ...prev, luogoNascita: v }))
                }
                variant="bordered"
              />
              <Select
                label="Sesso"
                placeholder="Non indicato"
                selectedKeys={editData.sesso ? [editData.sesso] : []}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0];
                  setEditData((prev) => ({
                    ...prev,
                    sesso: val === "M" || val === "F" ? val : undefined,
                  }));
                }}
                variant="bordered"
              >
                {/* Non obbligatorio, e con la voce per riportarlo a vuoto:
                    il sesso non indicato resta tale, e i calcoli che lo
                    richiedono lo dicono invece di sceglierne uno. */}
                <SelectItem key="-">Non indicato</SelectItem>
                <SelectItem key="M">Maschio</SelectItem>
                <SelectItem key="F">Femmina</SelectItem>
              </Select>
            </div>

            <Divider className="my-2" />
            <p className="text-sm font-medium text-gray-500">
              Contatti (opzionali)
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Indirizzo"
                value={editData.indirizzo || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({ ...prev, indirizzo: v }))
                }
                variant="bordered"
              />
              <Input
                label="Telefono"
                type="tel"
                value={editData.telefono || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({ ...prev, telefono: v }))
                }
                variant="bordered"
              />
              <Input
                label="Email"
                type="email"
                value={editData.email || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({ ...prev, email: v }))
                }
                variant="bordered"
                className="md:col-span-2"
              />
            </div>

            <Divider className="my-2" />
            <p className="text-sm font-medium text-gray-500">Dati clinici</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Gruppo sanguigno"
                placeholder="Seleziona"
                selectedKeys={
                  editData.gruppoSanguigno ? [editData.gruppoSanguigno] : []
                }
                onSelectionChange={(keys) =>
                  setEditData((prev) => ({
                    ...prev,
                    gruppoSanguigno: (Array.from(keys)[0] as string) || "",
                  }))
                }
                variant="bordered"
              >
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-", "Non noto"].map(
                  (g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  )
                )}
              </Select>
              <Input
                label="Altezza (cm)"
                type="text"
                inputMode="numeric"
                value={
                  altezzaInputDraft ??
                  (editData.altezza != null ? String(editData.altezza) : "")
                }
                onFocus={() => {
                  setAltezzaInputDraft(
                    editData.altezza != null ? String(editData.altezza) : "",
                  );
                }}
                onBlur={() => {
                  if (altezzaInputDraft !== null) {
                    setEditData((prev) => ({
                      ...prev,
                      altezza: parseHeightFieldBlur(altezzaInputDraft),
                    }));
                  }
                  setAltezzaInputDraft(null);
                }}
                onValueChange={(v) => {
                  if (!isValidHeightInputDraft(v)) return;
                  setAltezzaInputDraft(v);
                  const live = parseHeightFieldLive(v);
                  if (live === "incomplete") {
                    if (v === "") {
                      setEditData((prev) => ({ ...prev, altezza: undefined }));
                    }
                    return;
                  }
                  setEditData((prev) => ({ ...prev, altezza: live }));
                }}
                variant="bordered"
                placeholder="Es. 165"
              />
            </div>
            <div className="mt-2">
              <Textarea
                label="Allergie / Intolleranze"
                placeholder="Elenca eventuali allergie a farmaci, alimenti, ecc."
                value={editData.allergie || ""}
                onValueChange={(v) =>
                  setEditData((prev) => ({ ...prev, allergie: v }))
                }
                variant="bordered"
                minRows={2}
              />
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-between items-center">
            <Button
              color="danger"
              variant="light"
              isIconOnly
              onPress={() => {
                onEditClose();
                requestDelete({ kind: "paziente" });
              }}
              aria-label="Elimina Paziente"
              title="Elimina Paziente"
            >
              <Trash2Icon size={20} />
            </Button>
            <div className="flex gap-2">
              <Button color="default" variant="light" onPress={onEditClose}>
                Annulla
              </Button>
              <Button
                color="primary"
                onPress={handleSavePatient}
                isLoading={saving}
                startContent={!saving ? <SaveIcon size={16} /> : undefined}
              >
                Salva Modifiche
              </Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      {/* Modal Anteprima esame = PDF in iframe (come Anteprima Referto) */}
      <AppModal
        isOpen={isEsamePreviewOpen}
        onClose={() => {
          onEsamePreviewClose();
          setSelectedRichiestaEsamePreview(null);
          setEsamePreviewFullscreen(false);
        }}
        size={esamePreviewFullscreen ? "full" : "5xl"}
        scrollBehavior="inside"
        classNames={
          esamePreviewFullscreen
            ? { base: "m-0 max-w-[100vw] max-h-[100vh] h-[100vh] rounded-none" }
            : undefined
        }
      >
        <ModalContent className={esamePreviewFullscreen ? "flex flex-col max-h-[100vh] h-[100vh]" : undefined}>
          {selectedRichiestaEsamePreview && patient && (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <FlaskConical size={22} className="text-primary-700" />
                    <h2 className="text-xl font-bold">Anteprima esame</h2>
                  </div>
                </div>
              </ModalHeader>
              <ModalBody className={esamePreviewFullscreen ? "flex-1 flex flex-col min-h-0 overflow-hidden" : undefined}>
                {esamePreviewPdfLoading ? (
                  <div className="flex justify-center items-center min-h-[60vh]">
                    <Spinner size="lg" color="primary" label="Generazione anteprima PDF..." />
                  </div>
                ) : esamePreviewPdfBlobUrl ? (
                  <div className={esamePreviewFullscreen ? "flex-1 min-h-0 flex flex-col rounded-lg p-2 bg-[#e5e5e5]" : "bg-[#e5e5e5] rounded-lg p-2 flex flex-col min-h-[70vh]"}>
                    <iframe
                      src={esamePreviewPdfBlobUrl}
                      title="Anteprima esame"
                      className={esamePreviewFullscreen ? "flex-1 w-full min-h-0 rounded border border-gray-300 bg-white" : "flex-1 w-full min-h-[70vh] rounded border border-gray-300 bg-white"}
                    />
                  </div>
                ) : (
                  <div className="flex justify-center items-center min-h-[60vh] text-default-500">
                    Anteprima non disponibile.
                  </div>
                )}
              </ModalBody>
              <ModalFooter className="border-t border-default-200 gap-2 flex-wrap">
                <Button color="danger" variant="light" className="mr-auto" startContent={<Trash2Icon size={18} />} onPress={() => { if (!selectedRichiestaEsamePreview) return; requestDelete({ kind: "esame", id: selectedRichiestaEsamePreview.id }); }} aria-label="Elimina richiesta esame" title="Elimina richiesta esame">Elimina</Button>
                <Button variant="light" startContent={esamePreviewFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} onPress={() => setEsamePreviewFullscreen(!esamePreviewFullscreen)}>{esamePreviewFullscreen ? "Riduci" : "Espandi"}</Button>
                <Button color="primary" variant="flat" startContent={<Printer size={18} />} onPress={() => selectedRichiestaEsamePreview && handlePrintRichiestaEsame(selectedRichiestaEsamePreview)} isLoading={pdfLoading}>Stampa</Button>
                <Button color="default" variant="flat" startContent={<DownloadIcon size={16} />} onPress={() => selectedRichiestaEsamePreview && handleDownloadRichiestaEsame(selectedRichiestaEsamePreview)} isLoading={pdfLoading} isDisabled={pdfLoading}>{pdfLoading ? "Scaricamento..." : "Scarica richiesta"}</Button>
                <Button color="primary" startContent={<EditIcon size={18} />} onPress={handleFromPreviewToEdit}>Modifica</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </AppModal>

      {/* Modal Anteprima certificato = PDF in iframe (come Anteprima Referto) */}
      <AppModal
        isOpen={isCertificatoPreviewOpen}
        onClose={() => {
          handleCloseCertificatoPreview();
          setCertificatoPreviewFullscreen(false);
        }}
        size={certificatoPreviewFullscreen ? "full" : "5xl"}
        scrollBehavior="inside"
        classNames={certificatoPreviewFullscreen ? { base: "m-0 max-w-[100vw] max-h-[100vh] h-[100vh] rounded-none" } : undefined}
      >
        <ModalContent className={certificatoPreviewFullscreen ? "flex flex-col max-h-[100vh] h-[100vh]" : undefined}>
          {selectedCertificatoPreview && patient && (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Award size={22} className="text-warning-600" />
                    <h2 className="text-xl font-bold">Anteprima certificato</h2>
                  </div>
                  <Chip size="sm" variant="flat" color="warning">{getCertificatoTipoLabel(selectedCertificatoPreview.tipo)}</Chip>
                </div>
              </ModalHeader>
              <ModalBody className={certificatoPreviewFullscreen ? "flex-1 flex flex-col min-h-0 overflow-hidden" : undefined}>
                {certificatoPreviewPdfLoading ? (
                  <div className="flex justify-center items-center min-h-[60vh]">
                    <Spinner size="lg" color="primary" label="Generazione anteprima PDF..." />
                  </div>
                ) : certificatoPreviewPdfBlobUrl ? (
                  <div className={certificatoPreviewFullscreen ? "flex-1 min-h-0 flex flex-col rounded-lg p-2 bg-[#e5e5e5]" : "bg-[#e5e5e5] rounded-lg p-2 flex flex-col min-h-[70vh]"}>
                    <iframe src={certificatoPreviewPdfBlobUrl} title="Anteprima certificato" className={certificatoPreviewFullscreen ? "flex-1 w-full min-h-0 rounded border border-gray-300 bg-white" : "flex-1 w-full min-h-[70vh] rounded border border-gray-300 bg-white"} />
                  </div>
                ) : (
                  <div className="flex justify-center items-center min-h-[60vh] text-default-500">Anteprima non disponibile.</div>
                )}
              </ModalBody>
              <ModalFooter className="border-t border-default-200 gap-2 flex-wrap">
                <Button color="danger" variant="light" className="mr-auto" startContent={<Trash2Icon size={18} />} onPress={() => { if (!selectedCertificatoPreview) return; requestDelete({ kind: "certificato", id: selectedCertificatoPreview.id }); }} aria-label="Elimina certificato">Elimina</Button>
                <Button variant="light" startContent={certificatoPreviewFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} onPress={() => setCertificatoPreviewFullscreen(!certificatoPreviewFullscreen)}>{certificatoPreviewFullscreen ? "Riduci" : "Espandi"}</Button>
                <Button color="warning" variant="flat" startContent={<Printer size={18} />} onPress={() => selectedCertificatoPreview && handlePrintCertificato(selectedCertificatoPreview)} isLoading={pdfLoading}>Stampa</Button>
                <Button color="default" variant="flat" startContent={<DownloadIcon size={16} />} onPress={() => selectedCertificatoPreview && handleDownloadCertificato(selectedCertificatoPreview)} isLoading={pdfLoading} isDisabled={pdfLoading}>{pdfLoading ? "Scaricamento..." : "Scarica certificato"}</Button>
                <Button color="primary" startContent={<EditIcon size={18} />} onPress={handleFromCertificatoPreviewToEdit}>Modifica</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </AppModal>

      {/* Modal Creazione/Modifica Richiesta Esame */}
      <AppModal isOpen={isEsameOpen} onClose={handleCloseEsameModal} size="2xl">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 pb-2">
            <FlaskConical size={22} className="text-primary-700" />
            <span className="text-lg">
              {editingRichiestaEsame
                ? "Modifica richiesta esame"
                : "Nuova richiesta esame"}
            </span>
          </ModalHeader>
          <ModalBody className="gap-5 pb-6">
            <div className="flex flex-col gap-4">
              {/* Selezione Modello */}
              <div className="flex justify-end">
                <Dropdown>
                  <DropdownTrigger>
                    <Button
                      size="sm"
                      variant="flat"
                      color="primary"
                      startContent={<ClipboardList size={16} />}
                    >
                      Modelli Esame
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="Modelli Esame"
                    onAction={(key) => {
                      const t = examTemplates.find((x) => x.id === key);
                      if (t) {
                        setNuovaRichiestaNome(t.text);
                        setNuovaRichiestaNote(t.note || "");
                      }
                    }}
                    className="max-h-[300px] overflow-y-auto"
                  >
                    {examTemplates.map((t) => (
                      <DropdownItem
                        key={t.id}
                        description={
                          t.note
                            ? t.note.length > 50
                              ? t.note.substring(0, 50) + "..."
                              : t.note
                            : ""
                        }
                      >
                        {t.label}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>
              </div>

              <Input
                label="Esame richiesto"
                placeholder="Es. Emocromo, Eco Addome..."
                value={nuovaRichiestaNome}
                onValueChange={setNuovaRichiestaNome}
                variant="bordered"
              />

              <Textarea
                label="Note cliniche / Quesito diagnostico"
                placeholder="Es. Controllo post-operatorio, sospetta appendicite..."
                value={nuovaRichiestaNote}
                onValueChange={setNuovaRichiestaNote}
                variant="bordered"
                minRows={3}
              />

              <Input
                type="date"
                label="Data richiesta"
                value={nuovaRichiestaData}
                onValueChange={setNuovaRichiestaData}
                variant="bordered"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            {editingRichiestaEsame ? (
              <Button
                color="danger"
                variant="light"
                isIconOnly
                onPress={() =>
                  requestDelete({ kind: "esame", id: editingRichiestaEsame.id })
                }
                aria-label="Elimina richiesta"
                title="Elimina richiesta"
              >
                <Trash2Icon size={20} />
              </Button>
            ) : (
              <div />
            )}
            <div className="flex-1"></div>
            <Button variant="light" onPress={handleCloseEsameModal}>
              Annulla
            </Button>
            <Button
              color="primary"
              onPress={handleSaveRichiestaEsame}
              isDisabled={!nuovaRichiestaNome.trim()}
              isLoading={savingEsame}
              startContent={
                editingRichiestaEsame ? (
                  <SaveIcon size={18} />
                ) : (
                  <PlusIcon size={18} />
                )
              }
            >
              {editingRichiestaEsame ? "Salva Modifiche" : "Crea Richiesta"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      {/* Modal Nuovo/Modifica Certificato */}
      <AppModal isOpen={isCertificatoOpen} onClose={handleCloseCertificatoModal} size="2xl">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 pb-2">
            <Award size={22} className="text-warning-600" />
            <span className="text-lg">
              {editingCertificato ? "Modifica certificato" : "Nuovo certificato"}
            </span>
          </ModalHeader>
          <ModalBody className="gap-5 pb-6">
            {certTemplates.length > 0 && (
              <div className="flex justify-end">
                <Dropdown>
                  <DropdownTrigger>
                    <Button
                      size="sm"
                      variant="flat"
                      color="warning"
                      startContent={<ClipboardList size={16} />}
                    >
                      Modelli Certificato
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="Modelli Certificato"
                    onAction={(key) => {
                      const t = certTemplates.find((x) => x.id === key);
                      if (t) {
                        setCertDescrizione(t.text);
                        setCertTipo(getCertificatoTipoFromTemplate(t));
                      }
                    }}
                    className="max-h-[300px] overflow-y-auto"
                  >
                    {certTemplates.map((t) => (
                      <DropdownItem
                        key={t.id}
                        description={t.note ? (t.note.length > 50 ? t.note.substring(0, 50) + "..." : t.note) : ""}
                      >
                        {t.label}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>
              </div>
            )}
            <Select
              label="Tipo certificato"
              selectedKeys={[certTipo]}
              onSelectionChange={(keys) => {
                const k = Array.from(keys)[0] as CertificatoPaziente["tipo"];
                if (k) setCertTipo(k);
              }}
              variant="bordered"
            >
              <SelectItem key="assenza_lavoro">Assenza da lavoro</SelectItem>
              <SelectItem key="idoneita">Idoneità</SelectItem>
              <SelectItem key="malattia">Malattia</SelectItem>
              <SelectItem key="altro">Altro</SelectItem>
            </Select>
            <Textarea
              label="Descrizione / Testo del certificato"
              placeholder="Es. La sottoscritta attesta che la paziente è stata visitata in data odierna e necessita di riposo per..."
              value={certDescrizione}
              onValueChange={setCertDescrizione}
              variant="bordered"
              minRows={4}
            />

            <Input
              type="date"
              label="Data certificato"
              value={certData}
              onValueChange={setCertData}
              variant="bordered"
            />
          </ModalBody>
          <ModalFooter>
            {editingCertificato ? (
              <Button
                color="danger"
                variant="light"
                startContent={<Trash2Icon size={18} />}
                onPress={() =>
                  requestDelete({ kind: "certificato", id: editingCertificato.id })
                }
              >
                Elimina
              </Button>
            ) : (
              <div />
            )}
            <div className="flex-1" />
            <Button variant="light" onPress={handleCloseCertificatoModal}>
              Annulla
            </Button>
            <Button
              color="primary"
              onPress={handleSaveCertificato}
              isDisabled={!certDescrizione.trim()}
              isLoading={savingCertificato}
              startContent={editingCertificato ? <SaveIcon size={18} /> : <PlusIcon size={18} />}
            >
              {editingCertificato ? "Salva Modifiche" : "Crea Certificato"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      {/* Modal Anteprima ricetta = PDF in iframe */}
      <AppModal
        isOpen={isRicettaPreviewOpen}
        onClose={() => {
          handleCloseRicettaPreview();
          setRicettaPreviewFullscreen(false);
        }}
        size={ricettaPreviewFullscreen ? "full" : "5xl"}
        scrollBehavior="inside"
        classNames={ricettaPreviewFullscreen ? { base: "m-0 max-w-[100vw] max-h-[100vh] h-[100vh] rounded-none" } : undefined}
      >
        <ModalContent className={ricettaPreviewFullscreen ? "flex flex-col max-h-[100vh] h-[100vh]" : undefined}>
          {selectedRicettaPreview && patient && (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Pill size={22} className="corioli-text-brand" />
                    <h2 className="text-xl font-bold">Anteprima ricetta</h2>
                  </div>
                  <Chip size="sm" variant="flat" color="primary">{getRicettaTipoLabel(selectedRicettaPreview.tipo)}</Chip>
                </div>
              </ModalHeader>
              <ModalBody className={ricettaPreviewFullscreen ? "flex-1 flex flex-col min-h-0 overflow-hidden" : undefined}>
                {ricettaPreviewPdfLoading ? (
                  <div className="flex justify-center items-center min-h-[60vh]">
                    <Spinner size="lg" color="primary" label="Generazione anteprima PDF..." />
                  </div>
                ) : ricettaPreviewPdfBlobUrl ? (
                  <div className={ricettaPreviewFullscreen ? "flex-1 min-h-0 flex flex-col rounded-lg p-2 bg-[#e5e5e5]" : "bg-[#e5e5e5] rounded-lg p-2 flex flex-col min-h-[70vh]"}>
                    <iframe src={ricettaPreviewPdfBlobUrl} title="Anteprima ricetta" className={ricettaPreviewFullscreen ? "flex-1 w-full min-h-0 rounded border border-gray-300 bg-white" : "flex-1 w-full min-h-[70vh] rounded border border-gray-300 bg-white"} />
                  </div>
                ) : (
                  <div className="flex justify-center items-center min-h-[60vh] text-default-500">Anteprima non disponibile.</div>
                )}
              </ModalBody>
              <ModalFooter className="border-t border-default-200 gap-2 flex-wrap">
                <Button color="danger" variant="light" className="mr-auto" startContent={<Trash2Icon size={18} />} onPress={() => { if (!selectedRicettaPreview) return; requestDelete({ kind: "ricetta", id: selectedRicettaPreview.id }); }}>Elimina</Button>
                <Button variant="light" startContent={ricettaPreviewFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} onPress={() => setRicettaPreviewFullscreen(!ricettaPreviewFullscreen)}>{ricettaPreviewFullscreen ? "Riduci" : "Espandi"}</Button>
                <Button color="primary" variant="flat" startContent={<Printer size={18} />} onPress={() => selectedRicettaPreview && handlePrintRicetta(selectedRicettaPreview)} isLoading={pdfLoading}>Stampa</Button>
                <Button color="default" variant="flat" startContent={<DownloadIcon size={16} />} onPress={() => selectedRicettaPreview && handleDownloadRicetta(selectedRicettaPreview)} isLoading={pdfLoading} isDisabled={pdfLoading}>{pdfLoading ? "Scaricamento..." : "Scarica ricetta"}</Button>
                <Button color="primary" startContent={<EditIcon size={18} />} onPress={handleFromRicettaPreviewToEdit}>Modifica</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </AppModal>

      {/* Modal Nuovo/Modifica Ricetta */}
      <AppModal isOpen={isRicettaOpen} onClose={handleCloseRicettaModal} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center gap-2 pb-2">
            <Pill size={22} className="text-primary-700" />
            <span className="text-lg">
              {editingRicetta ? "Modifica ricetta" : "Nuova ricetta"}
            </span>
          </ModalHeader>
          <ModalBody className="gap-5 pb-6">
            <div className="flex flex-col gap-4">
              {ricetteTemplates.length > 0 && (
                <div className="flex justify-end">
                  <Dropdown>
                    <DropdownTrigger>
                      <Button size="sm" variant="flat" color="primary" startContent={<ClipboardList size={16} />}>
                        Modelli Ricetta
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Modelli Ricetta"
                      onAction={(key) => {
                        const t = ricetteTemplates.find((x) => x.id === key);
                        if (!t) return;
                        const blocco = [t.text, t.note]
                          .map((s) => (s ?? "").trim())
                          .filter(Boolean)
                          .join("\n\n");
                        if (!blocco) return;
                        setRicettaTesto((prev) =>
                          prev.trim() ? `${prev.trimEnd()}\n\n${blocco}` : blocco,
                        );
                      }}
                      className="max-h-[300px] overflow-y-auto"
                    >
                      {ricetteTemplates.map((t) => (
                        <DropdownItem key={t.id} description={t.label}>
                          {t.label}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                </div>
              )}

              <Textarea
                label="Prescrizione"
                placeholder={"Scrivi qui l'intera prescrizione: farmaci, posologie, durata e indicazioni.\n\nEs.\nMonuril: 2 bustine (una ogni 24 h) la sera a vescica vuota per 2 giorni\nD-Mannosio: 1 bustina al giorno\n\nBere almeno 2 L di acqua al giorno."}
                value={ricettaTesto}
                onValueChange={setRicettaTesto}
                variant="bordered"
                minRows={10}
              />

              <Input
                type="date"
                label="Data ricetta"
                value={ricettaData}
                onValueChange={setRicettaData}
                variant="bordered"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            {editingRicetta ? (
              <Button
                color="danger"
                variant="light"
                startContent={<Trash2Icon size={18} />}
                onPress={() => requestDelete({ kind: "ricetta", id: editingRicetta.id })}
              >
                Elimina
              </Button>
            ) : (
              <div />
            )}
            <div className="flex-1" />
            <Button variant="light" onPress={handleCloseRicettaModal}>
              Annulla
            </Button>
            <Button
              color="primary"
              onPress={() => handleSaveRicetta(false)}
              isDisabled={!ricettaTesto.trim()}
              isLoading={savingRicetta}
              startContent={
                editingRicetta ? <SaveIcon size={18} /> : <PlusIcon size={18} />
              }
            >
              {editingRicetta ? "Salva Modifiche" : "Crea Ricetta"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <AppModal
        isOpen={isIncludeImagesModalOpen}
        onClose={() => handleIncludeImagesChoice(false)}
        size="md"
      >
        <ModalContent>
          <ModalHeader>Includere le immagini allegate?</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              Sono presenti{" "}
              <span className="font-semibold">{includeImagesCount}</span>{" "}
              immagini nella visita. Vuoi inserirle nel PDF di stampa?
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => handleIncludeImagesChoice(false)}
            >
              No, genera senza immagini
            </Button>
            <Button
              color="primary"
              onPress={() => handleIncludeImagesChoice(true)}
            >
              Si, includi immagini
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      {doctorProfileIncompleteModal}

      {pendingDelete && (
        <ConfirmDangerModal
          isOpen={isDeleteOpen}
          onClose={() => {
            if (isDeleting) return;
            onDeleteClose();
            setPendingDelete(null);
          }}
          title={getDeleteModalConfig(pendingDelete).title}
          confirmLabel={getDeleteModalConfig(pendingDelete).confirmLabel}
          onConfirm={() => void confirmPendingDelete()}
          isLoading={isDeleting}
        >
          <p className="text-sm text-default-600">
            {getDeleteModalConfig(pendingDelete).message}
          </p>
        </ConfirmDangerModal>
      )}
    </div>
  );
}
