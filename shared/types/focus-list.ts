export interface FocusWineListUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  displayName: string;
}

export interface FocusWineListResponse {
  articleNumbers: string[];
  count: number;
  fileName: string | null;
  uploadedAt: string | null;
  uploadedBy: FocusWineListUser | null;
}
