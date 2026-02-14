
export type OrderType = 'Normal' | 'Urgent';
export type OrderStatus = 'Received' | 'Washing' | 'Ironing' | 'Ready' | 'Delivered';
export type PaymentMethod = 'Cash' | 'Card' | 'Transfer';

export interface LaundryItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  order_type: OrderType;
  items: LaundryItem[];
  subtotal: number;
  tax: number;
  total: number;
  custom_adjustment: number;
  is_paid: boolean;
  payment_method: PaymentMethod;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  // Notification tracking
  notified_1h?: boolean;
  notified_24h?: boolean;
  notified_48h?: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  unit: string;
  threshold: number;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  enabled: boolean;
}
