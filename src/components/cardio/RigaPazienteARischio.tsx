import { CATEGORIA_RISCHIO_LABELS } from "../../utils/rischioCv";
import { riempimentoBarra, type VoceRischio } from "../../utils/pazientiARischio";

/**
 * Una riga dell'elenco dei pazienti a rischio.
 *
 * Sta in un componente suo perche' la usano in due — la colonna in dashboard e
 * la pagina che si apre da "Vedi tutti" — e le due devono leggersi uguali: e'
 * lo stesso elenco, una volta accorciato e una volta intero.
 *
 * La riga dice tre cose e si ferma: chi, quanto manca all'obiettivo, da quale
 * classe discende quell'obiettivo. L'unita' di misura non si ripete a ogni
 * riga (sono tutti mg/dL) e l'obiettivo non si scrive per esteso: erano le due
 * cose che rendevano la colonna un muro di testo.
 */

/** Colore della striscia a sinistra: la classe, senza scriverla due volte. */
const STRISCIA: Record<VoceRischio["categoria"], string> = {
  "molto-alto-ricorrente": "bg-danger-400",
  "molto-alto": "bg-danger-300",
  alto: "bg-warning-400",
  moderato: "bg-default-300",
  basso: "bg-default-300",
};

/** La classe in due parole, senza il "Rischio " davanti. */
function classeBreve(categoria: VoceRischio["categoria"]): string {
  return CATEGORIA_RISCHIO_LABELS[categoria]
    .replace("Rischio ", "")
    .replace("Molto alto con evento ricorrente entro 2 anni", "molto alto, recidiva");
}

export function RigaPazienteARischio({
  voce,
  nome,
  onApri,
}: {
  voce: VoceRischio;
  nome: string;
  onApri: () => void;
}) {
  const fuori = voce.scostamento != null;
  const senzaEsami = voce.ldl == null;
  const percentuale = Math.round(riempimentoBarra(voce) * 100);

  return (
    <div
      className="px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer group"
      onClick={onApri}
    >
      <div className="flex gap-3">
        <span
          aria-hidden
          className={`mt-1 w-1 shrink-0 rounded-full ${STRISCIA[voce.categoria]}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">
              {nome}
            </p>
            {/* Senza esami non si dice "a obiettivo": non lo sappiamo, e la
                riga starebbe dicendo che va tutto bene. Si dice cosa manca. */}
            <span
              className={`shrink-0 text-sm font-semibold tabular-nums ${
                senzaEsami
                  ? "text-default-400"
                  : fuori
                    ? "text-warning-600"
                    : "text-success-600"
              }`}
            >
              {senzaEsami
                ? "da dosare"
                : fuori
                  ? `+${Math.round(voce.scostamento!)}`
                  : "a obiettivo"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {voce.ldl != null ? (
              <>
                <span
                  title={
                    voce.fonteLdl === "stimato"
                      ? "LDL stimato con Friedewald"
                      : "LDL dosato"
                  }
                >
                  LDL {voce.fonteLdl === "stimato" ? "≈" : ""}
                  {Math.round(voce.ldl)}
                </span>
                {" · obiettivo "}
                {voce.obiettivo}
              </>
            ) : (
              "nessun assetto lipidico"
            )}
            {" · "}
            {classeBreve(voce.categoria)}
          </p>
          {/* La barra e' lo scostamento dall'obiettivo, non una percentuale di
              rischio: quella non esiste. Si disegna solo per chi e' fuori —
              senza esami non sappiamo, e a obiettivo lo dice gia' la scritta
              verde, mentre una barra piena vorrebbe dire il contrario.

              Larghezza fissa e non a tutta riga: nella pagina intera una barra
              da un margine all'altro pesa piu' del numero che racconta. */}
          {fuori && (
            <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-default-100">
              <div
                className="h-full rounded-full bg-warning-400"
                style={{ width: `${Math.max(6, percentuale)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
