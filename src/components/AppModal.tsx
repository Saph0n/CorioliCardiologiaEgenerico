import { Modal, type ModalProps } from "@nextui-org/react";

/**
 * Modal dell'applicazione.
 *
 * Usa `disableAnimation` di proposito. In `@nextui-org/modal` 2.2.7 il modal è
 * renderizzato così:
 *
 *   disableAnimation && isOpen
 *     ? overlay
 *     : <AnimatePresence>{isOpen ? overlay : null}</AnimatePresence>
 *
 * Con le animazioni attive lo smontaggio dipende dall'handshake di uscita di
 * `AnimatePresence`, che qui non si completa mai: alla chiusura il backdrop va a
 * `opacity: 0` ma il portale resta nel DOM con `pointer-events: auto`, cioè uno
 * strato invisibile a tutto schermo che si mangia i click della pagina.
 * Verificato sul browser: con `disableAnimation` il portale viene smontato.
 *
 * Le props passate dal chiamante vincono, così un singolo modal può riattivare
 * l'animazione se il problema verrà risolto a monte.
 */
export function AppModal(props: ModalProps) {
  return <Modal disableAnimation {...props} />;
}

/**
 * `classNames.base` dei modal a tutto schermo (`size="full"`): partono sotto la
 * barra del titolo, se no la X del modal finisce proprio sotto il pulsante che
 * chiude la finestra. I `!` servono perche' la variante "full" di NextUI fissa
 * margini e altezze con classi responsive che altrimenti vincono.
 */
export const MODAL_SCHERMO_INTERO =
  "m-0 !mt-barra max-w-[100vw] !h-finestra !min-h-finestra !max-h-finestra rounded-none";
