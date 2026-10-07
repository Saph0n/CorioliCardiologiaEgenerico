/**
 * La spirale del logo Corioli, disegnata e non come immagine.
 *
 * Nella barra della finestra c'era l'icona dell'app (`corioli-icon.png`, 512
 * px, spirale bianca sottile su un quadrato verde) ridotta a 20 px: la
 * spirale diventava una macchia e il logo sembrava rotto. Qui sono gli stessi
 * quattro archi di `corioli-logo.svg`, vettoriali, nitidi a ogni zoom dello
 * schermo, con il tratto un po' piu' spesso perche' regga ai corpi piccoli.
 */
export function MarchioCorioli({
  size = 22,
  className = "",
  colore = "#127c74",
}: {
  size?: number;
  className?: string;
  colore?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={className}
    >
      <g fill="none" stroke={colore} strokeWidth={9} strokeLinecap="round">
        <path d="M50 6A44 44 0 1 1 6.78 41.76" />
        <path d="M81.51 44.44A32 32 0 1 1 38.64 20.09" />
        <path d="M56.84 68.79A20 20 0 1 1 60.12 32.75" />
        <path d="M43.07 54A8 8 0 0 1 56.93 46" />
      </g>
    </svg>
  );
}
