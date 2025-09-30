export interface CatalogPriceTier {
  tier: string;
  label: string;
  value: number | null;
  currency?: string | null;
}

export interface CatalogStockHistoryPoint {
  month: string;
  quantity: number;
}

export interface CatalogTopCustomer {
  id: string;
  name: string;
  lastOrdered: string | null;
  quantity: number | null;
  priceTier: string | null;
}

export interface CatalogAllocationInfo {
  quantity: number;
  note?: string | null;
}

export interface CatalogSummaryItem {
  id: string;
  articleNumber: string | null;
  winery: string | null;
  wineName: string | null;
  vintage: string | null;
  volume: string | null;
  stock: number | null;
  availableStock: number | null;
  country: string | null;
  region: string | null;
  grapes: string[];
  certifications: string[];
  prices: CatalogPriceTier[];
  image: string | null;
  allocation?: CatalogAllocationInfo | null;
}

export interface CatalogDetailItem extends CatalogSummaryItem {
  description: string | null;
  stockHistory: CatalogStockHistoryPoint[];
  topCustomers: CatalogTopCustomer[];
}

export interface CatalogFacetOption {
  id: string;
  name: string | null;
}

export interface CatalogListResponse {
  items: CatalogSummaryItem[];
  facets: {
    wineries: CatalogFacetOption[];
    vintages: string[];
  };
}

export interface CatalogDetailResponse {
  item: CatalogDetailItem;
}
