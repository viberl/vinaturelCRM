export interface LintherListeRow {
  id: string;
  palNr: string;
  weinbezeichnung: string;
  artikelnr: string;
  bemerkung: string;
  lagerort: string;
}

export interface LintherListeResponse {
  columns: string[];
  rows: LintherListeRow[];
}

export interface LintherListeCreateRequest {
  palNr?: string;
  weinbezeichnung?: string;
  artikelnr?: string;
  bemerkung?: string;
  lagerort?: string;
}
