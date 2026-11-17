import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardBody } from "@nextui-org/react";
import { BookOpen } from "lucide-react";
import { useAbbonamento } from "../../contexts/useAbbonamento";
import { archivioDiProvaAperto } from "../../services/StorageServiceFallback";

/**
 * Pagine che creano o modificano dati clinici (nuovo paziente, visita): in
 * sola lettura mostrano perché non si può, invece di un modulo che poi non
 * salva. La guida di primo avvio lavora su un archivio in memoria e resta
 * percorribile.
 */
export default function SoloConAbbonamento({ children }: { children: ReactNode }) {
  const { solaLettura, apriDialogo } = useAbbonamento();
  const navigate = useNavigate();

  if (!solaLettura || archivioDiProvaAperto()) return <>{children}</>;

  return (
    <div className="mx-auto max-w-xl pt-10">
      <Card className="border border-default-200 shadow-sm">
        <CardBody className="items-center gap-4 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <BookOpen size={22} />
          </span>
          <h1 className="text-xl font-semibold text-gray-900">Per scrivere serve l&apos;abbonamento</h1>
          <p className="text-sm text-gray-700">
            Senza un abbonamento attivo non si possono aggiungere pazienti né scrivere visite. I tuoi
            dati sono al sicuro: tutte le cartelle restano consultabili, stampabili ed esportabili.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button variant="flat" onPress={() => navigate(-1)}>
              Torna indietro
            </Button>
            <Button variant="flat" onPress={() => apriDialogo("collega")}>
              Ho già un abbonamento
            </Button>
            <Button color="primary" onPress={() => apriDialogo("abbonati")}>
              Abbonati
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
