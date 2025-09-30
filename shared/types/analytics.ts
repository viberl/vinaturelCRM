export type AnalyticsPeriodType = 'month' | 'quarter' | 'year' | 'custom';

export type AnalyticsCustomerGroup = 'all' | 'gastro' | 'fachhandel' | 'endkunden';

export interface AnalyticsTrendPoint {
  month: string;
  label: string;
  current: number;
  previous: number;
}

export interface AnalyticsTopCustomer {
  customerId: string | null;
  shopwareCustomerId?: string | null;
  name: string;
  revenue: number;
  orderNumber?: string | null;
}

export interface AnalyticsOrderRow {
  id: string;
  orderNumber: string | null;
  orderDate: string | null;
  amount: number;
  currency: string;
  customerId: string | null;
  shopwareCustomerId?: string | null;
  customerCompany: string | null;
  customerNumber: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
}

export interface AnalyticsSummaryResponse {
  period: {
    type: AnalyticsPeriodType;
    current: {
      from: string;
      to: string;
    };
    previous: {
      from: string;
      to: string;
    };
  };
  filters: {
    group: AnalyticsCustomerGroup;
  };
  totals: {
    revenue: {
      currency: string;
      current: number;
      previous: number;
    };
    orders: {
      current: number;
      previous: number;
    };
  };
  trend: AnalyticsTrendPoint[];
  topCustomers: AnalyticsTopCustomer[];
  orders: AnalyticsOrderRow[];
  currency: string;
  meta: {
    assignedCustomerCount: number;
    filteredCustomerCount: number;
  };
}
