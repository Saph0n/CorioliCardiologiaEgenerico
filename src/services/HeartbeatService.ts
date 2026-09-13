import axios from "axios";
import { Doctor } from "../types/Storage";
import { PatientService, VisitService } from "./OfflineServices";

interface HeartbeatResult {
  blocked: boolean | null;
  reason: string | null;
}

const getAppVersion = async (): Promise<string> => {
  const electronApi = (window as unknown as {
    electronAPI?: {
      getAppVersion?: () => Promise<string>;
    };
  }).electronAPI;

  if (electronApi?.getAppVersion) {
    try {
      return await electronApi.getAppVersion();
    } catch {
      // fallback below
    }
  }

  return import.meta.env.VITE_APP_VERSION || "unknown";
};

/**
 * Telemetria di licenza verso la dashboard.
 * `app: "corioli-cardiologia"` → BE `tipo: "cardiologia"`.
 */
export const sendHeartbeat = async (
  doctor: Doctor,
  app: "corioli-cardiologia",
): Promise<HeartbeatResult> => {
  try {
    const [patients, visits, version] = await Promise.all([
      PatientService.getAllPatients(),
      VisitService.getAllVisits(),
      getAppVersion(),
    ]);

    const isOnline = navigator.onLine;
    const activeUsers = isOnline ? 1 : 0;
    const offlineUsers = isOnline ? 0 : 1;

    const result = await axios.post(`${import.meta.env.VITE_API_URL}/heartbeat`, {
      id: doctor.id,
      nome: doctor.nome,
      cognome: doctor.cognome,
      email: doctor.email,
      numero_telefono: doctor.telefono,
      specializzazione: doctor.specializzazione,
      tipo: "cardiologia",
      app,
      version,
      activeUsers,
      offlineUsers,
      patients: patients.length,
      visits: visits.length,
    });

    return {
      blocked: Boolean(result.data?.blocked),
      reason: typeof result.data?.reason === "string" ? result.data.reason : null,
    };
  } catch (e) {
    console.error("sendHeartbeat:", e);
    return { blocked: null, reason: null };
  }
};
