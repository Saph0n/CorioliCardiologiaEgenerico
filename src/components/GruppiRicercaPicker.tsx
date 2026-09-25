import { useState } from "react";
import {
  Button,
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Input,
} from "@nextui-org/react";
import { Pencil, Plus, X } from "lucide-react";
import type { AppartenenzaGruppo } from "../types/Storage";
import {
  MAX_GRUPPI_PER_PAZIENTE,
  aggiungiGruppo,
  formattaDurata,
  giorniDa,
  gruppoKey,
  impostaDataArruolamento,
  rimuoviGruppo,
} from "../utils/gruppiRicerca";
import { todayIsoDate } from "../utils/dateUtils";

/**
 * Assegnazione dei gruppi di ricerca a un paziente.
 *
 * Compatto per scelta: sta accanto ai dati anagrafici, quindi di base mostra
 * solo i chip. Da qui si assegna e si disiscrive; i gruppi si creano e si
 * rinominano in Impostazioni, che è l'unico posto in cui si gestisce l'elenco.
 *
 * La data di arruolamento viene impostata a oggi al momento dell'assegnazione e
 * si corregge aprendo il chip, senza occupare spazio finché non serve.
 */
export function GruppiRicercaPicker({
  assegnati,
  disponibili,
  onChange,
  disabled = false,
}: {
  assegnati: AppartenenzaGruppo[];
  /** Gruppi già esistenti (registro + quelli in uso sugli altri pazienti). */
  disponibili: string[];
  onChange: (gruppi: AppartenenzaGruppo[]) => void;
  disabled?: boolean;
}) {
  /** Chip aperto per vederne i dettagli e correggere la data di arruolamento. */
  const [apertoPerData, setApertoPerData] = useState<string | null>(null);
  /** Secondo passo prima di togliere il paziente dal gruppo. */
  const [confermaRimozione, setConfermaRimozione] = useState(false);

  const assegnatiKeys = new Set(assegnati.map((g) => gruppoKey(g.nome)));
  const selezionabili = disponibili.filter((g) => !assegnatiKeys.has(gruppoKey(g)));
  const pieno = assegnati.length >= MAX_GRUPPI_PER_PAZIENTE;

  const dettaglio = (g: AppartenenzaGruppo): string => {
    if (!g.dal) return "data di arruolamento non registrata";
    const giorni = giorniDa(g.dal);
    const quando = new Date(`${g.dal}T12:00:00`).toLocaleDateString("it-IT");
    return giorni == null
      ? `arruolato il ${quando}`
      : `arruolato il ${quando} · da ${formattaDurata(giorni)}`;
  };

  const aperto = assegnati.find((g) => gruppoKey(g.nome) === apertoPerData);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {assegnati.map((g) => {
          const key = gruppoKey(g.nome);
          const attivo = apertoPerData === key;
          return (
            <Chip
              key={key}
              size="sm"
              variant={attivo ? "solid" : "flat"}
              color="secondary"
              title={
                disabled
                  ? dettaglio(g)
                  : `${dettaglio(g)} — clicca per modificare`
              }
              classNames={{
                base: disabled
                  ? ""
                  : "cursor-pointer transition-opacity hover:opacity-80",
              }}
              onClick={
                disabled
                  ? undefined
                  : () => {
                      setConfermaRimozione(false);
                      setApertoPerData(attivo ? null : key);
                    }
              }
              // Il segno che il chip si apre: senza, l'unico indizio era il
              // cursore, che su una riga di sola lettura non si nota.
              endContent={
                disabled ? undefined : (
                  <Pencil size={10} className="mr-1 opacity-50" aria-hidden />
                )
              }
            >
              {g.nome}
            </Chip>
          );
        })}

        {!disabled && !pieno && selezionabili.length > 0 && (
          <Dropdown>
            <DropdownTrigger>
              <Button
                size="sm"
                variant="light"
                isIconOnly
                className="h-6 w-6 min-w-6 text-default-500"
                aria-label="Aggiungi a un gruppo di ricerca"
                title="Aggiungi a un gruppo di ricerca"
              >
                <Plus size={14} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Gruppi di ricerca disponibili"
              onAction={(k) =>
                onChange(aggiungiGruppo(assegnati, String(k), todayIsoDate()))
              }
            >
              {selezionabili.map((g) => (
                <DropdownItem key={g}>{g}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        )}

        {!disabled && disponibili.length === 0 && (
          <span className="text-[11px] text-default-500">
            Nessun gruppo: creali in Impostazioni
          </span>
        )}
      </div>

      {aperto && !disabled && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-default-200 bg-white px-2 py-1.5">
          {confermaRimozione ? (
            <>
              {/* Togliere un paziente da un progetto cancella anche la sua data
                  di arruolamento: va chiesto, non fatto con un clic solo. */}
              <span className="text-[11px] text-danger-600 shrink-0">
                Togliere il paziente dal gruppo &quot;{aperto.nome}&quot;?
              </span>
              <Button
                size="sm"
                color="danger"
                variant="flat"
                className="h-7 text-[11px]"
                onPress={() => {
                  onChange(rimuoviGruppo(assegnati, aperto.nome));
                  setConfermaRimozione(false);
                  setApertoPerData(null);
                }}
              >
                Si, togli
              </Button>
              <Button
                size="sm"
                variant="light"
                className="h-7 text-[11px]"
                onPress={() => setConfermaRimozione(false)}
              >
                Annulla
              </Button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-default-500 shrink-0">
                {aperto.nome} · arruolato il
              </span>
              <Input
                type="date"
                size="sm"
                variant="bordered"
                aria-label={`Data di arruolamento in ${aperto.nome}`}
                max={todayIsoDate()}
                value={aperto.dal ?? ""}
                onValueChange={(v) =>
                  onChange(impostaDataArruolamento(assegnati, aperto.nome, v))
                }
                className="w-40"
              />
              <Button
                size="sm"
                variant="light"
                color="danger"
                className="h-7 text-[11px]"
                startContent={<X size={12} />}
                onPress={() => setConfermaRimozione(true)}
              >
                Togli dal gruppo
              </Button>
              <Button
                size="sm"
                variant="light"
                className="h-7 text-[11px]"
                onPress={() => setApertoPerData(null)}
              >
                Chiudi
              </Button>
            </>
          )}
        </div>
      )}

      {pieno && !disabled && (
        <span className="text-[11px] text-default-500">
          Massimo {MAX_GRUPPI_PER_PAZIENTE} gruppi per paziente.
        </span>
      )}
    </div>
  );
}
