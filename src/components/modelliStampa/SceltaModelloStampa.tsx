import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Select, SelectItem } from "@nextui-org/react";
import { Printer } from "lucide-react";
import { ModelliStampaService } from "../../services/OfflineServices";
import { modelliDelDocumento, modelloInUso } from "../../utils/modelliStampa";
import type { ArchivioModelliStampa, DocumentoStampa, ModelloStampa } from "../../types/Storage";

interface Props {
  documento: DocumentoStampa;
  /** Il modello scelto per questa stampa; assente, quello in uso. */
  scelto?: ModelloStampa;
  onScegli: (modello: ModelloStampa | undefined) => void;
}

/**
 * Nell'anteprima di un documento: con quale modello stamparlo, questa volta.
 *
 * Compare solo a chi ha piu' di un modello per quel documento: per gli altri
 * c'e' solo il collegamento all'editor. La scelta vale per l'anteprima e per
 * la stampa che parte da li', non cambia il modello in uso.
 */
export function SceltaModelloStampa({ documento, scelto, onScegli }: Props) {
  const navigate = useNavigate();
  const [archivio, setArchivio] = useState<ArchivioModelliStampa | null>(null);

  useEffect(() => {
    let attivo = true;
    void ModelliStampaService.getArchivio()
      .then((a) => attivo && setArchivio(a))
      .catch(() => undefined);
    return () => {
      attivo = false;
    };
  }, []);

  const elenco = archivio ? modelliDelDocumento(archivio, documento) : [];
  const inUso = archivio ? modelloInUso(archivio, documento) : null;
  const valore = scelto?.id ?? inUso?.id;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {elenco.length > 1 && (
        <Select
          size="md"
          aria-label="Modello di stampa"
          label="Modello di stampa"
          className="w-64"
          selectedKeys={valore ? [valore] : []}
          onSelectionChange={(chiavi) => {
            const id = Array.from(chiavi)[0] as string | undefined;
            const m = elenco.find((x) => x.id === id);
            onScegli(m && m.id !== inUso?.id ? m : undefined);
          }}
        >
          {elenco.map((m) => (
            <SelectItem key={m.id} textValue={m.nome}>
              {m.id === inUso?.id ? `${m.nome} (in uso)` : m.nome}
            </SelectItem>
          ))}
        </Select>
      )}
      <Button
        variant="light"
        startContent={<Printer size={16} />}
        onPress={() => navigate(`/modelli-stampa?documento=${documento}`)}
      >
        Cambia impaginazione
      </Button>
    </div>
  );
}
