import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardBody, CardHeader } from "@nextui-org/react";
import { HeartPulse } from "lucide-react";
import { PatientService, VisitService } from "../../services/OfflineServices";
import { PageHeader } from "../../components/PageHeader";
import { PageLoadingSkeleton } from "../../components/AppStartupSkeleton";
import { COLORI_CLASSE, classeBreve } from "../../components/cardio/classeRischio";
import { IndicatoreLdl } from "../../components/cardio/IndicatoreLdl";
import {
  pazientiDaTenereDOcchio,
  type VoceRischio,
} from "../../utils/pazientiARischio";
import { formatPatientDisplayName } from "../../utils/patientDisplay";

/**
 * L'elenco intero dei pazienti a rischio: la stessa coorte della colonna in
 * dashboard, senza il taglio alle prime righe.
 *
 * Ci si arriva dal "Vedi tutti" della colonna. Prima portava alla lista di
 * tutti i pazienti, che e' un altro elenco: chi apre da li' sta cercando
 * proprio questi, non gli altri.
 *
 * Qui e' una tabella e non la riga compatta della colonna: a tutta larghezza
 * la riga metteva lo scostamento a oltre mille pixel dal nome, e la classe
 * era solo il colore di una striscia. Stessi dati, stessi colori e lo stesso
 * indicatore a segmenti, con le tacche dell'obiettivo in colonna.
 */

function formattaData(iso?: string): string {
  if (!iso) return "—";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return a && m && g ? `${g}/${m}/${a}` : iso;
}

interface VoceConNome extends VoceRischio {
  patientName: string;
}

export default function PazientiARischio() {
  const navigate = useNavigate();
  const [voci, setVoci] = useState<VoceConNome[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carica = async () => {
      setLoading(true);
      try {
        const [pazienti, visite] = await Promise.all([
          PatientService.getAllPatients(),
          VisitService.getAllVisits(),
        ]);
        const perId = new Map(pazienti.map((p) => [p.id, p]));
        // Senza limite: qui l'elenco e' il contenuto della pagina.
        setVoci(
          pazientiDaTenereDOcchio(visite, Number.POSITIVE_INFINITY).map((voce) => {
            const p = perId.get(voce.patientId);
            return {
              ...voce,
              patientName: p
                ? formatPatientDisplayName(p) ?? "Paziente senza nome"
                : "Paziente sconosciuto",
            };
          }),
        );
      } catch (e) {
        console.error("Errore nel caricamento dei pazienti a rischio", e);
      } finally {
        setLoading(false);
      }
    };
    void carica();
  }, []);

  if (loading) {
    return <PageLoadingSkeleton variant="table" pathname="/pazienti-a-rischio" />;
  }

  const fuoriObiettivo = voci.filter((v) => v.scostamento != null).length;

  return (
    <div className="corioli-page space-y-6">
      <PageHeader
        title="Pazienti a rischio"
        subtitle={
          voci.length === 0
            ? "Nessun paziente con una classe di rischio dichiarata"
            : `${voci.length} ${voci.length === 1 ? "paziente" : "pazienti"}, ${fuoriObiettivo} sopra l'obiettivo di LDL`
        }
      />

      <Card className="corioli-card">
        <CardHeader className="corioli-card-header">
          {/* Il conteggio sta gia' nel sottotitolo della pagina: qui serve
              dire chi c'e' dentro e come si leggono i numeri. */}
          <p className="text-sm text-default-600">
            Classe alta o molto alta, più chiunque sia sopra l&apos;obiettivo di
            LDL della sua classe. Valori in mg/dL; ≈ indica un LDL stimato con
            Friedewald.
          </p>
        </CardHeader>
        <CardBody className="p-0">
          {voci.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-default-200 bg-default-50 text-left text-xs font-medium text-default-600">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Paziente</th>
                  <th className="px-4 py-2.5 font-medium">Classe</th>
                  <th className="px-4 py-2.5 font-medium text-right">LDL</th>
                  <th className="px-4 py-2.5 font-medium text-right">Obiettivo</th>
                  <th className="px-4 py-2.5 font-medium">Scostamento</th>
                  <th className="px-4 py-2.5 font-medium">Prelievo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100">
                {voci.map((voce) => {
                  const fuori = voce.scostamento != null;
                  return (
                    <tr
                      key={voce.patientId}
                      onClick={() => navigate(`/patient-history/${voce.patientId}`)}
                      className="cursor-pointer transition-colors hover:bg-default-50"
                    >
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{voce.patientName}</td>
                      <td className="px-4 py-2.5 text-default-700">
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${COLORI_CLASSE[voce.categoria].pallino}`} />
                          {classeBreve(voce.categoria)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-default-700">
                        {voce.ldl != null ? (
                          <span title={voce.fonteLdl === "stimato" ? "LDL stimato con Friedewald" : "LDL dosato"}>
                            {voce.fonteLdl === "stimato" ? "≈" : ""}
                            {Math.round(voce.ldl)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-default-700">
                        &lt; {voce.obiettivo}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-4">
                          {/* Larghezza fissa per la scritta: gli indicatori
                              partono tutti dallo stesso punto e le tacche
                              dell'obiettivo stanno una sotto l'altra. */}
                          <span className="w-20 shrink-0 text-right">
                            {voce.ldl == null ? (
                              <span className="text-default-600">da dosare</span>
                            ) : fuori ? (
                              <span
                                className={`font-semibold tabular-nums ${COLORI_CLASSE[voce.categoria].testo}`}
                              >
                                +{Math.round(voce.scostamento!)}
                              </span>
                            ) : (
                              <span className="font-medium text-brand-700">a obiettivo</span>
                            )}
                          </span>
                          <IndicatoreLdl voce={voce} className="w-80" />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-default-600">{formattaData(voce.dataLdl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
              <HeartPulse size={32} className="text-gray-200" />
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Nessun paziente da sorvegliare
              </p>
              <p
                className="max-w-[320px] text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                La classe di rischio si dichiara nella visita, nella colonna del
                rischio cardiovascolare: da lì discende l&apos;obiettivo
                di LDL con cui si riempie questo elenco.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
