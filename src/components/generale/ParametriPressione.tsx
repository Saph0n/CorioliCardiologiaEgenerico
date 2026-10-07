import { useMemo, useState, type ReactNode } from "react";
import { Button, Input, Tab, Tabs } from "@nextui-org/react";
import { Plus, X } from "lucide-react";
import {
  categoriaPa,
  conVirgola,
  eAdulto,
  ETICHETTA_CATEGORIA_PA,
  haSecondaMisura,
  normalizzaPressione,
  parsePressione,
  posizioni,
  pressioneDifferenziale,
  pressioneMedia,
  valutaOrtostatismo,
  type CategoriaPa,
  type EsitoOrtostatismo,
  type PosizionePa,
} from "../../utils/parametriVitali";
import {
  validateFrequenzaCardiaca,
  validatePressioneArteriosa,
} from "../../utils/formValidation";

/** I campi della visita che questo blocco legge e scrive. */
export interface ValoriPressione {
  pressioneArteriosa: string;
  posizionePa: "" | PosizionePa;
  frequenzaCardiaca: string;
  pressioneArteriosa2: string;
  posizionePa2: "" | PosizionePa;
  frequenzaCardiaca2: string;
}

type Campo = keyof ValoriPressione;
type CampoPa = "pressioneArteriosa" | "pressioneArteriosa2";
type CampoFc = "frequenzaCardiaca" | "frequenzaCardiaca2";

/** Colore del testo della categoria sotto il campo, come le note della Cardiologia. */
const TESTO_CATEGORIA: Record<CategoriaPa, string> = {
  ipotensione: "text-amber-700",
  ottimale: "text-brand-700",
  normale: "text-brand-700",
  "normale-alta": "text-amber-700",
  "grado-1": "text-red-700",
  "grado-2": "text-red-700",
  "grado-3": "text-red-800",
};

/**
 * Accetta solo quello che puo' diventare "120/80" mentre si scrive. Fino a
 * sei cifre di fila senza barra: "12080" diventa "120/80" uscendo dal campo
 * (`normalizzaPressione`).
 */
function bozzaPressione(v: string): boolean {
  return /^(\d{0,6}|\d{1,3}\s*\/\s*\d{0,3})$/.test(v);
}

function bozzaFrequenza(v: string): boolean {
  return /^\d{0,3}$/.test(v);
}

/**
 * Clinostatismo o ortostatismo, lo stesso selettore di Corioli Cardiologia:
 * due voci a un clic, perche' scegliere la posizione non deve costare piu'
 * della misura.
 */
function PosizionePaSelettore({
  valore,
  onChange,
  ariaLabel,
}: {
  valore: PosizionePa;
  onChange: (posizione: PosizionePa) => void;
  ariaLabel: string;
}) {
  return (
    <Tabs
      aria-label={ariaLabel}
      size="sm"
      radius="sm"
      selectedKey={valore}
      onSelectionChange={(k) => onChange(k === "orto" ? "orto" : "clino")}
      classNames={{ tabList: "gap-0.5 p-0.5", tab: "h-6 px-2", tabContent: "text-xs" }}
    >
      <Tab key="clino" title="Clino" />
      <Tab key="orto" title="Orto" />
    </Tabs>
  );
}

/**
 * Sotto il campo della pressione, al posto della riga vuota: categoria ESH
 * 2023 (solo per l'adulto), pressione media e differenziale. `undefined`
 * quando il campo non ha ancora una pressione valida, cosi' non resta spazio.
 */
function notaPressione(valore: string, adulto: boolean): ReactNode {
  const pa = parsePressione(valore);
  if (!pa) return undefined;
  const cat = adulto ? categoriaPa(pa) : null;
  return (
    <span className="flex flex-wrap gap-x-1.5 pt-0.5 text-xs leading-tight">
      {cat && (
        <span
          className={`font-semibold ${TESTO_CATEGORIA[cat]}`}
          title="Categoria ESH 2023 della pressione misurata in ambulatorio"
        >
          {ETICHETTA_CATEGORIA_PA[cat]}
        </span>
      )}
      <span
        className="text-default-600"
        title="Pressione media (diastolica + 1/3 della differenziale) e differenziale (sistolica − diastolica)"
      >
        PAM {pressioneMedia(pa)} · diff. {pressioneDifferenziale(pa)}
      </span>
    </span>
  );
}

const firmato = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

/**
 * Pressione arteriosa della visita, disposta come su Corioli Cardiologia:
 * P.A. e F.C. affiancate, sotto la pressione la posizione (Clino/Orto) e il
 * link "Seconda misurazione". La seconda ha la sua pressione, la sua
 * posizione (di default Orto) e qui anche la sua frequenza, che serve a
 * leggere la tachicardia in ortostatismo.
 *
 * Con una misura in clino e una in orto compare l'esito della prova
 * ortostatica (`valutaOrtostatismo`).
 */
export function ParametriPressione({
  valori,
  eta,
  onChange,
}: {
  valori: ValoriPressione;
  eta: number | null;
  onChange: (campo: Campo, valore: string) => void;
}) {
  const [toccati, setToccati] = useState<Partial<Record<Campo, boolean>>>({});
  // La seconda misurazione si apre a richiesta e resta aperta finche' ha un
  // valore.
  const [secondaAperta, setSecondaAperta] = useState(false);
  const mostraSeconda = secondaAperta || haSecondaMisura(valori);
  const adulto = eAdulto(eta);
  const { prima, seconda } = posizioni(valori);

  const esito = useMemo(() => valutaOrtostatismo(valori, eta), [valori, eta]);

  // L'errore si mostra uscendo dal campo e sparisce rientrando: mentre si
  // riscrive "120/8" non e' un errore, e' un numero a meta'.
  const entra = (campo: Campo) => setToccati((t) => ({ ...t, [campo]: false }));
  const esci = (campo: Campo) => {
    setToccati((t) => ({ ...t, [campo]: true }));
    if (campo === "pressioneArteriosa" || campo === "pressioneArteriosa2") {
      const n = normalizzaPressione(valori[campo]);
      if (n !== valori[campo]) onChange(campo, n);
    }
  };
  const errore = (campo: Campo): string | null => {
    if (!toccati[campo]) return null;
    return campo.startsWith("frequenza")
      ? validateFrequenzaCardiaca(valori[campo])
      : validatePressioneArteriosa(valori[campo]);
  };

  const campoPa = (campo: CampoPa, label: string, placeholder: string) => (
    <Input
      label={label}
      type="text"
      inputMode="numeric"
      size="sm"
      variant="bordered"
      labelPlacement="outside"
      placeholder={placeholder}
      value={valori[campo]}
      onValueChange={(v) => bozzaPressione(v) && onChange(campo, v)}
      onFocus={() => entra(campo)}
      onBlur={() => esci(campo)}
      isInvalid={Boolean(errore(campo))}
      errorMessage={errore(campo) ?? undefined}
      description={errore(campo) ? undefined : notaPressione(valori[campo], adulto)}
      classNames={{ description: "m-0" }}
    />
  );

  const campoFc = (campo: CampoFc, label: string) => (
    <Input
      label={label}
      type="text"
      inputMode="numeric"
      size="sm"
      variant="bordered"
      labelPlacement="outside"
      placeholder="Es. 72"
      value={valori[campo]}
      onValueChange={(v) => bozzaFrequenza(v) && onChange(campo, v)}
      onFocus={() => entra(campo)}
      onBlur={() => esci(campo)}
      isInvalid={Boolean(errore(campo))}
      errorMessage={errore(campo) ?? undefined}
    />
  );

  const togliSeconda = () => {
    onChange("pressioneArteriosa2", "");
    onChange("posizionePa2", "");
    onChange("frequenzaCardiaca2", "");
    setToccati((t) => ({ ...t, pressioneArteriosa2: false, frequenzaCardiaca2: false }));
    setSecondaAperta(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          {campoPa("pressioneArteriosa", "P.A. (mmHg)", "Es. 120/80")}
          <PosizionePaSelettore
            ariaLabel="Posizione della misurazione della pressione"
            valore={prima}
            onChange={(p) => onChange("posizionePa", p)}
          />
        </div>
        {campoFc("frequenzaCardiaca", "F.C. (bpm)")}

        {mostraSeconda ? (
          <>
            <div className="flex flex-col gap-1.5">
              {campoPa("pressioneArteriosa2", "P.A. 2ª (mmHg)", "Es. 110/70")}
              <div className="flex items-center gap-1">
                <PosizionePaSelettore
                  ariaLabel="Posizione della seconda misurazione"
                  valore={seconda}
                  onChange={(p) => onChange("posizionePa2", p)}
                />
                <Button
                  type="button"
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label="Togli la seconda misurazione"
                  title="Togli la seconda misurazione"
                  className="h-6 w-6 min-w-0 text-default-500"
                  onPress={togliSeconda}
                >
                  <X size={14} />
                </Button>
              </div>
            </div>
            {campoFc("frequenzaCardiaca2", "F.C. 2ª (bpm)")}
          </>
        ) : (
          <div className="col-span-2">
            <Button
              type="button"
              size="sm"
              variant="light"
              color="primary"
              className="h-6 min-w-0 px-1.5 text-xs"
              startContent={<Plus size={13} />}
              onPress={() => setSecondaAperta(true)}
            >
              Seconda misurazione
            </Button>
          </div>
        )}
      </div>

      {esito && <EsitoProva esito={esito} />}
      {mostraSeconda && !esito && prima === seconda && (
        <p className="text-xs text-default-600">
          Le due misure sono nella stessa posizione: per la prova ortostatica
          una va in clino e l&apos;altra in orto.
        </p>
      )}
    </div>
  );
}

/**
 * L'esito del confronto fra la misura in clino e quella in orto: il calo, la
 * variazione della frequenza e il criterio che scatta.
 */
function EsitoProva({ esito }: { esito: EsitoOrtostatismo }) {
  const variazione = (
    <>
      In orto {firmato(esito.deltaSistolica)}/{firmato(esito.deltaDiastolica)} mmHg
      {esito.deltaFc != null && <>, FC {firmato(esito.deltaFc)} bpm</>}.
    </>
  );

  const [titolo, colori, spiegazione] = esito.ipotensioneOrtostatica
    ? [
        "Ipotensione ortostatica",
        "border-amber-200 bg-amber-50 text-amber-900",
        "Criterio: calo di 20 mmHg di sistolica o 10 di diastolica entro 3 minuti.",
      ]
    : esito.tachicardiaOrtostatica
      ? [
          "Tachicardia in ortostatismo",
          "border-amber-200 bg-amber-50 text-amber-900",
          "Aumento della FC senza calo pressorio: è il criterio emodinamico della tachicardia posturale, da leggere con i sintomi.",
        ]
      : [
          "Nessun calo significativo in ortostatismo",
          "border-brand-200 bg-brand-50 text-brand-900",
          null,
        ];

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${colori}`}>
      <p className="font-semibold">{titolo}</p>
      <p className="text-xs tabular-nums">{variazione}</p>
      {spiegazione && <p className="mt-0.5 text-xs">{spiegazione}</p>}
      {esito.rapportoFcPas != null && (
        <p className="mt-0.5 text-xs" title="Aumento della FC diviso il calo sistolico, Norcliffe-Kaufmann 2018">
          ΔFC/ΔPAS {conVirgola(esito.rapportoFcPas, 2)}
          {esito.rapportoFcPas < 0.5
            ? ": sotto 0,5, orienta verso una forma neurogena."
            : ": da 0,5 in su, orienta verso una forma non neurogena."}
        </p>
      )}
      {esito.ipertensioneInClino && esito.caloSistolico >= 20 && esito.caloSistolico < 30 && (
        <p className="mt-0.5 text-xs">
          In clino da 140/90 in su: in chi è iperteso da sdraiato il consenso
          2011 considera più appropriato un calo sistolico di 30 mmHg.
        </p>
      )}
    </div>
  );
}
