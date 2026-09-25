/**
 * Andamento nel tempo di una misura, disegnato in SVG.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  PERCHE' SVG A MANO E NON UNA LIBRERIA
 *
 *  Qui serve una spezzata con quattro o cinque punti. Una libreria di grafici
 *  porterebbe centinaia di kilobyte dentro un pacchetto Electron che gira
 *  offline, per disegnare quello che sta in una polilinea. Le scale sono
 *  lineari e i punti sono pochi: il calcolo è più corto della configurazione
 *  che servirebbe a una libreria.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Il tempo sta sull'asse orizzontale in **scala reale**, non a passi uguali:
 * due prelievi a un mese di distanza e due a tre anni non possono apparire
 * ugualmente distanti, altrimenti la pendenza racconta una storia sbagliata.
 */

import { dataBreve, type PuntoStorico } from "../../utils/confrontoMisure";
import {
  VISITA_IN_CORSO,
  proietta,
  serieConCorrente,
} from "../../utils/graficoSerie";

function formatta(n: number): string {
  const arrotondato = Math.round(n * 10) / 10;
  return String(arrotondato).replace(".", ",");
}

/**
 * Miniatura dell'andamento, da mettere sotto al campo.
 *
 * Non ha assi né numeri: dice solo la forma della traiettoria. I numeri stanno
 * nel pannello esteso, che si apre cliccandola.
 *
 * `max-w-full` non e' decorativo: nella colonna del laboratorio le celle sono
 * larghe centosessanta pixel, e un SVG con larghezza fissa sporgeva oltre la
 * scheda facendo comparire una barra di scorrimento orizzontale. Con width e
 * height espliciti piu' `max-width`, l'immagine si rimpicciolisce mantenendo
 * le proporzioni invece di sfondare il contenitore.
 */
export function Sparkline({
  serie,
  corrente,
  dataCorrente,
  larghezza = 112,
  altezza = 24,
}: {
  serie: PuntoStorico[];
  /** Valore in digitazione, aggiunto come punto aperto. */
  corrente?: number;
  /** Data della visita aperta, a cui si colloca il valore in digitazione. */
  dataCorrente: string;
  larghezza?: number;
  altezza?: number;
}) {
  const completa = serieConCorrente(serie, corrente, dataCorrente);
  if (completa.length < 2) return null;

  const { punti } = proietta(completa, larghezza, altezza, 3);
  const d = punti.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ultimo = punti[punti.length - 1];
  const inCorso = ultimo.punto.visitaId === VISITA_IN_CORSO;

  return (
    <svg
      width={larghezza}
      height={altezza}
      viewBox={`0 0 ${larghezza} ${altezza}`}
      className="max-w-full"
      role="img"
      aria-label={`Andamento su ${completa.length} rilevazioni`}
    >
      <polyline
        points={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-default-500"
      />
      {punti.slice(0, -1).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.4} className="fill-default-300" />
      ))}
      <circle
        cx={ultimo.x}
        cy={ultimo.y}
        r={2.4}
        className={inCorso ? "fill-white stroke-primary-500" : "fill-primary-500"}
        strokeWidth={inCorso ? 1.4 : 0}
      />
    </svg>
  );
}

/**
 * Pannello esteso: la stessa spezzata con le date, i valori e la banda di
 * riferimento quando la misura ne ha una.
 *
 * La banda è disegnata sotto la linea come fascia chiara, non come soglia
 * secca: serve a collocare la traiettoria, non a promuovere o bocciare il
 * singolo punto.
 */
export function PannelloAndamento({
  titolo,
  unita,
  serie,
  corrente,
  dataCorrente,
  riferimento,
}: {
  titolo: string;
  unita?: string;
  serie: PuntoStorico[];
  corrente?: number;
  dataCorrente: string;
  /** Intervallo di riferimento da ombreggiare, se la misura ne ha uno. */
  riferimento?: { min?: number; max?: number };
}) {
  const completa = serieConCorrente(serie, corrente, dataCorrente);

  const L = 280;
  const A = 120;
  const M = 14;
  const { punti, min, max } = proietta(completa, L, A, M);
  const d = punti.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const primo = serie[0];
  const ultimoStorico = serie[serie.length - 1];
  const variazioneTotale = ultimoStorico.valore - primo.valore;

  // Fascia di riferimento, riproiettata sulla stessa scala verticale.
  const span = max - min;
  const yDi = (v: number) =>
    M + (1 - (span === 0 ? 0.5 : (v - min) / span)) * (A - M * 2);
  const bandaAlta = riferimento?.max != null ? yDi(riferimento.max) : null;
  const bandaBassa = riferimento?.min != null ? yDi(riferimento.min) : null;

  return (
    <div className="w-[300px] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800">{titolo}</p>
        <p className="text-[11px] text-default-500">
          {completa.length} rilevazioni
        </p>
      </div>

      <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} role="img" aria-label={titolo}>
        {bandaAlta != null && (
          <rect
            x={0}
            y={Math.min(bandaAlta, bandaBassa ?? A)}
            width={L}
            height={Math.abs((bandaBassa ?? A) - bandaAlta)}
            className="fill-success-100/60"
          />
        )}
        <line x1={0} y1={A - M / 2} x2={L} y2={A - M / 2} className="stroke-default-200" strokeWidth={1} />
        <polyline
          points={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-primary-500"
        />
        {punti.map((p, i) => {
          const inCorso = p.punto.visitaId === VISITA_IN_CORSO;
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={inCorso ? 4 : 3}
                className={inCorso ? "fill-white stroke-primary-600" : "fill-primary-600"}
                strokeWidth={inCorso ? 1.6 : 0}
              />
              <title>
                {formatta(p.punto.valore)}
                {unita ? ` ${unita}` : ""}
                {inCorso ? " (in questa visita)" : ` — ${dataBreve(p.punto.data)}`}
              </title>
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex justify-between text-[11px] text-default-500">
        <span>{dataBreve(primo.data)}</span>
        <span>
          min {formatta(min)} · max {formatta(max)}
        </span>
        <span>{dataBreve(ultimoStorico.data)}</span>
      </div>

      <p className="mt-2 border-t border-default-200 pt-2 text-[11px] text-default-600">
        Dal primo rilievo:{" "}
        <span className="font-semibold text-gray-800">
          {variazioneTotale > 0 ? "+" : variazioneTotale < 0 ? "−" : ""}
          {formatta(Math.abs(variazioneTotale))}
          {unita ? ` ${unita}` : ""}
        </span>{" "}
        in {anniFra(primo.data, ultimoStorico.data)}
      </p>
    </div>
  );
}

/** Distanza fra due date in forma leggibile, per la riga di sintesi. */
function anniFra(daIso: string, aIso: string): string {
  const da = new Date(`${daIso.slice(0, 10)}T12:00:00`).getTime();
  const a = new Date(`${aIso.slice(0, 10)}T12:00:00`).getTime();
  const giorni = Math.round((a - da) / 86400000);
  if (giorni < 45) return `${giorni} giorni`;
  const mesi = Math.round(giorni / 30.4);
  if (mesi < 24) return `${mesi} mesi`;
  const anni = Math.floor(mesi / 12);
  const resto = mesi % 12;
  return resto === 0 ? `${anni} anni` : `${anni} anni e ${resto} mesi`;
}
