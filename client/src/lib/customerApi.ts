import api from "@/lib/api";
import type { CustomerListResponse } from "@shared/types/customer-list";
import type { MapCustomer } from "@shared/types/map-customer";

export async function fetchCustomersPage(params: { page?: number; limit?: number; search?: string }) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", params.page.toString());
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.search) searchParams.set("search", params.search);
  const query = searchParams.toString();
  const url = query ? `/admin-api/search/customer?${query}` : "/admin-api/search/customer";
  const response = await api.get<CustomerListResponse>(url);
  return response.data;
}

export async function fetchAllCustomers(limit = 500): Promise<MapCustomer[]> {
  const aggregated: MapCustomer[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await fetchCustomersPage({ page, limit });
    aggregated.push(...data.customers);
    totalPages = data.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return aggregated;
}
