export interface CustomerOrderItem {
  id: string;
  label: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  productId?: string | null;
  productNumber?: string | null;
  manufacturer?: string | null;
  vintage?: string | null;
  volume?: string | null;
  taxRate?: number | null;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string | null;
  orderDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  netAmount: number | null;
  shippingTotal: number | null;
  taxAmount: number | null;
  status: string | null;
  lineItemCount: number;
  lineItems: CustomerOrderItem[];
}
