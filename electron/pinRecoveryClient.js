import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedEnv = null;

function loadBuildEnv() {
  if (cachedEnv) return cachedEnv;
  const out = { apiUrl: null, clientSecret: null };
  const candidates = [
    path.join(__dirname, "../.env"),
    path.join(process.cwd(), ".env"),
  ];
  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const text = fs.readFileSync(envPath, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (key === "VITE_API_URL") out.apiUrl = value.replace(/\/$/, "");
        if (key === "VITE_CLIENT_API_SECRET") out.clientSecret = value;
      }
      break;
    } catch {
      // try next path
    }
  }
  cachedEnv = out;
  return out;
}

/**
 * Verifica col server il codice mandato all'email del profilo (rotta
 * /email-verification/verify). Fatta dal processo principale, così il reset
 * della password non si può fingere chiamando l'IPC dalla pagina.
 */
export async function verifyEmailCode(clientId, email, otp, ticket) {
  const { apiUrl, clientSecret } = loadBuildEnv();
  if (!apiUrl || !clientSecret) {
    return { ok: false, error: "API cloud non configurata nell'app." };
  }
  try {
    const res = await fetch(`${apiUrl}/email-verification/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clientSecret}`,
      },
      body: JSON.stringify({
        id: String(clientId),
        email: String(email ?? "").trim().toLowerCase(),
        otp: String(otp ?? "").replace(/\D/g, ""),
        ticket: String(ticket ?? ""),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.verified !== true) {
      return { ok: false, error: data?.error || "Codice non valido." };
    }
    return { ok: true, email: data.email, proof: data.proof };
  } catch (err) {
    return { ok: false, error: err?.message || "Errore di connessione al server." };
  }
}

export async function consumePinRecoveryGrant(clientId, grant) {
  const { apiUrl, clientSecret } = loadBuildEnv();
  if (!apiUrl || !clientSecret) {
    return {
      ok: false,
      error:
        "API cloud non configurata nell'app. Impossibile completare il recupero online.",
    };
  }

  try {
    const res = await fetch(`${apiUrl}/pin-recovery/consume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clientSecret}`,
      },
      body: JSON.stringify({ id: String(clientId), grant: String(grant) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || "Autorizzazione di recupero non valida.",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Errore di connessione al server.",
    };
  }
}
