import { PatientService, VisitService } from "./OfflineServices";
import { todayIsoDate } from "../utils/dateUtils";

interface ImportResult {
  patientsImported: number;
  patientsUpdated: number;
  patientsSkipped: number;
  visitsImported: number;
  visitsSkipped: number;
  notesImported: number;
}

export interface DoctorlibImportResult {
  patientsImported: number;
  patientsUpdated: number;
  patientsSkipped: number;
}

type CsvRow = Record<string, string>;

function importDevLog(message: string): void {
  if (import.meta.env.DEV) {
    console.warn(`[Import CSV] ${message}`);
  }
}

interface PendingClinicalNote {
  patientId: string;
  dataVisita: string;
  note: string;
}

function normalizeHeader(header: string): string {
  return header.replace(/\uFEFF/g, "").trim().toLowerCase();
}

function cleanValue(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/\u0000/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "");
}

function safeLower(value: string): string {
  return value.trim().toLowerCase();
}

function parseDateLike(value: string): string {
  const cleaned = cleanValue(value);
  if (!cleaned) return "";

  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    return "";
  }

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = String(Number(slashMatch[1])).padStart(2, "0");
    const month = String(Number(slashMatch[2])).padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return "";
}

function parseDateTimeForVisit(value: string): string {
  const cleaned = cleanValue(value);
  if (!cleaned) return "";

  const datePart = cleaned.split(" ")[0];
  return parseDateLike(datePart);
}

/**
 * Sesso dalla colonna del CSV: `undefined` quando la colonna non lo dice.
 *
 * Indovinarlo e' peggio che non averlo — finiva in anagrafica come un dato
 * raccolto, si stampava nel referto ed entrava nei calcoli che dipendono dal
 * sesso, che ora invece si fermano dicendo che manca.
 */
function parseGender(value: string): "M" | "F" | undefined {
  const normalized = safeLower(cleanValue(value));
  if (normalized.startsWith("m") || normalized.startsWith("male")) return "M";
  if (normalized.startsWith("f") || normalized.startsWith("female")) return "F";
  return undefined;
}

function normalizePhone(value: string): string {
  const cleaned = cleanValue(value);
  if (!cleaned) return "";
  const hasPlus = cleaned.trim().startsWith("+");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

function normalizeEmail(value: string): string {
  return safeLower(cleanValue(value));
}

function extractCodiceFiscale(...values: string[]): string {
  const cfRegex = /[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]/i;
  for (const v of values) {
    const cleaned = cleanValue(v).toUpperCase();
    const match = cleaned.match(cfRegex);
    if (match?.[0]) return match[0].toUpperCase();
  }
  return "";
}

function composeIdentityKey(nome: string, cognome: string, dataNascita: string): string {
  return `${safeLower(nome)}::${safeLower(cognome)}::${dataNascita}`;
}

function buildAddress(row: CsvRow): string | undefined {
  const street = cleanValue(row["address street"]);
  const number = cleanValue(row["address number"]);
  const city = cleanValue(row["address city"]);
  const state = cleanValue(row["address state"]);

  const streetLine = [street, number].filter(Boolean).join(" ").trim();
  const cityLine = [city, state].filter(Boolean).join(" ").trim();
  const full = [streetLine, cityLine].filter(Boolean).join(", ").trim();
  return full || undefined;
}

function buildClinicalNote(row: CsvRow): string {
  const observations = cleanValue(row["observations"]);
  const precedents = cleanValue(row["precedents"]);
  const medications = cleanValue(row["medications"]);
  const allergies = cleanValue(row["allergies"]);
  const otherInfo = cleanValue(row["other information"]);

  const parts: string[] = [];
  if (observations) parts.push(`Osservazioni: ${observations}`);
  if (precedents) parts.push(`Pregressi: ${precedents}`);
  if (medications) parts.push(`Farmaci: ${medications}`);
  if (allergies) parts.push(`Allergie: ${allergies}`);
  if (otherInfo) parts.push(`Altre info: ${otherInfo}`);

  return parts.join("\n").trim();
}

function normalizeAppointmentStatus(value: string): string {
  return safeLower(cleanValue(value));
}

function shouldSkipAppointmentStatus(status: string): boolean {
  return status.startsWith("canceled");
}

function mapStatusToConclusion(status: string): string {
  if (status === "scheduled") return "Appuntamento pianificato";
  if (status === "confirmedbypatient") return "Appuntamento confermato dalla paziente";
  if (status === "confirmedbyadmin") return "Appuntamento confermato dalla segreteria";
  if (status === "waitingforconfirmation") return "In attesa di conferma";
  if (!status) return "Importato da agenda";
  return `Stato agenda: ${status}`;
}

function parseCsvSemicolon(content: string): CsvRow[] {
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = i + 1 < text.length ? text[i + 1] : "";

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ";") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((field) => field.trim() !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((field) => field.trim() !== "")) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => normalizeHeader(cleanValue(header)));
  const dataRows = rows.slice(1);

  return dataRows.map((row) => {
    const obj: CsvRow = {};
    headers.forEach((header, idx) => {
      obj[header] = cleanValue(row[idx] ?? "");
    });
    return obj;
  });
}

async function decodeFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const hasUtf16LeBom = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const hasUtf16BeBom = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;

  try {
    if (hasUtf16LeBom) return new TextDecoder("utf-16le").decode(buffer);
    if (hasUtf16BeBom) {
      try {
        return new TextDecoder("utf-16be").decode(buffer);
      } catch {
        return new TextDecoder("utf-16le").decode(buffer);
      }
    }
    return new TextDecoder("utf-8").decode(buffer);
  } catch {
    return new TextDecoder("utf-16le").decode(buffer);
  }
}

function composeVisitKey(patientId: string, date: string, description: string): string {
  return `${patientId}::${date}::${description.trim().toLowerCase()}`;
}

export type CsvImportProgress = { phase: string; current: number; total: number };

export class CsvImportService {
  static async importPatientsAndAppointments(
    patientsFile: File,
    appointmentsFile: File,
    onProgress?: (p: CsvImportProgress) => void
  ): Promise<ImportResult> {
    const result: ImportResult = {
      patientsImported: 0,
      patientsUpdated: 0,
      patientsSkipped: 0,
      visitsImported: 0,
      visitsSkipped: 0,
      notesImported: 0,
    };

    const [patientsText, appointmentsText, existingVisits] = await Promise.all([
      decodeFileText(patientsFile),
      decodeFileText(appointmentsFile),
      VisitService.getAllVisits(),
    ]);

    const existingVisitKeys = new Set(
      existingVisits.map((v) => composeVisitKey(v.patientId, v.dataVisita, v.descrizioneClinica))
    );

    const patientRows = parseCsvSemicolon(patientsText);
    const appointmentRows = parseCsvSemicolon(appointmentsText);

    const totalPatients = patientRows.length;
    const sourceIdToInternalPatientId = new Map<string, string>();
    const pendingClinicalNotes: PendingClinicalNote[] = [];

    const existingPatients = await PatientService.getAllPatients();
    type PatientType = Awaited<ReturnType<typeof PatientService.getAllPatients>>[number];
    const byCf = new Map<string, PatientType>();
    const byIdentity = new Map<string, PatientType>();
    for (const p of existingPatients) {
      if (p.codiceFiscale) byCf.set(String(p.codiceFiscale).trim().toUpperCase(), p);
      byIdentity.set(composeIdentityKey(p.nome || "", p.cognome || "", p.dataNascita || ""), p);
    }

    if (onProgress) onProgress({ phase: 'Pazienti', current: 0, total: Math.max(1, totalPatients) });

    for (let patientRowIndex = 0; patientRowIndex < patientRows.length; patientRowIndex += 1) {
      if (onProgress) onProgress({ phase: 'Pazienti', current: patientRowIndex + 1, total: Math.max(1, totalPatients) });
      const row = patientRows[patientRowIndex];
      const rowNum = patientRowIndex + 1;
      const sourceId = cleanValue(row["id"]);
      const nome = cleanValue(row["first name"]);
      const cognome = cleanValue(row["last name"]);
      const email = cleanValue(row["email"]);
      const telefono = cleanValue(row["phone"] || row["additional phone"] || row["number"]);
      const dataNascita = parseDateLike(row["date of birth"]);
      const luogoNascita = cleanValue(row["born city"] || row["address city"]);
      const sesso = parseGender(row["gender"]);
      const indirizzo = buildAddress(row);
      const clinicalNote = buildClinicalNote(row);
      const cfFromRow = cleanValue(row["codice fiscale"] || row["codicefiscale"] || row["cf"]);

      const hasUsefulData = Boolean(sourceId || nome || cognome || email || telefono);
      if (!hasUsefulData) {
        result.patientsSkipped += 1;
        importDevLog(`Paziente riga ${rowNum} saltato: nessun dato utile.`);
        continue;
      }

      const codiceFiscale = cfFromRow ? cfFromRow.trim().toUpperCase() : undefined;
      const identityKey = composeIdentityKey(nome, cognome, dataNascita || "");
      const existing =
        (codiceFiscale ? byCf.get(codiceFiscale) : null) ??
        (identityKey !== "::" ? byIdentity.get(identityKey) : null) ?? null;

      if (existing) {
        sourceIdToInternalPatientId.set(sourceId, existing.id);
        const needsUpdate =
          (!existing.email && email) ||
          (!existing.telefono && telefono) ||
          (!existing.indirizzo && indirizzo) ||
          (!existing.dataNascita && dataNascita) ||
          (codiceFiscale && !existing.codiceFiscale);

        if (needsUpdate) {
          const updatePayload: Parameters<typeof PatientService.updatePatient>[1] = {
            email: existing.email || email || undefined,
            telefono: existing.telefono || telefono || undefined,
            indirizzo: existing.indirizzo || indirizzo,
            dataNascita: existing.dataNascita || dataNascita || "",
          };
          if (codiceFiscale && !existing.codiceFiscale) {
            updatePayload.codiceFiscale = codiceFiscale;
            updatePayload.codiceFiscaleGenerato = false;
          }
          const updated = await PatientService.updatePatient(existing.id, updatePayload);
          if (updated.codiceFiscale) byCf.set(updated.codiceFiscale.trim().toUpperCase(), updated);
          byIdentity.set(composeIdentityKey(updated.nome || "", updated.cognome || "", updated.dataNascita || ""), updated);
          result.patientsUpdated += 1;
        } else {
          result.patientsSkipped += 1;
          importDevLog(`Paziente riga ${rowNum} saltato: già presente, nessun aggiornamento.`);
        }
      } else {
        const newPatient = await PatientService.addPatient({
          ...(codiceFiscale ? { codiceFiscale, codiceFiscaleGenerato: false } : {}),
          nome: nome || "Sconosciuto",
          cognome: cognome || "Sconosciuto",
          dataNascita: dataNascita || "",
          luogoNascita: luogoNascita || "",
          sesso,
          email: email || undefined,
          telefono: telefono || undefined,
          indirizzo,
        });

        sourceIdToInternalPatientId.set(sourceId, newPatient.id);
        if (newPatient.codiceFiscale) byCf.set(newPatient.codiceFiscale.trim().toUpperCase(), newPatient);
        byIdentity.set(composeIdentityKey(newPatient.nome || "", newPatient.cognome || "", newPatient.dataNascita || ""), newPatient);
        result.patientsImported += 1;

        if (clinicalNote) {
          pendingClinicalNotes.push({
            patientId: newPatient.id,
            dataVisita: dataNascita || todayIsoDate(),
            note: clinicalNote,
          });
        }
      }
    }


    const totalNotes = pendingClinicalNotes.length;
    if (totalNotes > 0 && onProgress) onProgress({ phase: 'Note cliniche', current: 0, total: totalNotes });
    let notesDone = 0;
    for (const note of pendingClinicalNotes) {
      if (onProgress) onProgress({ phase: 'Note cliniche', current: ++notesDone, total: totalNotes });
      const description = "Anamnesi iniziale importata da storico paziente";
      const key = composeVisitKey(note.patientId, note.dataVisita, description);
      if (existingVisitKeys.has(key)) {
        continue;
      }

      await VisitService.addVisit({
        patientId: note.patientId,
        dataVisita: note.dataVisita,
        descrizioneClinica: description,
        anamnesi: note.note,
        esamiObiettivo: "",
        conclusioniDiagnostiche: "Dati storici importati",
        terapie: "",
        tipo: "generale",
      });

      existingVisitKeys.add(key);
      result.notesImported += 1;
    }

    const totalVisits = appointmentRows.length;
    if (onProgress) onProgress({ phase: 'Visite', current: 0, total: Math.max(1, totalVisits) });
    for (let visitRowIndex = 0; visitRowIndex < appointmentRows.length; visitRowIndex += 1) {
      if (onProgress) onProgress({ phase: 'Visite', current: visitRowIndex + 1, total: Math.max(1, totalVisits) });
      const row = appointmentRows[visitRowIndex];
      const visitRowNum = visitRowIndex + 1;
      const externalPatientId = cleanValue(row["patientid"]);
      const internalPatientId = sourceIdToInternalPatientId.get(externalPatientId);
      if (!internalPatientId) {
        result.visitsSkipped += 1;
        importDevLog(`Appuntamento riga ${visitRowNum} saltato: patientId esterno non mappato.`);
        continue;
      }

      const status = normalizeAppointmentStatus(row["appointment status"]);
      if (shouldSkipAppointmentStatus(status)) {
        result.visitsSkipped += 1;
        importDevLog(`Appuntamento riga ${visitRowNum} saltato: stato cancellato.`);
        continue;
      }

      const date = parseDateTimeForVisit(row["start time"]);
      if (!date) {
        result.visitsSkipped += 1;
        importDevLog(`Appuntamento riga ${visitRowNum} saltato: data non valida.`);
        continue;
      }

      const agenda = cleanValue(row["agenda"]);
      const service = cleanValue(row["service"]) || "Visita";
      const comments = cleanValue(row["comments"]);

      const description = agenda ? `${service} (${agenda})` : service;
      const key = composeVisitKey(internalPatientId, date, description);
      if (existingVisitKeys.has(key)) {
        result.visitsSkipped += 1;
        importDevLog(`Appuntamento riga ${visitRowNum} saltato: visita duplicata.`);
        continue;
      }

      await VisitService.addVisit({
        patientId: internalPatientId,
        dataVisita: date,
        descrizioneClinica: description,
        anamnesi: comments || "",
        esamiObiettivo: "",
        conclusioniDiagnostiche: mapStatusToConclusion(status),
        terapie: "",
        tipo: "generale",
      });

      existingVisitKeys.add(key);
      result.visitsImported += 1;
    }

    return result;
  }

  static async importDoctorlibPatients(
    csvFile: File,
    onProgress?: (p: CsvImportProgress) => void
  ): Promise<DoctorlibImportResult> {
    const result: DoctorlibImportResult = {
      patientsImported: 0,
      patientsUpdated: 0,
      patientsSkipped: 0,
    };

    const [csvText, existingPatients] = await Promise.all([
      decodeFileText(csvFile),
      PatientService.getAllPatients(),
    ]);

    const rows = parseCsvSemicolon(csvText);
    const totalRows = rows.length;
    if (onProgress) onProgress({ phase: 'Pazienti Doctorlib', current: 0, total: Math.max(1, totalRows) });

    const byCf = new Map<string, (typeof existingPatients)[number]>();
    const byIdentity = new Map<string, (typeof existingPatients)[number]>();
    const byEmail = new Map<string, (typeof existingPatients)[number]>();
    const byPhone = new Map<string, (typeof existingPatients)[number]>();

    for (const p of existingPatients) {
      if (p.codiceFiscale) byCf.set(p.codiceFiscale.toUpperCase(), p);
      byIdentity.set(composeIdentityKey(p.nome, p.cognome, p.dataNascita || ""), p);
      if (p.email) byEmail.set(normalizeEmail(p.email), p);
      if (p.telefono) byPhone.set(normalizePhone(p.telefono), p);
    }

    for (let docRowIndex = 0; docRowIndex < rows.length; docRowIndex += 1) {
      if (onProgress) onProgress({ phase: 'Pazienti Doctorlib', current: docRowIndex + 1, total: Math.max(1, totalRows) });
      const row = rows[docRowIndex];
      const docRowNum = docRowIndex + 1;
      const sourceId = cleanValue(row["id"] || row["import_identifier"]);
      const nome = cleanValue(row["first_name"] || row["first name"] || row["name"]);
      const cognome = cleanValue(row["last_name"] || row["last name"] || row["surname"]);
      const dataNascita = parseDateLike(row["birthdate"] || row["date of birth"]);
      const email = cleanValue(row["email"]);
      const telefono = normalizePhone(row["phone_number"] || row["phone"] || row["secondary_phone_number"]);
      const indirizzo = cleanValue(row["address"]);
      const cap = cleanValue(row["zipcode"]);
      const citta = cleanValue(row["city"]);
      const luogoNascita = citta || cleanValue(row["birthplace"] || row["born city"]);
      const sesso = parseGender(row["gender"]);
      const notes = cleanValue(row["notes"]);
      const encryptedIdentifier = cleanValue(row["server_encrypted_identifier"]);

      const hasUsefulData = Boolean(nome || cognome || email || telefono || dataNascita || sourceId);
      if (!hasUsefulData) {
        result.patientsSkipped += 1;
        importDevLog(`[Doctorlib] Paziente riga ${docRowNum} saltato: nessun dato utile.`);
        continue;
      }

      const extractedCf = extractCodiceFiscale(notes, encryptedIdentifier);
      const codiceFiscale = extractedCf ? extractedCf.toUpperCase() : undefined;

      const identityKey = composeIdentityKey(nome, cognome, dataNascita || "");
      const fullAddress = [indirizzo, [cap, citta].filter(Boolean).join(" ")].filter(Boolean).join(", ").trim();
      const normalizedEmail = normalizeEmail(email);

      let existing =
        (codiceFiscale ? byCf.get(codiceFiscale) : undefined) ||
        (identityKey !== "::" ? byIdentity.get(identityKey) : undefined) ||
        (normalizedEmail ? byEmail.get(normalizedEmail) : undefined) ||
        (telefono ? byPhone.get(telefono) : undefined);

      if (existing) {
        const sameIdentity =
          Boolean(dataNascita) &&
          existing.dataNascita === dataNascita &&
          safeLower(existing.nome) === safeLower(nome) &&
          safeLower(existing.cognome) === safeLower(cognome);
        const sameEmail =
          Boolean(normalizedEmail) &&
          Boolean(existing.email) &&
          normalizeEmail(existing.email || "") === normalizedEmail;
        const samePhone =
          Boolean(telefono) &&
          Boolean(existing.telefono) &&
          normalizePhone(existing.telefono || "") === telefono;

        const existingCf = existing.codiceFiscale ? existing.codiceFiscale.toUpperCase() : '';
        const shouldReplaceCf =
          Boolean(codiceFiscale) &&
          existingCf !== codiceFiscale &&
          (sameIdentity || sameEmail || samePhone);

        const updatePayload: Record<string, any> = {};
        if (shouldReplaceCf && codiceFiscale && existingCf !== codiceFiscale) {
          updatePayload.codiceFiscale = codiceFiscale;
          updatePayload.codiceFiscaleGenerato = false;
        }
        if (codiceFiscale && existingCf === codiceFiscale && existing.codiceFiscaleGenerato) {
          updatePayload.codiceFiscaleGenerato = false;
        }
        if ((!existing.nome || existing.nome === "Sconosciuto") && nome) updatePayload.nome = nome;
        if ((!existing.cognome || existing.cognome === "Sconosciuto") && cognome) updatePayload.cognome = cognome;
        if (!existing.dataNascita && dataNascita) updatePayload.dataNascita = dataNascita;
        if (!existing.luogoNascita && luogoNascita) updatePayload.luogoNascita = luogoNascita;
        if (!existing.email && normalizedEmail) updatePayload.email = normalizedEmail;
        if (!existing.telefono && telefono) updatePayload.telefono = telefono;
        if (!existing.indirizzo && fullAddress) updatePayload.indirizzo = fullAddress;

        if (Object.keys(updatePayload).length > 0) {
          const updated = await PatientService.updatePatient(existing.id, updatePayload);
          existing = updated;
          result.patientsUpdated += 1;
        } else {
          result.patientsSkipped += 1;
          importDevLog(`[Doctorlib] Paziente riga ${docRowNum} saltato: già presente.`);
        }
      } else {
        const created = await PatientService.addPatient({
          ...(codiceFiscale ? { codiceFiscale, codiceFiscaleGenerato: false } : {}),
          nome: nome || "Sconosciuto",
          cognome: cognome || "Sconosciuto",
          dataNascita: dataNascita || "",
          luogoNascita: luogoNascita || "",
          sesso,
          email: normalizedEmail || undefined,
          telefono: telefono || undefined,
          indirizzo: fullAddress || undefined,
        });
        existing = created;
        result.patientsImported += 1;
      }

      if (existing) {
        if (existing.codiceFiscale) byCf.set(existing.codiceFiscale.toUpperCase(), existing);
        byIdentity.set(composeIdentityKey(existing.nome, existing.cognome, existing.dataNascita || ""), existing);
        if (existing.email) byEmail.set(normalizeEmail(existing.email), existing);
        if (existing.telefono) byPhone.set(normalizePhone(existing.telefono), existing);
      }
    }

    return result;
  }
}
