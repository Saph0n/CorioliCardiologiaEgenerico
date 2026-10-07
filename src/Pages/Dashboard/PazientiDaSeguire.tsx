import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardBody, CardHeader, Tab, Tabs } from "@nextui-org/react";
import { Activity } from "lucide-react";
import { PatientService, VisitService } from "../../services/OfflineServices";
import { PageHeader } from "../../components/PageHeader";
import { PageLoadingSkeleton } from "../../components/AppStartupSkeleton";
import {
  COLORI_LIVELLO,
  EtichettaSegnalazione,
  formattaData,
} from "../../components/generale/RigaPazienteDaSeguire";
import {
  pazientiDaSeguire,
  type MotivoDaSeguire,
  type VoceDaSeguire,
} from "../../utils/pazientiDaSeguire";
import { formatPatientDisplayName } from "../../utils/patientDisplay";
import { calculateAge } from "../../utils/dateUtils";
import { conVirgola } from "../../utils/parametriVitali";

/**
 * L'elenco intero dei pazienti da seguire: la stessa coorte della colonna in
 * dashboard, senza il taglio alle prime righe, come la pagina "Pazienti a
 * rischio" di Corioli Cardiologia.
 *
 * In tabella, con le ultime misure in colonna: a tutta larghezza la riga
 * compatta della dashboard lascerebbe i valori lontanissimi dal nome. Il
 * filtro in alto tiene un solo motivo alla volta.
 */

interface VoceConNome extends VoceDaSeguire {
  patientName: string;
  eta: number | null;
}

type Filtro = "tutti" | MotivoDaSeguire;

export default function PazientiDaSeguire() {
  const navigate = useNavigate();
  const [voci, setVoci] = useState<VoceConNome[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("tutti");

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
          pazientiDaSeguire(pazienti, visite, Number.POSITIVE_INFINITY).map((voce) => {
            const p = perId.get(voce.patientId);
            return {
              ...voce,
              patientName: p
                ? formatPatientDisplayName(p) ?? "Paziente senza nome"
                : "Paziente sconosciuto",
              eta: p ? calculateAge(p.dataNascita) : null,
            };
          }),
        );
      } catch (e) {
        console.error("Errore nel caricamento dei pazienti da seguire", e);
      } finally {
        setLoading(false);
      }
    };
    void carica();
  }, []);

  const conteggi = useMemo(() => {
    const c: Record<MotivoDaSeguire, number> = { pressione: 0, peso: 0, ortostatismo: 0 };
    for (const v of voci) for (const s of v.segnalazioni) c[s.motivo] += 1;
    return c;
  }, [voci]);

  const visibili = useMemo(
    () =>
      filtro === "tutti"
        ? voci
        : voci.filter((v) => v.segnalazioni.some((s) => s.motivo === filtro)),
    [voci, filtro],
  );

  if (loading) {
    return <PageLoadingSkeleton variant="table" pathname="/pazienti-da-seguire" />;
  }

  return (
    <div className="corioli-page space-y-6">
      <PageHeader
        icon={Activity}
        title="Pazienti da seguire"
        subtitle={
          voci.length === 0
            ? "Nessun paziente con valori da seguire all'ultima visita"
            : `${voci.length} ${voci.length === 1 ? "paziente" : "pazienti"}: ${conteggi.pressione} per la pressione, ${conteggi.peso} per il peso, ${conteggi.ortostatismo} per l'ortostatismo`
        }
      />

      <Card className="corioli-card">
        <CardHeader className="corioli-card-header flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-default-600">
            All&apos;ultima misura: pressione da 140/90 in su, BMI da 30 in su,
            ipotensione ortostatica o tachicardia in ortostatismo. In rosso i
            valori più alti.
          </p>
          <Tabs
            aria-label="Filtra per motivo"
            size="sm"
            selectedKey={filtro}
            onSelectionChange={(k) => setFiltro(k as Filtro)}
          >
            <Tab key="tutti" title={`Tutti (${voci.length})`} />
            <Tab key="pressione" title={`Pressione (${conteggi.pressione})`} />
            <Tab key="peso" title={`Peso (${conteggi.peso})`} />
            <Tab key="ortostatismo" title={`Ortostatismo (${conteggi.ortostatismo})`} />
          </Tabs>
        </CardHeader>
        <CardBody className="p-0">
          {visibili.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-default-200 bg-default-50 text-left text-xs font-medium text-default-600">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Paziente</th>
                    <th className="px-4 py-2.5 font-medium text-right">Età</th>
                    <th className="px-4 py-2.5 font-medium">Motivi</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ultima PA</th>
                    <th className="px-4 py-2.5 font-medium text-right">BMI</th>
                    <th className="px-4 py-2.5 font-medium text-right">Vita</th>
                    <th className="px-4 py-2.5 font-medium">Ultima visita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-100">
                  {visibili.map((voce) => (
                    <tr
                      key={voce.patientId}
                      onClick={() => navigate(`/patient-history/${voce.patientId}`)}
                      className="cursor-pointer transition-colors hover:bg-default-50"
                    >
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
                          <span
                            aria-hidden
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${COLORI_LIVELLO[voce.livello].pallino}`}
                          />
                          {voce.patientName}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-default-700">
                        {voce.eta ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {voce.segnalazioni.map((s) => (
                            <span key={s.motivo} className="inline-flex items-center gap-1.5">
                              <EtichettaSegnalazione s={s} />
                              <span className="text-xs text-default-600">
                                {s.dettaglio}
                                {/* Una misura presa prima dell'ultima visita: va
                                    detto, se no sembra di oggi. */}
                                {s.data.slice(0, 10) !== voce.ultimaVisita.slice(0, 10) && (
                                  <> · del {formattaData(s.data)}</>
                                )}
                              </span>
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-default-700">
                        {voce.pa ? `${voce.pa.sistolica}/${voce.pa.diastolica}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-default-700">
                        {voce.bmi != null ? conVirgola(voce.bmi) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-default-700">
                        {voce.circonferenzaVita != null ? `${voce.circonferenzaVita} cm` : "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-default-600">
                        {formattaData(voce.ultimaVisita)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
              <Activity size={32} className="text-gray-200" />
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Nessun paziente da seguire
              </p>
              <p
                className="max-w-[340px] text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                L&apos;elenco si riempie dai parametri della visita: pressione,
                peso (con l&apos;altezza in anagrafica) e prova ortostatica.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
