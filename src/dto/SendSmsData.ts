export interface SendSmsData {
  /** Alıcı telefon numarası. 05XXXXXXXXX, 5XXXXXXXXX veya 905XXXXXXXXX formatlarından biri kabul edilir. */
  to: string;
  /** Gönderilecek mesaj metni. */
  message: string;
  /** Onaylı gönderici başlığı (sender ID). Verilmezse sağlayıcıdaki varsayılan başlık kullanılır. */
  sender?: string;
  /** Bu gönderimin ticari (pazarlama) mi yoksa işlemsel mi olduğu — bazı sağlayıcılar İYS için bunu zorunlu tutar. */
  commercial?: boolean;
  /** Sağlayıcıya özgü ek alanlar için kaçış kapağı. */
  meta?: Record<string, unknown>;
}
