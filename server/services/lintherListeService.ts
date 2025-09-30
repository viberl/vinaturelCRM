import "../env";
import axios, { AxiosError } from "axios";
import type { LintherListeResponse, LintherListeRow } from "@shared/types/linther-liste";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const lintherListeShareUrl = process.env.LINTHER_LISTE_SHARE_URL;

if (!lintherListeShareUrl) {
  throw new Error("LINTHER_LISTE_SHARE_URL must be configured in the environment.");
}

const REQUIRED_COLUMNS: Array<{ key: keyof LintherListeRow; label: string }> = [
  { key: "palNr", label: "Pal Nr" },
  { key: "weinbezeichnung", label: "Weinbezeichnung mit Jahrgang" },
  { key: "artikelnr", label: "Artikelnr" },
  { key: "bemerkung", label: "Bemerkung" },
  { key: "lagerort", label: "Lagerort" }
];

function encodeShareId(url: string) {
  const base64 = Buffer.from(url, "utf8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const shareId = encodeShareId(lintherListeShareUrl);

type ColumnEntry = { displayName: string; key: keyof LintherListeRow; index: number };

type WorkbookMetadata = {
  driveId: string;
  itemId: string;
  tableId: string;
  columnOrder: ColumnEntry[];
};

export class GraphApiError extends Error {
  statusCode?: number;
  code?: string;
  isAuthError: boolean;

  constructor(message: string, options?: { statusCode?: number; code?: string }) {
    super(message);
    this.name = "GraphApiError";
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.isAuthError = Boolean(
      this.statusCode && [401, 403].includes(this.statusCode) ||
      this.code && ["InvalidAuthenticationToken", "InvalidGrant", "TokenNotFound"].includes(this.code)
    );
  }
}

let cachedWorkbookMetadata: WorkbookMetadata | null = null;

function extractGraphError(error: AxiosError): GraphApiError {
  const status = error.response?.status;
  let code: string | undefined;
  let message = error.message;

  const data = error.response?.data;
  if (data && typeof data === "object") {
    const graphError = (data as any).error;
    if (graphError) {
      if (typeof graphError.code === "string") {
        code = graphError.code;
      }
      if (typeof graphError.message === "string") {
        message = graphError.message;
      }
    }
  }

  return new GraphApiError(message, { statusCode: status, code });
}

async function graphGet<T>(path: string, accessToken: string) {
  try {
    const response = await axios.get<T>(`${GRAPH_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw extractGraphError(error);
    }
    throw error;
  }
}

async function graphPost<T>(path: string, body: unknown, accessToken: string) {
  try {
    const response = await axios.post<T>(`${GRAPH_BASE_URL}${path}`, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw extractGraphError(error);
    }
    throw error;
  }
}

async function resolveWorkbookLocation(accessToken: string): Promise<{ driveId: string; itemId: string }> {
  if (cachedWorkbookMetadata) {
    return { driveId: cachedWorkbookMetadata.driveId, itemId: cachedWorkbookMetadata.itemId };
  }

  const driveItemResponse: any = await graphGet(`/shares/${shareId}/driveItem?$select=id,parentReference`, accessToken);
  const driveId = driveItemResponse?.parentReference?.driveId;
  const itemId = driveItemResponse?.id;

  if (!driveId || !itemId) {
    throw new Error("Der Speicherort der Linther Liste konnte nicht ermittelt werden.");
  }

  return { driveId: String(driveId), itemId: String(itemId) };
}

async function ensureWorkbookMetadata(accessToken: string): Promise<WorkbookMetadata> {
  if (cachedWorkbookMetadata) {
    return cachedWorkbookMetadata;
  }

  const { driveId, itemId } = await resolveWorkbookLocation(accessToken);

  const tablesResponse: any = await graphGet(`/drives/${driveId}/items/${itemId}/workbook/tables`, accessToken);
  const tables: Array<{ id: string; name: string }> = tablesResponse.value ?? [];
  if (tables.length === 0) {
    throw new Error("Keine Tabellen im Linther-Liste-Workbook gefunden.");
  }

  const table = tables[0];
  const columnsResponse: any = await graphGet(
    `/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(table.id)}/columns`,
    accessToken
  );
  const columns: Array<{ name: string; index?: number }> = columnsResponse.value ?? [];

  const columnOrder: ColumnEntry[] = REQUIRED_COLUMNS.map((entry) => {
    const index = columns.findIndex((column) => (column.name ?? "").trim() === entry.label);
    if (index === -1) {
      throw new Error(`Erforderliche Spalte "${entry.label}" wurde im Workbook nicht gefunden.`);
    }
    return { displayName: entry.label, key: entry.key, index };
  });

  cachedWorkbookMetadata = {
    driveId,
    itemId,
    tableId: table.id,
    columnOrder
  };

  return cachedWorkbookMetadata;
}

function mapRow(values: unknown[], columnOrder: Array<{ key: keyof LintherListeRow; index: number }>, rowIndex: number): LintherListeRow {
  const result: LintherListeRow = {
    id: String(rowIndex),
    palNr: "",
    weinbezeichnung: "",
    artikelnr: "",
    bemerkung: "",
    lagerort: ""
  };

  for (const column of columnOrder) {
    const raw = values[column.index];
    (result as Record<keyof LintherListeRow, string>)[column.key] = raw == null ? "" : String(raw);
  }

  return result;
}

export async function getLintherListe(accessToken: string): Promise<LintherListeResponse> {
  const { driveId, itemId, tableId, columnOrder } = await ensureWorkbookMetadata(accessToken);
  const rowsResponse: any = await graphGet(
    `/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(tableId)}/rows`,
    accessToken
  );
  const rows: Array<{ index: number; values: unknown[][] }> = rowsResponse.value ?? [];

  const mappedRows = rows
    .map((row) => {
      const firstRow = Array.isArray(row.values) ? row.values[0] ?? [] : [];
      return mapRow(firstRow, columnOrder, row.index ?? 0);
    })
    .filter((row) => Object.values(row).some((value) => value && value.trim() !== ""));

  return {
    columns: columnOrder.map((entry) => entry.displayName),
    rows: mappedRows
  };
}

export async function addLintherListeRow(input: Partial<LintherListeRow>, accessToken: string) {
  const { driveId, itemId, tableId, columnOrder } = await ensureWorkbookMetadata(accessToken);
  const values = columnOrder.map((column) => (input[column.key] ?? "") as string);

  const response: any = await graphPost(
    `/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(tableId)}/rows/add`,
    {
      values: [values]
    },
    accessToken
  );

  const addedRow = response?.rows?.[0];
  const addedValues = Array.isArray(addedRow?.values) ? addedRow.values[0] ?? [] : [];
  const index = typeof addedRow?.index === "number" ? addedRow.index : 0;
  return mapRow(addedValues, columnOrder, index);
}
