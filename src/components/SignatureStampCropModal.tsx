/**
 * Ritaglio dell'immagine di firma/timbro per i PDF.
 *
 * NON ancora collegato: il caricamento in Impostazioni → Profilo Dottore salva
 * l'immagine così com'è. Il componente è tenuto di proposito, da agganciare in
 * futuro al flusso di caricamento firma — non è codice morto da eliminare.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Slider,
} from "@nextui-org/react";
import { ZoomIn, ZoomOut, Move } from "lucide-react";
import {
  SIGNATURE_STAMP_ASPECT,
  SIGNATURE_STAMP_EXPORT_WIDTH,
  SIGNATURE_STAMP_EXPORT_HEIGHT,
} from "../utils/signatureStamp";
import { AppModal } from "./AppModal";

type Props = {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
};

export function SignatureStampCropModal({
  isOpen,
  imageSrc,
  onClose,
  onConfirm,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const maskId = useId().replace(/:/g, "");
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const resetTransform = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    resetTransform();
    setImgSize({ w: 0, h: 0 });
    const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = imageSrc;
  }, [isOpen, imageSrc, resetTransform]);

  useEffect(() => {
    if (!isOpen || !viewportRef.current) return;
    const el = viewportRef.current;
    const update = () =>
      setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  const getCropGeometry = useCallback(() => {
    const vw = viewportSize.w;
    const vh = viewportSize.h;
    if (!vw || !vh || !imgSize.w || !imgSize.h) return null;
    const cropW = Math.min(vw - 32, 400);
    const cropH = cropW / SIGNATURE_STAMP_ASPECT;
    const cropX = (vw - cropW) / 2;
    const cropY = (vh - cropH) / 2;

    const fit = Math.min((vw * 0.92) / imgSize.w, (vh * 0.92) / imgSize.h);
    const displayW = imgSize.w * fit * scale;
    const displayH = imgSize.h * fit * scale;
    const imgX = vw / 2 - displayW / 2 + pan.x;
    const imgY = vh / 2 - displayH / 2 + pan.y;

    return { cropX, cropY, cropW, cropH, imgX, imgY, displayW, displayH };
  }, [imgSize, scale, pan, viewportSize]);

  const handleConfirm = () => {
    if (!imageSrc || !imgSize.w) return;
    const geo = getCropGeometry();
    if (!geo) return;

    const img = new Image();
    img.onload = () => {
      let sx = ((geo.cropX - geo.imgX) / geo.displayW) * img.naturalWidth;
      let sy = ((geo.cropY - geo.imgY) / geo.displayH) * img.naturalHeight;
      let sw = (geo.cropW / geo.displayW) * img.naturalWidth;
      let sh = (geo.cropH / geo.displayH) * img.naturalHeight;

      sx = Math.max(0, sx);
      sy = Math.max(0, sy);
      if (sx + sw > img.naturalWidth) sw = img.naturalWidth - sx;
      if (sy + sh > img.naturalHeight) sh = img.naturalHeight - sy;
      if (sw <= 0 || sh <= 0) return;

      const canvas = document.createElement("canvas");
      canvas.width = SIGNATURE_STAMP_EXPORT_WIDTH;
      canvas.height = SIGNATURE_STAMP_EXPORT_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIGNATURE_STAMP_EXPORT_WIDTH, SIGNATURE_STAMP_EXPORT_HEIGHT);
      ctx.drawImage(
        img,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        SIGNATURE_STAMP_EXPORT_WIDTH,
        SIGNATURE_STAMP_EXPORT_HEIGHT,
      );
      onConfirm(canvas.toDataURL("image/png"));
      onClose();
    };
    img.src = imageSrc;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!imgSize.w) return;
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  };

  const onPointerUp = () => setDragging(false);

  const geo = getCropGeometry();

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      scrollBehavior="inside"
      classNames={{ base: "max-w-xl" }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 pb-2">
          <span>Ritaglia timbro e firma</span>
          <span className="text-sm font-normal text-default-500">
            Trascina l&apos;immagine e regola lo zoom. Solo il contenuto nel riquadro
            verrà usato nei PDF.
          </span>
        </ModalHeader>
        <ModalBody className="gap-4">
          <div
            ref={viewportRef}
            className="relative h-[280px] w-full overflow-hidden rounded-xl bg-default-100 touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ cursor: dragging ? "grabbing" : imgSize.w ? "grab" : "default" }}
          >
            {imageSrc && imgSize.w > 0 && geo ? (
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  width: geo.displayW,
                  height: geo.displayH,
                  left: geo.imgX,
                  top: geo.imgY,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-default-500 text-sm">
                Caricamento…
              </div>
            )}

            {/* Maschera scura + riquadro ritaglio */}
            <div className="pointer-events-none absolute inset-0">
              <svg className="h-full w-full" aria-hidden>
                <defs>
                  <mask id={maskId}>
                    <rect width="100%" height="100%" fill="white" />
                    {geo ? (
                      <rect
                        x={geo.cropX}
                        y={geo.cropY}
                        width={geo.cropW}
                        height={geo.cropH}
                        fill="black"
                        rx={4}
                      />
                    ) : null}
                  </mask>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="rgba(15, 23, 42, 0.55)"
                  mask={`url(#${maskId})`}
                />
              </svg>
              {geo ? (
                <div
                  className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)] rounded"
                  style={{
                    left: geo.cropX,
                    top: geo.cropY,
                    width: geo.cropW,
                    height: geo.cropH,
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut size={16} className="text-default-500 shrink-0" />
            <Slider
              aria-label="Zoom"
              size="sm"
              minValue={0.4}
              maxValue={3}
              step={0.05}
              value={scale}
              onChange={(v) => setScale(Array.isArray(v) ? v[0] : v)}
              className="flex-1"
            />
            <ZoomIn size={16} className="text-default-500 shrink-0" />
          </div>

          <p className="flex items-center gap-2 text-xs text-default-500">
            <Move size={14} />
            Trascina per centrare timbro e firma nel riquadro orizzontale.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Annulla
          </Button>
          <Button color="primary" onPress={handleConfirm} isDisabled={!imgSize.w}>
            Usa ritaglio
          </Button>
        </ModalFooter>
      </ModalContent>
    </AppModal>
  );
}
