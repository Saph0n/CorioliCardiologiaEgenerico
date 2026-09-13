import {
  Button,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tab,
  Tabs,
} from "@nextui-org/react";

import { AppModal } from "../AppModal";
import {
  CAD_RADS_PASSI,
  categoriaCac,
  type CategoriaCac,
  type EsitoCac,
  type SogliaCacSevera,
} from "../../utils/tcCoronarica";

/**
 * Prontuario dell'imaging coronarico: fasce del calcium score e CAD-RADS.
 *
 * Il CAD-RADS stava in coda al prontuario delle terapie. Il cardiologo lo ha
 * voluto a parte (call dell'11 settembre 2026): i farmaci si consultano mentre
 * si decide la terapia, queste tabelle mentre si legge una TC, e si aprono da
 * dove la TC si compila e da dove se ne vede il rischio.
 *
 * Come l'altro, e' materiale da consultare: non finisce nel referto.
 */
export function ProntuarioImagingModal({
  isOpen,
  onClose,
  sogliaCac,
  categoriaCorrente,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Soglia severa impostata dal centro: decide dove finisce la fascia moderata. */
  sogliaCac: SogliaCacSevera;
  /** Categoria del calcium score di questa visita: la sua riga si evidenzia. */
  categoriaCorrente?: CategoriaCac;
}) {
  return (
    <AppModal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex-col items-start gap-0">
          <span className="text-base font-semibold">Prontuario imaging</span>
          <span className="text-xs font-normal text-default-500">
            Tabelle di riferimento della TC coronarica. Solo consultazione: non
            entrano nel referto.
          </span>
        </ModalHeader>
        <ModalBody className="pb-2">
          <Tabs aria-label="Schede del prontuario imaging" size="sm" variant="underlined">
            <Tab key="cac" title="Calcium score">
              <CalciumScore sogliaCac={sogliaCac} categoriaCorrente={categoriaCorrente} />
            </Tab>
            <Tab key="cadrads" title="CAD-RADS">
              <CadRads />
            </Tab>
          </Tabs>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={onClose}>
            Chiudi
          </Button>
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );
}

// ─── Calcium score ───────────────────────────────────────────────────────────

function CalciumScore({
  sogliaCac,
  categoriaCorrente,
}: {
  sogliaCac: SogliaCacSevera;
  categoriaCorrente?: CategoriaCac;
}) {
  // Le righe si chiedono a `categoriaCac` invece di riscriverle: la tabella
  // mostra le fasce che l'applicazione usa davvero nella colonna del rischio,
  // compresa la soglia severa impostata dal centro. Un punteggio per fascia:
  // 0, il primo lieve, l'ultimo moderato, il primo severo.
  const righe = [0, 1, sogliaCac - 1, sogliaCac]
    .map((score) => categoriaCac(score, sogliaCac))
    .filter((esito): esito is EsitoCac => esito != null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-default-500">
        Fasce dell&apos;Agatston usate dall&apos;applicazione. La soglia della
        calcificazione severa è un&apos;impostazione del centro, 300 o 400.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-default-200">
              <th className="py-1.5 pr-3 text-xs font-semibold text-default-500">
                Agatston
              </th>
              <th className="py-1.5 text-xs font-semibold text-gray-800">Categoria</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr
                key={r.categoria}
                className={`border-b border-default-100 align-top ${
                  r.categoria === categoriaCorrente ? "bg-primary-50" : ""
                }`}
              >
                <td className="py-2 pl-1 pr-3 text-xs font-semibold text-default-500">
                  {r.intervallo}
                </td>
                <td className="py-2 text-xs text-default-700">{r.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── CAD-RADS: passo successivo ─────────────────────────────────────────────

function CadRads() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-default-500">
        Solo a titolo informativo: il passo tipico per categoria, non una
        proposta per il paziente in visita.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-default-200">
              <th className="py-1.5 pr-3 text-xs font-semibold text-default-500">
                Categoria
              </th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-800">
                Significato clinico orientativo
              </th>
              <th className="py-1.5 text-xs font-semibold text-gray-800">
                Passo successivo tipico
              </th>
            </tr>
          </thead>
          <tbody>
            {CAD_RADS_PASSI.map((r) => (
              <tr key={r.categoria} className="border-b border-default-100 align-top">
                <td className="whitespace-nowrap py-2 pr-3 text-xs font-semibold text-default-500">
                  {r.categoria}
                </td>
                <td className="py-2 pr-3 text-xs text-default-700">{r.significato}</td>
                <td className="py-2 text-xs text-default-700">{r.passo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
