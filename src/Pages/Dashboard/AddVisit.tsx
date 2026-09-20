import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
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
  Chip,
  Checkbox,
  Switch,
  Tooltip,
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
  normalizzaPressioneArteriosa,
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
  BookOpen,
  Info,
  Plus,
} from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { Breadcrumb } from "../../components/Breadcrumb";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import { useDoctorProfileIncompleteModal } from "../../components/DoctorProfileIncompleteModal";
import {
  getMissingDoctorProfileFields,
  isDoctorProfileComplete,
} from "../../utils/doctorProfile";
import { AppModal } from "../../components/AppModal";
import { ProntuarioModal } from "../../components/cardio/ProntuarioModal";
import { ProntuarioImagingModal } from "../../components/cardio/ProntuarioImagingModal";
import { applicaBozze } from "../../utils/bozzeMisure";
import {
  MODULI_OPZIONALI,
  MODULI_VISITA_SPENTI,
  leggiModuliVisita,
  leggiProntuarioAttivo,
  type ChiaveModuloOpzionale,
  type ModuliVisitaAttivi,
} from "../../utils/moduliVisita";
import {
  CalcSuggestion,
  CardColonna,
  GruppoCampi,
  InfoTabella,
  MisuraInput,
  PosizionePaSelettore,
  RigaCalcolata,
  StrisciaCalcolati,
  ModuloCollassabile,
  ModuloHeader,
  NoteCampo,
  PrecedenteTesto,
  RiquadroTarget,
} from "../../components/cardio/CardioFields";
import {
  calcolaEgfrCkdEpi,
  calcolaHomaIr,
  calcolaLdlFriedewald,
  calcolaNonHdl,
  calcolaCaloNotturno,
  calcolaPercentualeFcMax,
  calcolaRapportoCtHdl,
  calcolaRapportoTgHdl,
  calcolaQtcBazett,
  calcolaScore2,
  stadioKdigo,
} from "../../utils/cardioCalcs";
import {
  SCORE2_CATEGORIA_LABELS,
  categoriaRischioScore2,
  sogliaCategoriaScore2,
} from "../../utils/cardioCalcs";
import {
  SCORE2_DEFAULT_REGION,
  SCORE2_REGION_LABELS,
  type Score2Region,
} from "../../utils/score2Coefficients";
import {
  costruisciPrecedenti,
  costruisciSerie,
  dataBreve,
} from "../../utils/confrontoMisure";
import {
  CATEGORIA_RISCHIO_LABELS,
  CATEGORIE_RISCHIO_CV,
  FATTORI_RISCHIO_CV,
  TARGET_APOB,
  TARGET_LDL,
  confrontaConTarget,
  descriviTargetLdl,
  type CategoriaRischioCv,
} from "../../utils/rischioCv";
import {
  CLASSI_NYHA,
  CONTESTO_BNP_LABELS,
  NYHA_LABELS,
  confondentiNtProBnp,
  fenotipoConStorico,
  valutaNtProBnp,
  type ContestoBnp,
  riferimentoNtProBnp,
} from "../../utils/scompenso";
import {
  BURDEN_PLACCA,
  SENZA_MENZIONE,
  SENZA_MENZIONE_LABEL,
  CAD_RADS_CATEGORIE,
  ESITI_FFR_CT,
  MODIFICATORI_CAD_RADS,
  SEGMENTI_SCCT,
  SOGLIA_CAC_PREDEFINITA,
  categoriaCac,
  coerenzaComponenti,
  descriviVariazione,
  percentileMesa,
  progressioneCac,
  type SogliaCacSevera,
} from "../../utils/tcCoronarica";
import {
  FATTORI_CHADSVASC,
  FATTORI_HASBLED,
  calcolaChadsVasc,
  calcolaHasBled,
  type FattoreHasBled,
} from "../../utils/fibrillazioneAtriale";
import {
  FASCE_HOMA_IR,
  scomponiPressione,
  valutaMisura,
  valutaPressione,
  type ChiaveMisura,
  type LivelloSegnale,
} from "../../utils/rangeClinici";

function getAltezzaCmForBmi(patient: Patient | null): number | null {
  if (patient?.altezza == null || patient.altezza <= 0) return null;
  return parseOptionalHeight(String(patient.altezza)) ?? null;
}

/**
 * Colore del riquadro BMI per livello.
 *
 * Qui il verde del `nella-norma` ci sta: il riquadro e' uno solo e resta
 * sempre acceso, quindi il colore distingue le fasce invece di segnalare
 * un'eccezione in mezzo a molti campi neutri.
 */
const RIQUADRO_BMI: Record<LivelloSegnale, string> = {
  "nella-norma": "text-success-700 bg-success-50 border-success-200",
  attenzione: "text-warning-700 bg-warning-50 border-warning-200",
  alterato: "text-danger-700 bg-danger-50 border-danger-200",
};

function computeBmi(weightKg: number, heightCm: number): number | null {
  const h = heightCm / 100;
  if (!(h > 0) || !(weightKg > 0)) return null;
  const bmi = weightKg / (h * h);
  return Number.isFinite(bmi) ? bmi : null;
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
  posizionePa: "" as "" | "clino" | "orto",
  pressioneArteriosa2: "",
  posizionePa2: "" as "" | "clino" | "orto",
  frequenzaCardiaca: "",
  fumatore: "" as "" | "si" | "no",
  categoriaRischioCv: "" as "" | CategoriaRischioCv,
  sintesiRischio: "",
  immagini: [] as string[],
  ecg: {} as NonNullable<NonNullable<Visit["visita"]>["ecg"]>,
  ecocardiogramma: {} as NonNullable<
    NonNullable<Visit["visita"]>["ecocardiogramma"]
  >,
  tcCoronarica: {} as NonNullable<NonNullable<Visit["visita"]>["tcCoronarica"]>,
  laboratorio: {} as NonNullable<NonNullable<Visit["visita"]>["laboratorio"]>,
  testErgometrico: {} as NonNullable<
    NonNullable<Visit["visita"]>["testErgometrico"]
  >,
  holterEcg: {} as NonNullable<NonNullable<Visit["visita"]>["holterEcg"]>,
  holterPressorio: {} as NonNullable<
    NonNullable<Visit["visita"]>["holterPressorio"]
  >,
  dopplerTsa: {} as NonNullable<NonNullable<Visit["visita"]>["dopplerTsa"]>,
  scompenso: {} as NonNullable<NonNullable<Visit["visita"]>["scompenso"]>,
  fibrillazioneAtriale: {} as NonNullable<
    NonNullable<Visit["visita"]>["fibrillazioneAtriale"]
  >,
  fattoriRischio: {} as NonNullable<
    NonNullable<Visit["visita"]>["fattoriRischio"]
  >,
});

/** Blocchi annidati della visita, aggiornati con lo stesso handler. */
type BloccoVisita =
  | "ecg"
  | "ecocardiogramma"
  | "tcCoronarica"
  | "laboratorio"
  | "testErgometrico"
  | "holterEcg"
  | "holterPressorio"
  | "dopplerTsa"
  | "scompenso"
  | "fibrillazioneAtriale"
  | "fattoriRischio";

/**
 * Da fattore del punteggio a campo salvato.
 *
 * I due punteggi condividono l'ictus pregresso: senza il prefisso finirebbero
 * sullo stesso campo e spuntarlo di qua lo spunterebbe anche di la', mentre
 * sono due domande diverse sullo stesso evento.
 */
const CAMPO_CHADSVASC: Record<"scompenso" | "ictus" | "vascolare", string> = {
  scompenso: "cvScompenso",
  ictus: "cvIctus",
  vascolare: "cvVascolare",
};

const CAMPO_HASBLED: Record<FattoreHasBled, string> = {
  ipertensioneNonControllata: "hbIpertensioneNonControllata",
  funzioneRenale: "hbFunzioneRenale",
  funzioneEpatica: "hbFunzioneEpatica",
  ictus: "hbIctus",
  sanguinamento: "hbSanguinamento",
  inrLabile: "hbInrLabile",
  farmaci: "hbFarmaci",
  alcol: "hbAlcol",
};

/**
 * Riquadro con il totale di un punteggio, le voci che lo compongono e la sua
 * lettura.
 *
 * Le voci sono elencate di proposito: un "5" da solo non e' verificabile,
 * mentre l'elenco permette al medico di accorgersi al volo di una casella
 * spuntata per sbaglio senza dover ricontare a mente.
 */
function RiquadroPunteggio({
  titolo,
  esito,
  allarme,
  inFondo,
  children,
}: {
  titolo: string;
  esito:
    | { ok: true; esito: { punteggio: number; massimo: number; voci: { label: string; punti: number }[]; nota: string } }
    | { ok: false; reason: string };
  /** `true` colora il riquadro: usato dall'HAS-BLED sopra soglia. */
  allarme?: boolean;
  /**
   * Spinge il riquadro in fondo alla colonna.
   *
   * Serve quando due punteggi stanno affiancati e hanno un numero diverso di
   * fattori: senza, i due totali finiscono a quote diverse e il confronto a
   * colpo d'occhio — che e' il motivo per cui sono affiancati — si perde.
   */
  inFondo?: boolean;
  children?: ReactNode;
}) {
  const fondo = inFondo ? "mt-auto" : "";
  if (!esito.ok) {
    return (
      <div className={`rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 ${fondo}`}>
        <p className="text-xs font-semibold text-warning-700">{titolo}</p>
        <p className="mt-0.5 text-xs text-default-600">{esito.reason}</p>
      </div>
    );
  }
  const { punteggio, massimo, voci, nota } = esito.esito;
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${fondo} ${
        allarme
          ? "border-warning-300 bg-warning-50"
          : "border-default-200 bg-default-50/60"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-default-500">{titolo}</p>
        <p className="text-lg font-semibold leading-none text-gray-800">
          {punteggio}
          <span className="text-xs font-normal text-default-500">
            {" "}
            / {massimo}
          </span>
        </p>
      </div>
      {voci.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-default-200/70 pt-1.5">
          {voci.map((v) => (
            <li
              key={v.label}
              className="flex justify-between gap-2 text-xs text-default-600"
            >
              <span>{v.label}</span>
              <span className="tabular-nums text-default-500">+{v.punti}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-default-600">{nota}</p>
      {children}
    </div>
  );
}

/** Estrae la sistolica da "130/85" per alimentare SCORE2. */
function parseSistolica(pa: string | undefined): number | undefined {
  const m = /^(\d{2,3})\s*\/\s*\d{2,3}$/.exec((pa ?? "").trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Converte lo stato del form nella forma salvata su disco: i blocchi vuoti
 * diventano `undefined` invece di oggetti `{}`, così una visita senza ECG non
 * porta con sé strutture vuote e la cronologia non registra falsi cambiamenti.
 */
function visitaPerSalvataggio(
  v: ReturnType<typeof createDefaultVisitaData>,
): NonNullable<Visit["visita"]> {
  const vuoto = (o: object) =>
    Object.values(o).every((x) => x === undefined || x === "" || x === null);
  return {
    problemaClinico: v.problemaClinico,
    prestazione: v.prestazione,
    esameObiettivo: v.esameObiettivo,
    accertamenti: v.accertamenti,
    terapiaSpecifica: v.terapiaSpecifica,
    pesoCorporeo: v.pesoCorporeo,
    pressioneArteriosa: v.pressioneArteriosa,
    ...(v.posizionePa ? { posizionePa: v.posizionePa } : {}),
    ...(v.pressioneArteriosa2?.trim()
      ? {
          pressioneArteriosa2: v.pressioneArteriosa2,
          ...(v.posizionePa2 ? { posizionePa2: v.posizionePa2 } : {}),
        }
      : {}),
    frequenzaCardiaca: v.frequenzaCardiaca,
    ...(v.fumatore === "si" || v.fumatore === "no"
      ? { fumatore: v.fumatore }
      : {}),
    ...(v.categoriaRischioCv
      ? { categoriaRischioCv: v.categoriaRischioCv }
      : {}),
    ...(v.sintesiRischio?.trim() ? { sintesiRischio: v.sintesiRischio } : {}),
    immagini: v.immagini,
    ...(vuoto(v.ecg) ? {} : { ecg: v.ecg }),
    ...(vuoto(v.ecocardiogramma) ? {} : { ecocardiogramma: v.ecocardiogramma }),
    ...(vuoto(v.tcCoronarica) ? {} : { tcCoronarica: v.tcCoronarica }),
    ...(vuoto(v.laboratorio) ? {} : { laboratorio: v.laboratorio }),
    ...(vuoto(v.scompenso) ? {} : { scompenso: v.scompenso }),
    ...(vuoto(v.fibrillazioneAtriale)
      ? {}
      : { fibrillazioneAtriale: v.fibrillazioneAtriale }),
    ...(vuoto(v.fattoriRischio) ? {} : { fattoriRischio: v.fattoriRischio }),
    ...(vuoto(v.testErgometrico) ? {} : { testErgometrico: v.testErgometrico }),
    ...(vuoto(v.holterEcg) ? {} : { holterEcg: v.holterEcg }),
    ...(vuoto(v.holterPressorio)
      ? {}
      : { holterPressorio: v.holterPressorio }),
    ...(vuoto(v.dopplerTsa) ? {} : { dopplerTsa: v.dopplerTsa }),
  };
}

/**
 * Errore della seconda pressione, detto come tale: con due misurazioni il
 * messaggio da solo non direbbe quale delle due correggere.
 */
function validateSecondaPressione(value?: string): string | null {
  const errore = validatePressioneArteriosa(value);
  return errore ? `Seconda misurazione: ${errore}` : null;
}

/**
 * Ogni misura numerica del referto, indicizzata con la stessa chiave che il
 * campo usa per la sua bozza di digitazione.
 *
 * `path` e' il percorso del valore dentro `visita` e serve sia a ritrovare il
 * valore della visita precedente sia a leggere quello corrente; `range` e' la
 * soglia clinica da applicare, assente per le misure che da sole non hanno un
 * limite di riferimento (i diametri ventricolari vanno indicizzati per
 * superficie corporea, l'insulinemia si legge solo dentro l'HOMA).
 *
 * Tenerla in un punto unico evita di ripetere percorso e soglia su una
 * trentina di campi, dove un refuso passerebbe inosservato.
 */
const MISURE: Record<string, { path: string; range?: ChiaveMisura }> = {
  // Laboratorio
  "lab.tot": { path: "laboratorio.colesteroloTotale" },
  "lab.hdl": { path: "laboratorio.hdl" },
  "lab.tg": { path: "laboratorio.trigliceridi", range: "lab.trigliceridi" },
  "lab.ldl": { path: "laboratorio.ldlMisurato", range: "lab.ldl" },
  "lab.gli": { path: "laboratorio.glicemia", range: "lab.glicemia" },
  "lab.ins": { path: "laboratorio.insulina" },
  "lab.hba1c": { path: "laboratorio.hba1c", range: "lab.hba1c" },
  "lab.crea": { path: "laboratorio.creatinina" },
  "lab.alb": { path: "laboratorio.albuminuria", range: "lab.albuminuria" },
  "lab.hb": { path: "laboratorio.emoglobina", range: "lab.emoglobina" },
  "lab.apob": { path: "laboratorio.apoB", range: "lab.apoB" },
  "lab.lpa": { path: "laboratorio.lpa", range: "lab.lpa" },
  "lab.ast": { path: "laboratorio.ast", range: "lab.ast" },
  "lab.alt": { path: "laboratorio.alt", range: "lab.alt" },
  "lab.uric": { path: "laboratorio.uricemia", range: "lab.uricemia" },
  // Nessuna soglia finche' non la indica il cardiologo.
  "lab.azot": { path: "laboratorio.azotemia" },
  "lab.tsh": { path: "laboratorio.tsh", range: "lab.tsh" },
  "lab.hspcr": { path: "laboratorio.hsPcr", range: "lab.hsPcr" },
  "lab.fibr": { path: "laboratorio.fibrinogeno" },
  // Nessuna soglia: il dosaggio delle LDL ossidate non e' standardizzato e i
  // valori di riferimento cambiano da un laboratorio all'altro.
  "lab.oxldl": { path: "laboratorio.oxLdl" },
  // Elettrocardiogramma
  "ecg.pr": { path: "ecg.pr", range: "ecg.pr" },
  "ecg.qrs": { path: "ecg.qrs", range: "ecg.qrs" },
  "ecg.qt": { path: "ecg.qt" },
  "ecg.asse": { path: "ecg.asse" },
  // Ecocardiogramma
  "eco.ddvs": { path: "ecocardiogramma.ddvs" },
  "eco.dsvs": { path: "ecocardiogramma.dsvs" },
  "eco.siv": { path: "ecocardiogramma.siv", range: "eco.siv" },
  "eco.pp": { path: "ecocardiogramma.pp", range: "eco.pp" },
  "eco.fe": { path: "ecocardiogramma.fe", range: "eco.fe" },
  "eco.as": { path: "ecocardiogramma.atrioSinistro", range: "eco.atrioSinistro" },
  // Valvole senza soglia, gradienti e AVA: le fasce di gravita' delle
  // valvulopatie le deve dare il referente clinico.
  "eco.gradmed": { path: "ecocardiogramma.gradienteAorticoMedio" },
  "eco.gradmax": { path: "ecocardiogramma.gradienteAorticoMassimo" },
  "eco.ava": { path: "ecocardiogramma.areaValvolareAortica" },
  "eco.mitmed": { path: "ecocardiogramma.gradienteMitralicoMedio" },
  "eco.mitmax": { path: "ecocardiogramma.gradienteMitralicoMassimo" },
  "eco.rad": { path: "ecocardiogramma.radiceAortica" },
  "eco.aoasc": {
    path: "ecocardiogramma.aortaAscendente",
    range: "eco.aortaAscendente",
  },
  "eco.tapse": { path: "ecocardiogramma.tapse", range: "eco.tapse" },
  "eco.paps": { path: "ecocardiogramma.paps", range: "eco.paps" },
  "eco.ea": { path: "ecocardiogramma.rapportoEA" },
  // TC coronarica
  "tc.cac": { path: "tcCoronarica.cacScore" },
  // Scompenso
  "sc.bnp": { path: "scompenso.ntProBnp" },
  // Test ergometrico
  "erg.durata": { path: "testErgometrico.durataMin" },
  "erg.watt": { path: "testErgometrico.caricoWatt" },
  "erg.mets": { path: "testErgometrico.mets" },
  "erg.fcmax": { path: "testErgometrico.fcMax" },
  "erg.fcpct": { path: "testErgometrico.fcMaxTeoricaPct" },
  // Holter ECG
  "hecg.durata": { path: "holterEcg.durataOre" },
  "hecg.fcmedia": { path: "holterEcg.fcMedia" },
  "hecg.fcmin": { path: "holterEcg.fcMin" },
  "hecg.fcmax": { path: "holterEcg.fcMax" },
  "hecg.besv": { path: "holterEcg.besv" },
  "hecg.bev": { path: "holterEcg.bev" },
  "hecg.pausa": { path: "holterEcg.pausaMaxSec" },
  // Holter pressorio
  "hp.m24s": { path: "holterPressorio.media24Sist" },
  "hp.m24d": { path: "holterPressorio.media24Diast" },
  "hp.mds": { path: "holterPressorio.mediaDiurnaSist" },
  "hp.mdd": { path: "holterPressorio.mediaDiurnaDiast" },
  "hp.mns": { path: "holterPressorio.mediaNotturnaSist" },
  "hp.mnd": { path: "holterPressorio.mediaNotturnaDiast" },
  "hp.calo": { path: "holterPressorio.caloNotturnoPct" },
  "hp.carico": { path: "holterPressorio.caricoPressorioPct" },
  // Doppler TSA
  "tsa.imt": { path: "dopplerTsa.imtMax" },
  "tsa.stenosi": { path: "dopplerTsa.stenosiCarotidea" },
};

/**
 * Prefissi dei moduli in cui il grafico dell'andamento non compare.
 *
 * Deciso dal cardiologo il 18 settembre 2026 guardando i campi uno per uno:
 * sono esami che non si ripetono a distanza utile — "le TAC non le fai ogni
 * anno, la fai al limite ogni cinque" — e fra un Holter e il successivo il
 * confronto lo scrive lui nel referto. Il valore della visita precedente resta:
 * quello che ha tolto e' il grafico, non il confronto.
 *
 * Il laboratorio lo tiene, perche' vedere la traiettoria e' il motivo per cui
 * quegli esami si ripetono, e lo tiene la stenosi carotidea, che e' il caso che
 * gli capita davvero: un 40% che diventa 50% e il paziente senza l'esame
 * vecchio in mano.
 */
const MODULI_SENZA_ANDAMENTO = ["tc.", "erg.", "hecg.", "hp."];

/**
 * Campi di misura con una bozza ma senza confronto con la visita precedente, e
 * quindi fuori da `MISURE`: al salvataggio la loro bozza va riportata nella
 * visita come quella di tutti gli altri.
 */
const PERCORSI_SOLO_BOZZA: Record<string, string> = {
  "tc.calc": "tcCoronarica.componenteCalcifica",
  "tc.noncalc": "tcCoronarica.componenteNonCalcifica",
  "tc.stenosi": "tcCoronarica.stenosiMassima",
  "tc.ffr": "tcCoronarica.ffrCt",
};

/** Campo della visita in cui finisce la bozza di una misura. */
function percorsoBozza(chiave: string): string | undefined {
  return MISURE[chiave]?.path ?? PERCORSI_SOLO_BOZZA[chiave];
}

/**
 * Composizione dei pannelli di laboratorio, nell'ordine in cui li stampa un
 * referto: prima l'assetto lipidico, poi il glucidico, poi la funzione renale.
 *
 * Le chiavi sono quelle di `MISURE`, così il contatore dei campi compilati in
 * testa a ogni pannello legge gli stessi valori dei campi senza duplicare i
 * percorsi.
 */
const GRUPPI_LABORATORIO = {
  // "Burden aterogeno" e non piu' "assetto lipidico": nel pannello ci sta anche
  // l'aterosclerosi vista all'ecografo, che di lipidico non ha niente ed e' il
  // dato che pesa di piu' sulla classe di rischio.
  burden: [
    "lab.tot", "lab.hdl", "lab.tg", "lab.ldl", "lab.apob", "lab.lpa",
    "tsa.stenosi",
  ],
  infiammatorio: ["lab.hspcr", "lab.oxldl", "lab.fibr"],
  glucidico: ["lab.gli", "lab.ins", "lab.hba1c"],
  renale: ["lab.crea", "lab.alb"],
  altri: ["lab.ast", "lab.alt", "lab.uric", "lab.azot", "lab.hb", "lab.tsh"],
} as const;

/** Tutte le voci del laboratorio, per il conteggio in testata alla card. */
const CHIAVI_LABORATORIO = Object.values(GRUPPI_LABORATORIO).flat();

/**
 * Quali card della colonna dei parametri restano aperte.
 *
 * Sta in `localStorage` e non sulla visita: e' una preferenza di chi compila,
 * non un dato clinico. Chi apre venti visite di fila non deve richiudere venti
 * volte le stesse card. Per la stessa ragione una card che contiene dati
 * **non** si riapre da sola, come fa invece `ModuloCollassabile` nel referto:
 * qui la sintesi in testata dice cosa c'e' dentro senza bisogno di aprirla.
 */
const CHIAVE_CARD_COLONNA = "corioli_visita_card_colonna";

type CardColonnaChiave = "cliniche" | "laboratorio" | "rischio";

const CARD_COLONNA_DEFAULT: Record<CardColonnaChiave, boolean> = {
  cliniche: true,
  laboratorio: false,
  rischio: false,
};

function leggiCardColonnaAperte(): Record<CardColonnaChiave, boolean> {
  try {
    const salvato = localStorage.getItem(CHIAVE_CARD_COLONNA);
    if (!salvato) return CARD_COLONNA_DEFAULT;
    return {
      ...CARD_COLONNA_DEFAULT,
      ...(JSON.parse(salvato) as Partial<Record<CardColonnaChiave, boolean>>),
    };
  } catch {
    // Storage negato o JSON rovinato: si riparte dai default. Non e' un dato
    // da cui dipenda niente.
    return CARD_COLONNA_DEFAULT;
  }
}

/**
 * Chiave scelta in una tendina, con "nessuna menzione" tradotta in campo vuoto.
 *
 * Le tendine di NextUI non si riportano a vuoto una volta scelte: senza la voce
 * esplicita, un referto radiologico che non nomina il burden di placca usciva
 * comunque stampato con un valore fra P1 e P4.
 */
function senzaMenzione(keys: unknown): string {
  const k = (Array.from(keys as Iterable<unknown>)[0] as string) ?? "";
  return k === SENZA_MENZIONE ? "" : k;
}

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
  /** Bozze dei campi numerici dei moduli strumentali, indicizzate per chiave. */
  const [numDrafts, setNumDrafts] = useState<Record<string, string | null>>({});
  const draftOf = (key: string) => numDrafts[key] ?? null;
  const setDraft = (key: string, value: string | null) =>
    setNumDrafts((prev) => ({ ...prev, [key]: value }));
  /** Regione di rischio SCORE2 (predefinita: Italia). */
  const [score2Region, setScore2Region] = useState<Score2Region>(
    SCORE2_DEFAULT_REGION,
  );
  /** Soglia di calcificazione severa del centro (impostazioni): 300 o 400. */
  const [sogliaCac, setSogliaCac] = useState<SogliaCacSevera>(
    SOGLIA_CAC_PREDEFINITA,
  );
  /**
   * Moduli opzionali accesi nelle impostazioni. Spenti finche' le preferenze
   * non dicono il contrario: e' lo stato in cui la visita deve presentarsi a
   * chi apre l'app per la prima volta.
   */
  const [moduliAttivi, setModuliAttivi] = useState<ModuliVisitaAttivi>(
    () => ({ ...MODULI_VISITA_SPENTI }),
  );
  /** Il prontuario e' consultabile dalla visita. */
  const [prontuarioAttivo, setProntuarioAttivo] = useState(false);

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
        return sortedVisits;
      };

      /**
       * Riporta i fattori di rischio dall'ultima visita che ne ha.
       *
       * Sono anamnestici e non cambiano da un controllo all'altro: richiederli
       * a ogni visita sarebbe esattamente il tempo perso che rende i referti
       * cardiologici volutamente scarni. Restano modificabili, e la copia e'
       * per visita, cosi' resta la storia di quando un fattore e' comparso.
       *
       * Si applica **solo alla visita nuova**: in modifica i valori devono
       * restare quelli salvati.
       */
      const riportaFattoriRischio = (visite: Visit[]) => {
        const precedente = visite.find((v) => v.visita?.fattoriRischio);
        const fattori = precedente?.visita?.fattoriRischio;
        if (!fattori) return;
        setVisitaData((prev) => ({ ...prev, fattoriRischio: { ...fattori } }));
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
                pressioneArteriosa2: visit.visita?.pressioneArteriosa2 ?? "",
                posizionePa2: visit.visita?.posizionePa2 ?? "",
                frequenzaCardiaca: visit.visita?.frequenzaCardiaca ?? "",
                fumatore: visit.visita?.fumatore ?? "",
                categoriaRischioCv: visit.visita?.categoriaRischioCv ?? "",
                sintesiRischio: visit.visita?.sintesiRischio ?? "",
                immagini: visit.visita?.immagini ?? [],
                ecg: visit.visita?.ecg ?? {},
                ecocardiogramma: visit.visita?.ecocardiogramma ?? {},
                tcCoronarica: visit.visita?.tcCoronarica ?? {},
                laboratorio: visit.visita?.laboratorio ?? {},
                scompenso: visit.visita?.scompenso ?? {},
                testErgometrico: visit.visita?.testErgometrico ?? {},
                holterEcg: visit.visita?.holterEcg ?? {},
                holterPressorio: visit.visita?.holterPressorio ?? {},
                fibrillazioneAtriale: visit.visita?.fibrillazioneAtriale ?? {},
                fattoriRischio: visit.visita?.fattoriRischio ?? {},
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
            if (patientData) {
              riportaFattoriRischio(await loadPatientVisits(patientData.id));
            }
          } catch {
            setError("Errore nel caricamento dati paziente");
          }
        } else if (patientCf) {
          try {
            const patientData = await PatientService.getPatientByCF(patientCf);
            setPatient(patientData);
            if (patientData) {
              riportaFattoriRischio(await loadPatientVisits(patientData.id));
            }
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
        // Soglia di calcificazione severa impostata dal centro: 300 o 400.
        const soglia = Number(prefs?.sogliaCacSevera);
        setSogliaCac(soglia === 400 ? 400 : SOGLIA_CAC_PREDEFINITA);
        setModuliAttivi(leggiModuliVisita(prefs));
        setProntuarioAttivo(leggiProntuarioAttivo(prefs));
      } catch {
        setAnamnesiConfig(createDefaultAnamnesiConfig());
        setModuliAttivi({ ...MODULI_VISITA_SPENTI });
        setProntuarioAttivo(false);
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

  /**
   * La visita come va salvata e stampata: i dati della maschera piu' le bozze
   * non ancora confermate.
   *
   * I campi di misura e il peso passano nella visita quando perdono il focus,
   * e chi preme "Salva Visita" o "Stampa" subito dopo aver digitato l'ultimo
   * valore non esce mai dal campo: salvataggio e stampa partivano dai dati di
   * prima, e quel numero spariva senza avviso. Leggono entrambi da qui, cosi'
   * il foglio porta esattamente quello che e' stato salvato.
   */
  const visitaCompleta = () => ({
    ...applicaBozze(visitaData, numDrafts, percorsoBozza),
    ...(pesoCorporeoDraft !== null
      ? { pesoCorporeo: parseWeightFieldBlur(pesoCorporeoDraft) }
      : {}),
    // "120 80" e "120-80" si salvano come "120/80": il separatore che si
    // digita non deve decidere se la visita si salva.
    pressioneArteriosa: normalizzaPressioneArteriosa(
      visitaData.pressioneArteriosa,
    ),
    pressioneArteriosa2: normalizzaPressioneArteriosa(
      visitaData.pressioneArteriosa2,
    ),
  });

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

      const visitaForSave = visitaCompleta();

      const paramErr =
        validateBodyWeight(visitaForSave.pesoCorporeo) ??
        validatePressioneArteriosa(visitaForSave.pressioneArteriosa) ??
        validateSecondaPressione(visitaForSave.pressioneArteriosa2) ??
        validateFrequenzaCardiaca(visitaForSave.frequenzaCardiaca);
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
        visita: visitaPerSalvataggio(visitaForSave),
      };

      if (isEditMode && existingVisit) {
        await VisitService.updateVisit(existingVisit.id, visitToSave);
        setHasUnsavedChanges(false);
        showToast("Visita aggiornata con successo!");
      } else {
        await VisitService.addVisit(visitToSave);
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
        pressioneArteriosa2: "",
        posizionePa2: "",
        frequenzaCardiaca: "",
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
      visita: visitaPerSalvataggio(visitaCompleta()),
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

  /**
   * "150 85" diventa "150/85" appena si esce dal campo, e non solo al
   * salvataggio: il cardiologo lo scriveva con lo spazio e vedeva restare lo
   * spazio (call dell'11 settembre 2026).
   */
  const normalizzaCampoPa = (
    campo: "pressioneArteriosa" | "pressioneArteriosa2",
  ) => {
    const attuale = visitaData[campo] ?? "";
    const normalizzata = normalizzaPressioneArteriosa(attuale);
    if (normalizzata !== attuale) handleVisitaChange(campo, normalizzata);
  };

  /** Aggiorna un campo dentro ECG / ecocardiogramma / TC coronarica / laboratorio. */
  const handleBloccoChange = (
    blocco: BloccoVisita,
    field: string,
    value: string | number | boolean | string[] | number[] | undefined,
  ) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    setVisitaData((prev) => {
      const corrente = { ...(prev[blocco] as Record<string, unknown>) };
      if (value === undefined || value === "") delete corrente[field];
      else corrente[field] = value;
      return { ...prev, [blocco]: corrente };
    });
  };

  /** Applica un modello al referto testuale di un modulo strumentale. */
  const applyBloccoTemplate = (blocco: BloccoVisita, text: string) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    setVisitaData((prev) => {
      const corrente = { ...(prev[blocco] as Record<string, unknown>) };
      const attuale = (corrente.referto as string) ?? "";
      corrente.referto = attuale ? `${attuale}\n${text}` : text;
      return { ...prev, [blocco]: corrente };
    });
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

  // ── Calcolatori: risultati derivati, mai scritti nei campi del referto ──
  const etaPaziente = useMemo(() => {
    const raw = calculateAge(patient?.dataNascita ?? "");
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [patient?.dataNascita]);

  const lab = visitaData.laboratorio;

  const ldlCalc = useMemo(
    () => calcolaLdlFriedewald(lab.colesteroloTotale, lab.hdl, lab.trigliceridi),
    [lab.colesteroloTotale, lab.hdl, lab.trigliceridi],
  );
  const nonHdlCalc = useMemo(
    () => calcolaNonHdl(lab.colesteroloTotale, lab.hdl),
    [lab.colesteroloTotale, lab.hdl],
  );
  const ctHdlCalc = useMemo(
    () => calcolaRapportoCtHdl(lab.colesteroloTotale, lab.hdl),
    [lab.colesteroloTotale, lab.hdl],
  );
  const tgHdlCalc = useMemo(
    () => calcolaRapportoTgHdl(lab.trigliceridi, lab.hdl),
    [lab.trigliceridi, lab.hdl],
  );
  const homaCalc = useMemo(
    () => calcolaHomaIr(lab.glicemia, lab.insulina),
    [lab.glicemia, lab.insulina],
  );
  const egfrCalc = useMemo(
    () =>
      calcolaEgfrCkdEpi(
        lab.creatinina,
        etaPaziente,
        patient?.sesso === "M" || patient?.sesso === "F" ? patient.sesso : undefined,
      ),
    [lab.creatinina, etaPaziente, patient?.sesso],
  );
  const qtcCalc = useMemo(
    () =>
      calcolaQtcBazett(
        visitaData.ecg.qt,
        visitaData.frequenzaCardiaca
          ? Number(visitaData.frequenzaCardiaca)
          : undefined,
      ),
    [visitaData.ecg.qt, visitaData.frequenzaCardiaca],
  );
  const score2Calc = useMemo(
    () =>
      calcolaScore2({
        eta: etaPaziente,
        sesso:
          patient?.sesso === "M" || patient?.sesso === "F" ? patient.sesso : undefined,
        fumatore:
          visitaData.fumatore === "si"
            ? true
            : visitaData.fumatore === "no"
              ? false
              : undefined,
        pas: parseSistolica(visitaData.pressioneArteriosa),
        colesteroloTotale: lab.colesteroloTotale,
        hdl: lab.hdl,
        region: score2Region,
      }),
    [
      etaPaziente,
      patient?.sesso,
      visitaData.fumatore,
      visitaData.pressioneArteriosa,
      lab.colesteroloTotale,
      lab.hdl,
      score2Region,
    ],
  );

  /** Sesso del paziente nella forma richiesta dalle soglie cliniche. */
  const sessoPaziente =
    patient?.sesso === "M" || patient?.sesso === "F" ? patient.sesso : undefined;

  /**
   * Ultimo valore noto di ogni misura, preso dalle visite precedenti dello
   * stesso paziente: e' quello che il medico dovrebbe altrimenti andare a
   * cercare aprendo la visita vecchia.
   */
  const precedenti = useMemo(
    () => costruisciPrecedenti(patientVisits, existingVisit?.id),
    [patientVisits, existingVisit?.id],
  );

  /**
   * Tutte le rilevazioni precedenti di ogni misura, per il grafico
   * dell'andamento. Costruite in un passaggio solo insieme ai precedenti:
   * l'elenco delle visite e' lo stesso.
   */
  const serieStoriche = useMemo(
    () => costruisciSerie(patientVisits, existingVisit?.id),
    [patientVisits, existingVisit?.id],
  );

  /** Valore corrente di una misura, dal percorso `blocco.campo`. */
  const valoreMisura = (path: string): number | undefined => {
    const [blocco, campo] = path.split(".");
    const b = (visitaData as unknown as Record<string, unknown>)[blocco] as
      | Record<string, unknown>
      | undefined;
    const v = b?.[campo];
    return typeof v === "number" ? v : undefined;
  };

  /**
   * Valore precedente e semaforo di soglia da agganciare a un `MisuraInput`,
   * usando la stessa chiave con cui il campo tiene la sua bozza.
   */
  const misura = (chiave: string) => {
    const def = MISURE[chiave];
    if (!def) return {};
    const conAndamento = !MODULI_SENZA_ANDAMENTO.some((prefisso) =>
      chiave.startsWith(prefisso),
    );
    return {
      precedente: precedenti[def.path],
      serie: conAndamento ? serieStoriche[def.path] : undefined,
      dataCorrente: visitData.dataVisita,
      segnale: def.range
        ? valutaMisura(def.range, valoreMisura(def.path), sessoPaziente)
        : undefined,
    };
  };

  /** True se il modulo contiene almeno un dato: decide se parte gia' aperto. */
  const bloccoCompilato = (blocco: BloccoVisita) =>
    Object.values(visitaData[blocco] as Record<string, unknown>).some(
      (v) => v !== undefined && v !== null && v !== "",
    );

  /**
   * Il modulo opzionale si vede: o e' acceso nelle impostazioni, o la visita
   * aperta ci ha gia' dentro dei dati.
   *
   * La seconda meta' non e' una cortesia: senza, riaprire una visita vecchia
   * farebbe sparire dalla maschera dei valori che il referto continua a
   * stampare, e il medico non avrebbe modo di correggerli. Vale anche per la
   * copia della visita precedente, che porta dentro i blocchi com'erano.
   *
   * Di qui un effetto che sembra strano e non lo e': l'ATS carotidea del
   * laboratorio e la stenosi massima del Doppler TSA sono lo stesso campo,
   * quindi scrivere la percentuale fra i lipidi fa comparire il modulo anche
   * da spento. E' il comportamento giusto — con quel valore il referto stampa
   * la sezione Doppler TSA, e tenerla nascosta vorrebbe dire stampare una
   * sezione che il medico non vede.
   */
  const moduloVisibile = (chiave: ChiaveModuloOpzionale) =>
    moduliAttivi[chiave] || bloccoCompilato(chiave);

  /**
   * Numeri delle sezioni che vengono dopo l'ecocardiogramma: dipendono da
   * quali moduli sono accesi. Con i numeri fissi, spegnerne uno lascerebbe un
   * buco nella sequenza (4, 5, 13) che sembra un difetto dell'app. Le prime
   * cinque sezioni ci sono sempre e tengono il loro numero.
   */
  const numeroSezione: Record<string, string> = (() => {
    const numeri: Record<string, string> = {};
    let n = 5;
    for (const modulo of MODULI_OPZIONALI) {
      if (moduloVisibile(modulo.chiave)) numeri[modulo.chiave] = String(++n);
    }
    numeri.accertamenti = String(++n);
    numeri.conclusioni = String(++n);
    return numeri;
  })();

  /**
   * Classe di rischio dichiarata dal medico. Guida gli obiettivi di LDL e ApoB:
   * finche' non e' indicata, i riquadri degli obiettivi restano spenti invece
   * di mostrare una soglia scelta da noi.
   */
  const categoriaRischio =
    visitaData.categoriaRischioCv === ""
      ? undefined
      : visitaData.categoriaRischioCv;

  /** LDL da confrontare con l'obiettivo: il dosato se c'e', altrimenti Friedewald. */
  const ldlEffettivo = useMemo(() => {
    if (lab.ldlMisurato != null) {
      return { valore: lab.ldlMisurato, fonte: "dosato" as const };
    }
    if (ldlCalc.ok) return { valore: ldlCalc.result.value, fonte: "stimato" as const };
    return null;
  }, [lab.ldlMisurato, ldlCalc]);

  const ldlTarget = useMemo(
    () => confrontaConTarget(ldlEffettivo?.valore, categoriaRischio, TARGET_LDL),
    [ldlEffettivo, categoriaRischio],
  );
  const apoBTarget = useMemo(
    () => confrontaConTarget(lab.apoB, categoriaRischio, TARGET_APOB),
    [lab.apoB, categoriaRischio],
  );

  /** Quanti campi di un pannello hanno gia' un valore, per il contatore. */
  const compilatiTra = (chiavi: readonly string[]) =>
    chiavi.filter((k) => {
      const def = MISURE[k];
      return def ? valoreMisura(def.path) != null : false;
    }).length;

  // ── Semafori sui valori derivati e sui parametri vitali ───────────────────
  const qtcSegnale = useMemo(
    () =>
      valutaMisura(
        "ecg.qtc",
        qtcCalc.ok ? qtcCalc.result.value : undefined,
        sessoPaziente,
      ),
    [qtcCalc, sessoPaziente],
  );
  const egfrSegnale = useMemo(
    () => valutaMisura("lab.egfr", egfrCalc.ok ? egfrCalc.result.value : undefined),
    [egfrCalc],
  );
  const ldlSegnale = useMemo(
    () => valutaMisura("lab.ldl", ldlCalc.ok ? ldlCalc.result.value : undefined),
    [ldlCalc],
  );
  const ctHdlSegnale = useMemo(
    () => valutaMisura("lab.ctHdl", ctHdlCalc.ok ? ctHdlCalc.result.value : undefined),
    [ctHdlCalc],
  );
  // La fascia dell'HOMA e' una soglia di riferimento come le altre: la scrive
  // `rangeClinici`, cosi' l'indice si presenta con la stessa etichetta colorata
  // degli altri valori invece di una frase tutta sua.
  const homaSegnale = useMemo(
    () => valutaMisura("lab.homa", homaCalc.ok ? homaCalc.result.value : undefined),
    [homaCalc],
  );
  const tgHdlSegnale = useMemo(
    () => valutaMisura("lab.tgHdl", tgHdlCalc.ok ? tgHdlCalc.result.value : undefined),
    [tgHdlCalc],
  );
  const pressioneSegnale = useMemo(() => {
    const { sistolica, diastolica } = scomponiPressione(
      visitaData.pressioneArteriosa,
    );
    return valutaPressione(sistolica, diastolica);
  }, [visitaData.pressioneArteriosa]);
  const pressione2Segnale = useMemo(() => {
    const { sistolica, diastolica } = scomponiPressione(
      visitaData.pressioneArteriosa2,
    );
    return valutaPressione(sistolica, diastolica);
  }, [visitaData.pressioneArteriosa2]);
  /**
   * Fenotipo dello scompenso: si ricava dalla FE dell'ecocardiogramma di questa
   * visita e non viene salvato, così se la FE viene corretta il fenotipo non
   * resta indietro.
   */
  const fenotipo = useMemo(
    () =>
      fenotipoConStorico(
        visitaData.ecocardiogramma.fe,
        serieStoriche["ecocardiogramma.fe"] ?? [],
      ),
    [visitaData.ecocardiogramma.fe, serieStoriche],
  );

  const altezzaCm = getAltezzaCmForBmi(patient);
  /**
   * BMI e fascia OMS. A differenza degli altri semafori il riquadro resta
   * visibile anche quando il valore e' normale — il numero va mostrato
   * comunque — quindi qui il livello `nella-norma` ha un colore suo invece di
   * far sparire l'indicatore.
   */
  const bmi = useMemo(
    () =>
      altezzaCm != null ? computeBmi(visitaData.pesoCorporeo, altezzaCm) : null,
    [visitaData.pesoCorporeo, altezzaCm],
  );
  const bmiSegnale = useMemo(
    () => valutaMisura("vitali.bmi", bmi ?? undefined),
    [bmi],
  );

  const esitoBnp = useMemo(
    () =>
      valutaNtProBnp(
        visitaData.scompenso.ntProBnp,
        visitaData.scompenso.contestoBnp,
        etaPaziente,
      ),
    [visitaData.scompenso.ntProBnp, visitaData.scompenso.contestoBnp, etaPaziente],
  );

  /**
   * La soglia contro cui si legge il valore, appena il contesto e' scelto e
   * anche prima che ci sia un valore: chiesta dal cardiologo il 12 settembre
   * 2026. Le fasce per esteso stanno nel prontuario.
   */
  const riferimentoBnp = riferimentoNtProBnp(
    visitaData.scompenso.contestoBnp,
    etaPaziente,
  );

  /**
   * Condizioni che spostano il peptide. Si mostrano solo quando c'e' un valore
   * da leggere: fuori da quel contesto sarebbero avvisi senza oggetto.
   */
  const avvisiBnp = useMemo(
    () =>
      visitaData.scompenso.ntProBnp == null
        ? []
        : confondentiNtProBnp({
            egfr: egfrCalc.ok ? egfrCalc.result.value : undefined,
            bmi: bmi ?? undefined,
            ritmo: visitaData.ecg.ritmo,
            fibrillazioneAtriale: visitaData.fibrillazioneAtriale.attivo,
            eta: etaPaziente,
          }),
    [
      visitaData.scompenso.ntProBnp,
      egfrCalc,
      bmi,
      visitaData.ecg.ritmo,
      visitaData.fibrillazioneAtriale.attivo,
      etaPaziente,
    ],
  );

  const fa = visitaData.fibrillazioneAtriale;
  const fattoriRischio = visitaData.fattoriRischio;

  // ── Card della colonna dei parametri ──────────────────────────────────────
  const [cardColonnaAperte, setCardColonnaAperte] = useState(
    leggiCardColonnaAperte,
  );

  const impostaCardColonna = (chiave: CardColonnaChiave, aperto: boolean) => {
    const aggiornate = { ...cardColonnaAperte, [chiave]: aperto };
    setCardColonnaAperte(aggiornate);
    try {
      localStorage.setItem(CHIAVE_CARD_COLONNA, JSON.stringify(aggiornate));
    } catch {
      // Storage pieno o negato: la preferenza vale per questa sessione.
    }
  };

  /**
   * Le righe che si leggono a card chiusa. Corte di proposito — due o tre
   * valori, non un riassunto — perche' stanno sotto al titolo in una colonna
   * larga 300px. Niente `useMemo`: sono concatenazioni di stringhe su una
   * colonna che si ridisegna comunque a ogni tasto.
   */
  const fattoriRischioDichiarati = FATTORI_RISCHIO_CV.filter(
    (f) => fattoriRischio[f.chiave] === true,
  ).length;

  const sintesiCliniche =
    [
      visitaData.pressioneArteriosa
        ? `P.A. ${visitaData.pressioneArteriosa}`
        : null,
      visitaData.frequenzaCardiaca
        ? `${visitaData.frequenzaCardiaca} bpm`
        : null,
      bmi != null ? `BMI ${bmi.toFixed(1).replace(".", ",")}` : null,
      visitaData.fumatore === "si" ? "fumatore" : null,
      fattoriRischioDichiarati > 0
        ? `${fattoriRischioDichiarati} ${
            fattoriRischioDichiarati === 1 ? "fattore" : "fattori"
          } CV`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "da compilare";

  const esamiCompilati = compilatiTra(CHIAVI_LABORATORIO);

  const sintesiLaboratorio =
    esamiCompilati === 0
      ? "nessun valore"
      : [
          ldlEffettivo ? `LDL ${Math.round(ldlEffettivo.valore)}` : null,
          `${esamiCompilati} ${esamiCompilati === 1 ? "valore" : "valori"}`,
          lab.dataPrelievo
            ? `prelievo ${dataBreve(lab.dataPrelievo)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const sintesiRischio = categoriaRischio
    ? `${CATEGORIA_RISCHIO_LABELS[categoriaRischio]} · obiettivo LDL < ${
        TARGET_LDL[categoriaRischio].mgdl
      }`
    : "classe non attribuita";

  /** Categoria del calcium score, con la soglia severa impostata dal centro. */
  const esitoCac = useMemo(
    () => categoriaCac(visitaData.tcCoronarica.cacScore, sogliaCac),
    [visitaData.tcCoronarica.cacScore, sogliaCac],
  );

  const percentileCac = useMemo(
    () =>
      percentileMesa({
        score: visitaData.tcCoronarica.cacScore,
        eta: etaPaziente,
        sesso: sessoPaziente,
      }),
    [visitaData.tcCoronarica.cacScore, etaPaziente, sessoPaziente],
  );

  const avvisoComponenti = useMemo(
    () =>
      coerenzaComponenti(
        visitaData.tcCoronarica.componenteCalcifica,
        visitaData.tcCoronarica.componenteNonCalcifica,
      ),
    [
      visitaData.tcCoronarica.componenteCalcifica,
      visitaData.tcCoronarica.componenteNonCalcifica,
    ],
  );

  /**
   * Progressione del calcium score.
   *
   * Costruita sui soli esami realmente eseguiti, quello in corso compreso:
   * niente punti intermedi fra due TC distanti anni, niente proiezioni. La
   * data e' quella dell'esame e non della visita, perche' una TC puo' essere
   * di mesi prima del controllo in cui viene vista.
   */
  const progressioneTc = useMemo(() => {
    const storici = patientVisits
      .filter((v) => v.id !== existingVisit?.id)
      .map((v) => ({
        score: Number(v.visita?.tcCoronarica?.cacScore),
        data: v.visita?.tcCoronarica?.dataEsame || v.dataVisita,
      }))
      .filter((e) => Number.isFinite(e.score) && e.score >= 0);

    const corrente = Number(visitaData.tcCoronarica.cacScore);
    const dataCorrente =
      visitaData.tcCoronarica.dataEsame || visitData.dataVisita;
    const tutti = Number.isFinite(corrente)
      ? [...storici, { score: corrente, data: dataCorrente }]
      : storici;

    return progressioneCac(tutti);
  }, [
    patientVisits,
    existingVisit?.id,
    visitaData.tcCoronarica.cacScore,
    visitaData.tcCoronarica.dataEsame,
    visitData.dataVisita,
  ]);
  const [isProntuarioOpen, setIsProntuarioOpen] = useState(false);
  /** Scheda su cui aprire il prontuario: dallo scompenso si va alle classi. */
  const [tabProntuario, setTabProntuario] = useState<string | undefined>();
  const apriProntuario = (tab?: string) => {
    setTabProntuario(tab);
    setIsProntuarioOpen(true);
  };
  const [isProntuarioImagingOpen, setIsProntuarioImagingOpen] = useState(false);
  // La seconda misurazione della pressione si apre a richiesta, e resta aperta
  // finche' ha un valore.
  const [mostraPa2, setMostraPa2] = useState(false);
  const mostraSecondaPa =
    mostraPa2 || Boolean(visitaData.pressioneArteriosa2?.trim());
  const togliSecondaPa = () => {
    handleVisitaChange("pressioneArteriosa2", "");
    handleVisitaChange("posizionePa2", "");
    setMostraPa2(false);
  };
  const tc = visitaData.tcCoronarica;

  /**
   * CHA₂DS₂-VASc e HAS-BLED. Come il fenotipo dello scompenso non vengono
   * salvati: si ricalcolano dai fattori spuntati, cosi' correggere una casella
   * aggiorna il punteggio invece di lasciarne uno vecchio nella scheda.
   */
  const chadsVascCalc = useMemo(
    () =>
      calcolaChadsVasc({
        eta: etaPaziente,
        sesso: sessoPaziente,
        fattori: {
          scompenso: fa.cvScompenso,
          // Dichiarati fra i fattori di rischio accanto alle variabili: il
          // punteggio li legge da li' invece di richiederli, altrimenti si
          // potrebbero avere spuntati di la' e no di qua.
          ipertensione: fattoriRischio.ipertensione,
          diabete: fattoriRischio.diabete,
          ictus: fa.cvIctus,
          vascolare: fa.cvVascolare,
        },
      }),
    [
      etaPaziente,
      sessoPaziente,
      fa.cvScompenso,
      fa.cvIctus,
      fa.cvVascolare,
      fattoriRischio.ipertensione,
      fattoriRischio.diabete,
    ],
  );

  const hasBledCalc = useMemo(
    () =>
      calcolaHasBled({
        eta: etaPaziente,
        // La tendina della terapia anticoagulante non c'e' piu': la voce
        // "INR labile" vale solo in warfarin, e adesso e' la spunta stessa del
        // medico a dichiararlo — l'etichetta della casella dice la condizione.
        inTao: Boolean(fa.hbInrLabile),
        fattori: {
          ipertensioneNonControllata: fa.hbIpertensioneNonControllata,
          funzioneRenale: fa.hbFunzioneRenale,
          funzioneEpatica: fa.hbFunzioneEpatica,
          ictus: fa.hbIctus,
          sanguinamento: fa.hbSanguinamento,
          inrLabile: fa.hbInrLabile,
          farmaci: fa.hbFarmaci,
          alcol: fa.hbAlcol,
        },
      }),
    [
      etaPaziente,
      fa.hbIpertensioneNonControllata,
      fa.hbFunzioneRenale,
      fa.hbFunzioneEpatica,
      fa.hbIctus,
      fa.hbSanguinamento,
      fa.hbInrLabile,
      fa.hbFarmaci,
      fa.hbAlcol,
    ],
  );

  const frequenzaSegnale = useMemo(() => {
    const n = Number(visitaData.frequenzaCardiaca);
    return valutaMisura(
      "vitali.frequenzaCardiaca",
      Number.isFinite(n) && n > 0 ? n : undefined,
    );
  }, [visitaData.frequenzaCardiaca]);

  const fcMaxPctCalc = useMemo(
    () =>
      calcolaPercentualeFcMax(visitaData.testErgometrico.fcMax, etaPaziente),
    [visitaData.testErgometrico.fcMax, etaPaziente],
  );
  const caloNotturnoCalc = useMemo(
    () =>
      calcolaCaloNotturno(
        visitaData.holterPressorio.mediaDiurnaSist,
        visitaData.holterPressorio.mediaNotturnaSist,
      ),
    [
      visitaData.holterPressorio.mediaDiurnaSist,
      visitaData.holterPressorio.mediaNotturnaSist,
    ],
  );

  /**
   * Categoria di rischio della percentuale SCORE2. La soglia dipende dalla
   * fascia d'eta', quindi va mostrata insieme al numero: un 7% a 45 anni e un
   * 7% a 65 anni non stanno nella stessa banda.
   */
  const score2Categoria = useMemo(() => {
    if (!score2Calc.ok || etaPaziente == null) return null;
    const chiave = categoriaRischioScore2(score2Calc.result.value, etaPaziente);
    return {
      chiave,
      label: SCORE2_CATEGORIA_LABELS[chiave],
      soglie: sogliaCategoriaScore2(etaPaziente),
    };
  }, [score2Calc, etaPaziente]);

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
        <label className="text-sm font-bold text-gray-700">1. Anamnesi</label>
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
                      {`1.${idx + 1} ${label}`}
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
            <User size={40} className="text-default-400" />
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

  const breadcrumbItems = [
    { label: "Dashboard", path: "/" },
    { label: "Pazienti", path: "/pazienti" },
    {
      label: `${patient.nome} ${patient.cognome}`,
      path: `/patient-history/${patient.id}`,
    },
    { label: isEditMode ? "Modifica" : "Nuova visita" },
  ];

  const canCopyOrClear = Boolean(getPreviousVisit()) || copiedPrevious;
  const immagini = visitaData.immagini ?? [];

  return (
    <div className="corioli-page space-y-6 pb-32">
      {/* 1. Header Navigation */}
      <Breadcrumb items={breadcrumbItems} />

      {/* 2. Patient Banner & Main Info */}
      <Card className="shadow-md border-t-4 border-primary">
        <CardBody className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl shrink-0">
              {patient.nome[0]}
              {patient.cognome[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {patient.nome} {patient.cognome}
                {hasUnsavedChanges && (
                  <Chip size="sm" color="warning" variant="flat">
                    Non salvato
                  </Chip>
                )}
              </h1>
              <p className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                <span className="text-gray-500">
                  <CodiceFiscaleValue
                    value={patient.codiceFiscale}
                    generatedFromImport={Boolean(patient.codiceFiscaleGenerato)}
                  />
                </span>
                {calculateAge(patient.dataNascita) && (
                  <>
                    <span className="hidden md:inline text-gray-300">|</span>
                    <span className="text-gray-500">
                      {calculateAge(patient.dataNascita)} anni
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <Input
              type="date"
              label="Data Visita"
              value={visitData.dataVisita}
              onValueChange={(value) => handleInputChange("dataVisita", value)}
              max={todayIsoDate()}
              variant="bordered"
              size="sm"
              labelPlacement="outside-left"
              className="w-full md:w-auto"
              classNames={{
                label: "text-gray-500 font-medium whitespace-nowrap pt-2",
                input: "bg-transparent",
                inputWrapper:
                  "border-default-300 hover:border-primary focus-within:border-primary min-w-[140px]",
              }}
            />
          </div>
        </CardBody>
      </Card>

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
        {!isEditMode && (
          <div className="flex justify-end">
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
          </div>
        )}

        {/* Le due colonne sono alte uguale per il solo `align-items:
            stretch` di default, senza una riga di CSS in piu'. Funziona
            perche' le card richiudibili tengono il rail sotto i ~900px,
            quindi piu' corto del referto: quando un figlio flex e' piu' corto
            della riga, lo stretch lo porta all'altezza della riga da solo — e
            l'ultima card del rail si prende lo spazio che avanza (vedi la
            card delle immagini). Non funzionava prima, con 3.168px di
            contenuto nel rail: era il rail a dettare l'altezza della riga, e
            lo stretch non accorcia un figlio sotto il suo contenuto.

            Da qui anche la rinuncia a `sticky` e a `overflow-y: auto` sul
            rail, provati entrambi il 12 settembre 2026: una seconda barra di
            scorrimento nella stessa pagina e' un fastidio continuo per chi
            compila, perche' la rotella fa una cosa diversa a seconda di dove
            hai il mouse e di quanto hai scorso la pagina. Una sola barra,
            quella della pagina.

            Se il medico apre tutte le card il rail torna piu' alto del
            referto ed e' di nuovo lui a dare l'altezza: il referto resta in
            alto e sotto avanza bianco. E' il prezzo, accettato, di non avere
            la seconda barra. */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT COLUMN: Variabili cliniche & Immagini */}
          {/* `flex flex-col` e non `space-y-6`: serve a `grow` sull'ultima
              card. Il `gap-6` da' la stessa aria di prima fra le card. */}
          <div className="w-full min-w-[300px] flex flex-col gap-6 lg:w-[29%]">
            <CardColonna
              titolo="Variabili cliniche"
              sintesi={sintesiCliniche}
              aperto={cardColonnaAperte.cliniche}
              onApertoChange={(a) => impostaCardColonna("cliniche", a)}
            >
              <CardBody className="px-4 py-6 gap-6">
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

                <div className="flex flex-col sm:flex-row items-end gap-3 w-full">
                  <Input
                    label="Peso corporeo (kg)"
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
                    className="flex-1"
                    classNames={{ label: "pb-1" }}
                  />

                  {/* Indicatore BMI: numero + fascia OMS, colorato per fascia */}
                  {bmi != null && (
                    <div className="flex flex-col items-center justify-end pb-1 px-1.5 animate-appearance-in">
                      <div
                        className={`flex flex-col items-center gap-0 rounded-md border px-2 py-1 ${RIQUADRO_BMI[bmiSegnale.livello]}`}
                        title={bmiSegnale.nota || "Indice di massa corporea"}
                      >
                        <div className="flex items-center gap-1 text-xs font-semibold">
                          <span>BMI {bmi.toFixed(1).replace(".", ",")}</span>
                          {/* L'altezza da cui esce il numero. Sta nella scheda
                              del paziente e non si ripete a ogni visita, quindi
                              dopo la prima volta spariva dalla vista: qui si
                              vede sempre da cosa e' stato calcolato il BMI. */}
                          {altezzaCm != null && (
                            <span className="font-normal opacity-70">
                              · h {altezzaCm} cm
                            </span>
                          )}
                        </div>
                        {bmiSegnale.etichetta && (
                          <span className="text-[10px] font-medium leading-tight">
                            {bmiSegnale.etichetta}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Divider className="my-2" />

                {/* Pressione con la posizione della misurazione e, se serve,
                    una seconda misurazione: in clinostatismo per tutti, in
                    ortostatismo per documentare un'ipotensione ortostatica.
                    Nel referto escono con la loro fascia prima
                    dell'elettrocardiogramma (call dell'11 settembre 2026). */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Input
                      label="P.A. (mmHg)"
                      type="text"
                      inputMode="numeric"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Es. 120/80"
                      value={visitaData.pressioneArteriosa ?? ""}
                      onValueChange={(v) =>
                        handleVisitaChange("pressioneArteriosa", v)
                      }
                      onBlur={() => normalizzaCampoPa("pressioneArteriosa")}
                      description={
                        <NoteCampo
                          segnale={pressioneSegnale}
                          precedente={precedenti["visita.pressioneArteriosa"]}
                          corrente={visitaData.pressioneArteriosa}
                        />
                      }
                      classNames={{ description: "m-0" }}
                    />
                    <PosizionePaSelettore
                      ariaLabel="Posizione della misurazione della pressione"
                      valore={visitaData.posizionePa || "clino"}
                      onChange={(p) => handleVisitaChange("posizionePa", p)}
                    />
                  </div>
                  <Input
                    label="F.C. (bpm)"
                    type="text"
                    inputMode="numeric"
                    size="sm"
                    variant="bordered"
                    labelPlacement="outside"
                    placeholder="Es. 72"
                    value={visitaData.frequenzaCardiaca ?? ""}
                    onValueChange={(v) => {
                      if (v !== "" && !/^\d{0,3}$/.test(v)) return;
                      handleVisitaChange("frequenzaCardiaca", v);
                    }}
                    description={
                      <NoteCampo
                        segnale={frequenzaSegnale}
                        precedente={precedenti["visita.frequenzaCardiaca"]}
                        corrente={
                          Number(visitaData.frequenzaCardiaca) || undefined
                        }
                      />
                    }
                    classNames={{ description: "m-0" }}
                  />
                  {mostraSecondaPa ? (
                    <div className="flex flex-col gap-1.5">
                      <Input
                        label="P.A. 2ª (mmHg)"
                        type="text"
                        inputMode="numeric"
                        size="sm"
                        variant="bordered"
                        labelPlacement="outside"
                        placeholder="Es. 110/70"
                        value={visitaData.pressioneArteriosa2 ?? ""}
                        onValueChange={(v) =>
                          handleVisitaChange("pressioneArteriosa2", v)
                        }
                        onBlur={() => normalizzaCampoPa("pressioneArteriosa2")}
                        description={<NoteCampo segnale={pressione2Segnale} />}
                        classNames={{ description: "m-0" }}
                      />
                      <div className="flex items-center gap-1">
                        <PosizionePaSelettore
                          ariaLabel="Posizione della seconda misurazione"
                          valore={visitaData.posizionePa2 || "orto"}
                          onChange={(p) => handleVisitaChange("posizionePa2", p)}
                        />
                        <Button
                          type="button"
                          isIconOnly
                          size="sm"
                          variant="light"
                          aria-label="Togli la seconda misurazione"
                          className="h-6 w-6 min-w-0 text-default-400"
                          onPress={togliSecondaPa}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="col-span-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="light"
                        color="primary"
                        className="h-6 min-w-0 px-1.5 text-xs"
                        startContent={<Plus size={13} />}
                        onPress={() => setMostraPa2(true)}
                      >
                        Seconda misurazione
                      </Button>
                    </div>
                  )}
                </div>

                <Divider className="my-2" />

                {/* Fattori di rischio cardiovascolare.
                    Stanno qui e non dentro un modulo perché servono a colpo
                    d'occhio mentre si scrive il referto. Alla visita nuova
                    arrivano già spuntati come nell'ultima: sono anamnestici e
                    ricompilarli ogni volta sarebbe tempo perso. */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Fattori di rischio CV
                  </p>

                  {/* Il fumo sta fra i fattori di rischio, che e' il suo posto,
                      ma **resta una tendina e non una casella**: ha tre stati e
                      non due. Per SCORE2 "non rilevato" e "no" sono due cose
                      diverse — una casella non spuntata non dice se il paziente
                      non fuma o se nessuno gliel'ha chiesto — e anche il referto
                      stampa il fumo in negativo, perche' "non fumatore" e' un
                      dato clinico (vedi `PdfService.drawFattoriRischio`). Sta in
                      testa e non in mezzo alle caselle: un controllo diverso
                      infilato nella lista sembrerebbe un errore. */}
                  {/* `mt-9` e non `mt-3`: l'etichetta esterna di NextUI sta
                      fuori dal riquadro del campo e si mangia quasi tutto il
                      margine sopra, cosi' "Fumatore" finiva incollato al
                      titolo del pannello — misurati 0px fra i due, 6 con
                      `mt-7`, 14 con questo. */}
                  <div className="mt-9">
                    <Select
                      label="Fumatore"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Non rilevato"
                      selectedKeys={
                        visitaData.fumatore ? [visitaData.fumatore] : []
                      }
                      onSelectionChange={(keys) =>
                        handleVisitaChange("fumatore", senzaMenzione(keys))
                      }
                      description="Tre stati: «non rilevato» non vale «no» nel calcolo del rischio"
                    >
                      {/* "Non rilevato" deve essere una voce vera e non solo il
                          testo del campo vuoto: una tendina di NextUI, scelta
                          una voce, non si riporta piu' a vuoto, e un "Si'"
                          cliccato per sbaglio restava li' per sempre — dentro
                          SCORE2 e stampato sul referto. E' lo stesso motivo per
                          cui le tendine della TC hanno "Nessuna menzione", e usa
                          la stessa chiave: la stringa vuota non va, il
                          componente la legge come "nessuna selezione" e la riga
                          non risulta cliccabile. */}
                      <SelectItem
                        key={SENZA_MENZIONE}
                        className="text-default-500"
                      >
                        Non rilevato
                      </SelectItem>
                      <SelectItem key="si">Si'</SelectItem>
                      <SelectItem key="no">No</SelectItem>
                    </Select>
                  </div>
                  {/* Una casella per riga, con abbastanza aria fra loro.
                      Due insidie del Checkbox di NextUI, che qui portavano
                      entrambe a spuntare il fattore sbagliato con un clic:
                      è `inline-flex`, quindi senza un contenitore proprio due
                      fattori finiscono sulla stessa riga; e usa `p-2 -m-2` per
                      allargare l'area di tocco, che percio' sborda di 8px
                      sopra e sotto il suo spazio di layout. Da cui `space-y-3`
                      e non `space-y-1`: sotto gli 11px le righe si
                      sovrappongono anche quando sembrano separate. */}
                  <div className="mt-2 space-y-3">
                    {FATTORI_RISCHIO_CV.map((f) => (
                      <div key={f.chiave}>
                        <Checkbox
                          size="sm"
                          isSelected={fattoriRischio[f.chiave] === true}
                          onValueChange={(c) =>
                            handleBloccoChange(
                              "fattoriRischio",
                              f.chiave,
                              c ? true : undefined,
                            )
                          }
                        >
                          <span className="text-sm text-gray-700">
                            {f.label}
                          </span>
                        </Checkbox>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-default-500">
                    Ipertensione e diabete alimentano anche il
                    CHA&#8322;DS&#8322;-VASc del modulo Fibrillazione atriale.
                  </p>
                </div>

                {/* Spento di default nelle impostazioni: le schede sono
                    contenuto clinico, e finche' non sono complete e validate
                    non devono uscire dall'app di chi non le ha scritte. */}
                {prontuarioAttivo && (
                  <>
                    <Divider className="my-2" />

                    {/* Il prontuario chiude la card invece di spezzare il flusso
                        delle variabili: è un'azione, non un dato da compilare, e in
                        mezzo ai campi si leggeva come un campo. Sta in un modal
                        perché è materiale da guardare mentre si scrive, non
                        contenuto da stampare.

                        In grigio piatto però non si vedeva: alla prova il
                        cardiologo l'ha trovato solo quando gliel'hanno indicato, e
                        un prontuario che non si trova non serve a niente. Colorato
                        e con l'icona si legge come il pulsante che è. */}
                    <Button
                      size="sm"
                      variant="flat"
                      color="primary"
                      className="w-full"
                      startContent={<BookOpen size={15} />}
                      onPress={() => apriProntuario()}
                    >
                      Prontuario — pilastri e farmaci
                    </Button>
                  </>
                )}
              </CardBody>
            </CardColonna>

            <CardColonna
              titolo="Laboratorio"
              sintesi={sintesiLaboratorio}
              aperto={cardColonnaAperte.laboratorio}
              onApertoChange={(a) => impostaCardColonna("laboratorio", a)}
            >
              <CardBody className="px-4 py-6 gap-4">
                <Input
                  type="date"
                  label="Data prelievo"
                  size="sm"
                  variant="bordered"
                  labelPlacement="outside"
                  max={todayIsoDate()}
                  value={visitaData.laboratorio.dataPrelievo ?? ""}
                  onValueChange={(v) =>
                    handleBloccoChange("laboratorio", "dataPrelievo", v)
                  }
                />
                <GruppoCampi
                  titolo="Burden aterogeno"
                  compilati={compilatiTra(GRUPPI_LABORATORIO.burden)}
                  totale={GRUPPI_LABORATORIO.burden.length}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <MisuraInput
                      label="Col. totale"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.colesteroloTotale}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "colesteroloTotale", v)
                      }
                      draft={draftOf("lab.tot")}
                      onDraftChange={(d) => setDraft("lab.tot", d)}
                      {...misura("lab.tot")}
                    />
                    <MisuraInput
                      label="HDL"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.hdl}
                      onValueChange={(v) => handleBloccoChange("laboratorio", "hdl", v)}
                      draft={draftOf("lab.hdl")}
                      onDraftChange={(d) => setDraft("lab.hdl", d)}
                      {...misura("lab.hdl")}
                    />
                    <MisuraInput
                      label="Trigliceridi"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.trigliceridi}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "trigliceridi", v)
                      }
                      draft={draftOf("lab.tg")}
                      onDraftChange={(d) => setDraft("lab.tg", d)}
                      {...misura("lab.tg")}
                    />
                    <MisuraInput
                      label="LDL dosato"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.ldlMisurato}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "ldlMisurato", v)
                      }
                      draft={draftOf("lab.ldl")}
                      onDraftChange={(d) => setDraft("lab.ldl", d)}
                      {...misura("lab.ldl")}
                    />
                    <MisuraInput
                      label="ApoB"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.apoB}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "apoB", v)
                      }
                      draft={draftOf("lab.apob")}
                      onDraftChange={(d) => setDraft("lab.apob", d)}
                      {...misura("lab.apob")}
                    />
                    <MisuraInput
                      label="Lp(a)"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.lpa}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "lpa", v)
                      }
                      draft={draftOf("lab.lpa")}
                      onDraftChange={(d) => setDraft("lab.lpa", d)}
                      {...misura("lab.lpa")}
                    />
                    {/* L'aterosclerosi vista all'ecografo sta accanto ai
                        lipidi e non fra gli esami strumentali: e' il marker che
                        sposta la classe di rischio, ed e' qui che il medico la
                        guarda mentre decide. E' lo stesso campo della stenosi
                        massima del modulo Doppler TSA, non una copia. */}
                    <MisuraInput
                      label="ATS carotidea"
                      unit="%"
                      decimals={false}
                      value={visitaData.dopplerTsa.stenosiCarotidea}
                      onValueChange={(v) =>
                        handleBloccoChange("dopplerTsa", "stenosiCarotidea", v)
                      }
                      draft={draftOf("tsa.stenosi")}
                      onDraftChange={(d) => setDraft("tsa.stenosi", d)}
                      {...misura("tsa.stenosi")}
                    />
                  </div>
                  {(ldlCalc.ok ||
                    nonHdlCalc.ok ||
                    ctHdlCalc.ok ||
                    tgHdlCalc.ok) && (
                    <StrisciaCalcolati>
                      <RigaCalcolata
                        label="LDL (Friedewald)"
                        outcome={ldlCalc}
                        segnale={ldlSegnale}
                      />
                      <RigaCalcolata label="Non-HDL" outcome={nonHdlCalc} />
                      <RigaCalcolata
                        label="CT / HDL"
                        outcome={ctHdlCalc}
                        segnale={ctHdlSegnale}
                      />
                      <RigaCalcolata
                        label="TG / HDL"
                        outcome={tgHdlCalc}
                        segnale={tgHdlSegnale}
                      />
                    </StrisciaCalcolati>
                  )}
                </GruppoCampi>

                {/* Infiammazione e stress ossidativo sotto il burden
                    aterogeno: sono la parte della placca che i lipidi non
                    misurano, e stavano sparsi fra il pannello lipidico
                    (LDL ossidate) e "Altri esami" (hs-PCR). */}
                <GruppoCampi
                  titolo="Profilo infiammatorio / redox"
                  compilati={compilatiTra(GRUPPI_LABORATORIO.infiammatorio)}
                  totale={GRUPPI_LABORATORIO.infiammatorio.length}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <MisuraInput
                      label="hs-PCR"
                      unit="mg/L"
                      value={visitaData.laboratorio.hsPcr}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "hsPcr", v)
                      }
                      draft={draftOf("lab.hspcr")}
                      onDraftChange={(d) => setDraft("lab.hspcr", d)}
                      {...misura("lab.hspcr")}
                    />
                    {/* Nessun semaforo: il dosaggio delle LDL ossidate non e'
                        standardizzato, i valori di riferimento cambiano da un
                        laboratorio all'altro e confrontare due referti di
                        centri diversi non vuol dire niente. Si registra il
                        numero e lo legge il medico sul referto che ha in mano. */}
                    <MisuraInput
                      label="LDL ossidate"
                      unit="U/L"
                      decimals={false}
                      value={visitaData.laboratorio.oxLdl}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "oxLdl", v)
                      }
                      draft={draftOf("lab.oxldl")}
                      onDraftChange={(d) => setDraft("lab.oxldl", d)}
                      {...misura("lab.oxldl")}
                    />
                    <MisuraInput
                      label="Fibrinogeno"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.fibrinogeno}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "fibrinogeno", v)
                      }
                      draft={draftOf("lab.fibr")}
                      onDraftChange={(d) => setDraft("lab.fibr", d)}
                      {...misura("lab.fibr")}
                    />
                  </div>
                  <p className="text-xs text-default-500">
                    LDL ossidate: valori di riferimento del laboratorio che ha
                    eseguito il dosaggio, non confrontabili fra centri diversi.
                  </p>
                </GruppoCampi>

                <GruppoCampi
                  titolo="Metabolismo glucidico"
                  compilati={compilatiTra(GRUPPI_LABORATORIO.glucidico)}
                  totale={GRUPPI_LABORATORIO.glucidico.length}
                  azione={
                    <InfoTabella
                      titolo="HOMA-IR: fasce di lettura"
                      colonne={["HOMA-IR", "Lettura"]}
                      righe={FASCE_HOMA_IR.map((f) => ({
                        chiave: f.etichetta,
                        intervallo: f.intervallo,
                        lettura: f.lettura,
                      }))}
                      evidenziata={homaCalc.ok ? homaSegnale.etichetta : undefined}
                      nota="Il valore di taglio dipende dal metodo di dosaggio dell'insulina e dal laboratorio."
                    />
                  }
                >
                  <div className="grid grid-cols-2 gap-3">
                    <MisuraInput
                      label="Glicemia"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.glicemia}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "glicemia", v)
                      }
                      draft={draftOf("lab.gli")}
                      onDraftChange={(d) => setDraft("lab.gli", d)}
                      {...misura("lab.gli")}
                    />
                    <MisuraInput
                      label="Insulinemia"
                      unit="µU/mL"
                      value={visitaData.laboratorio.insulina}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "insulina", v)
                      }
                      draft={draftOf("lab.ins")}
                      onDraftChange={(d) => setDraft("lab.ins", d)}
                      {...misura("lab.ins")}
                    />
                    <MisuraInput
                      label="HbA1c"
                      unit="%"
                      value={visitaData.laboratorio.hba1c}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "hba1c", v)
                      }
                      draft={draftOf("lab.hba1c")}
                      onDraftChange={(d) => setDraft("lab.hba1c", d)}
                      {...misura("lab.hba1c")}
                    />
                  </div>
                  {homaCalc.ok && (
                    <StrisciaCalcolati>
                      <RigaCalcolata
                        label="HOMA-IR"
                        outcome={homaCalc}
                        segnale={homaSegnale}
                      />
                    </StrisciaCalcolati>
                  )}
                </GruppoCampi>

                <GruppoCampi
                  titolo="Funzione renale"
                  compilati={compilatiTra(GRUPPI_LABORATORIO.renale)}
                  totale={GRUPPI_LABORATORIO.renale.length}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <MisuraInput
                      label="Creatinina"
                      unit="mg/dL"
                      value={visitaData.laboratorio.creatinina}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "creatinina", v)
                      }
                      draft={draftOf("lab.crea")}
                      onDraftChange={(d) => setDraft("lab.crea", d)}
                      {...misura("lab.crea")}
                    />
                    <MisuraInput
                      label="Albuminuria"
                      unit="mg/g"
                      value={visitaData.laboratorio.albuminuria}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "albuminuria", v)
                      }
                      draft={draftOf("lab.alb")}
                      onDraftChange={(d) => setDraft("lab.alb", d)}
                      {...misura("lab.alb")}
                    />
                  </div>
                  {egfrCalc.ok && (
                    <StrisciaCalcolati>
                      <RigaCalcolata
                        label={
                          egfrCalc.ok
                            ? `eGFR · ${stadioKdigo(egfrCalc.result.value)}`
                            : "eGFR"
                        }
                        outcome={egfrCalc}
                        segnale={egfrSegnale}
                      />
                    </StrisciaCalcolati>
                  )}
                </GruppoCampi>

                <GruppoCampi
                  titolo="Altri esami"
                  compilati={compilatiTra(GRUPPI_LABORATORIO.altri)}
                  totale={GRUPPI_LABORATORIO.altri.length}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <MisuraInput
                      label="AST"
                      unit="U/L"
                      decimals={false}
                      value={visitaData.laboratorio.ast}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "ast", v)
                      }
                      draft={draftOf("lab.ast")}
                      onDraftChange={(d) => setDraft("lab.ast", d)}
                      {...misura("lab.ast")}
                    />
                    <MisuraInput
                      label="ALT"
                      unit="U/L"
                      decimals={false}
                      value={visitaData.laboratorio.alt}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "alt", v)
                      }
                      draft={draftOf("lab.alt")}
                      onDraftChange={(d) => setDraft("lab.alt", d)}
                      {...misura("lab.alt")}
                    />
                    <MisuraInput
                      label="Uricemia"
                      unit="mg/dL"
                      value={visitaData.laboratorio.uricemia}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "uricemia", v)
                      }
                      draft={draftOf("lab.uric")}
                      onDraftChange={(d) => setDraft("lab.uric", d)}
                      {...misura("lab.uric")}
                    />
                    {/* Accanto all'uricemia, con emoglobina e TSH sotto: la
                        disposizione l'ha data il cardiologo nella call dell'11
                        settembre 2026. */}
                    <MisuraInput
                      label="Azotemia"
                      unit="mg/dL"
                      decimals={false}
                      value={visitaData.laboratorio.azotemia}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "azotemia", v)
                      }
                      draft={draftOf("lab.azot")}
                      onDraftChange={(d) => setDraft("lab.azot", d)}
                      {...misura("lab.azot")}
                    />
                    <MisuraInput
                      label="Emoglobina"
                      unit="g/dL"
                      value={visitaData.laboratorio.emoglobina}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "emoglobina", v)
                      }
                      draft={draftOf("lab.hb")}
                      onDraftChange={(d) => setDraft("lab.hb", d)}
                      {...misura("lab.hb")}
                    />
                    <MisuraInput
                      label="TSH"
                      unit="mU/L"
                      value={visitaData.laboratorio.tsh}
                      onValueChange={(v) =>
                        handleBloccoChange("laboratorio", "tsh", v)
                      }
                      draft={draftOf("lab.tsh")}
                      onDraftChange={(d) => setDraft("lab.tsh", d)}
                      {...misura("lab.tsh")}
                    />
                  </div>
                </GruppoCampi>
              </CardBody>
            </CardColonna>

            <CardColonna
              titolo="Rischio cardiovascolare"
              sintesi={sintesiRischio}
              aperto={cardColonnaAperte.rischio}
              onApertoChange={(a) => impostaCardColonna("rischio", a)}
            >
              {/* `gap` e non `space-y`: le etichette `labelPlacement="outside"`
                  sono posizionate in modo assoluto e NextUI riserva loro spazio
                  con un margine sul campo, che `space-y-*` sovrascriverebbe
                  facendole finire sopra al testo precedente. */}
              <CardBody className="px-4 py-6 gap-3">
                <p className="text-[11px] leading-snug text-default-400">
                  La classe di rischio la attribuisce il medico. Gli obiettivi e
                  il punteggio che ne derivano restano di supporto e non vengono
                  scritti nel referto.
                </p>

                {/* La classe di rischio la attribuisce il medico: è quella che
                    sblocca gli obiettivi lipidici, non un calcolo dell'app. */}
                <Select
                  label="Classe di rischio CV"
                  size="sm"
                  variant="bordered"
                  labelPlacement="outside"
                  placeholder="Non attribuita"
                  selectedKeys={
                    visitaData.categoriaRischioCv
                      ? [visitaData.categoriaRischioCv]
                      : []
                  }
                  onSelectionChange={(keys) =>
                    handleVisitaChange(
                      "categoriaRischioCv",
                      (Array.from(keys)[0] as string) ?? "",
                    )
                  }
                  description="La attribuisce il medico dai fattori di rischio; determina gli obiettivi di LDL e ApoB"
                  classNames={{ description: "text-[10px] leading-tight" }}
                >
                  {CATEGORIE_RISCHIO_CV.map((c) => (
                    <SelectItem key={c} textValue={CATEGORIA_RISCHIO_LABELS[c]}>
                      {CATEGORIA_RISCHIO_LABELS[c]}
                      <span className="block text-[10px] text-default-400">
                        LDL {descriviTargetLdl(c)}
                      </span>
                    </SelectItem>
                  ))}
                </Select>

                <RiquadroTarget
                  label="Obiettivo LDL"
                  esito={ldlTarget}
                  valore={
                    ldlEffettivo
                      ? String(Math.round(ldlEffettivo.valore))
                      : undefined
                  }
                  categoria={
                    categoriaRischio
                      ? CATEGORIA_RISCHIO_LABELS[categoriaRischio]
                      : undefined
                  }
                  nota={
                    ldlEffettivo?.fonte === "stimato"
                      ? "Confronto sull'LDL stimato con Friedewald"
                      : undefined
                  }
                />
                <RiquadroTarget
                  label="Obiettivo ApoB"
                  esito={apoBTarget}
                  valore={
                    lab.apoB != null ? String(Math.round(lab.apoB)) : undefined
                  }
                  categoria={
                    categoriaRischio
                      ? CATEGORIA_RISCHIO_LABELS[categoriaRischio]
                      : undefined
                  }
                />

                <Divider className="my-1" />

                <p className="text-xs font-semibold uppercase tracking-wider text-default-500">
                  {/* Dai 70 anni il modello è SCORE2-OP: l'intestazione li
                      nomina entrambi, altrimenti su un paziente anziano
                      annuncia SCORE2 e sotto compare un messaggio su un altro
                      modello. */}
                  Rischio calcolato (SCORE2 / SCORE2-OP)
                </p>
                <Select
                  label="Regione di rischio SCORE2"
                  size="sm"
                  variant="bordered"
                  labelPlacement="outside"
                  selectedKeys={[score2Region]}
                  onSelectionChange={(keys) =>
                    setScore2Region(Array.from(keys)[0] as Score2Region)
                  }
                >
                  {(
                    Object.keys(SCORE2_REGION_LABELS) as Score2Region[]
                  ).map((r) => (
                    <SelectItem key={r}>{SCORE2_REGION_LABELS[r]}</SelectItem>
                  ))}
                </Select>
                <CalcSuggestion
                  label="SCORE2 — rischio a 10 anni"
                  outcome={score2Calc}
                  emphasis
                  banda={
                    score2Categoria && (
                      <Tooltip
                        content={score2Categoria.soglie}
                        placement="top"
                        delay={200}
                      >
                        <Chip
                          size="sm"
                          variant="flat"
                          classNames={{
                            base: `h-5 cursor-help border ${
                              score2Categoria.chiave === "molto-alto"
                                ? "border-danger-300 bg-danger-50"
                                : score2Categoria.chiave === "alto"
                                  ? "border-warning-300 bg-warning-50"
                                  : "border-success-300 bg-success-50"
                            }`,
                            content: `px-1.5 text-[10px] font-semibold ${
                              score2Categoria.chiave === "molto-alto"
                                ? "text-danger-700"
                                : score2Categoria.chiave === "alto"
                                  ? "text-warning-700"
                                  : "text-success-700"
                            }`,
                          }}
                        >
                          {score2Categoria.label}
                        </Chip>
                      </Tooltip>
                    )
                  }
                />
                {/* Solo insieme a un punteggio: senza, spiegherebbe le fasce
                    di una categoria che non è stata calcolata. */}
                {score2Calc.ok && (
                  <p className="text-[10px] leading-snug text-default-400">
                    La categoria segue le fasce d&apos;eta&apos; ESC 2021. Non
                    tiene conto di diabete, malattia renale o familiarita&apos;,
                    che spostano il rischio e restano da valutare a parte.
                  </p>
                )}

                <Divider className="my-1" />

                {/* Rischio osservato all'imaging, tenuto separato da quello
                    calcolato: sono due cose diverse e affiancarle sotto la
                    stessa etichetta inviterebbe a sommarle. I valori si
                    leggono dal modulo TC coronarica, non si reinseriscono. */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-default-500">
                    Rischio osservato da imaging
                  </p>
                  {prontuarioAttivo && (
                    <Button
                      type="button"
                      isIconOnly
                      size="sm"
                      variant="light"
                      radius="full"
                      aria-label="Prontuario imaging: calcium score e CAD-RADS"
                      className="h-6 w-6 min-w-0 text-default-500 data-[hover=true]:text-primary-600"
                      onPress={() => setIsProntuarioImagingOpen(true)}
                    >
                      <Info size={15} />
                    </Button>
                  )}
                </div>
                {esitoCac || tc.cadRads ? (
                  <div className="rounded-lg border border-default-200 bg-default-50/60 px-3 py-2 space-y-1">
                    {esitoCac && (
                      <div>
                        <p className="text-xs text-default-500">
                          Calcium score
                          {tc.dataEsame ? ` — ${dataBreve(tc.dataEsame)}` : ""}
                        </p>
                        <p className="text-sm font-semibold text-gray-800">
                          {/* Spazio esplicito: il transform JSX si mangia
                              quello fra un'espressione e il testo che segue. */}
                          {tc.cacScore}
                          {" Agatston · "}
                          {esitoCac.label}
                        </p>
                      </div>
                    )}
                    {tc.cadRads && (
                      <div>
                        <p className="text-xs text-default-500">Angio-TC</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {CAD_RADS_CATEGORIE.find((o) => o.key === tc.cadRads)?.label ??
                            tc.cadRads}
                        </p>
                      </div>
                    )}
                    {!percentileCac.ok && esitoCac && (
                      <p className="text-[10px] leading-snug text-default-400">
                        {percentileCac.reason}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] leading-snug text-default-400">
                    Compare inserendo calcium score o CAD-RADS nel modulo TC
                    coronarica.
                  </p>
                )}

                <Divider className="my-1" />

                {/* Il solo punto in cui i due rischi si mettono insieme, e li
                    mette insieme il medico: l'app non calcola un rischio
                    combinato perché nessuna formula condivisa lo fa. */}
                <p className="text-xs font-semibold uppercase tracking-wider text-default-500">
                  Sintesi del medico
                </p>
                <RefertoTextarea
                  value={visitaData.sintesiRischio}
                  onValueChange={(value) =>
                    handleVisitaChange("sintesiRischio", value)
                  }
                  variant="bordered"
                  minRows={3}
                  placeholder="Come rischio calcolato e reperti di imaging si compongono in questo paziente..."
                />
                <p className="text-[10px] leading-snug text-default-400">
                  Rischio calcolato e rischio osservato restano separati: non
                  viene prodotto un rischio combinato, l&apos;integrazione e la
                  sua motivazione stanno in questo campo.
                </p>
              </CardBody>
            </CardColonna>

            {/* La card delle immagini si prende l'altezza che avanza nel
                rail, ma **al massimo fino a 240px**. Senza tetto assorbiva
                tutto: aprendo i moduli del referto (TC coronarica, eco,
                scompenso…) la colonna di destra arriva a tre o quattro
                schermate e la zona tratteggiata si allungava per centinaia di
                pixel — "sembra buggato", ed e' vero, non si legge come un
                bersaglio per il trascinamento ma come un errore di
                impaginazione. Oltre il tetto lo spazio che resta e' bianco in
                fondo al rail, come in qualunque form a due colonne.

                Il tetto vale solo a card vuota. Con le miniature dentro la
                card chiede anche piu' di 1.000px di suo, e un `max-height`
                sotto l'altezza del contenuto lo taglierebbe dentro al
                CardBody di NextUI, che ha `overflow-y: auto` di serie: cioe'
                la seconda barra di scorrimento che stiamo evitando.

                `grow` con `basis-auto` e `shrink-0` e non `flex-1`: `flex-1`
                azzera la base e rende la card comprimibile, e col rail piu'
                alto del referto la strizzerebbe — stessa barra. */}
            <Card
              className={`shadow-sm border border-default-200 bg-white${
                immagini.length === 0
                  ? " lg:grow lg:shrink-0 lg:basis-auto lg:max-h-[240px]"
                  : ""
              }`}
            >
              <CardHeader className="pb-0 pt-4 px-4 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                Immagini allegate
              </CardHeader>
              <CardBody className="px-4 py-6 space-y-3 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {immagini.length}/{MAX_IMAGES} immagini
                  </span>
                </div>

                {/* `flex-1` con un minimo suo: quando il rail ha spazio da
                    distribuire la zona diventa un bersaglio grande per il
                    trascinamento, quando non ne ha resta la striscia di
                    prima. */}
                <label className="flex flex-1 min-h-[60px] flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:border-primary cursor-pointer text-sm text-default-500">
                  <ImagePlus size={18} />
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
              <CardHeader className="pb-0 pt-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                Referto Medico
              </CardHeader>
              <CardBody className="p-6 space-y-8">
                {/* Sezione 1: Anamnesi.
                    L'anamnesi viene prima del motivo della visita: per capire
                    perché il paziente è qui serve prima conoscerne la storia.
                    È l'ordine dei referti cardiologici standard. */}
                {renderAnamnesiSection()}

                {/* Sezione 2: Descrizione */}
                <div className="space-y-2 group">
                  <label className="text-sm font-bold text-gray-700 block mb-1">
                    2. Motivo della visita
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

                {/* Sezione 3: Esame Obiettivo */}
                <div className="space-y-2 relative group">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-sm font-bold text-gray-700">
                      3. Esame Obiettivo
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

                {/* Sezione 4: ECG */}
                <div className="space-y-2 relative group">
                  <ModuloHeader
                    numero="4"
                    titolo="Elettrocardiogramma"
                    azione={
                      <TemplateSelector
                        templates={allTemplates.filter(
                          (t) => t.category === "visita" && t.section === "ecg",
                        )}
                        onSelect={(t) => applyBloccoTemplate("ecg", t)}
                      />
                    }
                  />
                  {/* Niente tendina con la diagnosi di ritmo: la scrive il
                      cardiologo nel referto qui sotto, ed e' piu'
                      professionale che venga da una frase sua invece che da
                      una voce di menu. Qui restano solo le misure. */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MisuraInput
                      label="PR"
                      unit="ms"
                      decimals={false}
                      value={visitaData.ecg.pr}
                      onValueChange={(v) => handleBloccoChange("ecg", "pr", v)}
                      draft={draftOf("ecg.pr")}
                      onDraftChange={(d) => setDraft("ecg.pr", d)}
                      {...misura("ecg.pr")}
                    />
                    <MisuraInput
                      label="QRS"
                      unit="ms"
                      decimals={false}
                      value={visitaData.ecg.qrs}
                      onValueChange={(v) => handleBloccoChange("ecg", "qrs", v)}
                      draft={draftOf("ecg.qrs")}
                      onDraftChange={(d) => setDraft("ecg.qrs", d)}
                      {...misura("ecg.qrs")}
                    />
                    <MisuraInput
                      label="QT"
                      unit="ms"
                      decimals={false}
                      value={visitaData.ecg.qt}
                      onValueChange={(v) => handleBloccoChange("ecg", "qt", v)}
                      draft={draftOf("ecg.qt")}
                      onDraftChange={(d) => setDraft("ecg.qt", d)}
                      {...misura("ecg.qt")}
                    />
                    <MisuraInput
                      label="Asse QRS"
                      unit="°"
                      decimals={false}
                      value={visitaData.ecg.asse}
                      onValueChange={(v) => handleBloccoChange("ecg", "asse", v)}
                      draft={draftOf("ecg.asse")}
                      onDraftChange={(d) => setDraft("ecg.asse", d)}
                      {...misura("ecg.asse")}
                    />
                  </div>
                  <div className="max-w-xs">
                        <CalcSuggestion
                      label="QTc (Bazett)"
                      outcome={qtcCalc}
                      segnale={qtcSegnale}
                    />
                  </div>
                  <RefertoTextarea
                    value={visitaData.ecg.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("ecg", "referto", value)
                    }
                    variant="bordered"
                    minRows={4}
                    placeholder="Ritmo, conduzione, ripolarizzazione, confronto con i tracciati precedenti..."
                  />
                </div>

                {/* Sezione 5: Ecocardiogramma.
                    Collassabile come la TC: si apre da solo quando e'
                    compilato, e in una visita nuova non occupa mezza pagina
                    finche' non serve. Proposta nella call dell'11 settembre
                    2026. */}
                <ModuloCollassabile
                  numero="5"
                  titolo="Ecocardiogramma"
                  sottotitolo="non eseguito"
                  compilato={bloccoCompilato("ecocardiogramma")}
                  azione={
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === "visita" &&
                          t.section === "ecocardiogramma",
                      )}
                      onSelect={(t) =>
                        applyBloccoTemplate("ecocardiogramma", t)
                      }
                    />
                  }
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MisuraInput
                      label="DTD VS"
                      unit="mm"
                      decimals={false}
                      value={visitaData.ecocardiogramma.ddvs}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "ddvs", v)
                      }
                      draft={draftOf("eco.ddvs")}
                      onDraftChange={(d) => setDraft("eco.ddvs", d)}
                      {...misura("eco.ddvs")}
                    />
                    <MisuraInput
                      label="DTS VS"
                      unit="mm"
                      decimals={false}
                      value={visitaData.ecocardiogramma.dsvs}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "dsvs", v)
                      }
                      draft={draftOf("eco.dsvs")}
                      onDraftChange={(d) => setDraft("eco.dsvs", d)}
                      {...misura("eco.dsvs")}
                    />
                    <MisuraInput
                      label="SIV"
                      unit="mm"
                      decimals={false}
                      value={visitaData.ecocardiogramma.siv}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "siv", v)
                      }
                      draft={draftOf("eco.siv")}
                      onDraftChange={(d) => setDraft("eco.siv", d)}
                      {...misura("eco.siv")}
                    />
                    <MisuraInput
                      label="Parete post."
                      unit="mm"
                      decimals={false}
                      value={visitaData.ecocardiogramma.pp}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "pp", v)
                      }
                      draft={draftOf("eco.pp")}
                      onDraftChange={(d) => setDraft("eco.pp", d)}
                      {...misura("eco.pp")}
                    />
                    <MisuraInput
                      label="FE"
                      unit="%"
                      decimals={false}
                      value={visitaData.ecocardiogramma.fe}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "fe", v)
                      }
                      draft={draftOf("eco.fe")}
                      onDraftChange={(d) => setDraft("eco.fe", d)}
                      {...misura("eco.fe")}
                    />
                    <MisuraInput
                      label="Atrio sx"
                      unit="mm"
                      decimals={false}
                      value={visitaData.ecocardiogramma.atrioSinistro}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "atrioSinistro", v)
                      }
                      draft={draftOf("eco.as")}
                      onDraftChange={(d) => setDraft("eco.as", d)}
                      {...misura("eco.as")}
                    />
                    {/* I gradienti transvalvolari aortici: la stenosi aortica
                        e' la patologia in cui tutto il resto dell'eco puo'
                        leggersi normale, e senza questi due numeri il referto
                        non la descrive. */}
                    <MisuraInput
                      label="Grad. Ao. medio"
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.ecocardiogramma.gradienteAorticoMedio}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "ecocardiogramma",
                          "gradienteAorticoMedio",
                          v,
                        )
                      }
                      draft={draftOf("eco.gradmed")}
                      onDraftChange={(d) => setDraft("eco.gradmed", d)}
                      {...misura("eco.gradmed")}
                    />
                    <MisuraInput
                      label="Grad. Ao. massimo"
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.ecocardiogramma.gradienteAorticoMassimo}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "ecocardiogramma",
                          "gradienteAorticoMassimo",
                          v,
                        )
                      }
                      draft={draftOf("eco.gradmax")}
                      onDraftChange={(d) => setDraft("eco.gradmax", d)}
                      {...misura("eco.gradmax")}
                    />
                    <MisuraInput
                      label="AVA"
                      unit="cm²"
                      value={visitaData.ecocardiogramma.areaValvolareAortica}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "ecocardiogramma",
                          "areaValvolareAortica",
                          v,
                        )
                      }
                      draft={draftOf("eco.ava")}
                      onDraftChange={(d) => setDraft("eco.ava", d)}
                      {...misura("eco.ava")}
                    />
                    <MisuraInput
                      label="Grad. Mitr. medio"
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.ecocardiogramma.gradienteMitralicoMedio}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "ecocardiogramma",
                          "gradienteMitralicoMedio",
                          v,
                        )
                      }
                      draft={draftOf("eco.mitmed")}
                      onDraftChange={(d) => setDraft("eco.mitmed", d)}
                      {...misura("eco.mitmed")}
                    />
                    <MisuraInput
                      label="Grad. Mitr. massimo"
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.ecocardiogramma.gradienteMitralicoMassimo}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "ecocardiogramma",
                          "gradienteMitralicoMassimo",
                          v,
                        )
                      }
                      draft={draftOf("eco.mitmax")}
                      onDraftChange={(d) => setDraft("eco.mitmax", d)}
                      {...misura("eco.mitmax")}
                    />
                    <MisuraInput
                      label="Radice aortica"
                      unit="mm"
                      decimals={false}
                      value={visitaData.ecocardiogramma.radiceAortica}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "radiceAortica", v)
                      }
                      draft={draftOf("eco.rad")}
                      onDraftChange={(d) => setDraft("eco.rad", d)}
                      {...misura("eco.rad")}
                    />
                    <MisuraInput
                      label="Aorta asc."
                      unit="mm"
                      decimals={false}
                      value={visitaData.ecocardiogramma.aortaAscendente}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "aortaAscendente", v)
                      }
                      draft={draftOf("eco.aoasc")}
                      onDraftChange={(d) => setDraft("eco.aoasc", d)}
                      {...misura("eco.aoasc")}
                    />
                    <MisuraInput
                      label="TAPSE"
                      unit="mm"
                      decimals={false}
                      value={visitaData.ecocardiogramma.tapse}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "tapse", v)
                      }
                      draft={draftOf("eco.tapse")}
                      onDraftChange={(d) => setDraft("eco.tapse", d)}
                      {...misura("eco.tapse")}
                    />
                    <MisuraInput
                      label="PAPs"
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.ecocardiogramma.paps}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "paps", v)
                      }
                      draft={draftOf("eco.paps")}
                      onDraftChange={(d) => setDraft("eco.paps", d)}
                      {...misura("eco.paps")}
                    />
                    <MisuraInput
                      label="E/A"
                      value={visitaData.ecocardiogramma.rapportoEA}
                      onValueChange={(v) =>
                        handleBloccoChange("ecocardiogramma", "rapportoEA", v)
                      }
                      draft={draftOf("eco.ea")}
                      onDraftChange={(d) => setDraft("eco.ea", d)}
                      {...misura("eco.ea")}
                    />
                  </div>
                  <RefertoTextarea
                    value={visitaData.ecocardiogramma.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("ecocardiogramma", "referto", value)
                    }
                    variant="bordered"
                    minRows={5}
                    placeholder="Camere, cinesi, valvole, sezioni destre, pericardio..."
                  />
                </ModuloCollassabile>

                {/* Sezione 6: TC coronarica.
                    Collassabile come i moduli 7-11: i campi sono molti, ma una
                    visita su cento porta una TC coronarica, e tenerli aperti a
                    vuoto è il tipo di ingombro che rende lenta la maschera. */}
                {/* Nessun modello di refertazione qui: il referto della TC lo
                    scrive il cardiologo leggendo quello del radiologo, e un
                    testo precompilato su un esame che si chiede ogni cinque
                    anni non fa risparmiare tempo, lo rende solo meno suo. */}
                <ModuloCollassabile
                  numero={numeroSezione.tcCoronarica}
                  visibile={moduloVisibile("tcCoronarica")}
                  titolo="TC coronarica"
                  sottotitolo="non eseguita"
                  compilato={bloccoCompilato("tcCoronarica")}
                  azione={
                    prontuarioAttivo ? (
                      <Button
                        type="button"
                        isIconOnly
                        size="sm"
                        variant="light"
                        radius="full"
                        aria-label="Prontuario imaging: calcium score e CAD-RADS"
                        className="h-6 w-6 min-w-0 text-default-500 data-[hover=true]:text-primary-600"
                        onPress={() => setIsProntuarioImagingOpen(true)}
                      >
                        <Info size={15} />
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      type="date"
                      label="Data esame"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      max={todayIsoDate()}
                      value={tc.dataEsame ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("tcCoronarica", "dataEsame", v)
                      }
                    />
                    <Input
                      label="Struttura"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Dove è stato eseguito"
                      value={tc.struttura ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("tcCoronarica", "struttura", v)
                      }
                    />
                    <Input
                      label="Metodica"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Es. TC 128 strati, protocollo dedicato"
                      value={tc.metodica ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("tcCoronarica", "metodica", v)
                      }
                    />
                  </div>

                  {/* --- Calcium score --- */}
                  <p className="text-xs font-semibold uppercase tracking-wider text-default-500">
                    Calcium score
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <MisuraInput
                      label="Agatston"
                      unit="punteggio"
                      decimals={false}
                      value={tc.cacScore}
                      onValueChange={(v) =>
                        handleBloccoChange("tcCoronarica", "cacScore", v)
                      }
                      draft={draftOf("tc.cac")}
                      onDraftChange={(d) => setDraft("tc.cac", d)}
                      {...misura("tc.cac")}
                    />
                    <div className="md:col-span-2">
                      {esitoCac ? (
                        <div className="rounded-lg border border-default-200 bg-default-50/60 px-3 py-2">
                          <p className="text-sm font-semibold text-gray-800">
                            {esitoCac.label}
                          </p>
                          <p className="text-xs text-default-500">
                            {esitoCac.intervallo}
                          </p>
                          <p className="mt-1 text-xs text-default-500">
                            {/* Percentile: finche' le tabelle MESA non ci sono,
                                si dice perché manca invece di stimarlo. */}
                            {percentileCac.ok
                              ? `Percentile MESA: ${percentileCac.percentile}deg`
                              : percentileCac.reason}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-default-500">
                          La categoria compare inserendo il punteggio Agatston.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Avvertenza non modificabile: è la ragione per cui
                      mostrare un Agatston in un gestionale è accettabile. */}
                  {esitoCac && (
                    <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
                      {esitoCac.flag}
                    </p>
                  )}

                  {/* Progressione: un punto per esame realmente eseguito. */}
                  {progressioneTc.length > 0 && (
                    <div className="rounded-lg border border-default-200 px-3 py-2">
                      <p className="text-xs font-semibold text-gray-700">
                        Progressione fra esami consecutivi
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {progressioneTc.map((v) => (
                          <li
                            key={`${v.da.data}-${v.a.data}`}
                            className="text-xs text-default-600"
                          >
                            {dataBreve(v.da.data)}
                            {" → "}
                            {dataBreve(v.a.data)}
                            {": "}
                            {v.da.score}
                            {" → "}
                            {v.a.score}
                            {" Agatston, "}
                            {descriviVariazione(v)}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-default-400">
                        Solo valori realmente misurati: fra due esami non viene
                        mostrato nessun valore intermedio.
                      </p>
                    </div>
                  )}

                  {/* --- Angio-TC --- */}
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-default-500">
                    Angio-TC
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Select
                      label="CAD-RADS"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="&mdash;"
                      description={
                        <PrecedenteTesto
                          precedente={precedenti["tcCoronarica.cadRads"]}
                          descrivi={(k) =>
                            CAD_RADS_CATEGORIE.find((o) => o.key === k)?.label ?? k
                          }
                        />
                      }
                      classNames={{ description: "m-0" }}
                      selectedKeys={tc.cadRads ? [tc.cadRads] : []}
                      onSelectionChange={(keys) =>
                        handleBloccoChange(
                          "tcCoronarica",
                          "cadRads",
                          senzaMenzione(keys),
                        )
                      }
                    >
                      <SelectItem key={SENZA_MENZIONE} className="text-default-500">
                        {SENZA_MENZIONE_LABEL}
                      </SelectItem>
                      <>
                        {CAD_RADS_CATEGORIE.map((o) => (
                          <SelectItem key={o.key}>{o.label}</SelectItem>
                        ))}
                      </>
                    </Select>
                    <Select
                      label="Burden di placca"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="&mdash;"
                      selectedKeys={tc.burdenPlacca ? [tc.burdenPlacca] : []}
                      onSelectionChange={(keys) =>
                        handleBloccoChange(
                          "tcCoronarica",
                          "burdenPlacca",
                          senzaMenzione(keys),
                        )
                      }
                    >
                      <SelectItem key={SENZA_MENZIONE} className="text-default-500">
                        {SENZA_MENZIONE_LABEL}
                      </SelectItem>
                      <>
                        {BURDEN_PLACCA.map((o) => (
                          <SelectItem key={o.chiave}>{o.label}</SelectItem>
                        ))}
                      </>
                    </Select>
                    {/* Più di un modificatore per lo stesso esame: uno stent e
                        una placca ad alto rischio convivono. Nelle targhette
                        bastano le sigle: il campo sta in una colonna stretta, e
                        le sigle sono il modo in cui i modificatori si scrivono
                        nel referto. */}
                    <Select
                      label="Modificatori"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Nessuno"
                      selectionMode="multiple"
                      classNames={{
                        trigger: "h-auto min-h-10 py-1.5",
                        value: "whitespace-normal",
                        label: "!top-0 !-translate-y-full !pb-1",
                      }}
                      renderValue={(voci) => (
                        <div className="flex flex-wrap gap-1">
                          {voci.map((v) => (
                            <Chip
                              key={v.key}
                              size="sm"
                              variant="flat"
                              classNames={{
                                base: "h-5 bg-default-100",
                                content: "px-1.5 text-[11px] text-default-700",
                              }}
                            >
                              {String(v.key)}
                            </Chip>
                          ))}
                        </div>
                      )}
                      selectedKeys={new Set(tc.cadRadsModificatori ?? [])}
                      onSelectionChange={(keys) => {
                        const v = Array.from(keys) as string[];
                        handleBloccoChange(
                          "tcCoronarica",
                          "cadRadsModificatori",
                          v.length > 0 ? v : undefined,
                        );
                      }}
                    >
                      {MODIFICATORI_CAD_RADS.map((o) => (
                        <SelectItem key={o.chiave} textValue={o.label}>
                          <span className="text-sm">{o.label}</span>
                          <span className="block text-xs text-default-400">
                            {o.nota}
                          </span>
                        </SelectItem>
                      ))}
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <MisuraInput
                      label="Componente calcifica"
                      unit="%"
                      decimals={false}
                      value={tc.componenteCalcifica}
                      onValueChange={(v) =>
                        handleBloccoChange("tcCoronarica", "componenteCalcifica", v)
                      }
                      draft={draftOf("tc.calc")}
                      onDraftChange={(d) => setDraft("tc.calc", d)}
                    />
                    <MisuraInput
                      label="Non calcifica o mista"
                      unit="%"
                      decimals={false}
                      value={tc.componenteNonCalcifica}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "tcCoronarica",
                          "componenteNonCalcifica",
                          v,
                        )
                      }
                      draft={draftOf("tc.noncalc")}
                      onDraftChange={(d) => setDraft("tc.noncalc", d)}
                    />
                    <MisuraInput
                      label="Stenosi massima"
                      unit="%"
                      decimals={false}
                      value={tc.stenosiMassima}
                      onValueChange={(v) =>
                        handleBloccoChange("tcCoronarica", "stenosiMassima", v)
                      }
                      draft={draftOf("tc.stenosi")}
                      onDraftChange={(d) => setDraft("tc.stenosi", d)}
                    />
                    <Select
                      label="Segmento della stenosi"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="&mdash;"
                      selectedKeys={
                        tc.stenosiMassimaSegmento != null
                          ? [String(tc.stenosiMassimaSegmento)]
                          : []
                      }
                      onSelectionChange={(keys) => {
                        const v = Array.from(keys)[0] as string | undefined;
                        handleBloccoChange(
                          "tcCoronarica",
                          "stenosiMassimaSegmento",
                          v ? Number(v) : undefined,
                        );
                      }}
                    >
                      {SEGMENTI_SCCT.map((sg) => (
                        <SelectItem key={String(sg.numero)}>
                          {`${sg.numero}. ${sg.nome}`}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>

                  {avvisoComponenti && (
                    <p className="text-xs text-warning-700">{avvisoComponenti}</p>
                  )}

                  {/* Quali segmenti, non solo quale vaso: una placca sulla
                      discendente anteriore prossimale e una distale non sono
                      lo stesso quadro. */}
                  {/* Le selezioni multiple di NextUI mettono i valori su una
                      riga sola con la classe `truncate`: oltre i tre-quattro
                      segmenti l'elenco veniva tagliato con i puntini, e quali
                      segmenti portano placca e' esattamente il dato per cui
                      esiste il modello a 18 segmenti. Con `renderValue` ogni
                      voce diventa una targhetta e la riga puo' andare a capo;
                      il trigger cresce in altezza invece di restare a 32px. */}
                  <Select
                    label="Segmenti con placca (modello SCCT a 18 segmenti)"
                    size="sm"
                    variant="bordered"
                    labelPlacement="outside"
                    placeholder="Nessun segmento indicato"
                    selectionMode="multiple"
                    classNames={{
                      trigger: "h-auto min-h-10 py-1.5",
                      value: "whitespace-normal",
                      // NextUI ancora l'etichetta "outside" al centro del
                      // campo: crescendo il campo, l'etichetta ci finisce
                      // dentro e si legge sopra le targhette. Ancorata al
                      // bordo superiore resta sopra a qualunque altezza.
                      label: "!top-0 !-translate-y-full !pb-1",
                    }}
                    renderValue={(voci) => (
                      <div className="flex flex-wrap gap-1">
                        {voci.map((v) => (
                          <Chip
                            key={v.key}
                            size="sm"
                            variant="flat"
                            classNames={{
                              base: "h-5 bg-default-100",
                              content: "px-1.5 text-[11px] text-default-700",
                            }}
                          >
                            {v.textValue}
                          </Chip>
                        ))}
                      </div>
                    )}
                    selectedKeys={
                      new Set((tc.segmenti ?? []).map((n) => String(n)))
                    }
                    onSelectionChange={(keys) => {
                      const scelte = Array.from(keys) as string[];
                      // "Nessuna menzione" non si somma agli altri: azzera.
                      const v = scelte.includes(SENZA_MENZIONE)
                        ? []
                        : scelte.map((k) => Number(k)).sort((a, b) => a - b);
                      handleBloccoChange(
                        "tcCoronarica",
                        "segmenti",
                        v.length > 0 ? v : undefined,
                      );
                    }}
                  >
                    <SelectItem key={SENZA_MENZIONE} className="text-default-500">
                      {SENZA_MENZIONE_LABEL}
                    </SelectItem>
                    <>
                    {SEGMENTI_SCCT.map((sg) => (
                      <SelectItem
                        key={String(sg.numero)}
                        textValue={`${sg.numero}. ${sg.nome}`}
                      >
                        <span className="text-sm">{`${sg.numero}. ${sg.nome}`}</span>
                        <span className="block text-xs text-default-400">
                          {sg.vaso}
                        </span>
                      </SelectItem>
                    ))}
                    </>
                  </Select>

                  {/* FFR-TC: facoltativo, resta vuoto se l'esame non lo riporta. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <MisuraInput
                      label="FFR-TC (facoltativo)"
                      unit="valore"
                      value={tc.ffrCt}
                      onValueChange={(v) =>
                        handleBloccoChange("tcCoronarica", "ffrCt", v)
                      }
                      draft={draftOf("tc.ffr")}
                      onDraftChange={(d) => setDraft("tc.ffr", d)}
                    />
                    <Select
                      label="Esito FFR-TC"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="&mdash;"
                      selectedKeys={tc.ffrCtEsito ? [tc.ffrCtEsito] : []}
                      onSelectionChange={(keys) =>
                        handleBloccoChange(
                          "tcCoronarica",
                          "ffrCtEsito",
                          senzaMenzione(keys),
                        )
                      }
                    >
                      <SelectItem key={SENZA_MENZIONE} className="text-default-500">
                        {SENZA_MENZIONE_LABEL}
                      </SelectItem>
                      <>
                        {ESITI_FFR_CT.map((o) => (
                          <SelectItem key={o.chiave}>{o.label}</SelectItem>
                        ))}
                      </>
                    </Select>
                  </div>

                  <RefertoTextarea
                    value={visitaData.tcCoronarica.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("tcCoronarica", "referto", value)
                    }
                    variant="bordered"
                    minRows={4}
                    placeholder="Sintesi del referto radiologico, sedi delle placche, conclusioni..."
                  />
                </ModuloCollassabile>

                {/* Sezione 7: Test ergometrico */}
                <ModuloCollassabile
                  numero={numeroSezione.testErgometrico}
                  visibile={moduloVisibile("testErgometrico")}
                  titolo="Test ergometrico"
                  sottotitolo="non eseguito"
                  compilato={bloccoCompilato("testErgometrico")}
                  azione={
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === "visita" &&
                          t.section === "testErgometrico",
                      )}
                      onSelect={(t) => applyBloccoTemplate("testErgometrico", t)}
                    />
                  }
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                      type="date"
                      label="Data esame"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      value={visitaData.testErgometrico.dataEsame ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("testErgometrico", "dataEsame", v)
                      }
                    />
                    <Select
                      label="Protocollo"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="—"
                      selectedKeys={
                        visitaData.testErgometrico.protocollo
                          ? [visitaData.testErgometrico.protocollo]
                          : []
                      }
                      onSelectionChange={(keys) =>
                        handleBloccoChange(
                          "testErgometrico",
                          "protocollo",
                          (Array.from(keys)[0] as string) ?? "",
                        )
                      }
                    >
                      <SelectItem key="Bruce">Bruce</SelectItem>
                      <SelectItem key="Bruce modificato">
                        Bruce modificato
                      </SelectItem>
                      <SelectItem key="Cicloergometro a rampa">
                        Cicloergometro a rampa
                      </SelectItem>
                      <SelectItem key="Altro">Altro</SelectItem>
                    </Select>
                    <MisuraInput
                      label="Durata"
                      unit="min"
                      value={visitaData.testErgometrico.durataMin}
                      onValueChange={(v) =>
                        handleBloccoChange("testErgometrico", "durataMin", v)
                      }
                      draft={draftOf("erg.durata")}
                      onDraftChange={(d) => setDraft("erg.durata", d)}
                      {...misura("erg.durata")}
                    />
                    <MisuraInput
                      label="Carico max"
                      unit="watt"
                      decimals={false}
                      value={visitaData.testErgometrico.caricoWatt}
                      onValueChange={(v) =>
                        handleBloccoChange("testErgometrico", "caricoWatt", v)
                      }
                      draft={draftOf("erg.watt")}
                      onDraftChange={(d) => setDraft("erg.watt", d)}
                      {...misura("erg.watt")}
                    />
                    <MisuraInput
                      label="METs"
                      value={visitaData.testErgometrico.mets}
                      onValueChange={(v) =>
                        handleBloccoChange("testErgometrico", "mets", v)
                      }
                      draft={draftOf("erg.mets")}
                      onDraftChange={(d) => setDraft("erg.mets", d)}
                      {...misura("erg.mets")}
                    />
                    <MisuraInput
                      label="FC max raggiunta"
                      unit="bpm"
                      decimals={false}
                      value={visitaData.testErgometrico.fcMax}
                      onValueChange={(v) =>
                        handleBloccoChange("testErgometrico", "fcMax", v)
                      }
                      draft={draftOf("erg.fcmax")}
                      onDraftChange={(d) => setDraft("erg.fcmax", d)}
                      {...misura("erg.fcmax")}
                    />
                    <Input
                      label="P.A. al picco"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Es. 180/90"
                      value={visitaData.testErgometrico.paMax ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("testErgometrico", "paMax", v)
                      }
                    />
                    <Select
                      label="Esito"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="—"
                      selectedKeys={
                        visitaData.testErgometrico.esito
                          ? [visitaData.testErgometrico.esito]
                          : []
                      }
                      onSelectionChange={(keys) =>
                        handleBloccoChange(
                          "testErgometrico",
                          "esito",
                          (Array.from(keys)[0] as string) ?? "",
                        )
                      }
                    >
                      <SelectItem key="negativo">
                        Negativo per ischemia inducibile
                      </SelectItem>
                      <SelectItem key="positivo">
                        Positivo per ischemia inducibile
                      </SelectItem>
                      <SelectItem key="dubbio">Dubbio</SelectItem>
                      <SelectItem key="non diagnostico">
                        Non diagnostico
                      </SelectItem>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                    <Input
                      label="Motivo dell'interruzione"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Esaurimento muscolare, sintomi, aritmia..."
                      value={visitaData.testErgometrico.motivoInterruzione ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "testErgometrico",
                          "motivoInterruzione",
                          v,
                        )
                      }
                    />
                    <CalcSuggestion
                      label="FC raggiunta sulla teorica"
                      outcome={fcMaxPctCalc}
                    />
                  </div>
                  <RefertoTextarea
                    value={visitaData.testErgometrico.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("testErgometrico", "referto", value)
                    }
                    variant="bordered"
                    minRows={4}
                    placeholder="Comportamento pressorio, alterazioni del tratto ST, sintomi, aritmie da sforzo..."
                  />
                </ModuloCollassabile>

                {/* Sezione 8: Holter ECG */}
                <ModuloCollassabile
                  numero={numeroSezione.holterEcg}
                  visibile={moduloVisibile("holterEcg")}
                  titolo="ECG dinamico secondo Holter"
                  sottotitolo="non eseguito"
                  compilato={bloccoCompilato("holterEcg")}
                  azione={
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === "visita" && t.section === "holterEcg",
                      )}
                      onSelect={(t) => applyBloccoTemplate("holterEcg", t)}
                    />
                  }
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                      type="date"
                      label="Data inizio"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      value={visitaData.holterEcg.dataEsame ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("holterEcg", "dataEsame", v)
                      }
                    />
                    <MisuraInput
                      label="Durata"
                      unit="ore"
                      decimals={false}
                      value={visitaData.holterEcg.durataOre}
                      onValueChange={(v) =>
                        handleBloccoChange("holterEcg", "durataOre", v)
                      }
                      draft={draftOf("hecg.durata")}
                      onDraftChange={(d) => setDraft("hecg.durata", d)}
                      {...misura("hecg.durata")}
                    />
                    <MisuraInput
                      label="FC media"
                      unit="bpm"
                      decimals={false}
                      value={visitaData.holterEcg.fcMedia}
                      onValueChange={(v) =>
                        handleBloccoChange("holterEcg", "fcMedia", v)
                      }
                      draft={draftOf("hecg.fcmedia")}
                      onDraftChange={(d) => setDraft("hecg.fcmedia", d)}
                      {...misura("hecg.fcmedia")}
                    />
                    <Select
                      label="Ritmo prevalente"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="—"
                      selectedKeys={
                        visitaData.holterEcg.ritmoPrevalente
                          ? [visitaData.holterEcg.ritmoPrevalente]
                          : []
                      }
                      onSelectionChange={(keys) =>
                        handleBloccoChange(
                          "holterEcg",
                          "ritmoPrevalente",
                          (Array.from(keys)[0] as string) ?? "",
                        )
                      }
                    >
                      <SelectItem key="sinusale">Sinusale</SelectItem>
                      <SelectItem key="fibrillazione atriale">
                        Fibrillazione atriale
                      </SelectItem>
                      <SelectItem key="da pacemaker">Da pacemaker</SelectItem>
                      <SelectItem key="altro">Altro</SelectItem>
                    </Select>
                    <MisuraInput
                      label="FC minima"
                      unit="bpm"
                      decimals={false}
                      value={visitaData.holterEcg.fcMin}
                      onValueChange={(v) =>
                        handleBloccoChange("holterEcg", "fcMin", v)
                      }
                      draft={draftOf("hecg.fcmin")}
                      onDraftChange={(d) => setDraft("hecg.fcmin", d)}
                      {...misura("hecg.fcmin")}
                    />
                    <MisuraInput
                      label="FC massima"
                      unit="bpm"
                      decimals={false}
                      value={visitaData.holterEcg.fcMax}
                      onValueChange={(v) =>
                        handleBloccoChange("holterEcg", "fcMax", v)
                      }
                      draft={draftOf("hecg.fcmax")}
                      onDraftChange={(d) => setDraft("hecg.fcmax", d)}
                      {...misura("hecg.fcmax")}
                    />
                    <MisuraInput
                      label="BESV / 24h"
                      decimals={false}
                      value={visitaData.holterEcg.besv}
                      onValueChange={(v) =>
                        handleBloccoChange("holterEcg", "besv", v)
                      }
                      draft={draftOf("hecg.besv")}
                      onDraftChange={(d) => setDraft("hecg.besv", d)}
                      {...misura("hecg.besv")}
                    />
                    <MisuraInput
                      label="BEV / 24h"
                      decimals={false}
                      value={visitaData.holterEcg.bev}
                      onValueChange={(v) =>
                        handleBloccoChange("holterEcg", "bev", v)
                      }
                      draft={draftOf("hecg.bev")}
                      onDraftChange={(d) => setDraft("hecg.bev", d)}
                      {...misura("hecg.bev")}
                    />
                    <MisuraInput
                      label="Pausa max"
                      unit="s"
                      value={visitaData.holterEcg.pausaMaxSec}
                      onValueChange={(v) =>
                        handleBloccoChange("holterEcg", "pausaMaxSec", v)
                      }
                      draft={draftOf("hecg.pausa")}
                      onDraftChange={(d) => setDraft("hecg.pausa", d)}
                      {...misura("hecg.pausa")}
                    />
                  </div>
                  <RefertoTextarea
                    value={visitaData.holterEcg.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("holterEcg", "referto", value)
                    }
                    variant="bordered"
                    minRows={4}
                    placeholder="Ritmo, aritmie sopraventricolari e ventricolari, pause, correlazione con i sintomi riferiti sul diario..."
                  />
                </ModuloCollassabile>

                {/* Sezione 9: Holter pressorio */}
                <ModuloCollassabile
                  numero={numeroSezione.holterPressorio}
                  visibile={moduloVisibile("holterPressorio")}
                  titolo="Monitoraggio pressorio delle 24 ore"
                  sottotitolo="non eseguito"
                  compilato={bloccoCompilato("holterPressorio")}
                  azione={
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === "visita" &&
                          t.section === "holterPressorio",
                      )}
                      onSelect={(t) => applyBloccoTemplate("holterPressorio", t)}
                    />
                  }
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                      type="date"
                      label="Data inizio"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      value={visitaData.holterPressorio.dataEsame ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("holterPressorio", "dataEsame", v)
                      }
                    />
                    <MisuraInput
                      label="Media 24h sist."
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.holterPressorio.media24Sist}
                      onValueChange={(v) =>
                        handleBloccoChange("holterPressorio", "media24Sist", v)
                      }
                      draft={draftOf("hp.m24s")}
                      onDraftChange={(d) => setDraft("hp.m24s", d)}
                      {...misura("hp.m24s")}
                    />
                    <MisuraInput
                      label="Media 24h diast."
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.holterPressorio.media24Diast}
                      onValueChange={(v) =>
                        handleBloccoChange("holterPressorio", "media24Diast", v)
                      }
                      draft={draftOf("hp.m24d")}
                      onDraftChange={(d) => setDraft("hp.m24d", d)}
                      {...misura("hp.m24d")}
                    />
                    <MisuraInput
                      label="Carico pressorio"
                      unit="%"
                      decimals={false}
                      value={visitaData.holterPressorio.caricoPressorioPct}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "holterPressorio",
                          "caricoPressorioPct",
                          v,
                        )
                      }
                      draft={draftOf("hp.carico")}
                      onDraftChange={(d) => setDraft("hp.carico", d)}
                      {...misura("hp.carico")}
                    />
                    <MisuraInput
                      label="Media diurna sist."
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.holterPressorio.mediaDiurnaSist}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "holterPressorio",
                          "mediaDiurnaSist",
                          v,
                        )
                      }
                      draft={draftOf("hp.mds")}
                      onDraftChange={(d) => setDraft("hp.mds", d)}
                      {...misura("hp.mds")}
                    />
                    <MisuraInput
                      label="Media diurna diast."
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.holterPressorio.mediaDiurnaDiast}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "holterPressorio",
                          "mediaDiurnaDiast",
                          v,
                        )
                      }
                      draft={draftOf("hp.mdd")}
                      onDraftChange={(d) => setDraft("hp.mdd", d)}
                      {...misura("hp.mdd")}
                    />
                    <MisuraInput
                      label="Media notturna sist."
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.holterPressorio.mediaNotturnaSist}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "holterPressorio",
                          "mediaNotturnaSist",
                          v,
                        )
                      }
                      draft={draftOf("hp.mns")}
                      onDraftChange={(d) => setDraft("hp.mns", d)}
                      {...misura("hp.mns")}
                    />
                    <MisuraInput
                      label="Media notturna diast."
                      unit="mmHg"
                      decimals={false}
                      value={visitaData.holterPressorio.mediaNotturnaDiast}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "holterPressorio",
                          "mediaNotturnaDiast",
                          v,
                        )
                      }
                      draft={draftOf("hp.mnd")}
                      onDraftChange={(d) => setDraft("hp.mnd", d)}
                      {...misura("hp.mnd")}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                    <MisuraInput
                      label="Calo notturno riportato"
                      unit="%"
                      value={visitaData.holterPressorio.caloNotturnoPct}
                      onValueChange={(v) =>
                        handleBloccoChange(
                          "holterPressorio",
                          "caloNotturnoPct",
                          v,
                        )
                      }
                      draft={draftOf("hp.calo")}
                      onDraftChange={(d) => setDraft("hp.calo", d)}
                      {...misura("hp.calo")}
                    />
                    <CalcSuggestion
                      label="Calo notturno calcolato"
                      outcome={caloNotturnoCalc}
                    />
                  </div>
                  <RefertoTextarea
                    value={visitaData.holterPressorio.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("holterPressorio", "referto", value)
                    }
                    variant="bordered"
                    minRows={4}
                    placeholder="Profilo circadiano, controllo pressorio nelle 24 ore, tolleranza della terapia in corso..."
                  />
                </ModuloCollassabile>

                {/* Sezione 10: Doppler TSA.
                    Non e' un esame del cardiologo — lo refertano il chirurgo
                    vascolare o il radiologo — ma il cardiologo lo legge e lo
                    usa: la placca carotidea e' aterosclerosi documentata, e
                    sposta la classe di rischio senza bisogno di punteggi. */}
                <ModuloCollassabile
                  numero={numeroSezione.dopplerTsa}
                  visibile={moduloVisibile("dopplerTsa")}
                  titolo="EcoColorDoppler dei tronchi sovraaortici"
                  sottotitolo="non eseguito"
                  compilato={bloccoCompilato("dopplerTsa")}
                  azione={
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === "visita" && t.section === "dopplerTsa",
                      )}
                      onSelect={(t) => applyBloccoTemplate("dopplerTsa", t)}
                    />
                  }
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                      type="date"
                      label="Data esame"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      value={visitaData.dopplerTsa.dataEsame ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("dopplerTsa", "dataEsame", v)
                      }
                    />
                    <Input
                      label="Struttura"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Dove è stato eseguito"
                      value={visitaData.dopplerTsa.struttura ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("dopplerTsa", "struttura", v)
                      }
                    />
                    <MisuraInput
                      label="IMT massimo"
                      unit="mm"
                      value={visitaData.dopplerTsa.imtMax}
                      onValueChange={(v) =>
                        handleBloccoChange("dopplerTsa", "imtMax", v)
                      }
                      draft={draftOf("tsa.imt")}
                      onDraftChange={(d) => setDraft("tsa.imt", d)}
                      {...misura("tsa.imt")}
                    />
                    {/* Lo stesso campo che nelle variabili cliniche si chiama
                        "ATS carotidea": si compila da tutte e due le parti e il
                        valore e' uno solo. */}
                    <MisuraInput
                      label="Stenosi massima"
                      unit="%"
                      decimals={false}
                      value={visitaData.dopplerTsa.stenosiCarotidea}
                      onValueChange={(v) =>
                        handleBloccoChange("dopplerTsa", "stenosiCarotidea", v)
                      }
                      draft={draftOf("tsa.stenosi")}
                      onDraftChange={(d) => setDraft("tsa.stenosi", d)}
                      {...misura("tsa.stenosi")}
                    />
                    <Input
                      label="Sede della stenosi"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Es. bulbo carotideo destro"
                      value={visitaData.dopplerTsa.sedeStenosi ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("dopplerTsa", "sedeStenosi", v)
                      }
                    />
                    <Input
                      label="Placche"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Sede ed ecostruttura"
                      className="md:col-span-2"
                      value={visitaData.dopplerTsa.placche ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("dopplerTsa", "placche", v)
                      }
                    />
                    <Input
                      label="Assi vertebrali"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Pervietà e direzione del flusso"
                      value={visitaData.dopplerTsa.vertebrali ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("dopplerTsa", "vertebrali", v)
                      }
                    />
                  </div>
                  <RefertoTextarea
                    value={visitaData.dopplerTsa.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("dopplerTsa", "referto", value)
                    }
                    variant="bordered"
                    minRows={4}
                    placeholder="Spessore medio-intimale, placche e loro ecostruttura, grado di stenosi, assi vertebrali, conclusioni del referto letto..."
                  />
                </ModuloCollassabile>

                {/* Sezione 11: Scompenso cardiaco */}
                <ModuloCollassabile
                  numero={numeroSezione.scompenso}
                  visibile={moduloVisibile("scompenso")}
                  titolo="Scompenso cardiaco"
                  sottotitolo="non valutato"
                  compilato={bloccoCompilato("scompenso")}
                  azione={
                    <div className="flex items-center gap-1">
                      {prontuarioAttivo && (
                        <Button
                          type="button"
                          isIconOnly
                          size="sm"
                          variant="light"
                          radius="full"
                          aria-label="Prontuario: classi di scompenso"
                          className="h-6 w-6 min-w-0 text-default-500 data-[hover=true]:text-primary-600"
                          onPress={() => apriProntuario("classi")}
                        >
                          <Info size={15} />
                        </Button>
                      )}
                      <TemplateSelector
                        templates={allTemplates.filter(
                          (t) =>
                            t.category === "visita" && t.section === "scompenso",
                        )}
                        onSelect={(t) => applyBloccoTemplate("scompenso", t)}
                      />
                    </div>
                  }
                >
                  {/* Il fenotipo non è un campo: arriva dalla FE inserita
                      nell'ecocardiogramma, e senza quella non c'è niente da
                      dire invece di una casella vuota da riempire a mano. */}
                  <div className="rounded-lg border border-default-200 bg-default-50/60 px-3 py-2">
                    {fenotipo ? (
                      <>
                        <p className="text-xs text-default-500">
                          Fenotipo per frazione di eiezione
                        </p>
                        <p className="text-sm font-semibold text-gray-800">
                          {fenotipo.label}{" "}
                          <span className="font-normal text-default-500">
                            ({fenotipo.intervallo})
                          </span>
                        </p>
                        {fenotipo.avvertenza && (
                          <p className="mt-1 text-xs text-default-500">
                            {fenotipo.avvertenza}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-default-500">
                        Il fenotipo (HFrEF / HFpEF) compare inserendo la
                        frazione di eiezione nell&apos;ecocardiogramma.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Select
                      label="Classe NYHA"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Non indicata"
                      description={
                        <PrecedenteTesto
                          precedente={precedenti["scompenso.nyha"]}
                          descrivi={(k) => `NYHA ${k}`}
                        />
                      }
                      classNames={{ description: "m-0" }}
                      selectedKeys={
                        visitaData.scompenso.nyha ? [visitaData.scompenso.nyha] : []
                      }
                      onSelectionChange={(keys) =>
                        handleBloccoChange(
                          "scompenso",
                          "nyha",
                          (Array.from(keys)[0] as string) ?? "",
                        )
                      }
                    >
                      {CLASSI_NYHA.map((c) => (
                        <SelectItem key={c}>{NYHA_LABELS[c]}</SelectItem>
                      ))}
                    </Select>
                    <Input
                      type="date"
                      label="Data dosaggio"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      max={todayIsoDate()}
                      value={visitaData.scompenso.dataBnp ?? ""}
                      onValueChange={(v) =>
                        handleBloccoChange("scompenso", "dataBnp", v)
                      }
                    />
                    <MisuraInput
                      label="NT-proBNP"
                      unit="pg/mL"
                      decimals={false}
                      value={visitaData.scompenso.ntProBnp}
                      onValueChange={(v) =>
                        handleBloccoChange("scompenso", "ntProBnp", v)
                      }
                      draft={draftOf("sc.bnp")}
                      onDraftChange={(d) => setDraft("sc.bnp", d)}
                      {...misura("sc.bnp")}
                    />
                    {/* Il contesto non è un di più: con 125 pg/mL in
                        ambulatorio e 300 in urgenza, lo stesso valore cade in
                        due fasce diverse. Senza, il giudizio non compare. */}
                    <Select
                      label="Contesto del prelievo"
                      size="sm"
                      variant="bordered"
                      labelPlacement="outside"
                      placeholder="Non indicato"
                      selectedKeys={
                        visitaData.scompenso.contestoBnp
                          ? [visitaData.scompenso.contestoBnp]
                          : []
                      }
                      onSelectionChange={(keys) =>
                        handleBloccoChange(
                          "scompenso",
                          "contestoBnp",
                          (Array.from(keys)[0] as string) ?? "",
                        )
                      }
                    >
                      {(Object.keys(CONTESTO_BNP_LABELS) as ContestoBnp[]).map(
                        (k) => (
                          <SelectItem key={k}>
                            {CONTESTO_BNP_LABELS[k]}
                          </SelectItem>
                        ),
                      )}
                    </Select>
                  </div>

                  {riferimentoBnp && (
                    <p className="text-xs text-default-500">{riferimentoBnp}</p>
                  )}

                  {visitaData.scompenso.ntProBnp != null && !esitoBnp && (
                    <p className="text-xs text-warning-700">
                      Indica il contesto del prelievo: le soglie di esclusione
                      sono 125 pg/mL in ambulatorio e 300 pg/mL in urgenza, e
                      senza saperlo il valore non &egrave; interpretabile.
                    </p>
                  )}

                  {esitoBnp && (
                    <div
                      className={`rounded-lg border px-3 py-2 ${
                        esitoBnp.livello === "conferma"
                          ? "border-danger-200 bg-danger-50"
                          : esitoBnp.livello === "indeterminato"
                            ? "border-warning-200 bg-warning-50"
                            : "border-success-200 bg-success-50"
                      }`}
                    >
                      <p
                        className={`text-sm font-semibold ${
                          esitoBnp.livello === "conferma"
                            ? "text-danger-700"
                            : esitoBnp.livello === "indeterminato"
                              ? "text-warning-700"
                              : "text-success-700"
                        }`}
                      >
                        {esitoBnp.titolo}
                      </p>
                      <p className="mt-0.5 text-xs text-default-600">
                        {esitoBnp.nota}
                      </p>
                      {avvisiBnp.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 border-t border-default-200/70 pt-1.5">
                          {avvisiBnp.map((a) => (
                            <li key={a} className="text-xs text-default-600">
                              &middot; {a}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <RefertoTextarea
                    value={visitaData.scompenso.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("scompenso", "referto", value)
                    }
                    variant="bordered"
                    minRows={4}
                    placeholder="Segni di congestione, tolleranza allo sforzo, terapia in atto e sua tolleranza..."
                  />
                </ModuloCollassabile>

                {/* Sezione 12: Fibrillazione atriale */}
                <ModuloCollassabile
                  numero={numeroSezione.fibrillazioneAtriale}
                  visibile={moduloVisibile("fibrillazioneAtriale")}
                  titolo="Fibrillazione atriale"
                  sottotitolo="non valutata"
                  compilato={bloccoCompilato("fibrillazioneAtriale")}
                  azione={
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === "visita" &&
                          t.section === "fibrillazioneAtriale",
                      )}
                      onSelect={(t) =>
                        applyBloccoTemplate("fibrillazioneAtriale", t)
                      }
                    />
                  }
                >
                  {/* Interruttore esplicito, e non l'aver toccato un campo:
                      i due punteggi si calcolano da eta', sesso e fattori di
                      rischio, quindi bastava aprire la sezione per ritrovarsi
                      un "CHA₂DS₂-VASc 0 / 9" stampato addosso a un paziente
                      che non e' mai stato fibrillante.

                      Ne' forma clinica ne' terapia anticoagulante: sono
                      diagnosi e decisioni, e le formula il cardiologo nel
                      referto qui sotto. */}
                  <Switch
                    size="sm"
                    isSelected={fa.attivo === true}
                    onValueChange={(v) =>
                      handleBloccoChange(
                        "fibrillazioneAtriale",
                        "attivo",
                        v ? true : undefined,
                      )
                    }
                  >
                    <span className="text-sm text-gray-700">
                      Valuta la fibrillazione atriale in questa visita
                    </span>
                  </Switch>
                  {fa.attivo !== true && (
                    <p className="text-xs text-default-500">
                      Finch&eacute; resta spento, il modulo non entra nel referto
                      e i punteggi non vengono calcolati.
                    </p>
                  )}

                  {fa.attivo === true && (
                  <>
                  {/* Età e sesso non sono caselle: i due punteggi li prendono
                      dall'anagrafica, così non possono contraddire la scheda
                      del paziente. */}
                  <p className="text-xs text-default-500">
                    Et&agrave; e sesso entrano nei punteggi dalla scheda del
                    paziente
                    {etaPaziente != null && sessoPaziente
                      ? ` (${etaPaziente} anni, ${
                          sessoPaziente === "F" ? "femmina" : "maschio"
                        })`
                      : ""}
                    : non vanno spuntati qui.
                  </p>

                  {/* `items-stretch` + `mt-auto` sui riquadri: le due colonne
                      hanno un numero diverso di fattori, e senza questo i due
                      punteggi finiscono a quote diverse, che è proprio il
                      confronto che il medico fa con l'occhio. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-semibold text-gray-700">
                        CHA&#8322;DS&#8322;-VASc — rischio tromboembolico
                      </p>
                      <div className="space-y-1.5">
                        {FATTORI_CHADSVASC.map((f) => {
                          // Ipertensione e diabete arrivano dai fattori di
                          // rischio: qui si mostrano in sola lettura, perche'
                          // la tabella del punteggio resti leggibile per
                          // intero senza poter essere contraddetta.
                          if (f.origine === "fattoriRischio") {
                            const attivo =
                              fattoriRischio[
                                f.chiave as keyof typeof fattoriRischio
                              ] === true;
                            return (
                              <div key={f.chiave} className="flex gap-2">
                                <span
                                  className={`mt-0.5 text-sm ${
                                    attivo ? "text-success-600" : "text-default-300"
                                  }`}
                                >
                                  {attivo ? "✓" : "—"}
                                </span>
                                <div>
                                  <span className="text-sm text-default-500">
                                    {f.label}
                                    <span className="ml-1 text-default-400">
                                      (+{f.punti})
                                    </span>
                                  </span>
                                  <p className="text-xs text-default-400">
                                    Dai fattori di rischio, nella colonna
                                    delle variabili cliniche.
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          const campo =
                            CAMPO_CHADSVASC[
                              f.chiave as keyof typeof CAMPO_CHADSVASC
                            ];
                          return (
                            <div key={f.chiave}>
                              <Checkbox
                                size="sm"
                                isSelected={fa[campo as keyof typeof fa] === true}
                                onValueChange={(c) =>
                                  handleBloccoChange(
                                    "fibrillazioneAtriale",
                                    campo,
                                    c ? true : undefined,
                                  )
                                }
                              >
                                <span className="text-sm text-gray-700">
                                  {f.label}
                                  <span className="ml-1 text-default-400">
                                    (+{f.punti})
                                  </span>
                                </span>
                              </Checkbox>
                              <p className="ml-7 text-xs text-default-500">
                                {f.nota}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <RiquadroPunteggio
                        titolo="CHA₂DS₂-VASc"
                        esito={chadsVascCalc}
                        inFondo
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-semibold text-gray-700">
                        HAS-BLED — rischio emorragico
                      </p>
                      <div className="space-y-1.5">
                        {FATTORI_HASBLED.map((f) => {
                          // La voce "INR labile" vale solo in warfarin. La
                          // tendina della terapia non c'e' piu': la casella
                          // resta spuntabile e a dire la condizione e' la sua
                          // nota, perche' chi la spunta sa cosa prende il
                          // paziente.
                          return (
                            <div key={f.chiave}>
                              <Checkbox
                                size="sm"
                                isSelected={
                                  fa[
                                    CAMPO_HASBLED[
                                      f.chiave
                                    ] as keyof typeof fa
                                  ] === true
                                }
                                onValueChange={(c) =>
                                  handleBloccoChange(
                                    "fibrillazioneAtriale",
                                    CAMPO_HASBLED[f.chiave],
                                    c ? true : undefined,
                                  )
                                }
                              >
                                <span className="text-sm text-gray-700">
                                  {f.label}
                                  <span className="ml-1 text-default-400">
                                    (+1)
                                  </span>
                                </span>
                              </Checkbox>
                              <p className="ml-7 text-xs text-default-500">
                                {f.nota}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <RiquadroPunteggio
                        titolo="HAS-BLED"
                        esito={hasBledCalc}
                        allarme={hasBledCalc.ok && hasBledCalc.esito.alto}
                        inFondo
                      >
                        {hasBledCalc.ok &&
                          hasBledCalc.esito.modificabili.length > 0 && (
                            <div className="mt-1.5 border-t border-default-200/70 pt-1.5">
                              <p className="text-xs font-semibold text-gray-700">
                                Fattori su cui si pu&ograve; intervenire
                              </p>
                              <ul className="mt-0.5 space-y-0.5">
                                {hasBledCalc.esito.modificabili.map((m) => (
                                  <li
                                    key={m}
                                    className="text-xs text-default-600"
                                  >
                                    &middot; {m}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </RiquadroPunteggio>
                    </div>
                  </div>

                  <RefertoTextarea
                    value={fa.referto ?? ""}
                    onValueChange={(value) =>
                      handleBloccoChange("fibrillazioneAtriale", "referto", value)
                    }
                    variant="bordered"
                    minRows={4}
                    placeholder="Data di riscontro, sintomi, strategia di controllo del ritmo o della frequenza, farmaco anticoagulante e dosaggio..."
                  />
                  </>
                  )}
                </ModuloCollassabile>

                {/* Sezione 13: Accertamenti */}
                <div className="space-y-2 relative group">
                  <label className="text-sm font-bold text-gray-700 block mb-1">
                    {numeroSezione.accertamenti}. Accertamenti
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

                {/* Sezione 14: Conclusioni e terapia */}
                <div className="space-y-2 relative group">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-sm font-bold text-gray-700">
                      {numeroSezione.conclusioni}. Conclusioni e Terapia
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

      {/* 4. Floating Action Bar (Pill) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex justify-center w-full pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 pointer-events-auto transition-all hover:shadow-xl hover:scale-[1.01]">
          <Button
            variant="light"
            color="danger"
            size="sm"
            onPress={handleNavigateCronologia}
            startContent={<ArrowLeft size={16} />}
            className="text-gray-600 hover:text-danger font-medium"
          >
            Annulla
          </Button>

          <div className="h-6 w-px bg-gray-300" />

          <div className="flex gap-3">
            <Button
              color="primary"
              variant="flat"
              size="md"
              onPress={handlePrintPdf}
              isLoading={loading || pdfLoading}
              isDisabled={loading || pdfLoading}
              startContent={<Printer size={18} />}
              className="rounded-full"
            >
              {loading
                ? "Salvataggio..."
                : pdfLoading
                  ? "Preparazione stampa..."
                  : "Stampa"}
            </Button>

            <Button
              onPress={() => handleSubmit()}
              color="primary"
              size="md"
              className="px-6 font-bold shadow-lg shadow-primary/20 rounded-full"
              isLoading={loading}
              isDisabled={loading}
              startContent={<Save size={18} />}
            >
              {loading ? "Salvando..." : "Salva Visita"}
            </Button>
          </div>
        </div>
      </div>

      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
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

      {/* Montati solo a prontuario attivo: i pulsanti che li aprono sono gia'
          nascosti, e cosi' non resta modo di arrivarci comunque. */}
      {prontuarioAttivo && (
        <>
          <ProntuarioImagingModal
            isOpen={isProntuarioImagingOpen}
            onClose={() => setIsProntuarioImagingOpen(false)}
            sogliaCac={sogliaCac}
            categoriaCorrente={esitoCac?.categoria}
          />
          <ProntuarioModal
            isOpen={isProntuarioOpen}
            onClose={() => setIsProntuarioOpen(false)}
            fe={visitaData.ecocardiogramma.fe}
            trigliceridi={visitaData.laboratorio.trigliceridi}
            categoriaRischio={visitaData.categoriaRischioCv}
            nyha={visitaData.scompenso.nyha}
            tabIniziale={tabProntuario}
          />
        </>
      )}

      {doctorProfileIncompleteModal}
    </div>
  );
}
