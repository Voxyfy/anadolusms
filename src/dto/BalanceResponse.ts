export interface BalanceResponse {
  /** Kalan bakiye/kredi miktarı — birimi sağlayıcıya göre değişir (TL, kredi adedi vb.), bkz. `unit`. */
  amount: number;
  unit: 'try' | 'credit';
  raw?: unknown;
}
