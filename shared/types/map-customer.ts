export type CustomerStatus = 'active' | 'potential' | 'inactive';

export interface MapCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  lat: string | null;
  lng: string | null;
  status: CustomerStatus;
  company?: string | null;
  totalRevenue?: string | null;
  orderCount?: number | null;
  lastContact?: string | null;
  memberSince?: string | null;
  discountLevel?: string | null;
  salesRepresentative?: {
    id: string;
    name: string | null;
  } | null;
  salesRepresentativeEmail?: string | null;
  updatedAt?: string | null;
  customerNumber?: string | null;
  customerGroup?: string | null;
  priceGroup?: string | null;
}
