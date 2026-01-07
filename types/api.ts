export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success?: boolean;
}

export interface Transaction {
  id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  customer_id?: string;
  metadata?: any;
  created_at: string;
}

export interface DashboardStats {
  today: number;
  week: number;
  month: number;
  total: number;
}
