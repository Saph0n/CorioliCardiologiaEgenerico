import { ArrowRight } from "lucide-react";
import { COLORI_CLASSE, classeBreve } from "./classeRischio";
import { IndicatoreLdl } from "./IndicatoreLdl";
import type { VoceRischio } from "../../utils/pazientiARischio";

/**
 * Una riga della colonna "Pazienti a rischio" in dashboard.
 *
 * Il disegno e' quello della colonna delle gravidanze in corso di
 * ginecologia, da cui la colonna e' nata: avatar e nome, sotto l'indicatore a
 * segmenti e una riga di dettaglio. La terza versione, 25 settembre 2026: la
 * seconda ("mi sembra un po' banale") aveva una striscia rosa, una barra
 * arancione di 220px senza nessun riferimento, e tutto sottile e grigio.
 *
 * La riga dice tre cose e si ferma: chi, quanto manca all'obiettivo, da quale
 * classe discende quell'obiettivo. L'unita' di misura non si ripete a ogni
 * riga (sono tutti mg/dL) e l'obiettivo non si scrive per esteso: erano le due
 * cose che rendevano la prima versione un muro di testo.
 */

export function RigaPazienteARischio({
  voce,
  nome,
  iniziali,
  onApri,
}: {
  voce: VoceRischio;
  nome: string;
  iniziali: string;
  onApri: () => void;
}) {
  const fuori = voce.scostamento != null;
  const senzaEsami = voce.ldl == null;
  const colori = COLORI_CLASSE[voce.categoria];

  return (
    <div
      className="px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer group"
      onClick={onApri}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colori.avatar}`}
        >
          {iniziali}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">
          {nome}
        </p>
        {/* Senza esami non si dice "a obiettivo": non lo sappiamo, e la
            riga starebbe dicendo che va tutto bene. Si dice cosa manca. */}
        {senzaEsami ? (
          <span className="shrink-0 text-sm text-default-500">da dosare</span>
        ) : fuori ? (
          <span className={`shrink-0 text-base font-semibold tabular-nums ${colori.testo}`}>
            +{Math.round(voce.scostamento!)}
          </span>
        ) : (
          <span className="shrink-0 text-sm font-medium text-brand-700">a obiettivo</span>
        )}
        <ArrowRight
          size={14}
          className="shrink-0 text-gray-300 group-hover:text-brand-600 transition-colors"
        />
      </div>
      {/* Sotto il nome, non sotto l'avatar: le tacche dell'obiettivo si
          allineano solo se tutti gli indicatori partono dallo stesso punto. */}
      <div className="ml-11 mt-2">
        <IndicatoreLdl voce={voce} />
        <p className="mt-1.5 truncate text-xs text-gray-500">
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
      </div>
    </div>
  );
}
