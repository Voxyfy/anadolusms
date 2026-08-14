export interface SendSmsResponse {
  /** Sağlayıcının bu gönderime verdiği kimlik — durum sorgularken kullanılır. */
  id: string;
  /** Sağlayıcının ham yanıtı — hata ayıklama/loglama için. */
  raw?: unknown;
}
