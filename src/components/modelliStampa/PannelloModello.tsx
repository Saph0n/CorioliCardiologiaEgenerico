import { useRef, useState, type ReactNode } from "react";
import {
  Button,
  Input,
  Select,
  SelectItem,
  Slider,
  Switch,
  Textarea,
} from "@nextui-org/react";
import {
  AlignLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  GripVertical,
  Heading,
  ImagePlus,
  Info,
  ListOrdered,
  Loader2,
  Palette,
  PanelBottom,
  PenLine,
  RotateCcw,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Doctor, ModelloStampa, SezioneReferto } from "../../types/Storage";
import { SEZIONI_REFERTO, titoloPredefinitoSezione } from "../../utils/modelliStampa";
import type { ParteModello } from "./AnteprimaModello";
import { preparaCartaIntestata, preparaLogo } from "./immagini";
import { coloreCss, fondoPienoCss, tintaCss } from "./colori";

/** Applica una modifica al modello; `chiave` raggruppa i tasti di uno stesso campo nell'annulla. */
export type CambiaModello = (modifica: (m: ModelloStampa) => void, chiave?: string) => void;

interface Props {
  modello: ModelloStampa;
  onCambia: CambiaModello;
  parte: ParteModello;
  onParte: (parte: ParteModello) => void;
  sezioneAttiva: SezioneReferto | null;
  onSezioneAttiva: (id: SezioneReferto | null) => void;
  doctor: Doctor | null;
  /** Quello che le impostazioni spengono per tutti i documenti. */
  spentoInImpostazioni: { telefono: boolean; email: boolean; firmaReferto: boolean };
  onErrore: (messaggio: string) => void;
  /** Porta a una sezione delle impostazioni. */
  onVaiImpostazioni: (sezione: string) => void;
  /** Porta aspetto e carta intestata sugli altri documenti; assente sui modelli di Corioli. */
  onApplicaATutti?: () => void;
  /** Sul modello di Corioli aperto: lo stesso modello pronto per tutti i documenti. */
  onUsaPerTutti?: () => void;
}

const PARTI: { id: ParteModello; nome: string; icona: LucideIcon }[] = [
  { id: "pagina", nome: "Aspetto", icona: Palette },
  { id: "intestazione", nome: "Carta intestata", icona: Building2 },
  { id: "titolo", nome: "Titolo", icona: Heading },
  { id: "paziente", nome: "Paziente", icona: UserRound },
  { id: "sezioni", nome: "Sezioni", icona: ListOrdered },
  { id: "firma", nome: "Firma", icona: PenLine },
  { id: "piede", nome: "Piè di pagina", icona: PanelBottom },
];

/** I titoletti proposti sopra il testo, per documento: il primo e' quello di Corioli. */
const SUGGERIMENTI_TESTI: Record<
  Exclude<ModelloStampa["documento"], "referto">,
  { principale: string[]; secondario?: string[]; nomePrincipale: string; nomeSecondario?: string }
> = {
  ricetta: { nomePrincipale: "Sopra la prescrizione", principale: ["Prescrizione", "Rp/", "Terapia"] },
  certificato: { nomePrincipale: "Sopra il testo", principale: ["Si certifica che", "Certifico che"] },
  richiestaEsame: {
    nomePrincipale: "Sopra l'esame",
    principale: ["Si richiede", "Richiesta"],
    nomeSecondario: "Sopra il quesito",
    secondario: ["Quesito diagnostico", "Motivo della richiesta"],
  },
};

/** Il riquadro della scheda: titolo grande e, sotto, i controlli. */
function Scheda({ titolo, descrizione, children }: { titolo: string; descrizione?: string; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold text-gray-900">{titolo}</h3>
        {descrizione && <p className="mt-1 text-base text-default-600">{descrizione}</p>}
      </div>
      {children}
    </div>
  );
}

function Etichetta({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-base font-medium text-gray-800">{children}</p>;
}

/** Una nota, con il pulsante che porta dove si risolve quando serve. */
function Nota({
  children,
  tono = "info",
  azione,
}: {
  children: ReactNode;
  tono?: "info" | "attenzione";
  azione?: { nome: string; onPress: () => void };
}) {
  return (
    <div
      className={[
        "flex flex-col gap-2 rounded-lg px-3.5 py-3 text-sm leading-relaxed",
        tono === "attenzione"
          ? "bg-warning-50 text-warning-800 ring-1 ring-warning-200"
          : "bg-default-50 text-default-700 ring-1 ring-default-200",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <Info size={18} className="mt-0.5 shrink-0" />
        <div>{children}</div>
      </div>
      {azione && (
        <Button
          size="sm"
          variant="flat"
          color={tono === "attenzione" ? "warning" : "default"}
          className="self-start"
          endContent={<ArrowRight size={16} />}
          onPress={azione.onPress}
        >
          {azione.nome}
        </Button>
      )}
    </div>
  );
}

/** Pulsanti a scelta singola, grandi: una riga, o piu' colonne se le voci sono molte. */
function Scelta<T extends string>({
  valore,
  voci,
  onScegli,
  colonne,
}: {
  valore: T;
  voci: { valore: T; nome: string; dettaglio?: ReactNode; descrizione?: string }[];
  onScegli: (v: T) => void;
  colonne?: number;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${colonne ?? voci.length}, minmax(0, 1fr))` }}
      role="radiogroup"
    >
      {voci.map((v) => {
        const scelta = v.valore === valore;
        return (
          <button
            key={v.valore}
            type="button"
            role="radio"
            aria-checked={scelta}
            onClick={() => onScegli(v.valore)}
            className={[
              "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-center text-[15px] transition-colors",
              scelta
                ? "border-2 border-brand-600 bg-brand-50 font-semibold text-brand-800"
                : "border-2 border-default-200 bg-white font-medium text-default-700 hover:border-default-400",
            ].join(" ")}
          >
            {v.dettaglio}
            <span className="leading-tight">{v.nome}</span>
            {v.descrizione && (
              <span className={["text-xs font-normal leading-snug", scelta ? "text-brand-700" : "text-default-500"].join(" ")}>
                {v.descrizione}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Interruttore su una riga intera: si clicca anche sul testo. */
function Interruttore({
  nome,
  descrizione,
  acceso,
  onCambia,
  nota,
}: {
  nome: string;
  descrizione?: string;
  acceso: boolean;
  onCambia: (v: boolean) => void;
  nota?: ReactNode;
}) {
  return (
    <div className="border-b border-default-100 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onCambia(!acceso)}
        >
          <p className="text-base font-medium text-gray-800">{nome}</p>
          {descrizione && <p className="mt-0.5 text-sm text-default-500">{descrizione}</p>}
        </button>
        <Switch size="lg" isSelected={acceso} onValueChange={onCambia} aria-label={nome} />
      </div>
      {nota && <div className="mt-2">{nota}</div>}
    </div>
  );
}

/**
 * Riquadro per caricare un'immagine: si clicca o ci si trascina sopra il file.
 * Con l'immagine gia' caricata mostra la miniatura, "Cambia" e "Togli".
 */
function CaricaImmagine({
  valore,
  accetta,
  titolo,
  spiegazione,
  prepara,
  onCarica,
  onTogli,
  onErrore,
  miniaturaFoglio = false,
}: {
  valore?: string;
  accetta: string;
  titolo: string;
  spiegazione: string;
  prepara: (file: File) => Promise<string>;
  onCarica: (dataUrl: string) => void;
  onTogli: () => void;
  onErrore: (messaggio: string) => void;
  /** La miniatura ha le proporzioni di un foglio (carta intestata) invece che di un logo. */
  miniaturaFoglio?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [sopra, setSopra] = useState(false);
  const [lavoro, setLavoro] = useState(false);

  const carica = async (file: File | undefined) => {
    if (!file) return;
    setLavoro(true);
    try {
      onCarica(await prepara(file));
    } catch (e) {
      onErrore(e instanceof Error ? e.message : "Il file non si è caricato.");
    } finally {
      setLavoro(false);
    }
  };

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={accetta}
        className="hidden"
        onChange={(e) => {
          void carica(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {valore ? (
        <div className="flex items-center gap-4 rounded-xl border border-default-200 p-3">
          <div
            className={[
              "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-50 ring-1 ring-default-200",
              miniaturaFoglio ? "h-28 w-20" : "h-20 w-40",
            ].join(" ")}
          >
            <img
              src={valore}
              alt={titolo}
              className={miniaturaFoglio ? "h-full w-full object-cover" : "max-h-16 max-w-[9rem] object-contain"}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="flat"
              startContent={lavoro ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
              onPress={() => input.current?.click()}
            >
              Cambia
            </Button>
            <Button variant="light" color="danger" startContent={<Trash2 size={18} />} onPress={onTogli}>
              Togli
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
          onDragLeave={() => setSopra(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSopra(false);
            void carica(e.dataTransfer.files?.[0]);
          }}
          className={[
            "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            sopra ? "border-brand-500 bg-brand-50" : "border-default-300 hover:border-default-400",
          ].join(" ")}
        >
          {lavoro ? (
            <Loader2 size={28} className="animate-spin text-default-500" />
          ) : miniaturaFoglio ? (
            <FileImage size={28} className="text-default-500" />
          ) : (
            <ImagePlus size={28} className="text-default-500" />
          )}
          <span className="text-base font-medium text-gray-800">{titolo}</span>
          <span className="text-sm text-default-500">{spiegazione}</span>
        </button>
      )}
    </div>
  );
}

const COLORI_PRINCIPALI: { valore: string; nome: string }[] = [
  { valore: "nero", nome: "Bianco e nero" },
  { valore: "#1565c0", nome: "Blu" },
  { valore: "blu", nome: "Blu scuro" },
  { valore: "#0e7490", nome: "Petrolio" },
  { valore: "verde", nome: "Verde" },
  { valore: "#2e7d6b", nome: "Salvia" },
  { valore: "bordeaux", nome: "Bordeaux" },
  { valore: "#5b3a8c", nome: "Viola" },
  { valore: "#37474f", nome: "Ardesia" },
];

const COLORI_SECONDI: { valore: string; nome: string }[] = [
  { valore: "#ef8a2b", nome: "Arancio" },
  { valore: "#c0892b", nome: "Oro" },
  { valore: "#e5674e", nome: "Corallo" },
  { valore: "#2e7d32", nome: "Verde" },
  { valore: "#1565c0", nome: "Blu" },
  { valore: "#78909c", nome: "Grigio" },
];

/**
 * Pastiglie di colore grandi, piu' "Altro colore" col selettore del sistema.
 * `nessuno` aggiunge la scelta vuota (il secondo colore uguale al primo).
 */
function TavolozzaColori({
  valore,
  voci,
  nessuno,
  onScegli,
}: {
  valore: string;
  voci: { valore: string; nome: string }[];
  nessuno?: string;
  onScegli: (v: string) => void;
}) {
  const libero = valore && !voci.some((v) => v.valore === valore) && valore.startsWith("#");
  const pastiglia = (v: string, nome: string, contenuto?: ReactNode) => {
    const scelto = valore === v;
    return (
      <button
        key={v || "nessuno"}
        type="button"
        title={nome}
        aria-label={nome}
        aria-pressed={scelto}
        onClick={() => onScegli(v)}
        className={[
          "flex h-11 min-w-[44px] items-center justify-center rounded-xl border-2 px-1 transition-colors",
          scelto ? "border-brand-600 ring-2 ring-brand-200" : "border-default-200 hover:border-default-400",
        ].join(" ")}
      >
        {contenuto ?? <span className="block h-7 w-7 rounded-lg" style={{ background: coloreCss(v) }} aria-hidden />}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {nessuno !== undefined && pastiglia("", nessuno, <span className="px-2 text-sm font-medium text-default-600">{nessuno}</span>)}
      {voci.map((v) => pastiglia(v.valore, v.nome))}
      <label
        className={[
          "relative flex h-11 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 text-sm font-medium transition-colors",
          libero ? "border-brand-600 ring-2 ring-brand-200" : "border-default-200 text-default-600 hover:border-default-400",
        ].join(" ")}
      >
        <span
          className="block h-6 w-6 rounded-md ring-1 ring-default-300"
          style={{ background: libero ? valore : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
          aria-hidden
        />
        Altro
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={libero ? valore : "#1565c0"}
          onChange={(e) => onScegli(e.target.value.toLowerCase())}
          aria-label="Scegli un altro colore"
        />
      </label>
    </div>
  );
}

/** Le tre strade per l'intestazione, ricavate dai due campi che la descrivono. */
type TipoIntestazione = "corioli" | "prestampata" | "digitale";

function tipoIntestazione(m: ModelloStampa): TipoIntestazione {
  if (!m.intestazione.cartaIntestata) return "corioli";
  return m.intestazione.sfondoInStampa ? "digitale" : "prestampata";
}

export function PannelloModello({
  modello: m,
  onCambia,
  parte,
  onParte,
  sezioneAttiva,
  onSezioneAttiva,
  doctor,
  spentoInImpostazioni,
  onErrore,
  onVaiImpostazioni,
  onApplicaATutti,
  onUsaPerTutti,
}: Props) {
  const referto = m.documento === "referto";
  const [trascinata, setTrascinata] = useState<number | null>(null);
  /**
   * La riga si trascina solo afferrandola per la maniglia: trascinabile per
   * intero, col mouse non si riusciva piu' a selezionare il testo del titolo.
   */
  const [afferrata, setAfferrata] = useState<number | null>(null);

  const spostaSezione = (da: number, a: number) => {
    if (a < 0 || a >= m.sezioni.length || da === a) return;
    onCambia((x) => {
      const [voce] = x.sezioni.splice(da, 1);
      x.sezioni.splice(a, 0, voce);
    });
  };

  const ambulatori = doctor?.ambulatori ?? [];
  const inUso = ambulatori.find((a) => a.isPrimario) ?? ambulatori[0];
  // Un ambulatorio cancellato dal profilo: il PDF ripiega su quello in uso, e
  // la tendina deve dire lo stesso invece di restare vuota.
  const ambulatorioScelto = ambulatori.some((a) => a.id === m.intestazione.ambulatorioId)
    ? m.intestazione.ambulatorioId!
    : "__in_uso";
  const tipo = tipoIntestazione(m);
  const scegliTipo = (t: TipoIntestazione) => onCambia((x) => {
    x.intestazione.cartaIntestata = t !== "corioli";
    x.intestazione.sfondoInStampa = t === "digitale";
  });

  const altri = referto ? "ricetta, certificato e richiesta" : "gli altri documenti";
  const pertutti = onApplicaATutti ? (
    <div className="rounded-xl bg-brand-50/60 p-4 ring-1 ring-brand-200">
      <p className="text-base font-semibold text-gray-900">Stesso aspetto per tutti i documenti</p>
      <p className="mt-1 text-sm text-default-600">
        Porta su {altri} colori, carattere, intestazione, logo e firma di questo modello.
        I loro testi restano come sono.
      </p>
      <Button
        className="mt-3"
        color="primary"
        variant="flat"
        startContent={<Copy size={18} />}
        onPress={onApplicaATutti}
      >
        Applica a tutti i documenti
      </Button>
    </div>
  ) : onUsaPerTutti ? (
    <div className="rounded-xl bg-brand-50/60 p-4 ring-1 ring-brand-200">
      <p className="text-base font-semibold text-gray-900">Stesso stile per tutti i documenti</p>
      <p className="mt-1 text-sm text-default-600">
        Usa «{m.nome}» anche per {altri}: escono tutti con la stessa veste.
      </p>
      <Button
        className="mt-3"
        color="primary"
        variant="flat"
        startContent={<Copy size={18} />}
        onPress={onUsaPerTutti}
      >
        Usa per tutti i documenti
      </Button>
    </div>
  ) : null;

  const sceltaGrandezzaTesto = (
    <Scelta
      valore={m.pagina.testo}
      onScegli={(v) => onCambia((x) => { x.pagina.testo = v; })}
      voci={[
        { valore: "piccolo", nome: "Piccolo", dettaglio: <span className="text-sm">Aa</span> },
        { valore: "normale", nome: "Normale", dettaglio: <span className="text-lg">Aa</span> },
        { valore: "grande", nome: "Grande", dettaglio: <span className="text-2xl">Aa</span> },
      ]}
    />
  );

  const spazi = (
    <div className="space-y-6">
      <Slider
        size="lg"
        label="Spazio vuoto in alto"
        minValue={15}
        maxValue={90}
        step={1}
        value={m.intestazione.spazioAlto}
        getValue={(v) => `${v} mm`}
        onChange={(v) => onCambia((x) => { x.intestazione.spazioAlto = Number(v); }, "spazioAlto")}
        classNames={{ label: "text-base font-medium text-gray-800", value: "text-base font-semibold" }}
      />
      <Slider
        size="lg"
        label="Spazio vuoto in basso"
        minValue={0}
        maxValue={50}
        step={1}
        value={m.intestazione.spazioBasso}
        getValue={(v) => `${v} mm`}
        onChange={(v) => onCambia((x) => { x.intestazione.spazioBasso = Number(v); }, "spazioBasso")}
        classNames={{ label: "text-base font-medium text-gray-800", value: "text-base font-semibold" }}
      />
    </div>
  );

  const contenuto = (() => {
    switch (parte) {
      case "pagina":
        return (
          // I modelli pronti non stanno qui: si scelgono in cima alla colonna,
          // un posto solo (Pablo, 29 ottobre 2026). Qui c'erano anche le loro
          // miniature, che con la colonna unica erano un secondo elenco degli
          // stessi cinque stili a pochi centimetri dal primo.
          <Scheda
            titolo="Aspetto"
            descrizione="Colori, carattere e forme del foglio. Per partire da un modello pronto, sceglilo più in alto."
          >
            <div>
              <Etichetta>Colore principale</Etichetta>
              <TavolozzaColori
                valore={m.pagina.colore}
                voci={COLORI_PRINCIPALI}
                onScegli={(v) => onCambia((x) => { x.pagina.colore = v; }, "colore")}
              />
            </div>
            <div>
              <Etichetta>Secondo colore</Etichetta>
              <TavolozzaColori
                valore={m.pagina.accento}
                voci={COLORI_SECONDI}
                nessuno="Nessuno"
                onScegli={(v) => onCambia((x) => { x.pagina.accento = v; }, "accento")}
              />
              <p className="mt-2 text-sm text-default-500">
                Per specializzazione, sottotitoli e valori fuori norma.
              </p>
            </div>
            <div>
              <Etichetta>Carattere</Etichetta>
              <Scelta
                valore={m.pagina.carattere}
                onScegli={(v) => onCambia((x) => { x.pagina.carattere = v; })}
                voci={[
                  { valore: "helvetica", nome: "Helvetica", dettaglio: <span className="text-2xl" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>Aa</span> },
                  { valore: "lato", nome: "Lato", dettaglio: <span className="text-2xl" style={{ fontFamily: "Lato, 'Segoe UI', sans-serif" }}>Aa</span> },
                  { valore: "times", nome: "Times", dettaglio: <span className="text-2xl" style={{ fontFamily: "'Times New Roman', Times, serif" }}>Aa</span> },
                ]}
              />
            </div>
            <div>
              <Etichetta>Stile</Etichetta>
              <Scelta
                valore={m.pagina.stile}
                onScegli={(v) => onCambia((x) => { x.pagina.stile = v; })}
                voci={[
                  { valore: "classico", nome: "Classico", descrizione: "Nome piccolo, filetto doppio" },
                  { valore: "moderno", nome: "Moderno", descrizione: "Nome grande e colorato, titoli spaziati" },
                ]}
              />
            </div>
            <div>
              <Etichetta>Angoli di fasce e riquadri</Etichetta>
              <Scelta
                valore={m.pagina.angoli}
                onScegli={(v) => onCambia((x) => { x.pagina.angoli = v; })}
                voci={[
                  { valore: "vivi", nome: "Vivi", dettaglio: <span className="block h-4 w-12 bg-default-300" aria-hidden /> },
                  { valore: "arrotondati", nome: "Arrotondati", dettaglio: <span className="block h-4 w-12 rounded-md bg-default-300" aria-hidden /> },
                ]}
              />
            </div>
            {referto && (
              <div>
                <Etichetta>Valori fuori norma</Etichetta>
                <Scelta
                  valore={m.pagina.evidenza}
                  onScegli={(v) => onCambia((x) => { x.pagina.evidenza = v; })}
                  voci={[
                    { valore: "grassetto", nome: "In grassetto", dettaglio: <span className="text-[15px] font-bold">132 mg/dL</span> },
                    {
                      valore: "colore",
                      nome: "A colori",
                      dettaglio: (
                        <span
                          className="rounded px-1.5 text-[15px] font-bold"
                          style={{ color: coloreCss(m.pagina.accento || m.pagina.colore), background: tintaCss(m.pagina.accento || m.pagina.colore) }}
                        >
                          132 mg/dL
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            )}
            <div>
              <Etichetta>Grandezza del testo</Etichetta>
              {sceltaGrandezzaTesto}
              <p className="mt-2 text-sm text-default-500">
                Vale per il testo che scrivi tu. Tabelle ed etichette restano come sono.
              </p>
            </div>
            <div>
              <Etichetta>Margini</Etichetta>
              <Scelta
                valore={m.pagina.margini}
                onScegli={(v) => onCambia((x) => { x.pagina.margini = v; })}
                voci={[
                  { valore: "stretti", nome: "Stretti" },
                  { valore: "normali", nome: "Normali" },
                  { valore: "larghi", nome: "Larghi" },
                ]}
              />
            </div>
            {!referto && (
              <div>
                <Etichetta>Formato del foglio</Etichetta>
                <Scelta
                  valore={m.pagina.formato}
                  onScegli={(v) => onCambia((x) => { x.pagina.formato = v; })}
                  voci={[
                    { valore: "A4", nome: "A4", dettaglio: <span className="block h-7 w-5 rounded-sm border-2 border-current" aria-hidden /> },
                    { valore: "A5", nome: "A5 (mezzo foglio)", dettaglio: <span className="block h-5 w-3.5 rounded-sm border-2 border-current" aria-hidden /> },
                  ]}
                />
              </div>
            )}
            {pertutti}
          </Scheda>
        );

      case "intestazione":
        return (
          <Scheda
            titolo="Carta intestata"
            descrizione="Chi mette nome e recapiti in cima al foglio: Corioli, la tua carta prestampata, o un'immagine della tua carta."
          >
            <Scelta
              valore={tipo}
              onScegli={scegliTipo}
              voci={[
                { valore: "corioli", nome: "La fa Corioli", descrizione: "Dal tuo profilo" },
                { valore: "prestampata", nome: "È già sulla carta", descrizione: "Lascia lo spazio" },
                { valore: "digitale", nome: "Carta digitale", descrizione: "Un'immagine sotto il testo" },
              ]}
            />

            {tipo === "prestampata" && (
              <div className="space-y-5">
                {spazi}
                <div>
                  <Etichetta>Foto o scansione della tua carta (facoltativa)</Etichetta>
                  <CaricaImmagine
                    valore={m.intestazione.sfondo}
                    accetta="application/pdf,image/png,image/jpeg"
                    titolo="Carica la tua carta intestata"
                    spiegazione="PDF, PNG o JPG. Si vede solo qui, per allineare il testo: non si stampa."
                    prepara={preparaCartaIntestata}
                    onCarica={(url) => onCambia((x) => { x.intestazione.sfondo = url; })}
                    onTogli={() => onCambia((x) => { delete x.intestazione.sfondo; })}
                    onErrore={onErrore}
                    miniaturaFoglio
                  />
                </div>
                <Nota>
                  Sposta i due cursori finché il testo non sta fuori dall&apos;intestazione stampata.
                  Senza foto, misura la carta col righello. Poi fai una stampa di prova su un foglio vero.
                </Nota>
              </div>
            )}

            {tipo === "digitale" && (
              <div className="space-y-5">
                <CaricaImmagine
                  valore={m.intestazione.sfondo}
                  accetta="application/pdf,image/png,image/jpeg"
                  titolo="Carica la carta intestata"
                  spiegazione="Il PDF o l'immagine che ti ha dato lo studio grafico: si stampa sotto il testo, su ogni pagina."
                  prepara={preparaCartaIntestata}
                  onCarica={(url) => onCambia((x) => { x.intestazione.sfondo = url; })}
                  onTogli={() => onCambia((x) => { delete x.intestazione.sfondo; })}
                  onErrore={onErrore}
                  miniaturaFoglio
                />
                {!m.intestazione.sfondo && (
                  <Nota tono="attenzione">Finché non carichi la carta, in cima al foglio resta solo lo spazio vuoto.</Nota>
                )}
                {spazi}
                <Nota>
                  Comoda per i PDF da mandare per email. Se stampi su carta già intestata, scegli
                  «È già sulla carta», altrimenti l&apos;intestazione esce due volte.
                </Nota>
              </div>
            )}

            {tipo === "corioli" && (
              <>
                <div>
                  <Etichetta>Disposizione</Etichetta>
                  <Scelta
                    valore={m.intestazione.disposizione}
                    onScegli={(v) => onCambia((x) => { x.intestazione.disposizione = v; })}
                    voci={[
                      { valore: "lati", nome: "Nome a sinistra, recapiti a destra" },
                      { valore: "centro", nome: "Tutto al centro" },
                      {
                        valore: "banda",
                        nome: "Su una banda colorata",
                        dettaglio: (
                          <span
                            className="block h-3 w-14 rounded-sm"
                            style={{ background: fondoPienoCss(m.pagina.colore) }}
                            aria-hidden
                          />
                        ),
                      },
                    ]}
                  />
                </div>
                <div>
                  <Etichetta>Logo dello studio</Etichetta>
                  <CaricaImmagine
                    valore={m.intestazione.logo}
                    accetta="image/png,image/jpeg"
                    titolo="Carica il logo"
                    spiegazione="PNG o JPG. Puoi anche trascinarlo qui."
                    prepara={preparaLogo}
                    onCarica={(url) => onCambia((x) => { x.intestazione.logo = url; })}
                    onTogli={() => onCambia((x) => { delete x.intestazione.logo; })}
                    onErrore={onErrore}
                  />
                  {m.intestazione.logo && (
                    <div className="mt-3">
                      <Scelta
                        valore={m.intestazione.grandezzaLogo}
                        onScegli={(v) => onCambia((x) => { x.intestazione.grandezzaLogo = v; })}
                        voci={[
                          { valore: "piccolo", nome: "Piccolo" },
                          { valore: "medio", nome: "Medio" },
                          { valore: "grande", nome: "Grande" },
                        ]}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <Etichetta>Cosa mostrare</Etichetta>
                  <div className="rounded-xl border border-default-200 px-4">
                    <Interruttore
                      nome="Specializzazione"
                      acceso={m.intestazione.specializzazione}
                      onCambia={(v) => onCambia((x) => { x.intestazione.specializzazione = v; })}
                    />
                    <Interruttore
                      nome="Ambulatorio e indirizzo"
                      acceso={m.intestazione.ambulatorio}
                      onCambia={(v) => onCambia((x) => { x.intestazione.ambulatorio = v; })}
                      nota={m.intestazione.ambulatorio && ambulatori.length > 1 ? (
                        <Select
                          size="lg"
                          aria-label="Quale ambulatorio"
                          label="Quale ambulatorio"
                          selectedKeys={[ambulatorioScelto]}
                          onSelectionChange={(chiavi) => {
                            const scelta = Array.from(chiavi)[0] as string | undefined;
                            onCambia((x) => {
                              if (!scelta || scelta === "__in_uso") delete x.intestazione.ambulatorioId;
                              else x.intestazione.ambulatorioId = scelta;
                            });
                          }}
                        >
                          {[
                            <SelectItem key="__in_uso">{`Quello in uso${inUso ? ` (${inUso.nome})` : ""}`}</SelectItem>,
                            ...ambulatori.map((a) => <SelectItem key={a.id}>{a.nome}</SelectItem>),
                          ]}
                        </Select>
                      ) : undefined}
                    />
                    <Interruttore
                      nome="Telefono"
                      acceso={m.intestazione.telefono}
                      onCambia={(v) => onCambia((x) => { x.intestazione.telefono = v; })}
                      nota={spentoInImpostazioni.telefono && m.intestazione.telefono ? (
                        <Nota
                          tono="attenzione"
                          azione={{ nome: "Apri le impostazioni", onPress: () => onVaiImpostazioni("impostazioni-visita") }}
                        >
                          Il telefono è spento per tutti i documenti nelle impostazioni.
                        </Nota>
                      ) : undefined}
                    />
                    <Interruttore
                      nome="Email"
                      acceso={m.intestazione.email}
                      onCambia={(v) => onCambia((x) => { x.intestazione.email = v; })}
                      nota={spentoInImpostazioni.email && m.intestazione.email ? (
                        <Nota
                          tono="attenzione"
                          azione={{ nome: "Apri le impostazioni", onPress: () => onVaiImpostazioni("impostazioni-visita") }}
                        >
                          L&apos;email è spenta per tutti i documenti nelle impostazioni.
                        </Nota>
                      ) : undefined}
                    />
                    <Interruttore
                      nome="Partita IVA"
                      acceso={m.intestazione.partitaIva}
                      onCambia={(v) => onCambia((x) => { x.intestazione.partitaIva = v; })}
                    />
                  </div>
                </div>
                <Textarea
                  size="lg"
                  label="Righe in più sotto i recapiti"
                  labelPlacement="outside"
                  placeholder={"Iscr. Ordine dei Medici di Pisa n. 1234\nRiceve su appuntamento"}
                  minRows={2}
                  maxRows={5}
                  value={m.intestazione.righeAggiuntive}
                  onValueChange={(v) => onCambia((x) => { x.intestazione.righeAggiuntive = v; }, "righeAggiuntive")}
                  classNames={{ label: "text-base font-medium text-gray-800" }}
                />
                <Nota azione={{ nome: "Modifica il profilo", onPress: () => onVaiImpostazioni("impostazioni-profilo") }}>
                  Nome, specializzazione, recapiti e partita IVA si scrivono una volta sola, nel profilo.
                </Nota>
              </>
            )}
            {pertutti}
          </Scheda>
        );

      case "titolo":
        return (
          <Scheda titolo="Titolo" descrizione="La scritta in cima al documento, sopra i dati del paziente.">
            <Input
              size="lg"
              label="Titolo"
              labelPlacement="outside"
              value={m.titolo.testo}
              onValueChange={(v) => onCambia((x) => { x.titolo.testo = v; }, "titolo")}
              classNames={{ label: "text-base font-medium text-gray-800" }}
            />
            <Input
              size="lg"
              label="Sottotitolo"
              labelPlacement="outside"
              placeholder={m.documento === "certificato" ? "Vuoto: il tipo di certificato (es. Idoneità)" : "Nessun sottotitolo"}
              value={m.titolo.sottotitolo}
              onValueChange={(v) => onCambia((x) => { x.titolo.sottotitolo = v; }, "sottotitolo")}
              classNames={{ label: "text-base font-medium text-gray-800" }}
            />
            <div>
              <Etichetta>Stile</Etichetta>
              <Scelta
                valore={m.titolo.stile}
                onScegli={(v) => onCambia((x) => { x.titolo.stile = v; })}
                voci={[
                  { valore: "fascia", nome: "Su fascia", dettaglio: <span className="block h-3 w-14 rounded-sm bg-default-200" aria-hidden /> },
                  { valore: "sottolineato", nome: "Sottolineato", dettaglio: <span className="block h-3 w-14 border-b-2 border-default-500" aria-hidden /> },
                  { valore: "testo", nome: "Solo testo", dettaglio: <span className="block h-3 w-14" aria-hidden /> },
                  {
                    valore: "sinistra",
                    nome: "Grande, a sinistra",
                    dettaglio: (
                      <span className="flex h-3 w-14 flex-col justify-end gap-0.5" aria-hidden>
                        <span className="block h-1.5 w-10 rounded-sm bg-default-500" />
                        <span className="block h-[3px] w-4" style={{ background: coloreCss(m.pagina.accento || m.pagina.colore) }} />
                      </span>
                    ),
                  },
                  {
                    valore: "sfumato",
                    nome: "Sfumato",
                    dettaglio: (
                      <span
                        className="block h-3 w-14 rounded"
                        style={{ background: `linear-gradient(to right, ${tintaCss(m.pagina.colore)}, ${tintaCss(m.pagina.accento || m.pagina.colore)})` }}
                        aria-hidden
                      />
                    ),
                  },
                ]}
                colonne={2}
              />
            </div>
          </Scheda>
        );

      case "paziente":
        return (
          <Scheda
            titolo="Dati del paziente"
            descrizione="Il nome c'è sempre. Scegli cos'altro stampare sotto il titolo: un dato che manca nella scheda non si stampa."
          >
            <div className="rounded-xl border border-default-200 px-4">
              <Interruttore
                nome="In un riquadro"
                descrizione="I dati del paziente dentro un bordo, invece che fra due filetti."
                acceso={m.paziente.riquadro}
                onCambia={(v) => onCambia((x) => { x.paziente.riquadro = v; })}
              />
            </div>
            <div className="rounded-xl border border-default-200 px-4">
              <Interruttore
                nome="Data di nascita ed età"
                acceso={m.paziente.dataNascita}
                onCambia={(v) => onCambia((x) => { x.paziente.dataNascita = v; })}
              />
              <Interruttore
                nome="Luogo di nascita"
                acceso={m.paziente.luogoNascita}
                onCambia={(v) => onCambia((x) => { x.paziente.luogoNascita = v; })}
              />
              <Interruttore
                nome="Sesso"
                acceso={m.paziente.sesso}
                onCambia={(v) => onCambia((x) => { x.paziente.sesso = v; })}
              />
              <Interruttore
                nome="Codice fiscale"
                acceso={m.paziente.codiceFiscale}
                onCambia={(v) => onCambia((x) => { x.paziente.codiceFiscale = v; })}
              />
              <Interruttore
                nome="Residenza"
                descrizione="L'indirizzo scritto nella scheda del paziente."
                acceso={m.paziente.residenza}
                onCambia={(v) => onCambia((x) => { x.paziente.residenza = v; })}
              />
              {!referto && (
                <Interruttore
                  nome="Data del documento"
                  descrizione="Accanto al paziente, oltre che vicino alla firma."
                  acceso={m.paziente.data}
                  onCambia={(v) => onCambia((x) => { x.paziente.data = v; })}
                />
              )}
            </div>
          </Scheda>
        );

      case "sezioni":
        if (!referto) {
          const sugg = SUGGERIMENTI_TESTI[m.documento as Exclude<ModelloStampa["documento"], "referto">];
          const campo = (
            chiave: "principale" | "secondario", nome: string, proposte: string[],
          ) => (
            <div>
              <Input
                size="lg"
                label={nome}
                labelPlacement="outside"
                placeholder="Nessun titoletto"
                value={m.testi[chiave]}
                onValueChange={(v) => onCambia((x) => { x.testi[chiave] = v; }, `testi-${chiave}`)}
                classNames={{ label: "text-base font-medium text-gray-800" }}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {proposte.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={m.testi[chiave] === p ? "solid" : "flat"}
                    color={m.testi[chiave] === p ? "primary" : "default"}
                    onPress={() => onCambia((x) => { x.testi[chiave] = p; })}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => onCambia((x) => { x.testi[chiave] = ""; })}
                >
                  Nessuno
                </Button>
              </div>
            </div>
          );
          return (
            <Scheda
              titolo="Testo"
              descrizione="Il testo è quello che scrivi nel documento. Qui scegli i titoletti sopra il testo e quanto grande stamparlo."
            >
              {campo("principale", sugg.nomePrincipale, sugg.principale)}
              {sugg.secondario && sugg.nomeSecondario && campo("secondario", sugg.nomeSecondario, sugg.secondario)}
              <div>
                <Etichetta>Grandezza del testo</Etichetta>
                {sceltaGrandezzaTesto}
              </div>
            </Scheda>
          );
        }
        return (
          <Scheda
            titolo="Sezioni del referto"
            descrizione="Trascinale per cambiare l'ordine, rinominale, nascondi quelle che non stampi mai. Una sezione vuota nella visita non si stampa comunque."
          >
            <div>
              <Etichetta>Stile dei titoli</Etichetta>
              <Scelta
                valore={m.stileSezioni}
                onScegli={(v) => onCambia((x) => { x.stileSezioni = v; })}
                voci={[
                  { valore: "fascia", nome: "Su fascia", dettaglio: <span className="block h-3 w-14 rounded-sm bg-default-200" aria-hidden /> },
                  { valore: "sottolineato", nome: "Sottolineati", dettaglio: <span className="block h-3 w-14 border-b-2 border-default-500" aria-hidden /> },
                  {
                    valore: "barra",
                    nome: "Con barretta",
                    dettaglio: (
                      <span
                        className="block h-3 w-14 rounded-sm border-l-4"
                        style={{ borderColor: coloreCss(m.pagina.colore), background: tintaCss(m.pagina.colore) }}
                        aria-hidden
                      />
                    ),
                  },
                  {
                    valore: "piena",
                    nome: "Fascia piena",
                    dettaglio: (
                      <span
                        className="block h-3 w-14 rounded-sm"
                        style={{ background: fondoPienoCss(m.pagina.colore) }}
                        aria-hidden
                      />
                    ),
                  },
                  {
                    valore: "centrate",
                    nome: "Al centro",
                    dettaglio: (
                      <span className="flex h-3 w-14 items-center gap-1" aria-hidden>
                        <span className="h-px flex-1 bg-default-400" />
                        <span className="block h-1.5 w-5 rounded-sm bg-default-500" />
                        <span className="h-px flex-1 bg-default-400" />
                      </span>
                    ),
                  },
                  {
                    valore: "punto",
                    nome: "Con un punto",
                    dettaglio: (
                      <span className="flex h-3 w-14 items-center gap-1" aria-hidden>
                        <span className="block h-2 w-2" style={{ background: coloreCss(m.pagina.accento || m.pagina.colore) }} />
                        <span className="block h-1.5 w-9 rounded-sm bg-default-500" />
                      </span>
                    ),
                  },
                ]}
                colonne={3}
              />
            </div>
            <div className="rounded-xl border border-default-200 px-4">
              <Interruttore
                nome="Conclusioni in evidenza"
                descrizione="In un riquadro colorato e in grassetto: è la parte che chi riceve il referto cerca per prima."
                acceso={m.conclusioniInEvidenza}
                onCambia={(v) => onCambia((x) => { x.conclusioniInEvidenza = v; })}
              />
              <Interruttore
                nome="Inquadramento clinico in riquadri"
                descrizione="Scompenso, fibrillazione atriale e rischio cardiovascolare in riquadri affiancati, con la classe di rischio in evidenza."
                acceso={m.inquadramentoInRiquadri}
                onCambia={(v) => onCambia((x) => { x.inquadramentoInRiquadri = v; })}
              />
            </div>
            <ol className="space-y-1.5">
              {m.sezioni.map((s, i) => {
                const attiva = sezioneAttiva === s.id;
                return (
                  <li
                    key={s.id}
                    id={`sezione-modello-${s.id}`}
                    draggable={afferrata === i}
                    onDragStart={(e) => {
                      setTrascinata(i);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (trascinata != null) spostaSezione(trascinata, i);
                      setTrascinata(null);
                    }}
                    onDragEnd={() => { setTrascinata(null); setAfferrata(null); }}
                    onClick={() => onSezioneAttiva(s.id)}
                    className={[
                      "flex items-center gap-2 rounded-xl border-2 bg-white px-2 py-1.5 transition-colors",
                      attiva ? "border-brand-600 bg-brand-50/60" : "border-default-200",
                      trascinata === i ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    <span
                      className="cursor-grab px-1 text-default-400 active:cursor-grabbing"
                      aria-hidden
                      title="Trascina per spostare"
                      onMouseDown={() => setAfferrata(i)}
                      onMouseUp={() => setAfferrata(null)}
                    >
                      <GripVertical size={20} />
                    </span>
                    <Input
                      size="md"
                      aria-label={`Titolo della sezione ${titoloPredefinitoSezione(s.id)}`}
                      placeholder={titoloPredefinitoSezione(s.id)}
                      value={s.titolo}
                      onValueChange={(v) => onCambia((x) => {
                        const voce = x.sezioni.find((z) => z.id === s.id);
                        if (voce) voce.titolo = v;
                      }, `sezione-${s.id}`)}
                      classNames={{
                        input: [
                          "text-[15px]",
                          s.visibile ? "" : "line-through text-default-400",
                        ].join(" "),
                      }}
                    />
                    <Button
                      isIconOnly
                      variant="light"
                      aria-label="Sposta su"
                      isDisabled={i === 0}
                      onPress={() => spostaSezione(i, i - 1)}
                    >
                      <ArrowUp size={18} />
                    </Button>
                    <Button
                      isIconOnly
                      variant="light"
                      aria-label="Sposta giù"
                      isDisabled={i === m.sezioni.length - 1}
                      onPress={() => spostaSezione(i, i + 1)}
                    >
                      <ArrowDown size={18} />
                    </Button>
                    <Button
                      isIconOnly
                      variant={s.visibile ? "light" : "flat"}
                      color={s.visibile ? "default" : "warning"}
                      aria-label={s.visibile ? "Nascondi la sezione" : "Mostra la sezione"}
                      title={s.visibile ? "Nascondi" : "Mostra"}
                      onPress={() => onCambia((x) => {
                        const voce = x.sezioni.find((z) => z.id === s.id);
                        if (voce) voce.visibile = !voce.visibile;
                      })}
                    >
                      {s.visibile ? <Eye size={18} /> : <EyeOff size={18} />}
                    </Button>
                  </li>
                );
              })}
            </ol>
            {m.sezioni.some((s) => !s.visibile) && (
              <Nota tono="attenzione">
                Le sezioni nascoste non si stampano nemmeno quando nella visita sono compilate.
              </Nota>
            )}
            <Button
              variant="flat"
              size="lg"
              startContent={<RotateCcw size={18} />}
              onPress={() => onCambia((x) => {
                x.sezioni = SEZIONI_REFERTO.map((s) => ({ id: s.id, titolo: "", visibile: true }));
              })}
            >
              Ripristina ordine e nomi di Corioli
            </Button>
          </Scheda>
        );

      case "firma":
        return (
          <Scheda titolo="Firma" descrizione="In calce al documento, con il nome e la specializzazione del profilo.">
            {doctor?.signatureStampImage && m.firma.immagine && (
              <div className="flex items-center gap-4 rounded-xl border border-default-200 p-3">
                <div className="flex h-20 w-40 shrink-0 items-center justify-center rounded-lg bg-default-50 ring-1 ring-default-200">
                  <img src={doctor.signatureStampImage} alt="La tua firma" className="max-h-16 max-w-[9rem] object-contain" />
                </div>
                <p className="text-sm text-default-600">La firma del tuo profilo, così come esce sul foglio.</p>
              </div>
            )}
            <div className="rounded-xl border border-default-200 px-4">
              <Interruttore
                nome="Immagine della firma"
                descrizione="Quella caricata in Impostazioni → Firma olografica."
                acceso={m.firma.immagine}
                onCambia={(v) => onCambia((x) => { x.firma.immagine = v; })}
                nota={
                  m.firma.immagine && !doctor?.signatureStampImage ? (
                    <Nota azione={{ nome: "Carica la firma", onPress: () => onVaiImpostazioni("impostazioni-firma") }}>
                      Non hai ancora caricato la firma: puoi fotografarla o scriverla sullo schermo.
                    </Nota>
                  ) : m.firma.immagine && referto && spentoInImpostazioni.firmaReferto ? (
                    <Nota
                      tono="attenzione"
                      azione={{ nome: "Apri le impostazioni", onPress: () => onVaiImpostazioni("impostazioni-firma") }}
                    >
                      La firma sul referto è spenta nelle impostazioni della firma.
                    </Nota>
                  ) : undefined
                }
              />
              <Interruttore
                nome="Luogo e data"
                descrizione="La città dell'ambulatorio e la data del documento."
                acceso={m.firma.luogoData}
                onCambia={(v) => onCambia((x) => { x.firma.luogoData = v; })}
              />
              {referto && (
                <Interruttore
                  nome="Riga per firmare a penna"
                  descrizione="Anche senza l'immagine della firma. Senza, il referto si chiude sulle conclusioni."
                  acceso={m.firma.rigaAPenna}
                  onCambia={(v) => onCambia((x) => { x.firma.rigaAPenna = v; })}
                />
              )}
            </div>
            <div>
              <Etichetta>Posizione</Etichetta>
              <Scelta
                valore={m.firma.posizione}
                onScegli={(v) => onCambia((x) => { x.firma.posizione = v; })}
                voci={[
                  { valore: "sinistra", nome: "A sinistra" },
                  { valore: "centro", nome: "Al centro" },
                  { valore: "destra", nome: "A destra" },
                ]}
              />
            </div>
            {m.firma.immagine && doctor?.signatureStampImage && (
              <div>
                <Etichetta>Grandezza della firma</Etichetta>
                <Scelta
                  valore={m.firma.grandezza}
                  onScegli={(v) => onCambia((x) => { x.firma.grandezza = v; })}
                  voci={[
                    { valore: "piccola", nome: "Piccola" },
                    { valore: "normale", nome: "Normale" },
                    { valore: "grande", nome: "Grande" },
                  ]}
                />
              </div>
            )}
          </Scheda>
        );

      case "piede":
        return (
          <Scheda titolo="Piè di pagina" descrizione="In fondo a ogni pagina. «Creato con Corioli» resta sempre.">
            {referto && (
              <div className="rounded-xl border border-default-200 px-4">
                <Interruttore
                  nome="Numero di pagina"
                  descrizione="«Pagina 1 di 2», in basso a destra."
                  acceso={m.piede.numeroPagina}
                  onCambia={(v) => onCambia((x) => { x.piede.numeroPagina = v; })}
                />
                <Interruttore
                  nome="Paziente in cima alle pagine dopo la prima"
                  descrizione="Se un foglio si stacca, resta di chi è."
                  acceso={m.piede.pazienteSullePagine}
                  onCambia={(v) => onCambia((x) => { x.piede.pazienteSullePagine = v; })}
                />
              </div>
            )}
            <Textarea
              size="lg"
              label="Testo in fondo a ogni pagina"
              labelPlacement="outside"
              placeholder="Documento riservato al medico curante"
              description="Al massimo due righe."
              minRows={2}
              maxRows={3}
              value={m.piede.testo}
              onValueChange={(v) => onCambia((x) => { x.piede.testo = v; }, "piede")}
              classNames={{ label: "text-base font-medium text-gray-800" }}
            />
          </Scheda>
        );
    }
  })();

  return (
    <div className="space-y-5">
      <nav className="grid grid-cols-2 gap-2 xl:grid-cols-4" aria-label="Parti del documento">
        {PARTI.map(({ id, nome, icona: Icona }) => {
          const scelta = parte === id;
          const etichetta = id === "sezioni" && !referto ? "Testo" : nome;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onParte(id)}
              aria-pressed={scelta}
              // Contorno del colore di Corioli e non fondo scuro: scure sono le
              // schede dei documenti in cima alla pagina, e due file di schede
              // scure una sopra l'altra non dicevano quale scelta contenesse l'altra.
              className={[
                "flex min-h-[48px] items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-[15px] transition-colors",
                scelta
                  ? "border-brand-600 bg-brand-50 font-semibold text-brand-800"
                  : "border-transparent bg-default-100 font-medium text-default-700 hover:bg-default-200",
              ].join(" ")}
            >
              {id === "sezioni" && !referto ? <AlignLeft size={18} /> : <Icona size={18} />}
              <span className="leading-tight">{etichetta}</span>
            </button>
          );
        })}
      </nav>
      {contenuto}
    </div>
  );
}
