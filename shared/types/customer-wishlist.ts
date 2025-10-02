import type { CatalogSummaryItem } from "./catalog";

export interface CustomerWishlistEntry {
  id: string;
  productId: string | null;
  addedAt: string | null;
  product: CatalogSummaryItem;
}

export interface CustomerWishlistResponse {
  items: CustomerWishlistEntry[];
}
