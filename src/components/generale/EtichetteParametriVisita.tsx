import type { ReactNode } from "react";
import { Activity, Gauge, HeartPulse, Ruler, Scale } from "lucide-react";
import type { Patient, Visit } from "../../types/Storage";
import { calculateAge } from "../../utils/dateUtils";
import {
  calcolaBmi,
  categoriaPa,
  classeBmi,
  conVirgola,
  eAdulto,
  ETICHETTA_CATEGORIA_PA,
  ETICHETTA_CLASSE_BMI,
  parseFrequenza,
  parsePressione,
  posizioni,
  rischioCirconferenzaVita,
  valutaOrtostatismo,
  type Pressione,
} from "../../utils/parametriVitali";
import {
  CLASSE_ETICHETTA,
  COLORE_BMI,
  COLORE_CATEGORIA_PA,
  COLORE_ESITO_NEGATIVO,
  COLORE_ESITO_POSITIVO,
  COLORE_FC,
  COLORE_PESO,
  COLORE_VITA,
  ETICHETTA_VITA,
} from "./coloriParametri";

/** Alto 20px invece di 24: per le righe della dashboard, allineate al pixel. */
const CLASSE_COMPATTA =
  "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-xs font-medium tabular-nums";

function Tag({
  icona,
  colore,
  title,
  compatta = false,
  children,
}: {
  icona: ReactNode;
  colore: string;
  title?: string;
  compatta?: boolean;
  children: ReactNode;
}) {
  return (
    <span title={title} className={`${compatta ? CLASSE_COMPATTA : CLASSE_ETICHETTA} gap-1 ${colore}`}>
      {icona}
      {children}
    </span>
  );
}

/**
 * Il tag di una pressione, colorato con la sua categoria ESH 2023 (verde,
 * ambra, rosso). Per un minore il colore e' quello neutro: le soglie sono
 * dell'adulto. Compatta nelle visite recenti della dashboard.
 */
export function TagPressione({
  pa,
  posizione,
  adulto = true,
  compatta = false,
}: {
  pa: Pressione;
  posizione?: string;
  adulto?: boolean;
  compatta?: boolean;
}) {
  const cat = adulto ? categoriaPa(pa) : null;
  return (
    <Tag
      compatta={compatta}
      icona={<HeartPulse size={compatta ? 12 : 13} aria-hidden />}
      colore={cat ? COLORE_CATEGORIA_PA[cat] : "border-default-200 bg-default-50 text-default-700"}
      title={cat ? `Pressione arteriosa: ${ETICHETTA_CATEGORIA_PA[cat].toLowerCase()}` : "Pressione arteriosa"}
    >
      {pa.sistolica}/{pa.diastolica}
      {posizione && <span className="font-normal opacity-80">{posizione}</span>}
    </Tag>
  );
}

/**
 * I parametri misurati in una visita, come tag nella scheda del paziente: si
 * legge a colpo d'occhio quando e' stata presa la pressione o il peso senza
 * aprire il referto. Ogni tag ha la sua icona; il colore dice il giudizio
 * dove ce n'e' uno (pressione, BMI, vita, prova ortostatica), altrimenti e' la
 * tinta fissa del parametro (frequenza azzurra, peso viola).
 */
export function EtichetteParametriVisita({
  visita,
  paziente,
  className = "",
}: {
  visita: Visit;
  paziente: Patient;
  className?: string;
}) {
  const v = visita.visita;
  if (!v) return null;

  const eta = calculateAge(paziente.dataNascita, visita.dataVisita);
  const adulto = eAdulto(eta);
  const pa = parsePressione(v.pressioneArteriosa);
  const pa2 = parsePressione(v.pressioneArteriosa2);
  const { prima, seconda } = posizioni(v);
  const fc = parseFrequenza(v.frequenzaCardiaca);
  const kg = v.pesoCorporeo && v.pesoCorporeo > 0 ? v.pesoCorporeo : null;
  const bmi = kg && paziente.altezza ? calcolaBmi(kg, paziente.altezza) : null;
  const vitaCm = v.circonferenzaVita && v.circonferenzaVita > 0 ? v.circonferenzaVita : null;
  const rischioVita = vitaCm && adulto ? rischioCirconferenzaVita(vitaCm, paziente.sesso) : null;
  const prova = valutaOrtostatismo(v, eta);

  if (!pa && !pa2 && !fc && !kg && !vitaCm && !prova) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {pa && <TagPressione pa={pa} posizione={prima} adulto={adulto} />}
      {pa2 && <TagPressione pa={pa2} posizione={seconda} adulto={adulto} />}
      {fc && (
        <Tag icona={<Gauge size={13} aria-hidden />} colore={COLORE_FC} title="Frequenza cardiaca">
          {fc} bpm
        </Tag>
      )}
      {kg && (
        <Tag icona={<Scale size={13} aria-hidden />} colore={COLORE_PESO} title="Peso corporeo">
          {Number.isInteger(kg) ? kg : conVirgola(kg)} kg
        </Tag>
      )}
      {bmi != null && (
        <Tag
          icona={<Scale size={13} aria-hidden />}
          colore={adulto ? COLORE_BMI[classeBmi(bmi)] : COLORE_PESO}
          title={adulto ? ETICHETTA_CLASSE_BMI[classeBmi(bmi)] : "Sotto i 18 anni il BMI si legge sui percentili"}
        >
          BMI {conVirgola(bmi)}
        </Tag>
      )}
      {vitaCm && (
        <Tag
          icona={<Ruler size={13} aria-hidden />}
          colore={rischioVita ? COLORE_VITA[rischioVita] : COLORE_PESO}
          title={rischioVita ? ETICHETTA_VITA[rischioVita] : "Circonferenza vita"}
        >
          Vita {vitaCm} cm
        </Tag>
      )}
      {prova && (
        <Tag
          icona={<Activity size={13} aria-hidden />}
          colore={
            prova.ipotensioneOrtostatica || prova.tachicardiaOrtostatica
              ? COLORE_ESITO_POSITIVO
              : COLORE_ESITO_NEGATIVO
          }
          title="Prova ortostatica: variazione in orto rispetto al clino"
        >
          {prova.ipotensioneOrtostatica
            ? `Ipotensione ortostatica −${prova.caloSistolico}/${prova.caloDiastolico}`
            : prova.tachicardiaOrtostatica
              ? `Tachicardia in orto +${prova.deltaFc}`
              : "Ortostatismo: nessun calo"}
        </Tag>
      )}
    </div>
  );
}
