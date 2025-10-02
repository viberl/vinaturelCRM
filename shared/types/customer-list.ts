import type { MapCustomer } from './map-customer';

export interface CustomerListResponse {
  customers: MapCustomer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  synced: boolean;
  hadAssignment: boolean;
  requiresSync: boolean;
}
