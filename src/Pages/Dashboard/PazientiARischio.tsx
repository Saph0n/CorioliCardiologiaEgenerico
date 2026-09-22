import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardBody, CardHeader } from "@nextui-org/react";
import { HeartPulse } from "lucide-react";
import { PatientService, VisitService } from "../../services/OfflineServices";
import { PageHeader } from "../../components/PageHeader";
import { PageLoadingSkeleton } from "../../components/AppStartupSkeleton";
import { RigaPazienteARischio } from "../../components/cardio/RigaPazienteARischio";
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
 */

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
        icon={HeartPulse}
        iconColor="primary"
      />

      <Card className="corioli-card">
        <CardHeader className="corioli-card-header">
          {/* Il conteggio sta gia' nel sottotitolo della pagina: qui serve
              dire chi c'e' dentro e come si leggono i numeri. */}
          <p className="text-sm text-default-500">
            Classe alta o molto alta, più chiunque sia sopra l&apos;obiettivo di
            LDL della sua classe. Valori in mg/dL; ≈ indica un LDL stimato con
            Friedewald.
          </p>
        </CardHeader>
        <CardBody className="p-0">
          {voci.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {voci.map((voce) => (
                <RigaPazienteARischio
                  key={voce.patientId}
                  voce={voce}
                  nome={voce.patientName}
                  onApri={() => navigate(`/patient-history/${voce.patientId}`)}
                />
              ))}
            </div>
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
