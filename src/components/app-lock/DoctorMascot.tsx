import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export type MascotField =
  | "nome"
  | "cognome"
  | "email"
  | "telefono"
  | "specializzazione"
  | "titoloReferto"
  | "partitaIva"
  | "pin"
  | "pin-confirm"
  | null;

type Props = {
  activeField?: MascotField;
  /** Entrambi i PIN inseriti e coincidono → celebrazione. */
  pinComplete?: boolean;
  /** Entrambi i PIN inseriti ma NON coincidono → espressione dispiaciuta. */
  pinMismatch?: boolean;
  /** Occhietti sorridenti fissi (es. tutti i consensi dati). */
  happy?: boolean;
  /** Contatore: a ogni incremento il gufo fa un cenno di approvazione. */
  nodSignal?: number;
  /** Diametro del cerchio di sfondo in px. */
  size?: number;
};

const FEATHER = "#2C5F5A";

const LOOK: Record<string, { x: number; y: number }> = {
  idle: { x: 0, y: 0 },
  nome: { x: -8, y: -1 },
  cognome: { x: 8, y: -1 },
  email: { x: 0, y: -7 },
  telefono: { x: -6, y: 7 },
  specializzazione: { x: 6, y: 7 },
  titoloReferto: { x: -5, y: 6 },
  partitaIva: { x: 5, y: 7 },
};

const BROWS: Record<string, [string, string]> = {
  idle: ["M 62 66 Q 78 58 92 64", "M 108 64 Q 122 58 138 66"],
  nome: ["M 62 68 Q 78 60 92 62", "M 108 62 Q 122 58 138 66"],
  cognome: ["M 62 62 Q 78 58 92 66", "M 108 66 Q 122 60 138 68"],
  email: ["M 62 62 Q 78 54 92 60", "M 108 60 Q 122 54 138 62"],
  telefono: ["M 64 70 Q 78 64 92 68", "M 108 68 Q 122 64 136 70"],
  pin: ["M 64 70 Q 78 65 92 69", "M 108 69 Q 122 65 136 70"],
  happy: ["M 62 60 Q 78 54 92 58", "M 108 58 Q 122 54 138 60"],
  // dispiaciuto: interno alto, esterno basso (sguardo preoccupato)
  sad: ["M 62 70 Q 78 64 92 58", "M 108 58 Q 122 64 138 70"],
};

const WING_REST = {
  l: "M 50 110 Q 30 114 28 146 Q 32 172 56 162 Q 48 138 52 116 Z",
  r: "M 150 110 Q 170 114 172 146 Q 168 172 144 162 Q 152 138 148 116 Z",
};
const WING_COVER = {
  l: "M 50 110 Q 34 70 64 56 Q 100 50 104 84 Q 100 112 78 116 Q 60 110 50 110 Z",
  r: "M 150 110 Q 166 70 136 56 Q 100 50 96 84 Q 100 112 122 116 Q 140 110 150 110 Z",
};

const SPRING = { type: "spring" as const, stiffness: 300, damping: 22 };
const WING_SPRING = { type: "spring" as const, stiffness: 220, damping: 18 };
// Copertura: spring più elastico → le ali salgono con un rimbalzino carino
const COVER_SPRING = { type: "spring" as const, stiffness: 260, damping: 12 };

// ── Effetti celebrazione ────────────────────────────────────────────────
const STAR_PATH =
  "M 0 -7 C 1.2 -2.2 2.2 -1.2 7 0 C 2.2 1.2 1.2 2.2 0 7 C -1.2 2.2 -2.2 1.2 -7 0 C -2.2 -1.2 -1.2 -2.2 0 -7 Z";

const STARS = [
  { id: 0, cx: 38, cy: 56, s: 1.15, color: "#FFD45C", delay: 0.04 },
  { id: 1, cx: 162, cy: 62, s: 1.35, color: "#FFFFFF", delay: 0.16 },
  { id: 2, cx: 28, cy: 122, s: 0.9, color: "#9FE1CB", delay: 0.1 },
  { id: 3, cx: 172, cy: 120, s: 1.0, color: "#FF8FA3", delay: 0.22 },
  { id: 4, cx: 100, cy: 24, s: 1.25, color: "#FFD45C", delay: 0.3 },
  { id: 5, cx: 134, cy: 28, s: 0.85, color: "#7FD0FF", delay: 0.36 },
];

const CONFETTI = Array.from({ length: 11 }, (_, i) => {
  const angle = (i / 11) * Math.PI * 2 + 0.3;
  const dist = 58 + (i % 3) * 16;
  return {
    id: i,
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist * 0.9 - 6,
    r: 2.2 + (i % 3) * 1.1,
    color: ["#FFD45C", "#9FE1CB", "#FF8FA3", "#7FD0FF", "#FFFFFF"][i % 5],
    delay: (i % 4) * 0.04,
  };
});

export default function DoctorMascot({
  activeField = null,
  pinComplete = false,
  pinMismatch = false,
  happy = false,
  nodSignal = 0,
  size = 96,
}: Props) {
  const isPin = activeField === "pin" || activeField === "pin-confirm";
  const af = activeField ?? "idle";

  // CELEBRAZIONE: entrambi i PIN coincidono → ali su a festa, occhi felici, rimbalzo
  const celebrate = isPin && pinComplete;
  // DISPIACIUTO: i due PIN non coincidono → scopre gli occhi e fa il broncio
  const sad = isPin && pinMismatch && !pinComplete;
  // le ali coprono solo se PIN attivo, non completo e senza errore di mismatch
  const wingsCover = isPin && !pinComplete && !sad;

  // ANTICIPO: occhi spalancati per ~220ms quando il PIN si attiva
  const [anticipate, setAnticipate] = useState(false);
  useEffect(() => {
    if (isPin && !pinComplete) {
      setAnticipate(true);
      const t = setTimeout(() => setAnticipate(false), 220);
      return () => clearTimeout(t);
    }
    setAnticipate(false);
  }, [isPin, pinComplete]);

  // DUCK: quando passa da occhi scoperti → coperti fa un tuffetto timido (una volta sola)
  const [coverDuck, setCoverDuck] = useState(false);
  useEffect(() => {
    if (!wingsCover) {
      setCoverDuck(false);
      return;
    }
    setCoverDuck(true);
    const t = setTimeout(() => setCoverDuck(false), 460);
    return () => clearTimeout(t);
  }, [wingsCover]);

  // SHAKE: piccola scrollata di testa quando i PIN non coincidono (una volta sola)
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (!sad) {
      setShake(false);
      return;
    }
    setShake(true);
    const t = setTimeout(() => setShake(false), 480);
    return () => clearTimeout(t);
  }, [sad]);

  // PEEK-A-BOO: mentre copre il PIN, ogni tanto sbircia tra le ali
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!wingsCover) {
      setPeek(false);
      return;
    }
    let alive = true;
    const id = setInterval(() => {
      if (!alive) return;
      setPeek(true);
      setTimeout(() => {
        if (alive) setPeek(false);
      }, 340);
    }, 1700);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [wingsCover]);

  const wide = anticipate || peek;

  // NOD: cenno di approvazione one-shot a ogni spunta dei consensi
  const [nod, setNod] = useState(false);
  useEffect(() => {
    if (!nodSignal) return;
    setNod(true);
    const t = setTimeout(() => setNod(false), 480);
    return () => clearTimeout(t);
  }, [nodSignal]);

  // occhietti sorridenti durante festa, stato "happy" o cenno
  const happyEyes = celebrate || happy || nod;

  const browKey = happyEyes
    ? "happy"
    : sad
      ? "sad"
      : isPin
        ? "pin"
        : BROWS[af]
          ? af
          : "idle";
  // sguardo: triste → in basso; sbirciamento → in su oltre le ali
  const o = sad
    ? { x: 0, y: 7 }
    : peek
      ? { x: 0, y: -7 }
      : (LOOK[af] ?? LOOK.idle);
  const brow = BROWS[browKey];

  // posizioni pupille (occhio sx centro 78,92 — dx 122,92)
  const lP = { cx: 78 + o.x, cy: 92 + o.y };
  const rP = { cx: 122 + o.x, cy: 92 + o.y };
  const lIr = { cx: 78 + o.x * 0.45, cy: 92 + o.y * 0.45 };
  const rIr = { cx: 122 + o.x * 0.45, cy: 92 + o.y * 0.45 };

  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (isPin) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const wink = () => {
      setBlink(true);
      setTimeout(() => alive && setBlink(false), 110);
      // ogni tanto un doppio battito di ciglia per più vita
      if (Math.random() < 0.3) {
        setTimeout(() => alive && setBlink(true), 230);
        setTimeout(() => alive && setBlink(false), 320);
      }
    };
    const loop = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        wink();
        loop();
      }, 2600 + Math.random() * 2600);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [isPin]);

  return (
    <motion.div
      initial={{ scale: 0.55, opacity: 0 }}
      animate={
        celebrate
          ? { scale: [1, 1.18, 0.93, 1.07, 1], y: [0, -12, 0], opacity: 1 }
          : sad
            ? { scale: 1, y: 0, rotate: shake ? [0, -5, 5, -4, 3, 0] : 0, opacity: 1 }
            : isPin
              ? coverDuck
                ? { scale: [1, 0.92, 1.05, 1], y: [0, 6, -1, 0], opacity: 1 }
                : { scale: 1, y: 0, opacity: 1 }
              : nod
                ? { scale: [1, 1.07, 1], y: [0, 7, 0], opacity: 1 }
                : { scale: 1, y: [0, -3.5, 0], opacity: 1 }
      }
      transition={
        celebrate
          ? { duration: 0.7, ease: "easeOut" }
          : sad
            ? { duration: shake ? 0.5 : 0.2, ease: "easeOut" }
            : isPin
              ? coverDuck
                ? { duration: 0.5, ease: "easeOut" }
                : { duration: 0.25 }
              : nod
                ? { duration: 0.45, ease: "easeOut" }
                : {
                    opacity: { duration: 0.4 },
                    scale: { type: "spring", stiffness: 260, damping: 18 },
                    y: { duration: 3.4, repeat: Infinity, ease: "easeInOut" },
                  }
      }
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: celebrate ? "#9FE1CB" : "#E1F5EE",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
        transition: "background 0.3s",
        boxShadow: celebrate
          ? "0 0 0 6px rgba(159,225,203,0.45), 0 10px 30px rgba(15,110,86,0.28)"
          : "none",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        role="img"
        aria-label="Mascotte gufo Corioli Generale"
        style={{ overflow: "visible" }}
      >
        {/* anello luminoso di celebrazione */}
        {celebrate ? (
          <motion.circle
            cx="100"
            cy="108"
            r="58"
            fill="none"
            stroke="#FFD45C"
            strokeWidth="3"
            style={{ transformOrigin: "100px 108px" }}
            initial={{ opacity: 0.75, scale: 0.55 }}
            animate={{ opacity: 0, scale: 1.7 }}
            transition={{ duration: 0.85, ease: "easeOut" }}
          />
        ) : null}

        {/* corpo */}
        <ellipse cx="100" cy="118" rx="56" ry="60" fill={FEATHER} />
        {/* ciuffi */}
        <path d="M 58 70 Q 52 44 64 40 Q 70 54 70 70 Z" fill={FEATHER} />
        <path d="M 142 70 Q 148 44 136 40 Q 130 54 130 70 Z" fill={FEATHER} />
        {/* petto */}
        <ellipse cx="100" cy="126" rx="34" ry="44" fill="#F4EFE4" />

        {/* occhi */}
        {happyEyes ? (
          <>
            {/* occhi sorridenti (archi verso l'alto) */}
            <path
              d="M 66 94 Q 78 84 90 94"
              stroke="#163A33"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M 110 94 Q 122 84 134 94"
              stroke="#163A33"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            {/* guance arrossate (solo nella festa vera) */}
            {celebrate ? (
              <>
                <motion.ellipse
                  cx="64"
                  cy="104"
                  rx="9"
                  ry="6"
                  fill="#FF8FA3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.55 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                />
                <motion.ellipse
                  cx="136"
                  cy="104"
                  rx="9"
                  ry="6"
                  fill="#FF8FA3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.55 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                />
              </>
            ) : null}
          </>
        ) : (
          <motion.g
            animate={{ scaleY: blink ? 0.1 : 1 }}
            style={{ transformOrigin: "100px 92px" }}
            transition={{ duration: 0.1 }}
          >
            {/* initial={false} su pupille, sopracciglia e ali: senza, al primo
                disegno cx/cy/d valevano "undefined" (errori in console e
                occhi che saltavano al centro). */}
            {/* occhio sinistro */}
            <circle cx="78" cy="92" r="25" fill="#9FE1CB" />
            <circle cx="78" cy="92" r="19" fill="#FFFFFF" />
            <motion.circle
              r={wide ? 13 : 11}
              fill="#163A33"
              initial={false}
              animate={{ cx: lIr.cx, cy: lIr.cy }}
              transition={SPRING}
            />
            <motion.circle
              r={wide ? 6.5 : 5.5}
              fill="#000"
              initial={false}
              animate={lP}
              transition={SPRING}
            />
            <motion.circle
              r="2.4"
              fill="#fff"
              initial={false}
              animate={{ cx: lP.cx + 3, cy: lP.cy - 3 }}
              transition={SPRING}
            />

            {/* occhio destro */}
            <circle cx="122" cy="92" r="25" fill="#9FE1CB" />
            <circle cx="122" cy="92" r="19" fill="#FFFFFF" />
            <motion.circle
              r={wide ? 13 : 11}
              fill="#163A33"
              initial={false}
              animate={{ cx: rIr.cx, cy: rIr.cy }}
              transition={SPRING}
            />
            <motion.circle
              r={wide ? 6.5 : 5.5}
              fill="#000"
              initial={false}
              animate={rP}
              transition={SPRING}
            />
            <motion.circle
              r="2.4"
              fill="#fff"
              initial={false}
              animate={{ cx: rP.cx + 3, cy: rP.cy - 3 }}
              transition={SPRING}
            />
          </motion.g>
        )}

        {/* sopracciglia */}
        <motion.path
          stroke="#163A33"
          strokeWidth="3.2"
          fill="none"
          strokeLinecap="round"
          initial={false}
          animate={{ d: brow[0] }}
          transition={SPRING}
        />
        <motion.path
          stroke="#163A33"
          strokeWidth="3.2"
          fill="none"
          strokeLinecap="round"
          initial={false}
          animate={{ d: brow[1] }}
          transition={SPRING}
        />

        {/* becco */}
        <path d="M 93 104 L 100 116 L 107 104 Z" fill="#E8A020" />

        {/* zampette */}
        <path
          d="M 86 176 l -6 10 M 86 176 l 0 11 M 86 176 l 6 10"
          stroke="#E8A020"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 114 176 l -6 10 M 114 176 l 0 11 M 114 176 l 6 10"
          stroke="#E8A020"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* ALI — ULTIME, sempre sopra gli occhi. Cambiano FORMA, non ruotano.
            In celebrazione battono a festa; durante il PIN si abbassano per lo sbirciamento. */}
        <motion.g
          style={{ transformOrigin: "50px 114px" }}
          animate={
            celebrate
              ? { rotate: [0, -24, -6, -16, 0], y: 0 }
              : { rotate: 0, y: wingsCover && peek ? 18 : 0 }
          }
          transition={
            celebrate
              ? { duration: 0.7, ease: "easeOut" }
              : { type: "spring", stiffness: 240, damping: 17 }
          }
        >
          <motion.path
            fill={FEATHER}
            initial={false}
            animate={{ d: wingsCover ? WING_COVER.l : WING_REST.l }}
            transition={wingsCover ? COVER_SPRING : WING_SPRING}
          />
        </motion.g>
        <motion.g
          style={{ transformOrigin: "150px 114px" }}
          animate={
            celebrate
              ? { rotate: [0, 24, 6, 16, 0], y: 0 }
              : { rotate: 0, y: wingsCover && peek ? 18 : 0 }
          }
          transition={
            celebrate
              ? { duration: 0.7, ease: "easeOut" }
              : { type: "spring", stiffness: 240, damping: 17 }
          }
        >
          <motion.path
            fill={FEATHER}
            initial={false}
            animate={{ d: wingsCover ? WING_COVER.r : WING_REST.r }}
            transition={wingsCover ? COVER_SPRING : WING_SPRING}
          />
        </motion.g>

        {/* CELEBRAZIONE: stelline scintillanti + coriandoli che esplodono */}
        {celebrate ? (
          <>
            {STARS.map((st) => (
              <motion.g
                key={`star-${st.id}`}
                style={{ transformOrigin: `${st.cx}px ${st.cy}px` }}
                initial={{ opacity: 0, scale: 0, rotate: -40 }}
                animate={{
                  opacity: [0, 1, 0.85, 0],
                  scale: [0, st.s, st.s * 0.9, 0],
                  rotate: [-40, 0, 25],
                }}
                transition={{ duration: 1.1, delay: st.delay, ease: "easeOut" }}
              >
                <path
                  d={STAR_PATH}
                  fill={st.color}
                  transform={`translate(${st.cx} ${st.cy})`}
                />
              </motion.g>
            ))}
            {CONFETTI.map((c) => (
              <motion.circle
                key={`conf-${c.id}`}
                r={c.r}
                fill={c.color}
                initial={{ cx: 100, cy: 106, opacity: 0, scale: 0 }}
                animate={{
                  cx: 100 + c.x,
                  cy: 106 + c.y,
                  opacity: [0, 1, 1, 0],
                  scale: [0, 1, 1, 0.4],
                }}
                transition={{ duration: 0.9, delay: c.delay, ease: "easeOut" }}
              />
            ))}
          </>
        ) : null}
      </svg>
    </motion.div>
  );
}
