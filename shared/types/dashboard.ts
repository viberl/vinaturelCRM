export interface DashboardOrderSummary {
  id: string;
  orderNumber: string | null;
  orderDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  status: string | null;
  customerId: string | null;
  customerName: string | null;
  customerCompany: string | null;
  customerNumber: string | null;
}

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  customerCount: number;
  averageOrderValue: number;
  latestOrderDate: string | null;
}

export interface DashboardData {
  orders: DashboardOrderSummary[];
  stats: DashboardStats;
}
