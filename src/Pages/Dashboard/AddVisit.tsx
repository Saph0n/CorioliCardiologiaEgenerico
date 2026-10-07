import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Divider,
  Select,
  SelectItem,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";

import { RefertoTextarea } from "../../components/RefertoTextarea";
import {
  useRegisterUnsavedChanges,
  useUnsavedChanges,
} from "../../contexts/UnsavedChangesContext";
import {
  PatientService,
  VisitService,
  TemplateService,
  PreferenceService,
  DoctorService,
} from "../../services/OfflineServices";
import { PdfService } from "../../services/PdfService";
import { Patient, Visit, MedicalTemplate } from "../../types/Storage";
import {
  createDefaultAnamnesiConfig,
  parseAnamnesiConfig,
  getCampiAttivi,
  getAnamnesiEtichette,
  pickCampiAttivi,
  createEmptyAnamnesiStrutturata,
  cleanAnamnesiStrutturata,
  hasAnamnesiStrutturataContent,
  formatAnamnesiStrutturataText,
} from "../../utils/anamnesiStrutturata";
import { calculateAge } from "../../utils/dateUtils";
import {
  MIN_HEIGHT_CM,
  MAX_HEIGHT_CM,
  isValidHeightInputDraft,
  isValidWeightInputDraft,
  parseOptionalHeight,
  parseWeightFieldBlur,
  parseWeightFieldLive,
  todayIsoDate,
  validateBodyWeight,
  validateFrequenzaCardiaca,
  validatePressioneArteriosa,
  validateVisitDate,
} from "../../utils/formValidation";
import {
  ArrowLeft,
  Printer,
  ClipboardList,
  AlertCircle,
  Save,
  User,
  ImagePlus,
  Trash2,
  Copy,
  X,
  Ruler,
} from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import { useDoctorProfileIncompleteModal } from "../../components/DoctorProfileIncompleteModal";
import {
  getMissingDoctorProfileFields,
  isDoctorProfileComplete,
} from "../../utils/doctorProfile";
import { AppModal } from "../../components/AppModal";
import {
  ParametriPressione,
  type ValoriPressione,
} from "../../components/generale/ParametriPressione";
import { IndiciCorporei } from "../../components/generale/IndiciCorporei";
import { normalizzaPressione, type PosizionePa } from "../../utils/parametriVitali";
import { formatPatientDisplayName } from "../../utils/patientDisplay";

function getAltezzaCmForBmi(patient: Patient | null): number | null {
  if (patient?.altezza == null || patient.altezza <= 0) return null;
  return parseOptionalHeight(String(patient.altezza)) ?? null;
}

/** Circonferenza vita accettata dal campo (cm). */
const MIN_VITA_CM = 40;
const MAX_VITA_CM = 250;

function validateCirconferenzaVita(cm?: number): string | null {
  if (!cm) return null;
  if (cm < MIN_VITA_CM || cm > MAX_VITA_CM) {
    return `Circonferenza vita fuori range (${MIN_VITA_CM}–${MAX_VITA_CM} cm)`;
  }
  return null;
}

/** "Seconda misurazione: pressione sistolica fuori range": quale campo, nel messaggio. */
function conCampo(campo: string, errore: string | null): string | null {
  return errore ? `${campo}: ${errore.charAt(0).toLowerCase()}${errore.slice(1)}` : null;
}

type VisitaData = ReturnType<typeof createDefaultVisitaData>;

/**
 * Il contenuto della visita come si salva: pressioni con la barra, posizioni
 * solo se c'e' la misura (senza valgono clino la prima e orto la seconda),
 * seconda misurazione e circonferenza vita vuote tolte.
 */
function visitaDaSalvare(v: VisitaData): NonNullable<Visit["visita"]> {
  const {
    posizionePa,
    pressioneArteriosa2,
    posizionePa2,
    frequenzaCardiaca2,
    circonferenzaVita,
    ...resto
  } = v;
  const pa = normalizzaPressione(v.pressioneArteriosa ?? "");
  const pa2 = normalizzaPressione(pressioneArteriosa2 ?? "");
  const fc2 = (frequenzaCardiaca2 ?? "").trim();
  return {
    ...resto,
    pressioneArteriosa: pa,
    ...(pa && posizionePa ? { posizionePa } : {}),
    ...(pa2 ? { pressioneArteriosa2: pa2 } : {}),
    ...((pa2 || fc2) && posizionePa2 ? { posizionePa2 } : {}),
    ...(fc2 ? { frequenzaCardiaca2: fc2 } : {}),
    ...(circonferenzaVita > 0 ? { circonferenzaVita } : {}),
  };
}

const TemplateSelector = ({
  templates,
  onSelect,
  label = "Modello",
}: {
  templates: MedicalTemplate[];
  onSelect: (text: string) => void;
  label?: string;
}) => {
  if (templates.length === 0) return null;

  return (
    <Dropdown
      classNames={{
        // `justify-start` non è decorativo: lo slot `content` di NextUI è un
        // flex column con `justify-center`, e in un contenitore scrollabile
        // centrato l'eccedenza sopra il primo elemento è irraggiungibile
        // (scrollTop non va sotto zero): con molti modelli metà lista restava
        // invisibile pur essendoci la scrollbar.
        content: "max-h-[min(20rem,60vh)] overflow-y-auto justify-start",
      }}
    >
      <DropdownTrigger>
        <Button
          size="sm"
          variant="flat"
          color="primary"
          startContent={<ClipboardList size={14} />}
          className="h-7 text-xs font-medium"
        >
          {label}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Modelli referto"
        onAction={(key) => {
          const selected = templates.find((t) => t.id === key);
          if (selected) onSelect(selected.text);
        }}
      >
        {templates.map((t) => (
          <DropdownItem
            key={t.id}
            description={t.text.substring(0, 50) + "..."}
          >
            {t.label}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
};

const createDefaultVisitData = () => ({
  dataVisita: todayIsoDate(),
  tipo: "generale" as const,
  descrizioneClinica: "",
  anamnesi: "",
  esamiObiettivo: "",
  conclusioniDiagnostiche: "",
  terapie: "",
});

const createDefaultVisitaData = () => ({
  problemaClinico: "",
  prestazione: "",
  esameObiettivo: "",
  accertamenti: "",
  terapiaSpecifica: "",
  pesoCorporeo: 0,
  pressioneArteriosa: "",
  posizionePa: "" as "" | PosizionePa,
  frequenzaCardiaca: "",
  pressioneArteriosa2: "",
  posizionePa2: "" as "" | PosizionePa,
  frequenzaCardiaca2: "",
  circonferenzaVita: 0,
  immagini: [] as string[],
});

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024; // 7MB per immagine

export default function AddVisit() {
  const [searchParams] = useSearchParams();
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { open: openDoctorProfileIncompleteModal, modal: doctorProfileIncompleteModal } =
    useDoctorProfileIncompleteModal();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientVisits, setPatientVisits] = useState<Visit[]>([]);
  const [existingVisit, setExistingVisit] = useState<Visit | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { guardAction } = useUnsavedChanges();
  useRegisterUnsavedChanges("add-visit", hasUnsavedChanges);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [anamnesiConfig, setAnamnesiConfig] = useState(
    createDefaultAnamnesiConfig,
  );
  const [isIncludeImagesModalOpen, setIsIncludeImagesModalOpen] =
    useState(false);
  const [includeImagesCount, setIncludeImagesCount] = useState(0);
  // Conferma copia anamnesi "campo unico" → anamnesi a campi multipli
  const [isFlattenAnamnesiModalOpen, setIsFlattenAnamnesiModalOpen] =
    useState(false);
  const [flattenAnamnesiOptions, setFlattenAnamnesiOptions] = useState<
    { key: string; label: string }[]
  >([]);
  const [flattenAnamnesiSelected, setFlattenAnamnesiSelected] =
    useState<string>("");
  const [flattenAnamnesiSource, setFlattenAnamnesiSource] = useState("");
  const flattenAnamnesiResolverRef = useRef<
    ((value: string | null) => void) | null
  >(null);
  const [copiedPrevious, setCopiedPrevious] = useState(false);
  const includeImagesResolverRef = useRef<((value: boolean) => void) | null>(
    null,
  );
  const initialLoadDone = useRef(false);

  // Templates state
  const [allTemplates, setAllTemplates] = useState<MedicalTemplate[]>([]);

  // Campi piatti della visita (compatibilità e ricerche)
  const [visitData, setVisitData] = useState(createDefaultVisitData);

  // Contenuto clinico della visita
  const [visitaData, setVisitaData] = useState(createDefaultVisitaData);

  // Anamnesi strutturata
  const [anamnesiStrutturata, setAnamnesiStrutturata] = useState(
    createEmptyAnamnesiStrutturata,
  );

  // Se sto modificando una visita "vecchia" salvata in modalità singola (testo in
  // prestazione/anamnesi e nessun dato strutturato), mostro comunque il campo singolo
  // così il testo esistente resta visibile e modificabile, anche con la preferenza attiva.
  const editingLegacySingleAnamnesi =
    isEditMode &&
    !hasAnamnesiStrutturataContent(existingVisit?.anamnesiStrutturata) &&
    Boolean(
      (existingVisit?.visita?.prestazione || existingVisit?.anamnesi || "").trim(),
    );
  const useStructuredAnamnesi =
    anamnesiConfig.generale.mode === "strutturata" &&
    !editingLegacySingleAnamnesi;
  const campiAnamnesiAttivi = getCampiAttivi(anamnesiConfig, "generale");

  /** Altezza da salvare in scheda paziente (banner BMI). */
  const [altezzaPendingInput, setAltezzaPendingInput] = useState("");
  const [savingAltezza, setSavingAltezza] = useState(false);
  /** Testo libero peso corporeo mentre il campo ha focus. */
  const [pesoCorporeoDraft, setPesoCorporeoDraft] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const loadData = async () => {
      // Reset completo quando cambia rotta/paziente per evitare valori "residui"
      initialLoadDone.current = false;
      setIsEditMode(false);
      setExistingVisit(null);
      setHasUnsavedChanges(false);
      setCopiedPrevious(false);
      setError(null);
      setPatientVisits([]);
      setVisitData(createDefaultVisitData());
      setVisitaData(createDefaultVisitaData());
      setAnamnesiStrutturata(createEmptyAnamnesiStrutturata());
      setPesoCorporeoDraft(null);
      setAltezzaPendingInput("");
      setSavingAltezza(false);

      try {
        const templates = await TemplateService.getAllTemplates();
        setAllTemplates(templates);
      } catch (e) {
        console.error("Errore caricamento template", e);
      }

      const loadPatientVisits = async (patientId: string) => {
        const visitsData = await VisitService.getVisitsByPatientId(patientId);
        const sortedVisits = visitsData.sort((a, b) => {
          const dateDiff =
            new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime();
          if (dateDiff !== 0) return dateDiff;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
        setPatientVisits(sortedVisits);
      };

      if (visitId) {
        setIsEditMode(true);
        try {
          const visit = await VisitService.getVisitById(visitId);
          if (visit) {
            setExistingVisit(visit);
            setVisitData({
              dataVisita: visit.dataVisita,
              tipo: "generale",
              descrizioneClinica: visit.descrizioneClinica,
              anamnesi: visit.anamnesi,
              esamiObiettivo: visit.esamiObiettivo,
              conclusioniDiagnostiche: visit.conclusioniDiagnostiche,
              terapie: visit.terapie,
            });
            setAnamnesiStrutturata({
              ...createEmptyAnamnesiStrutturata(),
              ...(visit.anamnesiStrutturata ?? {}),
            });

            if (visit.visita) {
              setVisitaData((prev) => ({
                ...prev,
                ...visit.visita,
                pesoCorporeo: visit.visita?.pesoCorporeo ?? 0,
                pressioneArteriosa: visit.visita?.pressioneArteriosa ?? "",
                posizionePa: visit.visita?.posizionePa ?? "",
                frequenzaCardiaca: visit.visita?.frequenzaCardiaca ?? "",
                pressioneArteriosa2: visit.visita?.pressioneArteriosa2 ?? "",
                posizionePa2: visit.visita?.posizionePa2 ?? "",
                frequenzaCardiaca2: visit.visita?.frequenzaCardiaca2 ?? "",
                circonferenzaVita: visit.visita?.circonferenzaVita ?? 0,
                immagini: visit.visita?.immagini ?? [],
              }));
            } else {
              // Visita salvata prima del blocco `visita` (o importata): i campi
              // piatti diventano il contenuto del referto.
              setVisitaData((prev) => ({
                ...prev,
                problemaClinico: visit.descrizioneClinica ?? "",
                prestazione: visit.anamnesi ?? "",
                esameObiettivo: visit.esamiObiettivo ?? "",
                terapiaSpecifica:
                  [visit.conclusioniDiagnostiche, visit.terapie]
                    .filter(Boolean)
                    .join("\n") || "",
              }));
            }

            const patientData = await PatientService.getPatientById(
              visit.patientId,
            );
            setPatient(patientData);
            if (patientData) await loadPatientVisits(patientData.id);
          } else {
            setError("Visita non trovata");
          }
        } catch {
          setError("Errore nel caricamento della visita");
        }
      } else {
        const patientId = searchParams.get("patientId");
        const patientCf = searchParams.get("patientCf");

        if (patientId) {
          try {
            const patientData = await PatientService.getPatientById(patientId);
            setPatient(patientData);
            if (patientData) await loadPatientVisits(patientData.id);
          } catch {
            setError("Errore nel caricamento dati paziente");
          }
        } else if (patientCf) {
          try {
            const patientData = await PatientService.getPatientByCF(patientCf);
            setPatient(patientData);
            if (patientData) await loadPatientVisits(patientData.id);
          } catch {
            setError("Errore nel caricamento dati paziente");
          }
        }
      }
      setTimeout(() => {
        initialLoadDone.current = true;
      }, 300);
    };
    loadData();
  }, [searchParams, visitId]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const loadVisitPreferences = async () => {
      try {
        const prefs = await PreferenceService.getPreferences();
        setAnamnesiConfig(
          prefs ? parseAnamnesiConfig(prefs) : createDefaultAnamnesiConfig(),
        );
      } catch {
        setAnamnesiConfig(createDefaultAnamnesiConfig());
      }
    };

    void loadVisitPreferences();
    const onFocus = () => void loadVisitPreferences();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreenImage) {
        setFullscreenImage(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenImage]);

  const handleTemplateSelect = (field: string, text: string) => {
    setVisitaData((prev) => ({
      ...prev,
      [field]: prev[field as keyof typeof prev]
        ? `${prev[field as keyof typeof prev]}\n${text}`
        : text,
    }));
    if (initialLoadDone.current) setHasUnsavedChanges(true);
  };

  const handleSubmit = async (
    e?: React.FormEvent | { preventDefault: () => void },
    options?: { skipRedirect?: boolean },
  ): Promise<boolean> => {
    if (e && e.preventDefault) e.preventDefault();
    if (!patient) {
      setError("Nessun paziente selezionato");
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const doctor = await DoctorService.getDoctor();
      if (!isDoctorProfileComplete(doctor)) {
        openDoctorProfileIncompleteModal(getMissingDoctorProfileFields(doctor));
        return false;
      }

      const visitDateErr = validateVisitDate(visitData.dataVisita);
      if (visitDateErr) {
        setError(visitDateErr);
        showToast(visitDateErr, "error");
        return false;
      }

      const visitaForSave =
        pesoCorporeoDraft !== null
          ? {
              ...visitaData,
              pesoCorporeo: parseWeightFieldBlur(pesoCorporeoDraft),
            }
          : visitaData;

      const paramErr =
        validateBodyWeight(visitaForSave.pesoCorporeo) ??
        validatePressioneArteriosa(normalizzaPressione(visitaForSave.pressioneArteriosa)) ??
        validateFrequenzaCardiaca(visitaForSave.frequenzaCardiaca) ??
        conCampo(
          "Seconda misurazione",
          validatePressioneArteriosa(normalizzaPressione(visitaForSave.pressioneArteriosa2)),
        ) ??
        conCampo("Seconda misurazione", validateFrequenzaCardiaca(visitaForSave.frequenzaCardiaca2)) ??
        validateCirconferenzaVita(visitaForSave.circonferenzaVita);
      if (paramErr) {
        setError(paramErr);
        showToast(paramErr, "error");
        return false;
      }

      if (
        altezzaPendingInput.trim() &&
        (!patient.altezza || patient.altezza <= 0)
      ) {
        const valid = parseOptionalHeight(altezzaPendingInput.trim());
        if (valid != null) {
          await persistPatientAltezzaIfNeeded(valid);
        }
      }

      // Modalità strutturata: salva i sotto-campi (puliti) e lascia intatta
      // `prestazione` (per non perdere dati se si torna alla modalità singola).
      // Modalità singola: azzera `anamnesiStrutturata` così il PDF usa `prestazione`.
      const anamnesiStrutturataForSave = useStructuredAnamnesi
        ? cleanAnamnesiStrutturata(
            pickCampiAttivi(anamnesiStrutturata, anamnesiConfig, "generale"),
          )
        : undefined;

      const visitToSave = {
        patientId: patient.id,
        dataVisita: visitData.dataVisita,
        descrizioneClinica: visitData.descrizioneClinica,
        anamnesi: visitData.anamnesi,
        esamiObiettivo: visitData.esamiObiettivo,
        conclusioniDiagnostiche: visitData.conclusioniDiagnostiche,
        terapie: visitData.terapie,
        tipo: "generale" as const,
        anamnesiStrutturata: anamnesiStrutturataForSave,
        visita: visitaDaSalvare(visitaForSave),
      };

      if (isEditMode && existingVisit) {
        await VisitService.updateVisit(existingVisit.id, visitToSave);
        setHasUnsavedChanges(false);
        showToast("Visita aggiornata con successo!");
      } else {
        const salvata = await VisitService.addVisit(visitToSave);
        // Da qui la visita esiste: il salvataggio dopo la aggiorna. Senza,
        // "Stampa" (che salva e resta nella pagina) seguito da "Stampa" o da
        // "Salva" ne creava una seconda identica, come su Corioli Cardiologia
        // prima della stessa correzione.
        setExistingVisit(salvata);
        setIsEditMode(true);
        setHasUnsavedChanges(false);
        showToast("Visita salvata con successo!");
      }
      setVisitaData(visitaForSave);
      setPesoCorporeoDraft(null);
      if (!options?.skipRedirect) {
        setTimeout(() => navigate(`/patient-history/${patient.id}`), 1000);
      }
      return true;
    } catch (err) {
      console.error("Errore nel salvataggio visita:", err);
      setError(
        isEditMode
          ? "Errore nell'aggiornamento della visita"
          : "Errore nel salvataggio della visita",
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getPreviousVisit = () =>
    patientVisits.find((v) => !existingVisit || v.id !== existingVisit.id);

  const handleCopyPreviousVisit = async () => {
    // Secondo click: svuota i campi
    if (copiedPrevious) {
      setVisitData((prev) => ({
        ...prev,
        descrizioneClinica: "",
        anamnesi: "",
        esamiObiettivo: "",
        conclusioniDiagnostiche: "",
        terapie: "",
      }));
      setVisitaData(createDefaultVisitaData());
      setAnamnesiStrutturata(createEmptyAnamnesiStrutturata());
      setPesoCorporeoDraft(null);
      setCopiedPrevious(false);
      setHasUnsavedChanges(true);
      showToast("Campi svuotati.");
      return;
    }

    const previousVisit = getPreviousVisit();
    if (!previousVisit) {
      showToast("Nessuna visita precedente trovata per questo paziente.", "info");
      return;
    }

    setVisitData((prev) => ({
      ...prev,
      descrizioneClinica: previousVisit.descrizioneClinica || "",
      anamnesi: previousVisit.anamnesi || "",
      esamiObiettivo: previousVisit.esamiObiettivo || "",
      conclusioniDiagnostiche: previousVisit.conclusioniDiagnostiche || "",
      terapie: previousVisit.terapie || "",
    }));

    if (previousVisit.visita) {
      setVisitaData((prev) => ({
        ...prev,
        ...previousVisit.visita,
        immagini: previousVisit.visita?.immagini ?? [],
        // I parametri rilevati nella singola visita vanno reinseriti.
        pesoCorporeo: 0,
        pressioneArteriosa: "",
        posizionePa: "",
        frequenzaCardiaca: "",
        pressioneArteriosa2: "",
        posizionePa2: "",
        frequenzaCardiaca2: "",
        circonferenzaVita: 0,
      }));
    } else {
      setVisitaData((prev) => ({
        ...prev,
        problemaClinico: previousVisit.descrizioneClinica ?? "",
        prestazione: previousVisit.anamnesi ?? "",
        esameObiettivo: previousVisit.esamiObiettivo ?? "",
        terapiaSpecifica:
          [previousVisit.conclusioniDiagnostiche, previousVisit.terapie]
            .filter(Boolean)
            .join("\n") || "",
      }));
    }
    setPesoCorporeoDraft(null);

    // ── Anamnesi: copia secondo la modalità configurata ──
    const prevStructured = previousVisit.anamnesiStrutturata;
    const prevHasStructured = hasAnamnesiStrutturataContent(prevStructured);
    const prevSingleAnamnesi = (
      previousVisit.visita?.prestazione ||
      previousVisit.anamnesi ||
      ""
    ).trim();

    if (anamnesiConfig.generale.mode === "strutturata") {
      if (prevHasStructured) {
        // Precedente già a campi multipli: ogni campo va nel campo giusto
        // (solo i sotto-campi attualmente attivi).
        const next = createEmptyAnamnesiStrutturata();
        for (const f of campiAnamnesiAttivi) {
          const val = (prevStructured?.[f.key] ?? "").trim();
          if (val) next[f.key] = val;
        }
        setAnamnesiStrutturata(next);
      } else if (prevSingleAnamnesi && campiAnamnesiAttivi.length > 0) {
        // Precedente in campo unico → conversione non automatica: il medico
        // sceglie se distribuire manualmente o importare tutto in una sezione.
        const next = createEmptyAnamnesiStrutturata();
        const chosenKey = await askConfirmFlattenSingleToMulti(
          campiAnamnesiAttivi.map((c) => ({ key: c.key, label: c.label })),
          prevSingleAnamnesi,
        );
        if (chosenKey) next[chosenKey] = prevSingleAnamnesi;
        setAnamnesiStrutturata(next);
      } else {
        setAnamnesiStrutturata(createEmptyAnamnesiStrutturata());
      }
      // In modalità strutturata il campo unico non è usato: evita testo "dormiente"
      // copiato dalla visita precedente che riaffiorerebbe nel fallback del PDF.
      setVisitaData((prev) => ({ ...prev, prestazione: "" }));
    } else {
      // Modalità campo unico
      setAnamnesiStrutturata(createEmptyAnamnesiStrutturata());
      if (prevHasStructured) {
        // Precedente a campi multipli → tutto nel campo unico (prestazione)
        const flat = formatAnamnesiStrutturataText(
          prevStructured,
          undefined,
          getAnamnesiEtichette(anamnesiConfig, "generale"),
        );
        setVisitaData((prev) => ({ ...prev, prestazione: flat }));
      }
      // Se anche la precedente era in campo unico, prestazione è già copiata sopra.
    }

    setHasUnsavedChanges(true);
    setCopiedPrevious(true);
    showToast("Campi copiati dall'ultima visita.");
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve((dataUrl && dataUrl.split(",")[1]) ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImagesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const currentImages = visitaData.immagini ?? [];

    if (currentImages.length >= MAX_IMAGES) {
      showToast(`Hai già raggiunto il massimo di ${MAX_IMAGES} immagini.`, "info");
      return;
    }

    try {
      const validFiles = Array.from(files).filter((file) => {
        if (!file.type.startsWith("image/")) return false;
        if (file.size > MAX_IMAGE_BYTES) {
          showToast(`File "${file.name}" troppo grande (max 7MB).`, "info");
          return false;
        }
        return true;
      });

      const availableSlots = Math.max(0, MAX_IMAGES - currentImages.length);
      const filesToLoad = validFiles.slice(0, availableSlots);
      const encoded = await Promise.all(filesToLoad.map(fileToDataUrl));

      setVisitaData((prev) => ({
        ...prev,
        immagini: [...(prev.immagini ?? []), ...encoded],
      }));

      if (initialLoadDone.current) setHasUnsavedChanges(true);
      if (encoded.length > 0)
        showToast(`${encoded.length} immagine/i caricata/e.`);
    } catch (err) {
      console.error("Errore caricamento immagini:", err);
      showToast("Errore durante il caricamento delle immagini.", "error");
    }
  };

  const handleRemoveImage = (imageIndex: number) => {
    setVisitaData((prev) => ({
      ...prev,
      immagini: (prev.immagini ?? []).filter((_, idx) => idx !== imageIndex),
    }));
    if (initialLoadDone.current) setHasUnsavedChanges(true);
  };

  const askIncludeImages = (count: number): Promise<boolean> => {
    setIncludeImagesCount(count);
    setIsIncludeImagesModalOpen(true);
    return new Promise((resolve) => {
      includeImagesResolverRef.current = resolve;
    });
  };

  const resolveIncludeImages = (include: boolean) => {
    setIsIncludeImagesModalOpen(false);
    includeImagesResolverRef.current?.(include);
    includeImagesResolverRef.current = null;
  };

  const askConfirmFlattenSingleToMulti = (
    campi: { key: string; label: string }[],
    sourceText: string,
  ): Promise<string | null> => {
    setFlattenAnamnesiOptions(campi);
    setFlattenAnamnesiSelected(campi[0]?.key ?? "");
    setFlattenAnamnesiSource(sourceText);
    setIsFlattenAnamnesiModalOpen(true);
    return new Promise((resolve) => {
      flattenAnamnesiResolverRef.current = resolve;
    });
  };

  /** `null` = distribuisci manualmente (nessun campo precompilato). */
  const resolveFlattenAnamnesi = (value: string | null) => {
    setIsFlattenAnamnesiModalOpen(false);
    flattenAnamnesiResolverRef.current?.(value);
    flattenAnamnesiResolverRef.current = null;
  };

  const handlePrintPdf = async () => {
    if (!patient) return;

    // Salva la visita prima di stampare (senza redirect)
    const saved = await handleSubmit(undefined, { skipRedirect: true });
    if (!saved) return;

    const currentVisit: Visit = {
      id: existingVisit?.id || "",
      patientId: patient.id,
      dataVisita: visitData.dataVisita,
      descrizioneClinica: visitData.descrizioneClinica,
      anamnesi: visitData.anamnesi,
      esamiObiettivo: visitData.esamiObiettivo,
      conclusioniDiagnostiche: visitData.conclusioniDiagnostiche,
      terapie: visitData.terapie,
      tipo: "generale",
      anamnesiStrutturata: useStructuredAnamnesi
        ? cleanAnamnesiStrutturata(
            pickCampiAttivi(anamnesiStrutturata, anamnesiConfig, "generale"),
          )
        : undefined,
      visita: visitaDaSalvare(visitaData),
      createdAt: existingVisit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const imageCount = currentVisit.visita?.immagini?.length ?? 0;
    let includeImages = false;
    if (imageCount > 0) {
      includeImages = await askIncludeImages(imageCount);
    }

    setPdfLoading(true);
    try {
      const blob = await PdfService.generateVisitPDF(patient, currentVisit, {
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
          a.download = `Referto_${patient.cognome}_${currentVisit.dataVisita}.pdf`;
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

  const handleInputChange = (field: string, value: string) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    setVisitData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAnamnesiStrutturataChange = (field: string, value: string) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    setAnamnesiStrutturata((prev) => ({ ...prev, [field]: value }));
  };

  const applyAnamnesiTemplate = (field: string, text: string) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    setAnamnesiStrutturata((prev) => ({
      ...prev,
      [field]: prev[field] ? `${prev[field]}\n${text}` : text,
    }));
  };

  const handleVisitaChange = (field: string, value: string | number) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    setVisitaData((prev) => ({ ...prev, [field]: value }));
  };

  const liveBodyWeight = (raw: string) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    const live = parseWeightFieldLive(raw);
    if (live === "incomplete") {
      if (raw === "" || raw === ".") {
        setVisitaData((prev) => ({ ...prev, pesoCorporeo: 0 }));
      }
      return;
    }
    setVisitaData((prev) => ({ ...prev, pesoCorporeo: live }));
  };

  const commitBodyWeight = (raw: string) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    setVisitaData((prev) => ({
      ...prev,
      pesoCorporeo: parseWeightFieldBlur(raw),
    }));
  };

  const persistPatientAltezzaIfNeeded = async (
    heightCm: number | undefined,
  ): Promise<boolean> => {
    if (!patient || heightCm == null || heightCm <= 0) return false;
    if (patient.altezza != null && patient.altezza > 0) return false;
    const valid = parseOptionalHeight(String(heightCm));
    if (valid == null) return false;
    try {
      await PatientService.updatePatient(patient.id, {
        altezza: valid,
        updatedAt: new Date().toISOString(),
      });
      setPatient((prev) => (prev ? { ...prev, altezza: valid } : prev));
      setAltezzaPendingInput("");
      return true;
    } catch (e) {
      console.error("Errore salvataggio altezza paziente:", e);
      showToast("Errore durante il salvataggio dell'altezza", "error");
      return false;
    }
  };

  const handleSaveAltezza = async () => {
    const raw = altezzaPendingInput.trim();
    if (!raw) {
      showToast("Inserisci l'altezza in cm", "error");
      return;
    }
    const valid = parseOptionalHeight(raw);
    if (valid == null) {
      showToast(
        `Altezza non valida (${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM} cm)`,
        "error",
      );
      return;
    }
    setSavingAltezza(true);
    try {
      const saved = await persistPatientAltezzaIfNeeded(valid);
      if (saved) showToast("Altezza salvata nella scheda paziente");
    } finally {
      setSavingAltezza(false);
    }
  };

  /**
   * Ctrl+S salva restando nella visita, Ctrl+P stampa il referto, come su
   * Corioli Cardiologia. I ref tengono sempre l'ultima versione delle due
   * funzioni, che leggono lo stato della visita.
   */
  const salvaERestaRef = useRef<() => void>(() => {});
  const stampaRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const tasto = e.key.toLowerCase();
      if (tasto === "s") {
        e.preventDefault();
        salvaERestaRef.current();
      } else if (tasto === "p") {
        // Senza il preventDefault il browser stamperebbe la pagina.
        e.preventDefault();
        stampaRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleNavigateCronologia = () => {
    guardAction(() => navigate(`/patient-history/${patient?.id}`));
  };

  /**
   * Sezione "2. Anamnesi" del referto. Renderizza la modalità strutturata
   * (sotto-campi familiare/fisiologica/patologica/…) oppure quella singola a
   * testo libero legata a `prestazione`, secondo la preferenza. In strutturata
   * il selettore di modelli resta legato alla modalità singola, così i template
   * esistenti non si rompono.
   */
  const renderAnamnesiSection = () => (
    <div className="space-y-2 relative">
      <div className="flex justify-between items-end mb-1">
        <label className="text-sm font-bold text-gray-700">2. Anamnesi</label>
        {!useStructuredAnamnesi && (
          <TemplateSelector
            templates={allTemplates.filter(
              (t) => t.category === "visita" && t.section === "prestazione",
            )}
            onSelect={(t) => handleTemplateSelect("prestazione", t)}
          />
        )}
      </div>
      {useStructuredAnamnesi ? (
        <div className="space-y-3">
          {campiAnamnesiAttivi.map(
            ({ key, label, placeholder, minRows, optional, templateSection }, idx) => {
              const fieldTemplates = allTemplates.filter(
                (t) => t.category === "visita" && t.section === templateSection,
              );
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between items-end">
                    <label className="text-xs font-semibold text-gray-500">
                      {`2.${idx + 1} ${label}`}
                      {optional ? " (facoltativa)" : ""}
                    </label>
                    {fieldTemplates.length > 0 && (
                      <TemplateSelector
                        templates={fieldTemplates}
                        onSelect={(t) => applyAnamnesiTemplate(key, t)}
                      />
                    )}
                  </div>
                  <RefertoTextarea
                    value={anamnesiStrutturata[key] ?? ""}
                    onValueChange={(value) =>
                      handleAnamnesiStrutturataChange(key, value)
                    }
                    variant="bordered"
                    minRows={minRows}
                    placeholder={placeholder}
                  />
                </div>
              );
            },
          )}
        </div>
      ) : (
        <RefertoTextarea
          value={visitaData.prestazione}
          onValueChange={(value) => handleVisitaChange("prestazione", value)}
          variant="bordered"
          minRows={3}
          placeholder="Nega patologie di rilievo, nega terapia in atto..."
        />
      )}
    </div>
  );

  if (!patient) {
    return (
      <Card className="max-w-2xl mx-auto mt-12 shadow-medium">
        <CardBody className="text-center py-12">
          <div className="w-20 h-20 bg-default-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User size={40} className="text-default-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Nessun paziente selezionato
          </h2>
          <p className="text-gray-500 mb-6">
            Seleziona un paziente dalla dashboard per creare una nuova visita
          </p>
          <Button
            color="primary"
            onPress={() => navigate("/")}
            startContent={<ArrowLeft size={18} />}
          >
            Torna alla Dashboard
          </Button>
        </CardBody>
      </Card>
    );
  }

  const canCopyOrClear = Boolean(getPreviousVisit()) || copiedPrevious;
  salvaERestaRef.current = () => {
    if (!loading && !pdfLoading) void handleSubmit(undefined, { skipRedirect: true });
  };
  stampaRef.current = () => {
    if (!loading && !pdfLoading) void handlePrintPdf();
  };
  const etaPaziente = calculateAge(patient.dataNascita);
  const altezzaCm = getAltezzaCmForBmi(patient);
  const immagini = visitaData.immagini ?? [];

  return (
    <div className="corioli-page space-y-6 pb-12">
      {/* Barra della visita, come su Corioli Cardiologia. Sostituisce navbar,
          briciole, riquadro del paziente e la pillola in basso con
          Annulla/Stampa/Salva: una sola striscia sempre in vista, con su chi si
          sta scrivendo e le azioni. In basso la pillola copriva i campi, e in
          alto il nome usciva di schermo appena si scorreva il referto. La
          navbar qui non c'e' (`DesktopShell`). */}
      <div className="sfondo-corioli sticky top-barra z-40 -mx-6 px-6 pt-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-default-200 bg-white px-4 py-3 shadow-sm">
          <Button
            isIconOnly
            variant="light"
            aria-label="Torna alla scheda del paziente"
            title="Torna alla scheda del paziente"
            onPress={handleNavigateCronologia}
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-default-600">
              {isEditMode ? "Modifica visita" : "Nuova visita"}
              {hasUnsavedChanges && (
                <span className="ml-1 font-medium text-warning-700">· modifiche non salvate</span>
              )}
            </p>
            <h1 className="flex min-w-0 items-baseline gap-2 text-lg font-semibold text-gray-900">
              <span className="truncate">
                {formatPatientDisplayName(patient) ?? "Paziente senza nome"}
              </span>
              <span className="shrink-0 whitespace-nowrap text-sm font-normal text-default-600">
                {[
                  etaPaziente != null ? `${etaPaziente} anni` : null,
                  patient.sesso === "M" ? "M" : patient.sesso === "F" ? "F" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {patient.codiceFiscale && (
                  <>
                    {" · "}
                    <CodiceFiscaleValue
                      value={patient.codiceFiscale}
                      generatedFromImport={Boolean(patient.codiceFiscaleGenerato)}
                    />
                  </>
                )}
              </span>
            </h1>
            {/* Le allergie in vista mentre si scrive la terapia: prima
                stavano solo nella scheda del paziente. */}
            {patient.allergie?.trim() && (
              <p className="mt-0.5 truncate text-xs font-medium text-danger-700" title={patient.allergie}>
                Allergie: {patient.allergie}
              </p>
            )}
          </div>
          <Input
            type="date"
            label="Data"
            value={visitData.dataVisita}
            onValueChange={(value) => handleInputChange("dataVisita", value)}
            max={todayIsoDate()}
            variant="bordered"
            size="sm"
            labelPlacement="outside-left"
            className="w-auto"
            classNames={{
              label: "text-default-600 font-medium whitespace-nowrap",
              input: "bg-transparent",
              inputWrapper:
                "border-default-300 hover:border-primary focus-within:border-primary min-w-[140px]",
            }}
          />
          <div className="flex items-center gap-2">
            <Button variant="light" onPress={handleNavigateCronologia} className="text-default-700">
              Annulla
            </Button>
            {/* Col bordo: in grigio pieno accanto a "Salva visita" sembrava
                un pulsante disattivato. */}
            <Button
              color="primary"
              variant="bordered"
              title="Stampa il referto (Ctrl+P)"
              onPress={() => void handlePrintPdf()}
              isLoading={pdfLoading}
              isDisabled={loading || pdfLoading}
              startContent={!pdfLoading ? <Printer size={18} /> : undefined}
            >
              {pdfLoading ? "Preparazione..." : "Stampa"}
            </Button>
            <Button
              onPress={() => handleSubmit()}
              color="primary"
              className="corioli-cta font-semibold"
              isLoading={loading}
              isDisabled={loading}
              startContent={!loading ? <Save size={18} /> : undefined}
              title="Salva la visita (Ctrl+S)"
            >
              {loading ? "Salvataggio..." : "Salva visita"}
            </Button>
          </div>
        </div>
        {/* Il referto che scorre sparisce sfumando sotto la barra. */}
        <div
          aria-hidden="true"
          className="sfondo-corioli pointer-events-none absolute inset-x-0 top-full h-4 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
      </div>

      {error && (
        <Card className="border-l-4 border-l-danger bg-danger-50">
          <CardBody className="py-3">
            <p className="text-danger text-sm font-medium flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </p>
          </CardBody>
        </Card>
      )}

      {/* 3. Main Form Content */}
      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT COLUMN: Parametri & Immagini */}
          <div className="w-full lg:w-[29%] min-w-[300px] space-y-6">
            <Card className="shadow-sm border border-default-200 bg-white">
              <CardHeader className="pb-0 pt-4 px-4 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                <span>Parametri</span>
              </CardHeader>
              <CardBody className="px-4 py-6 space-y-6">
                {/* `key`: passando a un'altra visita (Ctrl+N) il riquadro della
                    prova ortostatica e gli errori ripartono da zero. */}
                <ParametriPressione
                  key={`${patient.id}-${visitId ?? "nuova"}`}
                  valori={visitaData as ValoriPressione}
                  eta={calculateAge(patient.dataNascita, visitData.dataVisita)}
                  onChange={(campo, valore) => handleVisitaChange(campo, valore)}
                />

                <Divider className="my-2" />

                {/* Peso corporeo + BMI */}
                {altezzaCm == null && (
                  <div className="mb-3 rounded-xl border border-dashed border-primary-200 bg-gradient-to-r from-primary-50/70 via-white to-primary-50/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary">
                        <Ruler size={14} />
                      </div>
                      <p className="text-xs font-semibold text-primary-800">
                        Inserisci l&apos;altezza (cm) per calcolare il BMI
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-2">
                      <Input
                        aria-label="Altezza in cm"
                        type="text"
                        inputMode="numeric"
                        size="sm"
                        variant="bordered"
                        placeholder="Es. 175"
                        className="w-full"
                        classNames={{ base: "w-full" }}
                        value={altezzaPendingInput}
                        onValueChange={(v) => {
                          if (!isValidHeightInputDraft(v)) return;
                          setAltezzaPendingInput(v);
                        }}
                      />
                      <Button
                        size="sm"
                        color="primary"
                        className="corioli-cta w-full"
                        isLoading={savingAltezza}
                        onPress={() => void handleSaveAltezza()}
                      >
                        Salva
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Peso (kg)"
                    type="text"
                    inputMode="decimal"
                    size="sm"
                    variant="bordered"
                    labelPlacement="outside"
                    value={
                      pesoCorporeoDraft ??
                      (visitaData.pesoCorporeo === 0
                        ? ""
                        : String(visitaData.pesoCorporeo))
                    }
                    onFocus={() => {
                      setPesoCorporeoDraft(
                        visitaData.pesoCorporeo > 0
                          ? String(visitaData.pesoCorporeo)
                          : "",
                      );
                    }}
                    onBlur={() => {
                      if (pesoCorporeoDraft !== null) {
                        commitBodyWeight(pesoCorporeoDraft);
                      }
                      setPesoCorporeoDraft(null);
                    }}
                    onValueChange={(v) => {
                      if (!isValidWeightInputDraft(v)) return;
                      setPesoCorporeoDraft(v);
                      liveBodyWeight(v);
                    }}
                    placeholder="Es. 75"
                  />
                  <Input
                    label="Vita (cm)"
                    aria-label="Circonferenza vita in cm"
                    type="text"
                    inputMode="numeric"
                    size="sm"
                    variant="bordered"
                    labelPlacement="outside"
                    placeholder="Es. 92"
                    value={visitaData.circonferenzaVita ? String(visitaData.circonferenzaVita) : ""}
                    onValueChange={(v) => {
                      if (!/^\d{0,3}$/.test(v)) return;
                      handleVisitaChange("circonferenzaVita", v === "" ? 0 : parseInt(v, 10));
                    }}
                    isInvalid={Boolean(
                      visitaData.circonferenzaVita >= 10 &&
                        validateCirconferenzaVita(visitaData.circonferenzaVita),
                    )}
                    errorMessage={
                      visitaData.circonferenzaVita >= 10
                        ? validateCirconferenzaVita(visitaData.circonferenzaVita) ?? undefined
                        : undefined
                    }
                  />
                </div>

                <IndiciCorporei
                  pesoKg={visitaData.pesoCorporeo}
                  altezzaCm={altezzaCm}
                  vitaCm={visitaData.circonferenzaVita}
                  sesso={patient.sesso}
                  eta={calculateAge(patient.dataNascita, visitData.dataVisita)}
                />
              </CardBody>
            </Card>

            <Card className="shadow-sm border border-default-200 bg-white">
              <CardHeader className="pb-0 pt-4 px-4 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                Immagini allegate
              </CardHeader>
              <CardBody className="px-4 py-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {immagini.length}/{MAX_IMAGES} immagini
                  </span>
                </div>

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:border-primary cursor-pointer text-sm">
                  <ImagePlus size={16} />
                  Carica immagini
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleImagesUpload(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                {immagini.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {immagini.map((image, idx) => (
                      <div
                        key={`img-${idx}`}
                        className="relative group border rounded-lg overflow-hidden bg-gray-50"
                      >
                        <img
                          src={image}
                          alt={`Immagine allegata ${idx + 1}`}
                          className="w-full h-28 object-cover cursor-zoom-in"
                          onClick={() => setFullscreenImage(image)}
                          title="Clicca per ingrandire"
                        />
                        <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">
                          Clicca per ingrandire
                        </span>
                        <button
                          type="button"
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveImage(idx)}
                          aria-label="Rimuovi immagine"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* RIGHT COLUMN: Referto Testuale */}
          <div className="w-full lg:flex-1 space-y-6">
            <Card className="shadow-sm border border-default-200 bg-white">
              {/* "Copia visita precedente" sta qui e non su una riga sua in
                  cima al form, come su Corioli Cardiologia: lasciava spazio
                  vuoto sopra le colonne, e solo nelle visite nuove. */}
              <CardHeader className="flex items-center justify-between gap-3 pb-0 pt-4 px-6">
                <span className="font-semibold text-gray-700 uppercase text-xs tracking-wider">
                  Referto medico
                </span>
                {!isEditMode && (
                  <Button
                    color="primary"
                    variant="flat"
                    size="sm"
                    onPress={handleCopyPreviousVisit}
                    isDisabled={!canCopyOrClear}
                    startContent={<Copy size={16} />}
                  >
                    {copiedPrevious ? "Svuota campi" : "Copia visita precedente"}
                  </Button>
                )}
              </CardHeader>
              <CardBody className="p-6 space-y-8">
                {/* Sezione 1: Descrizione */}
                <div className="space-y-2 group">
                  <label className="text-sm font-bold text-gray-700 block mb-1">
                    1. Descrizione del problema / dati clinici
                  </label>
                  <RefertoTextarea
                    value={visitaData.problemaClinico}
                    onValueChange={(value) =>
                      handleVisitaChange("problemaClinico", value)
                    }
                    variant="bordered"
                    minRows={3}
                    placeholder="Il paziente riferisce..."
                  />
                </div>

                {/* Sezione 2: Anamnesi */}
                {renderAnamnesiSection()}

                {/* Sezione 3: Esame Obiettivo */}
                <div className="space-y-2 relative group">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-sm font-bold text-gray-700">
                      3. Esame obiettivo
                    </label>
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === "visita" &&
                          t.section === "esameObiettivo",
                      )}
                      onSelect={(t) => handleTemplateSelect("esameObiettivo", t)}
                    />
                  </div>
                  <RefertoTextarea
                    value={visitaData.esameObiettivo}
                    onValueChange={(value) =>
                      handleVisitaChange("esameObiettivo", value)
                    }
                    variant="bordered"
                    minRows={5}
                    placeholder="Condizioni generali, esame obiettivo per apparati..."
                  />
                </div>

                {/* Sezione 4: Accertamenti */}
                <div className="space-y-2 relative group">
                  <label className="text-sm font-bold text-gray-700 block mb-1">
                    4. Accertamenti
                  </label>
                  <RefertoTextarea
                    value={visitaData.accertamenti}
                    onValueChange={(value) =>
                      handleVisitaChange("accertamenti", value)
                    }
                    variant="bordered"
                    minRows={3}
                    placeholder="Esami visionati o richiesti, referti in atti..."
                  />
                </div>

                {/* Sezione 5: Conclusioni e terapia */}
                <div className="space-y-2 relative group">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-sm font-bold text-gray-700">
                      5. Conclusioni e terapia
                    </label>
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          (t.category === "visita" &&
                            t.section === "conclusioni") ||
                          t.category === "terapie",
                      )}
                      onSelect={(t) =>
                        handleTemplateSelect("terapiaSpecifica", t)
                      }
                    />
                  </div>
                  <RefertoTextarea
                    value={visitaData.terapiaSpecifica}
                    onValueChange={(value) =>
                      handleVisitaChange("terapiaSpecifica", value)
                    }
                    variant="bordered"
                    minRows={3}
                    placeholder="Si consiglia..."
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </form>

      {fullscreenImage && (
        <div
          className="fixed inset-x-0 bottom-0 top-barra z-[200] flex items-center justify-center p-6"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute top-3 right-3 z-10 rounded-full bg-white/95 border border-gray-200 text-gray-700 p-2 shadow-md hover:bg-white"
              onClick={() => setFullscreenImage(null)}
              aria-label="Chiudi anteprima immagine"
            >
              <X size={18} />
            </button>
            <img
              src={fullscreenImage}
              alt="Immagine ingrandita"
              className="max-w-[92vw] max-h-[92vh] object-contain rounded-2xl border border-gray-200 bg-white p-1 shadow-[0_22px_55px_rgba(0,0,0,0.22)]"
            />
          </div>
        </div>
      )}

      <AppModal
        isOpen={isIncludeImagesModalOpen}
        onClose={() => resolveIncludeImages(false)}
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
            <Button variant="light" onPress={() => resolveIncludeImages(false)}>
              No, genera senza immagini
            </Button>
            <Button color="primary" onPress={() => resolveIncludeImages(true)}>
              Si, includi immagini
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      <AppModal
        isOpen={isFlattenAnamnesiModalOpen}
        onClose={() => resolveFlattenAnamnesi(null)}
        size="md"
      >
        <ModalContent>
          <ModalHeader>Conversione anamnesi non automatica</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              La visita precedente ha un&apos;anamnesi scritta in un{" "}
              <span className="font-semibold">unico campo</span>, mentre questa
              visita usa l&apos;anamnesi a{" "}
              <span className="font-semibold">sezioni multiple</span>. Non è
              possibile suddividerla automaticamente nelle singole sezioni.
            </p>
            <p className="text-sm text-gray-600">
              Puoi <span className="font-semibold">distribuirla manualmente</span>{" "}
              (copiando dal testo qui sotto) oppure importarla tutta in una
              sezione e poi spostarne le parti.
            </p>
            {flattenAnamnesiSource && (
              <div className="max-h-32 overflow-auto rounded-lg border border-default-200 bg-default-50 p-2 text-xs text-gray-700 whitespace-pre-wrap select-text">
                {flattenAnamnesiSource}
              </div>
            )}
            <Select
              label="Importa tutto nella sezione"
              variant="bordered"
              labelPlacement="outside"
              selectedKeys={
                flattenAnamnesiSelected ? [flattenAnamnesiSelected] : []
              }
              onSelectionChange={(keys) =>
                setFlattenAnamnesiSelected((Array.from(keys)[0] as string) ?? "")
              }
            >
              {flattenAnamnesiOptions.map((o) => (
                <SelectItem key={o.key}>{o.label}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => resolveFlattenAnamnesi(null)}>
              Distribuisci manualmente
            </Button>
            <Button
              color="primary"
              isDisabled={!flattenAnamnesiSelected}
              onPress={() =>
                resolveFlattenAnamnesi(flattenAnamnesiSelected || null)
              }
            >
              Importa nella sezione
            </Button>
          </ModalFooter>
        </ModalContent>
      </AppModal>

      {doctorProfileIncompleteModal}
    </div>
  );
}
