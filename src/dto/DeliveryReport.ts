import { SmsStatus } from '../support/SmsStatus.js';

export interface DeliveryReport {
  id: string;
  status: SmsStatus;
  /** Alıcıya göre ayrıştırılmış durumlar (toplu gönderimde her numara için bir kayıt). */
  recipients?: Array<{ to: string; status: SmsStatus }>;
  raw?: unknown;
}
