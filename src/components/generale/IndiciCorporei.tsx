import {
  calcolaBmi,
  classeBmi,
  conVirgola,
  eAdulto,
  ETICHETTA_CLASSE_BMI,
  rapportoVitaAltezza,
  rischioCirconferenzaVita,
  superficieCorporea,
} from "../../utils/parametriVitali";
import {
  CLASSE_ETICHETTA,
  COLORE_BMI,
  COLORE_VITA,
  ETICHETTA_VITA,
  NEUTRO,
} from "./coloriParametri";

function Indice({ children, className, title }: { children: string; className: string; title: string }) {
  return (
    <span
      title={title}
      className={`${CLASSE_ETICHETTA} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Gli indici che si ricavano da peso, altezza e circonferenza vita: BMI con
 * la classe OMS, superficie corporea (Mosteller), rischio legato alla
 * circonferenza vita (OMS, soglie per sesso) e rapporto vita/altezza.
 * Ognuno compare solo quando ci sono i dati per calcolarlo.
 *
 * Sotto i 18 anni classi e soglie dell'adulto non valgono: BMI e rapporto
 * vita/altezza restano numeri, senza classe ne' colore.
 */
export function IndiciCorporei({
  pesoKg,
  altezzaCm,
  vitaCm,
  sesso,
  eta,
}: {
  pesoKg: number;
  altezzaCm: number | null;
  vitaCm: number;
  sesso?: "M" | "F";
  eta: number | null;
}) {
  const adulto = eAdulto(eta);
  const bmi = altezzaCm ? calcolaBmi(pesoKg, altezzaCm) : null;
  const bsa = altezzaCm ? superficieCorporea(pesoKg, altezzaCm) : null;
  const vita = adulto ? rischioCirconferenzaVita(vitaCm, sesso) : null;
  const whtr = altezzaCm ? rapportoVitaAltezza(vitaCm, altezzaCm) : null;

  if (bmi == null && bsa == null && vita == null && whtr == null) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {bmi != null &&
        (adulto ? (
          <Indice
            className={COLORE_BMI[classeBmi(bmi)]}
            title="Indice di massa corporea, classi OMS per l'adulto"
          >
            {`BMI ${conVirgola(bmi)} · ${ETICHETTA_CLASSE_BMI[classeBmi(bmi)]}`}
          </Indice>
        ) : (
          <Indice
            className={NEUTRO}
            title="Sotto i 18 anni il BMI si legge sui percentili per età e sesso"
          >
            {`BMI ${conVirgola(bmi)}`}
          </Indice>
        ))}
      {bsa != null && (
        <Indice className={NEUTRO} title="Superficie corporea, formula di Mosteller">
          {`BSA ${conVirgola(bsa, 2)} m²`}
        </Indice>
      )}
      {vita != null && (
        <Indice
          className={COLORE_VITA[vita]}
          title={
            sesso === "M"
              ? "Circonferenza vita (OMS): rischio aumentato da 94 cm, molto aumentato da 102"
              : "Circonferenza vita (OMS): rischio aumentato da 80 cm, molto aumentato da 88"
          }
        >
          {ETICHETTA_VITA[vita]}
        </Indice>
      )}
      {whtr != null && (
        <Indice
          className={adulto && whtr >= 0.5 ? COLORE_VITA.aumentato : NEUTRO}
          title="Rapporto vita/altezza: da 0,5 il grasso addominale è in eccesso (NICE 2022)"
        >
          {`Vita/altezza ${conVirgola(whtr, 2)}`}
        </Indice>
      )}
    </div>
  );
}
