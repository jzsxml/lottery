import type Database from "better-sqlite3";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { appendAuditLog } from "../lib/audit.js";

export type ImportRow = {
  emp_no: string;
  name: string;
  department?: string;
};

const HEADER_MAP: Record<string, keyof ImportRow> = {
  工号: "emp_no",
  emp_no: "emp_no",
  empno: "emp_no",
  姓名: "name",
  name: "name",
  部门: "department",
  department: "department",
  dept: "department",
};

function normalizeHeaders(row: Record<string, unknown>): ImportRow | null {
  const out: Partial<ImportRow> = {};
  for (const [key, value] of Object.entries(row)) {
    const norm = key.trim().toLowerCase();
    const mapped =
      HEADER_MAP[key.trim()] ??
      HEADER_MAP[norm] ??
      (norm === "emp_no" || norm === "name" || norm === "department"
        ? (norm as keyof ImportRow)
        : undefined);
    if (mapped && value != null && String(value).trim() !== "") {
      out[mapped] = String(value).trim();
    }
  }
  if (!out.emp_no || !out.name) return null;
  return {
    emp_no: out.emp_no,
    name: out.name,
    department: out.department ?? "",
  };
}

export function parseCsv(buffer: Buffer): ImportRow[] {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const rows: ImportRow[] = [];
  for (const row of parsed.data) {
    const n = normalizeHeaders(row);
    if (n) rows.push(n);
  }
  return rows;
}

export function parseExcel(buffer: Buffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const rows: ImportRow[] = [];
  for (const row of json) {
    const n = normalizeHeaders(row);
    if (n) rows.push(n);
  }
  return rows;
}

export type ImportSummary = {
  inserted: number;
  updated: number;
  skippedDuplicatesInFile: number;
  total: number;
};

export function importParticipants(
  db: Database.Database,
  eventId: number,
  rows: ImportRow[]
): ImportSummary {
  const seen = new Set<string>();
  let skippedDuplicatesInFile = 0;
  const deduped: ImportRow[] = [];
  for (const r of rows) {
    const key = r.emp_no;
    if (seen.has(key)) {
      skippedDuplicatesInFile++;
      continue;
    }
    seen.add(key);
    deduped.push(r);
  }

  const upsert = db.prepare(
    `INSERT INTO participants (event_id, emp_no, name, department, status)
     VALUES (?, ?, ?, ?, 'active')
     ON CONFLICT(event_id, emp_no) DO UPDATE SET
       name = excluded.name,
       department = excluded.department,
       status = 'active'`
  );

  let inserted = 0;
  let updated = 0;

  const tx = db.transaction(() => {
    for (const r of deduped) {
      const before = db
        .prepare("SELECT id FROM participants WHERE event_id = ? AND emp_no = ?")
        .get(eventId, r.emp_no);
      upsert.run(eventId, r.emp_no, r.name, r.department ?? "");
      if (before) updated++;
      else inserted++;
    }
    appendAuditLog(db, eventId, "participants.import", "event", eventId, {
      inserted,
      updated,
      skippedDuplicatesInFile,
      total: deduped.length,
    });
  });

  tx();

  return {
    inserted,
    updated,
    skippedDuplicatesInFile,
    total: deduped.length,
  };
}