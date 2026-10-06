/**
 * Firma scritta sullo schermo, per chi ha un portatile o un tablet touch.
 *
 * Alternativa alla foto della firma (`SignatureStampCropModal`): esce nello
 * stesso formato, PNG 3:1 su fondo bianco, cosi' i PDF la trattano allo
 * stesso modo. Il timbro qui non c'e': chi lo vuole carica la foto.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import {
  Button,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@nextui-org/react";
import { Eraser, Undo2 } from "lucide-react";
import { AppModal } from "./AppModal";
import {
  SIGNATURE_STAMP_ASPECT,
  SIGNATURE_STAMP_EXPORT_HEIGHT,
  SIGNATURE_STAMP_EXPORT_WIDTH,
} from "../utils/signatureStamp";
import {
  adattaAlRiquadro,
  disegnaTratti,
  type TrattoFirma,
} from "../utils/firmaAMano";

/** Quasi nero: il referto si stampa in bianco e nero. */
const INCHIOSTRO = "#14171f";
/** Altezza della riga su cui si firma, in altezze del riquadro. */
const RIGA_Y = 0.74;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
};

export function FirmaAManoModal({ isOpen, onClose, onConfirm }: Props) {
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tratti = useRef<TrattoFirma[]>([]);
  const puntatore = useRef<number | null>(null);
  /**
   * Visto un pennino, il dito non scrive piu': e' il palmo appoggiato allo
   * schermo mentre si firma.
   */
  const pennino = useRef(false);
  const ridisegno = useRef<number | null>(null);
  const [numeroTratti, setNumeroTratti] = useState(0);

  const disegna = useCallback(() => {
    ridisegno.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    disegnaTratti(ctx, tratti.current, h, INCHIOSTRO);
  }, []);

  const chiediRidisegno = useCallback(() => {
    if (ridisegno.current === null) {
      ridisegno.current = requestAnimationFrame(disegna);
    }
  }, [disegna]);

  useEffect(() => {
    if (!isOpen) return;
    tratti.current = [];
    pennino.current = false;
    puntatore.current = null;
    setNumeroTratti(0);
    const el = contenitoreRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const adegua = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(el.clientWidth * dpr);
      canvas.height = Math.round(el.clientHeight * dpr);
      disegna();
    };
    adegua();
    const ro = new ResizeObserver(adegua);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (ridisegno.current !== null) cancelAnimationFrame(ridisegno.current);
      ridisegno.current = null;
    };
  }, [isOpen, disegna]);

  const punto = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.height,
      y: (e.clientY - r.top) / r.height,
      p: e.pointerType === "pen" ? e.pressure : 0.5,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") pennino.current = true;
    else if (e.pointerType === "touch" && pennino.current) return;
    if (puntatore.current !== null) return;
    e.preventDefault();
    // La cattura tiene il tratto anche se il pennino esce dal riquadro; se il
    // browser la rifiuta si firma lo stesso, solo dentro il riquadro.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* si prosegue senza cattura */
    }
    puntatore.current = e.pointerId;
    tratti.current.push([punto(e)]);
    setNumeroTratti(tratti.current.length);
    chiediRidisegno();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== puntatore.current) return;
    const tratto = tratti.current[tratti.current.length - 1];
    // "Ricomincia" premuto con un dito ancora appoggiato svuota i tratti.
    if (!tratto) return;
    // Il pennino manda piu' punti di quanti eventi arrivino: senza quelli
    // raccolti dal browser fra un evento e l'altro le curve si spezzano.
    const eventi = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of eventi.length > 0 ? eventi : [e.nativeEvent]) {
      tratto.push(punto(ev));
    }
    chiediRidisegno();
  };

  const fineTratto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId === puntatore.current) puntatore.current = null;
  };

  const annullaTratto = () => {
    tratti.current.pop();
    setNumeroTratti(tratti.current.length);
    chiediRidisegno();
  };

  const ricomincia = () => {
    tratti.current = [];
    setNumeroTratti(0);
    chiediRidisegno();
  };

  const conferma = () => {
    if (tratti.current.length === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = SIGNATURE_STAMP_EXPORT_WIDTH;
    canvas.height = SIGNATURE_STAMP_EXPORT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    disegnaTratti(
      ctx,
      tratti.current,
      SIGNATURE_STAMP_EXPORT_HEIGHT,
      INCHIOSTRO,
      adattaAlRiquadro(tratti.current),
    );
    onConfirm(canvas.toDataURL("image/png"));
    onClose();
  };

  const vuota = numeroTratti === 0;

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      isDismissable={false}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 pb-2">
          <span className="text-xl">Firma sullo schermo</span>
          <span className="text-base font-normal text-default-600">
            Firma sulla riga come su un foglio, con il pennino o con il dito.
            Va bene anche il mouse.
          </span>
        </ModalHeader>
        <ModalBody className="gap-4">
          <div
            ref={contenitoreRef}
            className="relative w-full overflow-hidden rounded-xl border-2 border-default-300 bg-white"
            style={{ aspectRatio: `${SIGNATURE_STAMP_ASPECT} / 1` }}
          >
            {/* La riga e la scritta stanno sotto il canvas e non finiscono
                nell'immagine: servono solo a chi firma. */}
            <div
              className="pointer-events-none absolute border-b-2 border-dashed border-default-300"
              style={{ left: "6%", right: "6%", top: `${RIGA_Y * 100}%` }}
              aria-hidden
            />
            {vuota ? (
              <span
                className="pointer-events-none absolute left-[6%] text-lg text-default-400"
                style={{ top: `calc(${RIGA_Y * 100}% + 8px)` }}
                aria-hidden
              >
                Firma qui
              </span>
            ) : null}
            <canvas
              ref={canvasRef}
              aria-label="Riquadro per la firma"
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={fineTratto}
              onPointerCancel={fineTratto}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              variant="bordered"
              startContent={<Undo2 size={20} />}
              isDisabled={vuota}
              onPress={annullaTratto}
            >
              Togli l&apos;ultimo tratto
            </Button>
            <Button
              size="lg"
              variant="bordered"
              startContent={<Eraser size={20} />}
              isDisabled={vuota}
              onPress={ricomincia}
            >
              Ricomincia
            </Button>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" size="lg" onPress={onClose}>
            Annulla
          </Button>
          <Button
            color="primary"
            size="lg"
            className="corioli-cta"
            onPress={conferma}
            isDisabled={vuota}
          >
            Usa questa firma
          </Button>
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );
}
