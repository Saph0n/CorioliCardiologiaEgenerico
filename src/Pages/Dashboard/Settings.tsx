import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Select,
  SelectItem,
  Switch,
  Divider,
  Input,
  Chip,
  Tabs,
  Tab,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Progress,
  Tooltip,
} from "@nextui-org/react";
import {
  User,
  Users,
  Search,
  RefreshCw,
  Database,
  Building2,
  Settings as SettingsIcon,
  FileText,
  Plus,
  Trash2,
  Edit,
  Shield,
  ExternalLink,
  Download,
  Circle,
  CheckCircle2,
  HelpCircle,
  ArrowUpCircle,
  Pill,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { PRIVACY_POLICY_URL, PRIVACY_CONTACT_EMAIL } from "../../constants/privacy";
import { ExportService } from "../../services/ExportService";
import AppLockSettingsCard from "../../components/app-lock/AppLockSettingsCard";
import { isAppLockAvailable } from "../../services/AppLockService";
import { PageHeader } from "../../components/PageHeader";
import BackupManager from "../../components/BackupManager";
import { TemplateEditorModal } from "../../components/TemplateEditorModal";
import { ConfirmDangerModal } from "../../components/ConfirmDangerModal";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import {
  DoctorService,
  TemplateService,
  PatientService,
  VisitService,
  DocumentService,
  PreferenceService,
} from "../../services/OfflineServices";
import { MedicalTemplate } from "../../types/Storage";
import { normalizeRegistro } from "../../utils/gruppiRicerca";
import { SOGLIA_CAC_PREDEFINITA } from "../../utils/tcCoronarica";
import {
  GRUPPI_MODULI,
  MODULI_VISITA_SPENTI,
  leggiModuliVisita,
  leggiProntuarioAttivo,
  moduliDelGruppo,
  type ChiaveModuloOpzionale,
  type ModuliVisitaAttivi,
} from "../../utils/moduliVisita";
import { getMissingDoctorProfileFields } from "../../utils/doctorProfile";
import {
  AnamnesiConfig,
  AnamnesiVisitType,
  AnamnesiMode,
  AnamnesiTypeConfig,
  ANAMNESI_VISIT_TYPES,
  ANAMNESI_VISIT_TYPE_LABELS,
  getAnamnesiCampoMeta,
  createDefaultAnamnesiConfig,
  parseAnamnesiConfig,
  sanitizeAnamnesiEtichetta,
  MAX_ANAMNESI_ETICHETTA_LEN,
  MAX_ANAMNESI_SEZIONI,
  genAnamnesiCustomKey,
} from "../../utils/anamnesiStrutturata";
import { AppModal } from "../../components/AppModal";

type SettingsNoticeScope = "profilo" | "ambulatori" | "modelli" | "duplicati";

type SettingsNotice = {
  scope: SettingsNoticeScope;
  type: "success" | "error";
  message: string;
};

// TODO(store): ID della scheda Microsoft Store. Questo e' ancora quello di
// Corioli (edizione ginecologica): va sostituito con l'ID della scheda di
// "Corioli Cardiologia" appena la app viene pubblicata, altrimenti il pulsante
// "Cerca aggiornamenti" porta alla scheda sbagliata.
const CORIOLI_MS_STORE_ID = "9P24WMFJW58N";
const CORIOLI_MS_STORE_WEB = `https://apps.microsoft.com/detail/${CORIOLI_MS_STORE_ID}?hl=it-it&gl=IT`;
const CORIOLI_MS_STORE_APP = `ms-windows-store://pdp/?ProductId=${CORIOLI_MS_STORE_ID}`;

async function openCorioliMicrosoftStore() {
  const api = (
    window as unknown as {
      electronAPI?: {
        openExternal?: (url: string) => Promise<{ ok?: boolean }>;
      };
    }
  ).electronAPI;

  if (!api?.openExternal) {
    window.open(CORIOLI_MS_STORE_WEB, "_blank", "noopener,noreferrer");
    return;
  }

  const storeResult = await api.openExternal(CORIOLI_MS_STORE_APP);
  if (!storeResult?.ok) {
    await api.openExternal(CORIOLI_MS_STORE_WEB);
  }
}

function SettingsSectionNotice({
  scope,
  notice,
}: {
  scope: SettingsNoticeScope;
  notice: SettingsNotice | null;
}) {
  if (!notice || notice.scope !== scope) return null;

  return (
    <div
      role="status"
      className={`mb-3 rounded-lg border px-3 py-2 text-sm animate-in fade-in duration-200 ${
        notice.type === "success"
          ? "corioli-feedback-success"
          : "border-danger/30 bg-danger-50 text-danger-800"
      }`}
    >
      {notice.message}
    </div>
  );
}

const SettingsScreen = () => {
  const navigate = useNavigate();
  // ... state declarations ...
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pdfTheme, setPdfTheme] = useState("light");
  const [signatureStampImage, setSignatureStampImage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<SettingsNotice | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback(
    (
      scope: SettingsNoticeScope,
      type: "success" | "error",
      message: string,
      ms = 3000,
    ) => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      setNotice({ scope, type, message });
      if (ms > 0) {
        noticeTimerRef.current = setTimeout(() => {
          setNotice((current) =>
            current?.scope === scope && current.message === message
              ? null
              : current,
          );
        }, ms);
      }
    },
    [],
  );

  const clearNotice = useCallback((scope?: SettingsNoticeScope) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    if (!scope) {
      setNotice(null);
      return;
    }
    setNotice((current) => (current?.scope === scope ? null : current));
  }, []);

  const [doctorInfo, setDoctorInfo] = useState({
    nome: "",
    cognome: "",
    email: "",
    telefono: "",
    specializzazione: "",
  });

  // Template State
  const [templates, setTemplates] = useState<MedicalTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<MedicalTemplate["category"]>("visita");
  const {
    isOpen: isTemplateModalOpen,
    onOpen: onTemplateModalOpen,
    onClose: onTemplateModalClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteTemplateOpen,
    onOpen: onDeleteTemplateOpen,
    onClose: onDeleteTemplateClose,
  } = useDisclosure();
  const [currentTemplate, setCurrentTemplate] = useState<
    Partial<MedicalTemplate>
  >({
    label: "",
    text: "",
    category: "visita",
    section: "prestazione",
  });
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const [templateToDelete, setTemplateToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);

  // Data stats
  const [patientCount, setPatientCount] = useState(0);
  const [visitCount, setVisitCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);

  const [ambulatori, setAmbulatori] = useState<any[]>([]);
  const [savingAmbulatori, setSavingAmbulatori] = useState(false);

  const [newAmbulatorio, setNewAmbulatorio] = useState({
    nome: "",
    indirizzo: "",
    citta: "",
    cap: "",
    telefono: "",
    email: "",
    isPrimario: false,
  });
  const {
    isOpen: isEditAmbulatorioOpen,
    onOpen: onEditAmbulatorioOpen,
    onClose: onEditAmbulatorioClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteAmbulatorioOpen,
    onOpen: onDeleteAmbulatorioOpen,
    onClose: onDeleteAmbulatorioClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteDuplicateOpen,
    onOpen: onDeleteDuplicateOpen,
    onClose: onDeleteDuplicateClose,
  } = useDisclosure();
  const [editAmbulatorio, setEditAmbulatorio] = useState<{
    id: string;
    nome: string;
    indirizzo: string;
    citta: string;
    cap: string;
    telefono: string;
    email: string;
  } | null>(null);
  const [ambulatorioToDelete, setAmbulatorioToDelete] = useState<{
    id: string;
    nome: string;
  } | null>(null);
  const [duplicatePatientToDelete, setDuplicatePatientToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [preferences, setPreferences] = useState({
    nuoviPazienti: true,
    visiteCompletate: true,
    promemoriGiornalieri: false,
    modalitaCompatta: false,
    animazioniRidotte: false,
    anamnesiConfig: createDefaultAnamnesiConfig() as AnamnesiConfig,
    gruppiRicercaEnabled: false,
    gruppiRicerca: [] as string[],
    showDoctorPhoneInPdf: true,
    showDoctorEmailInPdf: true,
    sogliaCacSevera: SOGLIA_CAC_PREDEFINITA as number,
    moduliVisita: { ...MODULI_VISITA_SPENTI } as ModuliVisitaAttivi,
    prontuarioEnabled: false,
  });
  const [duplicateGroups, setDuplicateGroups] = useState<
    Array<{ key: string; patients: any[] }>
  >([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [processingDuplicateId, setProcessingDuplicateId] = useState<
    string | null
  >(null);
  const [processingDuplicateGroupKey, setProcessingDuplicateGroupKey] =
    useState<string | null>(null);
  const [duplicateSearch, setDuplicateSearch] = useState("");
  const [duplicateCheckProgress, setDuplicateCheckProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [mergeConflictOpen, setMergeConflictOpen] = useState(false);
  const [mergeConflictData, setMergeConflictData] = useState<{
    groupKey: string;
    target: any;
    sources: any[];
    conflictFields: Array<{
      key: string;
      label: string;
      options: string[];
      defaultValue: string;
      generatedByValue?: Record<string, boolean>;
    }>;
    basePayload: Record<string, any>;
  } | null>(null);
  const [mergeSelections, setMergeSelections] = useState<
    Record<string, string>
  >({});

  const [appVersion, setAppVersion] = useState<string>("");
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" && navigator.onLine);


  // Carica dati iniziali
  useEffect(() => {
    loadDoctorData();
    loadPreferences();
    loadTemplates();
  }, []);

  useEffect(() => {
    const onBackupCompleted = (event: Event) => {
      const date = (event as CustomEvent<{ lastBackupDate?: string }>).detail
        ?.lastBackupDate;
      if (!date) return;
      setLastBackupDate(date);
      setPreferences((prev) => ({ ...prev, lastBackupDate: date }));
    };
    window.addEventListener('corioli-backup-completed', onBackupCompleted);
    return () =>
      window.removeEventListener('corioli-backup-completed', onBackupCompleted);
  }, []);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        const [patients, visits, docs] = await Promise.all([
          PatientService.getAllPatients(),
          VisitService.getAllVisits(),
          DocumentService.getAllDocuments(),
        ]);
        setPatientCount(patients.length);
        setVisitCount(visits.length);
        setDocCount(docs.length);
      } catch {
        // ignore
      }
    };
    loadCounts();
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const api = (window as unknown as {
      electronAPI?: { getAppVersion?: () => Promise<string> };
    }).electronAPI;
    if (api?.getAppVersion) {
      api.getAppVersion().then((v) => setAppVersion(v || ""));
    } else if (typeof import.meta.env.VITE_APP_VERSION === "string") {
      setAppVersion(import.meta.env.VITE_APP_VERSION);
    }
  }, []);

  const loadTemplates = async () => {
    try {
      const allTemplates = await TemplateService.getAllTemplates();
      setTemplates(allTemplates);
    } catch (e) {
      console.error("Errore caricamento template", e);
    }
  };

  const handleEditTemplate = (template: MedicalTemplate) => {
    setCurrentTemplate(template);
    onTemplateModalOpen();
  };

  const handleNewTemplate = () => {
    const sectionByCategory: Record<string, string> = {
      visita: "prestazione",
      terapie: "generale",
      esame_complementare: "nome",
      certificato: "generale",
    };
    setCurrentTemplate({
      label: "",
      text: "",
      category: selectedCategory,
      section: sectionByCategory[selectedCategory] ?? "prestazione",
    });
    onTemplateModalOpen();
  };

  const handleSaveTemplate = async (template: Partial<MedicalTemplate>) => {
    setIsSavingTemplate(true);
    try {
      if (template.id) {
        await TemplateService.updateTemplate(template.id, template);
      } else {
        await TemplateService.addTemplate(
          template as Omit<MedicalTemplate, "id">,
        );
      }
      await loadTemplates();
      onTemplateModalClose();
      showNotice("modelli", "success", "Modello salvato con successo");
    } catch (e) {
      showNotice("modelli", "error", "Errore salvataggio template", 5000);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const requestDeleteTemplate = (template: MedicalTemplate) => {
    setTemplateToDelete({ id: template.id, label: template.label });
    onDeleteTemplateOpen();
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    setIsDeletingTemplate(true);
    try {
      await TemplateService.deleteTemplate(templateToDelete.id);
      await loadTemplates();
      onDeleteTemplateClose();
      setTemplateToDelete(null);
      showNotice("modelli", "success", "Modello eliminato");
    } catch (e) {
      showNotice("modelli", "error", "Errore eliminazione template", 5000);
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  const loadDoctorData = async () => {
    try {
      const doctor = await DoctorService.getDoctor();
      if (doctor) {
        setDoctorInfo({
          nome: doctor.nome,
          cognome: doctor.cognome,
          email: doctor.email,
          telefono: doctor.telefono || "",
          specializzazione: doctor.specializzazione || "",
        });
        setAmbulatori(doctor.ambulatori || []);
        const sig = (doctor as any).signatureStampImage;
        if (sig) setSignatureStampImage(sig);
      }
    } catch (error) {
      console.error("Errore nel caricamento dati dottore:", error);
    }
  };

  const loadPreferences = async () => {
    try {
      const prefs = await PreferenceService.getPreferences();
      if (prefs) {
        setPreferences((prev) => ({
          ...prev,
          ...prefs,
          // Normalizza/migra sempre la struttura anamnesi (vecchio booleano incluso)
          anamnesiConfig: parseAnamnesiConfig(prefs),
          gruppiRicerca: normalizeRegistro(prefs.gruppiRicerca),
          // Moduli opzionali e prontuario: assenti o scritti male valgono
          // spenti, come vuole la beta.
          moduliVisita: leggiModuliVisita(prefs),
          prontuarioEnabled: leggiProntuarioAttivo(prefs),
        }));
        setNotificationsEnabled((prefs.notificationsEnabled as boolean) ?? true);
        setPdfTheme((prefs.pdfTheme as string) ?? "light");
        if (prefs.lastBackupDate) {
          setLastBackupDate(prefs.lastBackupDate as string);
        }
      }
    } catch (error) {
      console.error("Errore nel caricamento preferenze:", error);
    }
  };

  const savePreferences = async () => {
    const prefs = {
      ...preferences,
      notificationsEnabled,
      pdfTheme,
    };
    await PreferenceService.savePreferences(prefs);
  };

  useEffect(() => {
    savePreferences().catch(console.error);
  }, [preferences, notificationsEnabled, pdfTheme]);

  const handleDoctorInfoChange = (field: string, value: string) => {
    setDoctorInfo((prev) => ({ ...prev, [field]: value }));
  };

  const handlePreferenceChange = (
    field: string,
    value: boolean | number | string | string[] | AnamnesiConfig | ModuliVisitaAttivi,
  ) => {
    setPreferences(prev => ({ ...prev, [field]: value }));
  };

  /**
   * Accende o spegne un singolo modulo opzionale della visita.
   *
   * Aggiorna a partire dallo stato precedente e non dalla copia di questo
   * render: gli interruttori sono sette in fila, e due click ravvicinati
   * perderebbero il primo.
   */
  const handleModuloChange = (
    chiave: ChiaveModuloOpzionale,
    attivo: boolean,
  ) => {
    setPreferences((prev) => ({
      ...prev,
      moduliVisita: { ...prev.moduliVisita, [chiave]: attivo },
    }));
  };

  // ── Helpers configurazione struttura anamnesi (per tipo di visita) ──
  const [isAnamnesiConfigModalOpen, setIsAnamnesiConfigModalOpen] =
    useState(false);
  const [isModuliConfigModalOpen, setIsModuliConfigModalOpen] = useState(false);

  /** Quanti moduli di un gruppo sono accesi: la sintesi sulla card. */
  const moduliAttiviDelGruppo = (gruppo: (typeof GRUPPI_MODULI)[number]["gruppo"]) =>
    moduliDelGruppo(gruppo).filter(
      (modulo) => preferences.moduliVisita?.[modulo.chiave],
    ).length;

  const updateAnamnesiTipo = (
    tipo: AnamnesiVisitType,
    patch: Partial<AnamnesiTypeConfig>,
  ) => {
    const cur = preferences.anamnesiConfig;
    handlePreferenceChange("anamnesiConfig", {
      ...cur,
      [tipo]: { ...cur[tipo], ...patch },
    });
  };

  const setAnamnesiMode = (tipo: AnamnesiVisitType, mode: AnamnesiMode) =>
    updateAnamnesiTipo(tipo, { mode });

  /** Aggiunge una nuova sezione personalizzata (max MAX_ANAMNESI_SEZIONI attive). */
  const addCustomAnamnesiSezione = (tipo: AnamnesiVisitType) => {
    const cfg = preferences.anamnesiConfig[tipo];
    if (cfg.campi.length >= MAX_ANAMNESI_SEZIONI) return;
    const key = genAnamnesiCustomKey();
    const etichette = { ...(cfg.etichette ?? {}) };
    etichette[key] = "Nuova sezione";
    updateAnamnesiTipo(tipo, { campi: [...cfg.campi, key], etichette });
  };

  /** Elimina una sezione (predefinita o personalizzata): chiave + etichetta. */
  const removeAnamnesiSezione = (tipo: AnamnesiVisitType, key: string) => {
    const cfg = preferences.anamnesiConfig[tipo];
    const etichette = { ...(cfg.etichette ?? {}) };
    delete etichette[key];
    updateAnamnesiTipo(tipo, {
      campi: cfg.campi.filter((k) => k !== key),
      etichette,
    });
  };

  const moveAnamnesiCampo = (
    tipo: AnamnesiVisitType,
    key: string,
    dir: -1 | 1,
  ) => {
    const campi = [...preferences.anamnesiConfig[tipo].campi];
    const i = campi.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= campi.length) return;
    [campi[i], campi[j]] = [campi[j], campi[i]];
    updateAnamnesiTipo(tipo, { campi });
  };

  /** Imposta (o azzera, se vuota) l'etichetta personalizzata di una sezione. */
  const setAnamnesiEtichetta = (
    tipo: AnamnesiVisitType,
    key: string,
    value: string,
  ) => {
    const next = sanitizeAnamnesiEtichetta(value);
    const etichette = { ...(preferences.anamnesiConfig[tipo].etichette ?? {}) };
    if (next.trim()) etichette[key] = next;
    else delete etichette[key];
    updateAnamnesiTipo(tipo, { etichette });
  };

  const normalizeName = (value: string) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z\s]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const normalizeSearchText = (value: string) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const normalizeFieldValue = (field: string, value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (field === "telefono") return raw.replace(/[^\d+]/g, "");
    if (field === "email") return raw.toLowerCase();
    if (field === "codiceFiscale") return raw.toUpperCase();
    if (field === "dataNascita") return raw;
    return raw.toLowerCase();
  };

  const uniqueValues = (values: string[]) => {
    const out: string[] = [];
    for (const v of values) {
      const clean = String(v || "").trim();
      if (!clean) continue;
      if (!out.includes(clean)) out.push(clean);
    }
    return out;
  };

  const isValidCodiceFiscale = (cf: string) => {
    const code = (cf || "").trim().toUpperCase();
    if (!/^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(code))
      return false;

    const oddMap: Record<string, number> = {
      "0": 1,
      "1": 0,
      "2": 5,
      "3": 7,
      "4": 9,
      "5": 13,
      "6": 15,
      "7": 17,
      "8": 19,
      "9": 21,
      A: 1,
      B: 0,
      C: 5,
      D: 7,
      E: 9,
      F: 13,
      G: 15,
      H: 17,
      I: 19,
      J: 21,
      K: 2,
      L: 4,
      M: 18,
      N: 20,
      O: 11,
      P: 3,
      Q: 6,
      R: 8,
      S: 12,
      T: 14,
      U: 16,
      V: 10,
      W: 22,
      X: 25,
      Y: 24,
      Z: 23,
    };
    const evenMap: Record<string, number> = {
      "0": 0,
      "1": 1,
      "2": 2,
      "3": 3,
      "4": 4,
      "5": 5,
      "6": 6,
      "7": 7,
      "8": 8,
      "9": 9,
      A: 0,
      B: 1,
      C: 2,
      D: 3,
      E: 4,
      F: 5,
      G: 6,
      H: 7,
      I: 8,
      J: 9,
      K: 10,
      L: 11,
      M: 12,
      N: 13,
      O: 14,
      P: 15,
      Q: 16,
      R: 17,
      S: 18,
      T: 19,
      U: 20,
      V: 21,
      W: 22,
      X: 23,
      Y: 24,
      Z: 25,
    };

    let sum = 0;
    for (let i = 0; i < 15; i++) {
      const c = code[i];
      sum += (i + 1) % 2 === 0 ? evenMap[c] : oddMap[c];
    }
    const expected = String.fromCharCode(65 + (sum % 26));
    return expected === code[15];
  };

  const choosePreferredCodiceFiscale = (
    values: string[],
    targetValue: string,
    generatedByValue: Record<string, boolean>,
    targetGenerated: boolean,
  ) => {
    const candidates = uniqueValues(
      values.map((v) => String(v || "").toUpperCase()),
    ).filter(Boolean);
    if (candidates.length === 0) return "";
    const validCandidates = candidates.filter(isValidCodiceFiscale);
    const pool = validCandidates.length > 0 ? validCandidates : candidates;
    const nonGeneratedPool = pool.filter((cf) => !generatedByValue[cf]);
    const targetUpper = String(targetValue || "").toUpperCase();

    if (targetUpper && pool.includes(targetUpper) && !targetGenerated)
      return targetUpper;
    if (nonGeneratedPool.length > 0) return nonGeneratedPool[0];
    if (targetUpper && pool.includes(targetUpper)) return targetUpper;
    return pool[0];
  };

  const levenshteinDistanceAtMost = (
    a: string,
    b: string,
    maxDistance: number,
  ) => {
    if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
    const dp = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Number.MAX_SAFE_INTEGER;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
        rowMin = Math.min(rowMin, dp[i][j]);
      }
      if (rowMin > maxDistance) return maxDistance + 1;
    }
    return dp[a.length][b.length];
  };

  const areLikelyDuplicatePatients = (a: any, b: any) => {
    const nameA = normalizeName(a.nome || "");
    const nameB = normalizeName(b.nome || "");
    const surnameA = normalizeName(a.cognome || "");
    const surnameB = normalizeName(b.cognome || "");
    if (!nameA && !surnameA) return false;
    if (!nameB && !surnameB) return false;

    const exact = nameA === nameB && surnameA === surnameB;
    if (exact) return true;

    const sameSurnameNearName =
      surnameA === surnameB &&
      nameA.length >= 3 &&
      nameB.length >= 3 &&
      levenshteinDistanceAtMost(nameA, nameB, 1) <= 1;
    if (sameSurnameNearName) return true;

    const sameNameNearSurname =
      nameA === nameB &&
      surnameA.length >= 3 &&
      surnameB.length >= 3 &&
      levenshteinDistanceAtMost(surnameA, surnameB, 1) <= 1;
    if (sameNameNearSurname) return true;

    const swappedTokens =
      `${nameA} ${surnameA}`.trim() === `${surnameB} ${nameB}`.trim();
    return swappedTokens;
  };

  const loadDuplicateGroups = async () => {
    setLoadingDuplicates(true);
    setDuplicateCheckProgress(null);
    try {
      const patients = await PatientService.getAllPatients();
      const n = patients.length;
      setDuplicateCheckProgress({ current: 0, total: Math.max(1, n) });
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (x: number): number => {
        if (parent[x] !== x) parent[x] = find(parent[x]);
        return parent[x];
      };
      const union = (a: number, b: number) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[rb] = ra;
      };

      for (let i = 0; i < n; i++) {
        setDuplicateCheckProgress({ current: i + 1, total: Math.max(1, n) });
        if (i > 0 && i % 25 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
        for (let j = i + 1; j < n; j++) {
          if (areLikelyDuplicatePatients(patients[i], patients[j])) {
            union(i, j);
          }
        }
      }

      const groups = new Map<number, any[]>();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        const arr = groups.get(root) || [];
        arr.push(patients[i]);
        groups.set(root, arr);
      }

      const formatted = Array.from(groups.values())
        .filter((g) => g.length > 1)
        .map((g, idx) => ({
          key: `dup-${idx}-${g.map((p) => p.id).join("-")}`,
          patients: g.sort((a, b) =>
            (a.createdAt || "").localeCompare(b.createdAt || ""),
          ),
        }))
        .sort((a, b) => b.patients.length - a.patients.length);

      setDuplicateGroups(formatted);
    } catch (e) {
      console.error("Errore caricamento doppioni:", e);
      showNotice("duplicati", "error", "Errore durante il controllo doppioni.", 5000);
    } finally {
      setLoadingDuplicates(false);
      setDuplicateCheckProgress(null);
    }
  };

  const requestDeleteDuplicatePatient = (
    patientId: string,
    nome?: string,
    cognome?: string,
  ) => {
    const label =
      nome && cognome ? `${nome} ${cognome}` : "questo paziente";
    setDuplicatePatientToDelete({ id: patientId, label });
    onDeleteDuplicateOpen();
  };

  const confirmDeleteDuplicatePatient = async () => {
    if (!duplicatePatientToDelete) return;
    const patientId = duplicatePatientToDelete.id;
    setProcessingDuplicateId(patientId);
    clearNotice("duplicati");
    try {
      await PatientService.deletePatient(patientId);
      showNotice("duplicati", "success", "Paziente duplicato eliminato.");
      const [patients, visits] = await Promise.all([
        PatientService.getAllPatients(),
        VisitService.getAllVisits(),
      ]);
      setPatientCount(patients.length);
      setVisitCount(visits.length);
      setDuplicateGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            patients: g.patients.filter((p) => p.id !== patientId),
          }))
          .filter((g) => g.patients.length > 1),
      );
      onDeleteDuplicateClose();
      setDuplicatePatientToDelete(null);
    } catch (e: any) {
      showNotice(
        "duplicati",
        "error",
        "Errore durante eliminazione duplicato: " + (e?.message || "errore"),
        5000,
      );
    } finally {
      setProcessingDuplicateId(null);
    }
  };

  const executeMergeDuplicateGroup = async (
    groupKey: string,
    target: any,
    sources: any[],
    payload: Record<string, any>,
  ) => {
    setProcessingDuplicateGroupKey(groupKey);
    setProcessingDuplicateId(target.id);
    clearNotice("duplicati");
    try {
      for (const source of sources) {
        const visits = await VisitService.getVisitsByPatientId(source.id);
        for (const visit of visits) {
          await VisitService.updateVisit(visit.id, { patientId: target.id });
        }
      }

      if (Object.keys(payload).length > 0) {
        await PatientService.updatePatient(target.id, payload);
      }

      for (const source of sources) {
        await PatientService.deletePatient(source.id);
      }

      setDuplicateGroups((prev) => prev.filter((g) => g.key !== groupKey));
      const [patients, visits] = await Promise.all([
        PatientService.getAllPatients(),
        VisitService.getAllVisits(),
      ]);
      setPatientCount(patients.length);
      setVisitCount(visits.length);
      showNotice(
        "duplicati",
        "success",
        `Doppioni uniti con successo (mantenuto: ${target.nome} ${target.cognome}).`,
      );
    } catch (e: any) {
      showNotice(
        "duplicati",
        "error",
        "Errore durante merge duplicati: " + (e?.message || "errore"),
        5000,
      );
    } finally {
      setProcessingDuplicateGroupKey(null);
      setProcessingDuplicateId(null);
    }
  };

  type ConflictField = {
    key: string;
    label: string;
    options: string[];
    defaultValue: string;
    generatedByValue?: Record<string, boolean>;
  };

  const buildMergeData = (groupPatients: any[]) => {
    if (!groupPatients || groupPatients.length < 2) return null;
    const completenessScore = (p: any) =>
      [
        p.nome,
        p.cognome,
        p.dataNascita,
        p.luogoNascita,
        p.email,
        p.telefono,
        p.indirizzo,
        p.codiceFiscale,
      ].filter((v) => !!String(v || "").trim()).length;

    const sorted = [...groupPatients].sort(
      (a, b) => completenessScore(b) - completenessScore(a),
    );
    const target = sorted[0];
    const sources = sorted.slice(1);
    const all = [target, ...sources];

    const fieldDefs = [
      { key: "codiceFiscale", label: "Codice Fiscale" },
      { key: "telefono", label: "Telefono" },
      { key: "email", label: "Email" },
      { key: "dataNascita", label: "Data di nascita" },
      { key: "luogoNascita", label: "Luogo di nascita" },
      { key: "indirizzo", label: "Indirizzo" },
    ];

    const basePayload: Record<string, any> = {};
    const conflictFields: ConflictField[] = [];

    for (const field of fieldDefs) {
      const rawValues = uniqueValues(
        all.map((p) => {
          const raw = String(p[field.key] || "").trim();
          return field.key === "codiceFiscale" ? raw.toUpperCase() : raw;
        }),
      );
      if (rawValues.length === 0) continue;

      const generatedByValue: Record<string, boolean> = {};
      if (field.key === "codiceFiscale") {
        for (const p of all) {
          const raw = String(p.codiceFiscale || "")
            .trim()
            .toUpperCase();
          if (!raw) continue;
          generatedByValue[raw] =
            generatedByValue[raw] || Boolean(p.codiceFiscaleGenerato);
        }
      }

      const normalizedUnique = uniqueValues(
        rawValues.map((v) => normalizeFieldValue(field.key, v)),
      );
      const hasConflict = normalizedUnique.length > 1;

      if (!hasConflict) {
        const mergedValue = rawValues[0];
        if (
          mergedValue &&
          String(target[field.key] || "").trim() !== mergedValue
        ) {
          basePayload[field.key] = mergedValue;
        }
        if (
          field.key === "codiceFiscale" &&
          mergedValue &&
          Boolean(target.codiceFiscaleGenerato) !==
            Boolean(generatedByValue[mergedValue])
        ) {
          basePayload.codiceFiscaleGenerato = Boolean(
            generatedByValue[mergedValue],
          );
        }
        continue;
      }

      const defaultValue =
        field.key === "codiceFiscale"
          ? choosePreferredCodiceFiscale(
              rawValues,
              target.codiceFiscale,
              generatedByValue,
              Boolean(target.codiceFiscaleGenerato),
            )
          : String(target[field.key] || "").trim() || rawValues[0];

      conflictFields.push({
        key: field.key,
        label: field.label,
        options: rawValues,
        defaultValue,
        generatedByValue:
          field.key === "codiceFiscale" ? generatedByValue : undefined,
      });
    }

    return { target, sources, basePayload, conflictFields };
  };

  const mergeDuplicateGroup = async (
    groupKey: string,
    groupPatients: any[],
  ) => {
    const data = buildMergeData(groupPatients);
    if (!data) return;

    if (data.conflictFields.length === 0) {
      await executeMergeDuplicateGroup(
        groupKey,
        data.target,
        data.sources,
        data.basePayload,
      );
      return;
    }

    const initialSelections: Record<string, string> = {};
    for (const f of data.conflictFields) {
      initialSelections[f.key] = f.defaultValue;
    }

    setMergeConflictData({
      groupKey,
      target: data.target,
      sources: data.sources,
      conflictFields: data.conflictFields,
      basePayload: data.basePayload,
    });
    setMergeSelections(initialSelections);
    setMergeConflictOpen(true);
  };

  const mergeDuplicateGroupAuto = async (
    groupKey: string,
    groupPatients: any[],
  ) => {
    const data = buildMergeData(groupPatients);
    if (!data) return;
    const finalPayload: Record<string, any> = { ...data.basePayload };
    for (const f of data.conflictFields) {
      finalPayload[f.key] = f.defaultValue;
      if (f.key === "codiceFiscale") {
        finalPayload.codiceFiscaleGenerato = Boolean(
          f.generatedByValue?.[f.defaultValue],
        );
      }
    }
    await executeMergeDuplicateGroup(
      groupKey,
      data.target,
      data.sources,
      finalPayload,
    );
  };

  const [mergingAll, setMergingAll] = useState(false);

  const mergeAllDuplicateGroups = async () => {
    if (duplicateGroups.length === 0) return;
    if (
      !confirm(
        `Unire tutti i ${duplicateGroups.length} gruppi di doppioni? Per ogni gruppo verrà mantenuto il paziente con più dati e i conflitti risolti con i valori predefiniti.`,
      )
    )
      return;
    clearNotice("duplicati");
    setMergingAll(true);
    const groups = [...duplicateGroups];
    let done = 0;
    try {
      for (const group of groups) {
        await mergeDuplicateGroupAuto(group.key, group.patients);
        done += 1;
      }
      showNotice("duplicati", "success", `Uniti ${done} gruppi di doppioni.`, 5000);
    } catch (e: any) {
      showNotice(
        "duplicati",
        "error",
        `Errore durante unione gruppi: ${e?.message || "errore"}. Uniti ${done} di ${groups.length}.`,
        5000,
      );
    } finally {
      setMergingAll(false);
    }
  };

  const confirmMergeWithSelections = async () => {
    if (!mergeConflictData) return;
    const { groupKey, target, sources, conflictFields, basePayload } =
      mergeConflictData;
    const finalPayload: Record<string, any> = { ...basePayload };

    for (const field of conflictFields) {
      const selected = String(
        mergeSelections[field.key] || field.defaultValue || "",
      ).trim();
      const targetValue = String(target[field.key] || "").trim();
      if (selected && selected !== targetValue) {
        finalPayload[field.key] = selected;
      }
      if (field.key === "codiceFiscale") {
        finalPayload.codiceFiscaleGenerato = Boolean(
          field.generatedByValue?.[selected],
        );
      }
    }

    setMergeConflictOpen(false);
    setMergeConflictData(null);
    setMergeSelections({});
    await executeMergeDuplicateGroup(groupKey, target, sources, finalPayload);
  };

  const filteredDuplicateGroups = useMemo(() => {
    const q = normalizeSearchText(duplicateSearch);
    if (!q) return duplicateGroups;

    return duplicateGroups
      .map((group) => {
        const filteredPatients = group.patients.filter((p) => {
          const fullName = `${p.nome || ""} ${p.cognome || ""}`;
          const haystack = normalizeSearchText(
            `${fullName} ${p.codiceFiscale || ""} ${p.email || ""} ${p.telefono || ""} ${p.dataNascita || ""}`,
          );
          return haystack.includes(q);
        });
        return { ...group, patients: filteredPatients };
      })
      .filter((group) => group.patients.length > 0);
  }, [duplicateGroups, duplicateSearch]);

  /** Salva i dati dottore (con eventuale lista ambulatori passata). Usato per salvataggio immediato dopo azioni ambulatori. */
  const saveDoctorData = async (ambulatoriList?: any[]) => {
    const list = ambulatoriList !== undefined ? ambulatoriList : ambulatori;
    clearNotice("ambulatori");
    try {
      await DoctorService.updateDoctor({
        nome: doctorInfo.nome.trim(),
        cognome: doctorInfo.cognome.trim(),
        email: doctorInfo.email.trim(),
        telefono: doctorInfo.telefono.trim(),
        specializzazione: doctorInfo.specializzazione.trim(),
        ambulatori: list,
      });
      savePreferences();
      window.dispatchEvent(new CustomEvent("appdottori-doctor-updated"));
    } catch (e) {
      console.error("Errore salvataggio:", e);
      showNotice(
        "ambulatori",
        "error",
        "Errore nel salvataggio: " + (e as Error).message,
        5000,
      );
      throw e;
    }
  };

  const addAmbulatorio = async () => {
    if (!newAmbulatorio.nome.trim() || !newAmbulatorio.indirizzo.trim()) {
      showNotice("ambulatori", "error", "Nome e indirizzo ambulatorio sono obbligatori", 5000);
      return;
    }
    clearNotice("ambulatori");

    const ambulatorio = {
      id: Date.now().toString(),
      ...newAmbulatorio,
      isPrimario: ambulatori.length === 0,
    };

    const newList = [...ambulatori, ambulatorio];
    setAmbulatori(newList);
    setNewAmbulatorio({
      nome: "",
      indirizzo: "",
      citta: "",
      cap: "",
      telefono: "",
      email: "",
      isPrimario: false,
    });

    setSavingAmbulatori(true);
    try {
      await saveDoctorData(newList);
      showNotice("ambulatori", "success", "Ambulatorio aggiunto e salvato.");
    } catch {
      setAmbulatori(ambulatori);
    } finally {
      setSavingAmbulatori(false);
    }
  };

  const removeAmbulatorio = async (id: string) => {
    const previousList = ambulatori;
    const removed = previousList.find((amb) => amb.id === id);
    let newList = previousList.filter((amb) => amb.id !== id);
    if (removed?.isPrimario && newList.length > 0) {
      newList = newList.map((amb, index) => ({
        ...amb,
        isPrimario: index === 0,
      }));
    }
    setAmbulatori(newList);
    setSavingAmbulatori(true);
    try {
      await saveDoctorData(newList);
      showNotice("ambulatori", "success", "Ambulatorio rimosso e modifiche salvate.");
    } catch (e) {
      setAmbulatori(previousList);
      throw e;
    } finally {
      setSavingAmbulatori(false);
    }
  };

  const openEditAmbulatorio = (amb: (typeof ambulatori)[number]) => {
    setEditAmbulatorio({
      id: amb.id,
      nome: amb.nome,
      indirizzo: amb.indirizzo,
      citta: amb.citta || "",
      cap: amb.cap || "",
      telefono: amb.telefono || "",
      email: amb.email || "",
    });
    onEditAmbulatorioOpen();
  };

  const saveEditAmbulatorio = async () => {
    if (!editAmbulatorio) return;
    if (!editAmbulatorio.nome.trim() || !editAmbulatorio.indirizzo.trim()) {
      showNotice("ambulatori", "error", "Nome e indirizzo ambulatorio sono obbligatori", 5000);
      return;
    }
    clearNotice("ambulatori");

    const newList = ambulatori.map((amb) =>
      amb.id === editAmbulatorio.id ? { ...amb, ...editAmbulatorio } : amb,
    );
    setAmbulatori(newList);
    setSavingAmbulatori(true);
    try {
      await saveDoctorData(newList);
      showNotice("ambulatori", "success", "Ambulatorio aggiornato.");
      onEditAmbulatorioClose();
      setEditAmbulatorio(null);
    } catch {
      setAmbulatori(ambulatori);
    } finally {
      setSavingAmbulatori(false);
    }
  };

  const requestDeleteAmbulatorio = (amb: { id: string; nome: string }) => {
    setAmbulatorioToDelete(amb);
    onDeleteAmbulatorioOpen();
  };

  const confirmDeleteAmbulatorio = async () => {
    if (!ambulatorioToDelete || savingAmbulatori) return;
    const { id } = ambulatorioToDelete;
    try {
      await removeAmbulatorio(id);
      onDeleteAmbulatorioClose();
      setAmbulatorioToDelete(null);
    } catch {
      // Errore già mostrato nella sezione Ambulatori; tieni il modale aperto.
    }
  };

  const setPrimario = async (id: string) => {
    const newList = ambulatori.map((amb) => ({
      ...amb,
      isPrimario: amb.id === id,
    }));
    setAmbulatori(newList);
    setSavingAmbulatori(true);
    try {
      await saveDoctorData(newList);
      showNotice("ambulatori", "success", "Sede in uso aggiornata.");
    } catch {
      setAmbulatori(ambulatori);
    } finally {
      setSavingAmbulatori(false);
    }
  };

  const saveDoctorInfo = async () => {
    setIsLoading(true);
    clearNotice("profilo");
    const profileToValidate: {
      nome: string;
      cognome: string;
      email: string;
      telefono: string;
      specializzazione: string;
    } = {
      ...doctorInfo,
      nome: doctorInfo.nome.trim(),
      cognome: doctorInfo.cognome.trim(),
      email: doctorInfo.email.trim(),
      telefono: doctorInfo.telefono.trim(),
      specializzazione: doctorInfo.specializzazione.trim(),
    };
    const missingFields = getMissingDoctorProfileFields(profileToValidate);
    if (missingFields.length > 0) {
      showNotice(
        "profilo",
        "error",
        `Compila tutti i campi obbligatori del profilo: ${missingFields.join(", ")}.`,
        5000,
      );
      setIsLoading(false);
      return;
    }

    try {
      await DoctorService.updateDoctor({
        nome: doctorInfo.nome.trim(),
        cognome: doctorInfo.cognome.trim(),
        email: doctorInfo.email.trim(),
        telefono: doctorInfo.telefono.trim(),
        specializzazione: doctorInfo.specializzazione.trim(),
        ambulatori: ambulatori,
        signatureStampImage: signatureStampImage || undefined,
      });

      savePreferences();
      window.dispatchEvent(new CustomEvent("appdottori-doctor-updated"));
      showNotice("profilo", "success", "Profilo salvato con successo.");
    } catch (error) {
      console.error("Errore nel salvataggio:", error);
      showNotice(
        "profilo",
        "error",
        "Errore nel salvataggio dei dati: " + (error as Error).message,
        5000,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="corioli-page space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <PageHeader
        title="Impostazioni"
        subtitle="Personalizza la tua esperienza dell'applicazione"
        icon={SettingsIcon}
        iconColor="primary"
      />

      {/* ── Sicurezza & Aggiornamenti ── */}
      {(isAppLockAvailable() || typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== "undefined") ? (
        <div>
          <p className="section-label">Sicurezza</p>
          <Card className="shadow-sm border border-default-200 overflow-hidden">
            <CardBody className="p-0">
              {isAppLockAvailable() ? <AppLockSettingsCard /> : null}

              {typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== "undefined" ? (
                <div className="settings-row">
                  <div
                    className="flex items-center justify-center shrink-0 rounded-lg"
                    style={{ width: 30, height: 30, background: "#e1f5ee" }}
                  >
                    <ArrowUpCircle size={16} color="#0f6e56" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-[500] text-foreground leading-snug">
                      Controlla aggiornamenti
                    </p>
                    <p className="text-[12px] leading-snug mt-0.5">
                      <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>
                        Microsoft Store
                      </span>
                      <span style={{ color: "var(--color-text-tertiary)" }}>
                        {" "}→ Libreria → Corioli Cardiologia
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="settings-ghost-btn settings-ghost-btn--teal"
                    onClick={() => void openCorioliMicrosoftStore()}
                  >
                    <ExternalLink size={13} />
                    Apri Store
                  </button>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:items-stretch [&>*]:h-full [&>*]:min-h-0">
          {/* Profilo Dottore */}
          <Card
            className="shadow-lg w-full"
            classNames={{
              base: "h-full flex flex-col min-h-0",
              body: "flex flex-1 flex-col gap-6 min-h-0",
            }}
          >
            <CardHeader className="pb-2 flex-shrink-0">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-gray-900">
                  Profilo Dottore
                </h2>
              </div>
            </CardHeader>
            <CardBody>
              <SettingsSectionNotice scope="profilo" notice={notice} />
              <div className="flex flex-1 flex-col justify-between gap-5 py-1 min-h-0">
                <Input
                  label="Nome"
                  value={doctorInfo.nome}
                  isRequired
                  onValueChange={(value) =>
                    handleDoctorInfoChange("nome", value)
                  }
                  variant="bordered"
                />
                <Input
                  label="Cognome"
                  value={doctorInfo.cognome}
                  isRequired
                  onValueChange={(value) =>
                    handleDoctorInfoChange("cognome", value)
                  }
                  variant="bordered"
                />
                <Input
                  label="Email"
                  type="email"
                  value={doctorInfo.email}
                  isRequired
                  onValueChange={(value) =>
                    handleDoctorInfoChange("email", value)
                  }
                  variant="bordered"
                />
                <Input
                  label="Telefono"
                  value={doctorInfo.telefono}
                  isRequired
                  onValueChange={(value) =>
                    handleDoctorInfoChange("telefono", value)
                  }
                  variant="bordered"
                  placeholder="3331234567"
                />
                <Input
                  label="Specializzazione"
                  value={doctorInfo.specializzazione}
                  isRequired
                  onValueChange={(value) =>
                    handleDoctorInfoChange("specializzazione", value)
                  }
                  variant="bordered"
                  placeholder="Es. Cardiologia"
                />
              </div>

              <Button
                color="primary"
                className="corioli-cta w-full mt-auto"
                onPress={saveDoctorInfo}
                isLoading={isLoading}
              >
                {isLoading ? "Salvando..." : "Salva Modifiche"}
              </Button>
            </CardBody>
          </Card>

          {/* Ambulatori */}
          <Card
            className="shadow-lg w-full"
            classNames={{
              base: "h-full flex flex-col min-h-0",
              body: "flex flex-1 flex-col gap-3 min-h-0",
            }}
          >
            <CardHeader className="pb-2 flex-shrink-0">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-primary shrink-0" />
                <h2 className="text-xl font-semibold text-gray-900">
                  Ambulatori
                </h2>
              </div>
            </CardHeader>
            <CardBody>
              <SettingsSectionNotice scope="ambulatori" notice={notice} />
              {/* Lista ambulatori — scroll solo se > 2 sedi */}
              <div className="rounded-lg border border-default-200 bg-default-50/50 p-3 flex-shrink-0">
                {ambulatori.length > 0 ? (
                  <>
                    <h3 className="font-medium text-gray-900 text-sm mb-2 px-0.5">
                      Ambulatori Configurati
                    </h3>
                    <div
                      className={`corioli-scroll space-y-2 pr-1 ${
                        ambulatori.length > 2
                          ? "max-h-[14.5rem] overflow-y-auto overflow-x-hidden"
                          : ""
                      }`}
                      aria-label="Lista ambulatori configurati"
                    >
                      {ambulatori.map((amb) => (
                        <Card
                          key={amb.id}
                          shadow="none"
                          className={`bg-white border flex-shrink-0 transition-colors ${
                            amb.isPrimario
                              ? "border-primary/40 ring-1 ring-primary/20"
                              : "border-default-200 hover:border-primary/40 cursor-pointer"
                          }`}
                        >
                          <CardBody className="p-3 gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              {!amb.isPrimario ? (
                                <button
                                  type="button"
                                  disabled={savingAmbulatori}
                                  onClick={() => void setPrimario(amb.id)}
                                  className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left transition-colors hover:bg-default-50 disabled:cursor-default disabled:opacity-60"
                                  aria-label={`Usa ${amb.nome} come sede attiva`}
                                >
                                  <Tooltip content="Clicca per usare questa sede">
                                    <span
                                      className="mt-0.5 inline-flex shrink-0 rounded-full p-0.5 text-default-300"
                                      aria-hidden
                                    >
                                      <Circle className="w-4 h-4" />
                                    </span>
                                  </Tooltip>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex min-h-[26px] min-w-0 items-center gap-2">
                                      <h4 className="truncate text-sm font-semibold text-gray-900">
                                        {amb.nome}
                                      </h4>
                                      <Chip
                                        size="sm"
                                        color="primary"
                                        variant="flat"
                                        className="invisible flex-shrink-0"
                                        aria-hidden
                                      >
                                        In uso
                                      </Chip>
                                    </div>
                                    <p className="mt-1 text-xs leading-snug text-gray-600">
                                      {amb.indirizzo}, {amb.cap} {amb.citta}
                                    </p>
                                    <p className="min-h-[1rem] text-xs leading-snug text-gray-500">
                                      {amb.telefono && `Tel. ${amb.telefono}`}
                                      {amb.telefono && amb.email && " · "}
                                      {amb.email}
                                      {!amb.telefono && !amb.email ? "\u00A0" : ""}
                                    </p>
                                  </div>
                                </button>
                              ) : (
                                <div className="flex min-w-0 flex-1 items-start gap-2">
                                  <Tooltip content="Sede attualmente in uso">
                                    <span
                                      className="mt-0.5 inline-flex shrink-0 rounded-full p-0.5 corioli-text-brand"
                                      aria-hidden
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </span>
                                  </Tooltip>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex min-h-[26px] min-w-0 items-center gap-2">
                                      <h4 className="truncate text-sm font-semibold text-gray-900">
                                        {amb.nome}
                                      </h4>
                                      <Chip
                                        size="sm"
                                        color="primary"
                                        variant="flat"
                                        className="flex-shrink-0"
                                      >
                                        In uso
                                      </Chip>
                                    </div>
                                    <p className="mt-1 text-xs leading-snug text-gray-600">
                                      {amb.indirizzo}, {amb.cap} {amb.citta}
                                    </p>
                                    <p className="min-h-[1rem] text-xs leading-snug text-gray-500">
                                      {amb.telefono && `Tel. ${amb.telefono}`}
                                      {amb.telefono && amb.email && " · "}
                                      {amb.email}
                                      {!amb.telefono && !amb.email ? "\u00A0" : ""}
                                    </p>
                                  </div>
                                </div>
                              )}
                              <div className="flex shrink-0 gap-0.5">
                                <Tooltip content="Modifica">
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    onPress={() => openEditAmbulatorio(amb)}
                                    isDisabled={savingAmbulatori}
                                    aria-label="Modifica ambulatorio"
                                  >
                                    <Edit size={16} />
                                  </Button>
                                </Tooltip>
                                <Tooltip content="Elimina">
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    color="danger"
                                    onPress={() =>
                                      requestDeleteAmbulatorio({
                                        id: amb.id,
                                        nome: amb.nome,
                                      })
                                    }
                                    isDisabled={savingAmbulatori}
                                    aria-label="Elimina ambulatorio"
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </Tooltip>
                              </div>
                            </div>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
                    Nessun ambulatorio configurato. Aggiungine uno qui sotto.
                  </p>
                )}
              </div>

              <Divider className="flex-shrink-0" />

              {/* Form nuovo ambulatorio — ancorato in basso */}
              <div className="flex flex-col gap-2 flex-shrink-0 mt-auto">
                <h3 className="font-medium text-gray-900 text-sm">
                  Aggiungi Nuovo Ambulatorio
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    size="sm"
                    label="Nome Ambulatorio"
                    value={newAmbulatorio.nome}
                    onValueChange={(value) =>
                      setNewAmbulatorio((prev) => ({ ...prev, nome: value }))
                    }
                    variant="bordered"
                    placeholder="Studio Medico"
                  />
                  <Input
                    size="sm"
                    label="Telefono"
                    value={newAmbulatorio.telefono}
                    onValueChange={(value) =>
                      setNewAmbulatorio((prev) => ({
                        ...prev,
                        telefono: value,
                      }))
                    }
                    variant="bordered"
                    placeholder="0612345678"
                  />
                </div>
                <Input
                  size="sm"
                  label="Indirizzo"
                  value={newAmbulatorio.indirizzo}
                  onValueChange={(value) =>
                    setNewAmbulatorio((prev) => ({ ...prev, indirizzo: value }))
                  }
                  variant="bordered"
                  placeholder="Via Roma 10"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    size="sm"
                    label="Città"
                    value={newAmbulatorio.citta}
                    onValueChange={(value) =>
                      setNewAmbulatorio((prev) => ({ ...prev, citta: value }))
                    }
                    variant="bordered"
                    placeholder="Roma"
                  />
                  <Input
                    size="sm"
                    label="CAP"
                    value={newAmbulatorio.cap}
                    onValueChange={(value) =>
                      setNewAmbulatorio((prev) => ({ ...prev, cap: value }))
                    }
                    variant="bordered"
                    placeholder="00100"
                  />
                  <Input
                    size="sm"
                    label="Email"
                    type="email"
                    value={newAmbulatorio.email}
                    onValueChange={(value) =>
                      setNewAmbulatorio((prev) => ({ ...prev, email: value }))
                    }
                    variant="bordered"
                    placeholder="Opzionale"
                  />
                </div>
                <Button
                  color="primary"
                  className="corioli-cta w-full"
                  onPress={addAmbulatorio}
                  isLoading={savingAmbulatori}
                  isDisabled={savingAmbulatori}
                >
                  {savingAmbulatori ? "Salvataggio..." : "Aggiungi Ambulatorio"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Backup e Dati */}
          <Card className="shadow-lg h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-primary shrink-0" />
                <h2 className="text-xl font-semibold text-gray-900">
                  Backup e Dati
                </h2>
              </div>
            </CardHeader>
            <CardBody className="flex flex-col space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-primary-50 rounded-lg border border-primary-100">
                    <p className="text-xs text-primary-600 font-semibold uppercase tracking-wider">
                      Pazienti
                    </p>
                    <p className="text-2xl font-bold text-primary-700 mt-1">
                      {patientCount}
                    </p>
                  </div>
                  <div className="p-3 bg-brand-100 rounded-lg border border-brand-200">
                    <p className="text-xs text-brand-800 font-semibold uppercase tracking-wider">
                      Visite
                    </p>
                    <p className="text-2xl font-bold text-brand-700 mt-1">
                      {visitCount}
                    </p>
                  </div>
                  <div className="p-3 bg-default-50 rounded-lg border border-default-200">
                    <p className="text-xs text-default-600 font-semibold uppercase tracking-wider">
                      Doc
                    </p>
                    <p className="text-2xl font-bold text-default-700 mt-1">
                      {docCount}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-default-200 p-4 bg-default-50/30 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <RefreshCw className="w-4 h-4" />
                      <span>Ultimo backup</span>
                    </div>
                    <span
                      className={`font-semibold ${!lastBackupDate ? "text-warning-600" : "corioli-text-brand"}`}
                    >
                      {lastBackupDate
                        ? new Date(lastBackupDate).toLocaleDateString() +
                          " " +
                          new Date(lastBackupDate).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Mai eseguito"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-default-200 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <Shield className="w-4 h-4 text-primary shrink-0" />
                    Privacy e diritti
                  </div>
                  <Button
                    size="sm"
                    variant="bordered"
                    startContent={<Download className="w-3.5 h-3.5" />}
                    onPress={() => void ExportService.exportDataAccessPackage()}
                  >
                    Esporta dati (JSON)
                  </Button>
                </div>
                <p className="text-xs text-default-500">
                  Esporta il pacchetto per il diritto di accesso. Richieste
                  privacy:{" "}
                  <a
                    href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                    className="text-primary font-medium hover:underline"
                  >
                    {PRIVACY_CONTACT_EMAIL}
                  </a>{" "}
                  &middot;{" "}
                  <a
                    href={PRIVACY_POLICY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-medium hover:underline inline-flex items-center gap-0.5"
                  >
                    Informativa <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              <div className="space-y-3 mt-auto">
                <div className="w-full [&>button]:w-full">
                  <BackupManager />
                </div>

                <p className="text-xs text-center text-default-400 px-4">
                  Gestione avanzata permette importazioni, cancellazioni e reset.
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Funzionalita Visite */}
          <Card className="shadow-lg h-full">
            <CardHeader className="pb-1">
              <div className="flex items-center gap-3">
                <SettingsIcon className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Funzionalita Visite
                  </h2>
                  <p className="text-xs text-default-500">
                    Configura comportamento visite e contenuto PDF
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="rounded-lg border border-default-200 bg-default-50/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      Struttura anamnesi
                    </p>
                    <p className="text-xs text-default-500 mt-1">
                      Campo unico oppure sezioni multiple (attivabili,
                      rinominabili e riordinabili).
                    </p>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {ANAMNESI_VISIT_TYPES.map((tipo) => {
                        const cfg = preferences.anamnesiConfig[tipo];
                        return (
                          <div
                            key={tipo}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="text-gray-600 w-44 shrink-0">
                              {ANAMNESI_VISIT_TYPE_LABELS[tipo]}
                            </span>
                            <Chip
                              size="sm"
                              variant="flat"
                              color={
                                cfg.mode === "strutturata"
                                  ? "primary"
                                  : "default"
                              }
                            >
                              {cfg.mode === "strutturata"
                                ? `Multi-sezione · ${cfg.campi.length} sezioni`
                                : "Campo unico"}
                            </Chip>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    className="shrink-0"
                    startContent={<SettingsIcon size={16} />}
                    onPress={() => setIsAnamnesiConfigModalOpen(true)}
                  >
                    Configura
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-default-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      Gruppi di ricerca
                    </p>
                    <p className="text-xs text-default-500 mt-1">
                      Arruola i pazienti nei tuoi progetti e ritrovali insieme
                      dalla pagina Gruppi di ricerca.
                    </p>
                  </div>
                  <Switch
                    aria-label="Attiva i gruppi di ricerca"
                    className="shrink-0"
                    isSelected={Boolean(preferences.gruppiRicercaEnabled)}
                    onValueChange={(value) =>
                      handlePreferenceChange("gruppiRicercaEnabled", value)
                    }
                  />
                </div>
              </div>

              {/* Moduli opzionali della visita.
                  Decisi nella call del 18 settembre 2026: la maschera che un
                  cardiologo trova alla prima apertura e' quella scarna, e i
                  moduli che usa di rado se li accende lui uno per uno. In
                  pagina resta la sintesi, l'elenco sta nel modal come per la
                  struttura anamnesi: sette interruttori in fila allungavano le
                  impostazioni piu' di quanto valessero. */}
              <div className="rounded-lg border border-default-200 bg-default-50/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      Moduli della visita
                    </p>
                    <p className="text-xs text-default-500 mt-1">
                      La visita comprende sempre anamnesi, esame obiettivo,
                      pressione, elettrocardiogramma, ecocardiogramma,
                      laboratorio, rischio cardiovascolare e conclusioni. Gli
                      altri moduli si accendono uno per uno.
                    </p>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {GRUPPI_MODULI.map(({ gruppo, titolo }) => {
                        const attivi = moduliAttiviDelGruppo(gruppo);
                        const totale = moduliDelGruppo(gruppo).length;
                        return (
                          <div
                            key={gruppo}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="text-gray-600 w-44 shrink-0">
                              {titolo}
                            </span>
                            <Chip
                              size="sm"
                              variant="flat"
                              color={attivi > 0 ? "primary" : "default"}
                            >
                              {attivi > 0
                                ? `${attivi} di ${totale} attivi`
                                : "Nessuno attivo"}
                            </Chip>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    className="shrink-0"
                    startContent={<SettingsIcon size={16} />}
                    onPress={() => setIsModuliConfigModalOpen(true)}
                  >
                    Configura
                  </Button>
                </div>
              </div>

              {/* Il prontuario e' spento di default per una ragione che non e'
                  di ingombro: le schede sono contenuto clinico, e finche' non
                  sono complete e validate non devono uscire dall'app di chi non
                  le ha scritte. */}
              <div className="rounded-lg border border-default-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      Prontuario
                    </p>
                    <p className="text-xs text-default-500 mt-1">
                      Schede di consultazione richiamabili dalla visita:
                      pilastri e farmaci, classi di rischio, classi dello
                      scompenso, calcium score e CAD-RADS. Sono in revisione
                      clinica: restano spente finché non le attivi.
                    </p>
                  </div>
                  <Switch
                    aria-label="Rendi consultabile il prontuario"
                    className="shrink-0"
                    isSelected={Boolean(preferences.prontuarioEnabled)}
                    onValueChange={(value) =>
                      handlePreferenceChange("prontuarioEnabled", value)
                    }
                  />
                </div>
              </div>

              <div className="rounded-lg border border-default-200 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-800">
                  Dati dottore nel PDF
                </p>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-default-700">Mostra telefono</p>
                  <Switch
                    aria-label="Mostra telefono nel PDF"
                    isSelected={Boolean(preferences.showDoctorPhoneInPdf)}
                    onValueChange={(value) =>
                      handlePreferenceChange("showDoctorPhoneInPdf", value)
                    }
                  />
                </div>
                <Divider />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-default-700">Mostra email</p>
                  <Switch
                    aria-label="Mostra email nel PDF"
                    isSelected={Boolean(preferences.showDoctorEmailInPdf)}
                    onValueChange={(value) =>
                      handlePreferenceChange("showDoctorEmailInPdf", value)
                    }
                  />
                </div>
              </div>

              {/* La soglia oltre cui la calcificazione coronarica si dice
                  severa non è universale: alcuni centri usano 300, altri 400.
                  È quindi un'impostazione del centro e non una costante, e la
                  categoria mostrata dichiara sempre quale soglia ha applicato. */}
              <div className="rounded-lg border border-default-200 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-800">
                  Calcium score coronarico
                </p>
                {/* Qui non si inserisce nessun punteggio, e il malinteso e'
                    costato una telefonata: il valore Agatston del paziente si
                    scrive nel modulo TC coronarica della visita, questa e'
                    solo la soglia con cui il referto lo chiama severo. */}
                <p className="text-xs text-default-500">
                  Il punteggio del singolo paziente si inserisce nel modulo
                  &laquo;TC coronarica&raquo; della visita. Qui si sceglie solo
                  la soglia con cui il referto lo definisce severo.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-default-700">
                      Soglia di calcificazione severa
                    </p>
                    <p className="text-xs text-default-500">
                      Agatston oltre il quale il referto parla di calcificazione
                      severa. Le fasce sotto restano le stesse: 0 nessuna
                      calcificazione, 1-99 lieve, 100-299 moderata.
                    </p>
                  </div>
                  <Select
                    aria-label="Soglia di calcificazione severa"
                    size="sm"
                    className="w-36 shrink-0"
                    selectedKeys={[String(preferences.sogliaCacSevera ?? SOGLIA_CAC_PREDEFINITA)]}
                    onSelectionChange={(keys) => {
                      const v = Number(Array.from(keys)[0]);
                      if (v === 300 || v === 400) {
                        handlePreferenceChange("sogliaCacSevera", v);
                      }
                    }}
                  >
                    <SelectItem key="300">≥ 300</SelectItem>
                    <SelectItem key="400">≥ 400</SelectItem>
                  </Select>
                </div>
              </div>
            </CardBody>
          </Card>

        </div>
      </div>

      {/* Sezione dedicata: Qualità Dati Pazienti */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Qualità Dati Pazienti
          </h2>
          <p className="text-sm text-gray-600">
            Area dedicata al controllo dei possibili pazienti duplicati.
          </p>
        </div>

        <Card className="shadow-lg border border-warning-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between w-full gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-warning" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Controllo Doppioni
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Chip color="warning" variant="flat">
                  Gruppi: {duplicateGroups.length}
                </Chip>
                <Chip color="primary" variant="flat">
                  Record:{" "}
                  {duplicateGroups.reduce(
                    (acc, g) => acc + g.patients.length,
                    0,
                  )}
                </Chip>
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  onPress={loadDuplicateGroups}
                  isLoading={loadingDuplicates && !duplicateCheckProgress}
                >
                  {duplicateCheckProgress
                    ? `Analisi: ${duplicateCheckProgress.current} / ${duplicateCheckProgress.total}`
                    : "Controlla"}
                </Button>
                <Button
                  size="sm"
                  color="warning"
                  onPress={mergeAllDuplicateGroups}
                  isLoading={mergingAll}
                  isDisabled={
                    loadingDuplicates ||
                    duplicateGroups.length === 0 ||
                    !!processingDuplicateGroupKey
                  }
                >
                  {mergingAll ? "Unione in corso..." : "Unisci tutto"}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardBody className="space-y-4">
            <SettingsSectionNotice scope="duplicati" notice={notice} />
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <Input
                label="Ricerca nei sospetti doppioni"
                placeholder="Cerca per nome, cognome, codice fiscale, email o telefono"
                variant="bordered"
                value={duplicateSearch}
                onValueChange={setDuplicateSearch}
                startContent={<Search size={16} className="text-default-400" />}
              />
              {duplicateSearch && (
                <Button
                  variant="flat"
                  onPress={() => setDuplicateSearch("")}
                  className="md:mb-1"
                >
                  Pulisci ricerca
                </Button>
              )}
            </div>

            {loadingDuplicates ? (
              <div className="py-6 space-y-3 flex flex-col items-stretch">
                <span className="text-sm text-gray-500 text-center">
                  {duplicateCheckProgress
                    ? `Analisi doppioni: ${duplicateCheckProgress.current} / ${duplicateCheckProgress.total} pazienti`
                    : "Analisi doppioni in corso..."}
                </span>
                {duplicateCheckProgress && (
                  <Progress
                    size="md"
                    value={
                      (duplicateCheckProgress.current /
                        Math.max(1, duplicateCheckProgress.total)) *
                      100
                    }
                    color="warning"
                    className="max-w-full"
                    aria-label={`Analisi doppioni ${duplicateCheckProgress.current}/${duplicateCheckProgress.total}`}
                  />
                )}
              </div>
            ) : filteredDuplicateGroups.length === 0 ? (
              <div className="py-6 text-sm text-gray-500">
                {duplicateGroups.length === 0
                  ? "Nessun doppione sospetto trovato."
                  : "Nessun risultato per la ricerca corrente."}
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto overflow-x-hidden max-h-[28rem] md:max-h-[40rem] pr-1 md:pr-2">
                {filteredDuplicateGroups.map((group, gIdx) => (
                  <Card
                    key={group.key}
                    className="bg-warning-50 border border-warning-200"
                  >
                    <CardBody className="space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-medium text-warning-800">
                          Gruppo sospetto #{gIdx + 1} • {group.patients.length}{" "}
                          record
                        </p>
                        <Button
                          size="sm"
                          color="warning"
                          onPress={() =>
                            mergeDuplicateGroup(group.key, group.patients)
                          }
                          isLoading={processingDuplicateGroupKey === group.key}
                          isDisabled={group.patients.length < 2}
                        >
                          Unisci gruppo
                        </Button>
                      </div>

                      <Table aria-label={`Duplicati gruppo ${gIdx + 1}`}>
                        <TableHeader>
                          <TableColumn>PAZIENTE</TableColumn>
                          <TableColumn>CF / NASCITA</TableColumn>
                          <TableColumn>CONTATTI</TableColumn>
                          <TableColumn>AZIONI</TableColumn>
                        </TableHeader>
                        <TableBody>
                          {group.patients.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>
                                <p className="font-medium text-gray-900">
                                  {p.nome} {p.cognome}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-gray-700">
                                  CF:{" "}
                                  <CodiceFiscaleValue
                                    value={p.codiceFiscale}
                                    placeholder="—"
                                    generatedFromImport={Boolean(
                                      p.codiceFiscaleGenerato,
                                    )}
                                  />
                                </p>
                                <p className="text-xs text-gray-500">
                                  Nascita: {p.dataNascita || "—"}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-gray-700">
                                  Tel: {p.telefono || "—"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Email: {p.email || "—"}
                                </p>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  color="danger"
                                  variant="flat"
                                  onPress={() =>
                                    requestDeleteDuplicatePatient(
                                      p.id,
                                      p.nome,
                                      p.cognome,
                                    )
                                  }
                                  isLoading={processingDuplicateId === p.id}
                                  isDisabled={
                                    processingDuplicateGroupKey === group.key
                                  }
                                >
                                  Elimina record
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Gestione Modelli */}
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <h2 className="text-xl font-semibold text-gray-900">
              Gestione Modelli Referti
            </h2>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <SettingsSectionNotice scope="modelli" notice={notice} />
          <div className="flex flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Come funzionano i modelli referti?
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-default-600">
                  Guida rapida su uso e creazione.
                </p>
              </div>
            </div>
            <Button
              color="primary"
              variant="solid"
              className="corioli-cta shrink-0 sm:ml-4"
              startContent={<HelpCircle size={16} />}
              onPress={() => navigate("/help?topic=modelli-referti")}
            >
              Vai alla guida
            </Button>
          </div>
          <Tabs
            aria-label="Categorie Template"
            selectedKey={selectedCategory}
            onSelectionChange={(key) =>
              setSelectedCategory(key as MedicalTemplate["category"])
            }
          >
            <Tab key="visita" title="Visita" />
            <Tab key="terapie" title="Terapie" />
            <Tab key="ricette" title="Ricette" />
            <Tab key="esame_complementare" title="Esami" />
            <Tab key="certificato" title="Certificati" />
          </Tabs>

          {selectedCategory === "terapie" && (
            <div className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50/60 p-4">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-default-600">
                I modelli <strong>Terapie</strong> compaiono nella sezione{" "}
                <strong>Conclusioni e Terapie</strong> della visita. Scrivili in forma{" "}
                <strong>discorsiva</strong> (indicazioni e raccomandazioni). Per
                l&apos;elenco dei farmaci da stampare in ricetta usa la scheda{" "}
                <strong>Ricette</strong>.
              </p>
            </div>
          )}

          {selectedCategory === "ricette" && (
            <div className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50/60 p-4">
              <Pill className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-default-600">
                I modelli <strong>Ricette</strong> compaiono nel menu{" "}
                <strong>Modelli Ricetta</strong> quando emetti una ricetta. Scrivi un
                farmaco per riga (<em>Nome: posologia</em>) per compilare la ricetta
                con un clic.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-xl border border-default-200 bg-default-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-gray-800">
                Testi pronti da inserire con un clic durante visite, esami o certificati.
              </p>
              <p className="text-xs leading-relaxed text-default-500">
                <span className="font-semibold text-default-700">Nome in menu</span>{" "}
                → titolo nel menu{" "}
                <span className="text-default-400">·</span>{" "}
                <span className="font-semibold text-default-700">Contenuto</span>{" "}
                → testo inserito nel referto
              </p>
            </div>
            <Button
              color="primary"
              size="md"
              className="corioli-cta w-full shrink-0 px-6 sm:w-auto sm:min-w-[168px]"
              startContent={<Plus size={18} />}
              onPress={handleNewTemplate}
            >
              Nuovo modello
            </Button>
          </div>
          <Table aria-label="Tabella Modelli">
            <TableHeader>
              <TableColumn>Nome in menu</TableColumn>
              <TableColumn>Sezione</TableColumn>
              <TableColumn>Contenuto inserito</TableColumn>
              <TableColumn>AZIONI</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={"Nessun modello trovato per questa categoria."}
            >
              {templates
                .filter((t) => t.category === selectedCategory)
                .map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      {template.label}
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" className="capitalize">
                        {template.section === "esameObiettivo"
                          ? "Visita / Eco Office"
                          : template.section === "prestazione"
                            ? "Anamnesi"
                            : template.section === "conclusioni"
                              ? "Conclusioni"
                              : template.category === "ricette"
                                ? "Farmaci"
                                : template.category === "terapie"
                                  ? "Terapia"
                                  : template.section === "generale" && template.category === "certificato"
                                    ? "Testo"
                                    : template.section}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate text-default-500">
                        {template.text}
                        {template.note && (
                          <span className="block text-xs italic text-default-400">
                            {template.note}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleEditTemplate(template)}
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          onPress={() => requestDeleteTemplate(template)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Info App */}
      <Card className="shadow-lg">
        <CardBody>
          <div className="text-center space-y-2">
            <h3 className="font-semibold text-gray-900">Corioli Cardiologia Desktop</h3>
            <div className="flex justify-center gap-4 text-sm text-gray-600 flex-wrap">
              <span>Versione {appVersion || "—"}</span>
              <span>•</span>
              <span>{isOnline ? "Modalità Online" : "Modalità Offline"}</span>
              <span>•</span>
              <span>Dati Locali</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <AppModal
        isOpen={mergeConflictOpen}
        onClose={() => {
          setMergeConflictOpen(false);
          setMergeConflictData(null);
          setMergeSelections({});
        }}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>Seleziona i dati da mantenere</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              Abbiamo trovato informazioni diverse tra i record. Scegli quale
              valore usare nel paziente finale.
            </p>

            <div className="space-y-4">
              {mergeConflictData?.conflictFields.map((field) => (
                <div
                  key={field.key}
                  className="rounded-lg border border-default-200 p-3 bg-default-50"
                >
                  <p className="text-sm font-medium mb-2">{field.label}</p>
                  <Select
                    aria-label={`Selezione ${field.label}`}
                    selectedKeys={[
                      mergeSelections[field.key] ?? field.defaultValue,
                    ]}
                    onSelectionChange={(keys) => {
                      const selected = String(Array.from(keys)[0] || "");
                      setMergeSelections((prev) => ({
                        ...prev,
                        [field.key]: selected,
                      }));
                    }}
                    variant="bordered"
                    size="sm"
                  >
                    {field.options.map((value) => (
                      <SelectItem
                        key={value}
                        value={value}
                        textValue={
                          field.key === "codiceFiscale"
                            ? `${value}${field.generatedByValue?.[value] ? " (generato da import)" : ""}`
                            : value
                        }
                      >
                        {field.key === "codiceFiscale" ? (
                          <span>
                            <span className="font-mono">{value}</span>
                            {field.generatedByValue?.[value] && (
                              <span className="text-danger font-bold ml-1">
                                *
                              </span>
                            )}
                            {field.generatedByValue?.[value]
                              ? " (generato da import)"
                              : ""}
                          </span>
                        ) : (
                          value
                        )}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => {
                setMergeConflictOpen(false);
                setMergeConflictData(null);
                setMergeSelections({});
              }}
            >
              Annulla
            </Button>
            <Button color="warning" onPress={confirmMergeWithSelections}>
              Conferma merge
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <TemplateEditorModal
        isOpen={isTemplateModalOpen}
        onClose={onTemplateModalClose}
        initialTemplate={currentTemplate}
        onSave={handleSaveTemplate}
        isSaving={isSavingTemplate}
        anamnesiConfig={preferences.anamnesiConfig}
      />

      <AppModal
        isOpen={isAnamnesiConfigModalOpen}
        onClose={() => setIsAnamnesiConfigModalOpen(false)}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>Struttura anamnesi</span>
            <span className="text-xs font-normal text-default-500">
              Configura, per ogni tipo di visita, se usare un unico campo di
              anamnesi o suddividerla in sezioni — attivabili, riordinabili e
              rinominabili. Lascia vuoto il nome per ripristinare quello
              predefinito.
            </span>
          </ModalHeader>
          <ModalBody className="pb-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {ANAMNESI_VISIT_TYPES.map((tipo) => {
                const cfg = preferences.anamnesiConfig[tipo];
                const enabled = cfg.campi;
                return (
                  <div
                    key={tipo}
                    className="rounded-xl border border-default-200 bg-default-50/40 p-3 flex flex-col gap-3"
                  >
                    <p className="text-sm font-semibold text-gray-700">
                      {ANAMNESI_VISIT_TYPE_LABELS[tipo]}
                    </p>
                    <Select
                      aria-label={`Modalità anamnesi ${ANAMNESI_VISIT_TYPE_LABELS[tipo]}`}
                      size="sm"
                      variant="bordered"
                      selectedKeys={[cfg.mode]}
                      onSelectionChange={(keys) =>
                        setAnamnesiMode(
                          tipo,
                          (Array.from(keys)[0] as AnamnesiMode) ||
                            "strutturata",
                        )
                      }
                    >
                      <SelectItem key="strutturata">Multi-sezione</SelectItem>
                      <SelectItem key="singola">Campo unico</SelectItem>
                    </Select>

                    {cfg.mode === "strutturata" ? (
                      <div className="space-y-1.5">
                        {enabled.map((key, idx) => {
                          const meta = getAnamnesiCampoMeta(key);
                          if (!meta) return null;
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 rounded-md border border-default-100 bg-white px-2 py-1.5"
                            >
                              <div className="flex flex-col">
                                <button
                                  type="button"
                                  aria-label={`Sposta su ${meta.label}`}
                                  disabled={idx === 0}
                                  onClick={() => moveAnamnesiCampo(tipo, key, -1)}
                                  className="text-default-400 hover:text-default-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ChevronUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Sposta giù ${meta.label}`}
                                  disabled={idx === enabled.length - 1}
                                  onClick={() => moveAnamnesiCampo(tipo, key, 1)}
                                  className="text-default-400 hover:text-default-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ChevronDown size={14} />
                                </button>
                              </div>
                              <span className="text-[11px] font-semibold text-default-400 w-7 shrink-0 tabular-nums">
                                1.{idx + 1}
                              </span>
                              <Input
                                size="sm"
                                variant="flat"
                                aria-label={`Nome sezione ${meta.label}`}
                                value={cfg.etichette?.[key] ?? ""}
                                placeholder={meta.label}
                                maxLength={MAX_ANAMNESI_ETICHETTA_LEN}
                                onValueChange={(v) =>
                                  setAnamnesiEtichetta(tipo, key, v)
                                }
                                className="flex-1"
                                classNames={{
                                  inputWrapper: "h-8 min-h-8",
                                  input: "text-sm",
                                }}
                              />
                              <button
                                type="button"
                                aria-label={`Elimina ${meta.label}`}
                                title="Elimina sezione"
                                onClick={() => removeAnamnesiSezione(tipo, key)}
                                className="text-default-400 hover:text-danger"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          );
                        })}

                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
                          startContent={<Plus size={14} />}
                          isDisabled={enabled.length >= MAX_ANAMNESI_SEZIONI}
                          onPress={() => addCustomAnamnesiSezione(tipo)}
                          className="w-full"
                        >
                          Aggiungi sezione ({enabled.length}/
                          {MAX_ANAMNESI_SEZIONI})
                        </Button>

                        {enabled.length === 0 && (
                          <p className="text-xs text-warning-600">
                            Nessuna sezione: aggiungine almeno una o passa a
                            "Campo unico".
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-default-500">
                        L&apos;anamnesi sarà un unico campo di testo libero.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="primary"
              onPress={() => setIsAnamnesiConfigModalOpen(false)}
            >
              Fatto
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <AppModal
        isOpen={isModuliConfigModalOpen}
        onClose={() => setIsModuliConfigModalOpen(false)}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>Moduli della visita</span>
            <span className="text-xs font-normal text-default-500">
              Accendi i moduli che usi: restano spenti finché non li attivi, e
              la visita ti si presenta con le sole sezioni che compili sempre.
              Un modulo già compilato resta visibile nelle visite in archivio
              anche quando è spento.
            </span>
          </ModalHeader>
          <ModalBody className="pb-2">
            <div className="flex flex-col gap-5">
              {GRUPPI_MODULI.map(({ gruppo, titolo, nota }) => (
                <div key={gruppo} className="flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      {titolo}
                    </p>
                    {nota && (
                      <p className="text-xs text-default-500 mt-0.5">{nota}</p>
                    )}
                  </div>
                  {moduliDelGruppo(gruppo).map((modulo) => (
                    <div
                      key={modulo.chiave}
                      className="flex items-start justify-between gap-4 rounded-lg border border-default-200 bg-default-50/40 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-default-700">
                          {modulo.titolo}
                        </p>
                        <p className="text-xs text-default-500">
                          {modulo.descrizione}
                        </p>
                      </div>
                      <Switch
                        aria-label={`Attiva il modulo ${modulo.titolo}`}
                        className="shrink-0"
                        isSelected={Boolean(
                          preferences.moduliVisita?.[modulo.chiave],
                        )}
                        onValueChange={(value) =>
                          handleModuloChange(modulo.chiave, value)
                        }
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="primary"
              onPress={() => setIsModuliConfigModalOpen(false)}
            >
              Fatto
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <ConfirmDangerModal
        isOpen={isDeleteTemplateOpen}
        onClose={() => {
          onDeleteTemplateClose();
          setTemplateToDelete(null);
        }}
        title="Elimina modello"
        confirmLabel="Elimina modello"
        onConfirm={() => void confirmDeleteTemplate()}
        isLoading={isDeletingTemplate}
      >
        <p className="text-sm text-default-600">
          Sei sicuro di voler eliminare <strong>{templateToDelete?.label}</strong>?
        </p>
      </ConfirmDangerModal>

      {/* Modifica ambulatorio */}
      <AppModal
        isOpen={isEditAmbulatorioOpen}
        onClose={() => {
          onEditAmbulatorioClose();
          setEditAmbulatorio(null);
        }}
        size="lg"
      >
        <ModalContent>
          <ModalHeader>Modifica ambulatorio</ModalHeader>
          <ModalBody>
            {editAmbulatorio && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    size="sm"
                    label="Nome Ambulatorio"
                    value={editAmbulatorio.nome}
                    onValueChange={(value) =>
                      setEditAmbulatorio((prev) =>
                        prev ? { ...prev, nome: value } : prev,
                      )
                    }
                    variant="bordered"
                    placeholder="Studio Medico"
                  />
                  <Input
                    size="sm"
                    label="Telefono"
                    value={editAmbulatorio.telefono}
                    onValueChange={(value) =>
                      setEditAmbulatorio((prev) =>
                        prev ? { ...prev, telefono: value } : prev,
                      )
                    }
                    variant="bordered"
                    placeholder="0612345678"
                  />
                </div>
                <Input
                  size="sm"
                  label="Indirizzo"
                  value={editAmbulatorio.indirizzo}
                  onValueChange={(value) =>
                    setEditAmbulatorio((prev) =>
                      prev ? { ...prev, indirizzo: value } : prev,
                    )
                  }
                  variant="bordered"
                  placeholder="Via Roma 10"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    size="sm"
                    label="Città"
                    value={editAmbulatorio.citta}
                    onValueChange={(value) =>
                      setEditAmbulatorio((prev) =>
                        prev ? { ...prev, citta: value } : prev,
                      )
                    }
                    variant="bordered"
                    placeholder="Roma"
                  />
                  <Input
                    size="sm"
                    label="CAP"
                    value={editAmbulatorio.cap}
                    onValueChange={(value) =>
                      setEditAmbulatorio((prev) =>
                        prev ? { ...prev, cap: value } : prev,
                      )
                    }
                    variant="bordered"
                    placeholder="00100"
                  />
                  <Input
                    size="sm"
                    label="Email"
                    type="email"
                    value={editAmbulatorio.email}
                    onValueChange={(value) =>
                      setEditAmbulatorio((prev) =>
                        prev ? { ...prev, email: value } : prev,
                      )
                    }
                    variant="bordered"
                    placeholder="Opzionale"
                  />
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              color="danger"
              variant="light"
              onPress={() => {
                onEditAmbulatorioClose();
                setEditAmbulatorio(null);
              }}
            >
              Annulla
            </Button>
            <Button
              color="primary"
              onPress={saveEditAmbulatorio}
              isLoading={savingAmbulatori}
              isDisabled={savingAmbulatori}
            >
              Salva modifiche
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <ConfirmDangerModal
        isOpen={isDeleteAmbulatorioOpen}
        onClose={() => {
          onDeleteAmbulatorioClose();
          setAmbulatorioToDelete(null);
        }}
        title="Elimina ambulatorio"
        confirmLabel="Elimina ambulatorio"
        onConfirm={() => void confirmDeleteAmbulatorio()}
        isLoading={savingAmbulatori}
      >
        <p className="text-sm text-default-600">
          Sei sicuro di voler eliminare <strong>{ambulatorioToDelete?.nome}</strong>?
        </p>
      </ConfirmDangerModal>

      <ConfirmDangerModal
        isOpen={isDeleteDuplicateOpen}
        onClose={() => {
          if (processingDuplicateId) return;
          onDeleteDuplicateClose();
          setDuplicatePatientToDelete(null);
        }}
        title="Elimina paziente duplicato"
        confirmLabel="Elimina paziente"
        onConfirm={() => void confirmDeleteDuplicatePatient()}
        isLoading={Boolean(processingDuplicateId)}
      >
        <p className="text-sm text-default-600">
          Sei sicuro di voler eliminare <strong>{duplicatePatientToDelete?.label}</strong>?
          Verranno eliminate anche le visite collegate.
        </p>
      </ConfirmDangerModal>

    </div>
  );
};

export default SettingsScreen;
