export type OtpVerifyResult =
  | { valid: true }
  | { valid: false; reason: 'not_found' | 'expired' | 'mismatch' | 'max_attempts' };

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

/** OTP kodlarını numaraya göre bellekte tutan, süresi geçmiş/deneme hakkı biten kayıtları eleyen basit bir mağaza. */
export class OtpStore {
  private readonly entries = new Map<string, OtpEntry>();

  constructor(private readonly maxAttempts: number) {}

  set(to: string, code: string, ttlSeconds: number): void {
    this.entries.set(to, { code, expiresAt: Date.now() + ttlSeconds * 1000, attempts: 0 });
  }

  verify(to: string, code: string): OtpVerifyResult {
    const entry = this.entries.get(to);

    if (!entry) {
      return { valid: false, reason: 'not_found' };
    }

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(to);
      return { valid: false, reason: 'expired' };
    }

    if (entry.attempts >= this.maxAttempts) {
      this.entries.delete(to);
      return { valid: false, reason: 'max_attempts' };
    }

    if (entry.code !== code) {
      entry.attempts += 1;
      if (entry.attempts >= this.maxAttempts) {
        this.entries.delete(to);
        return { valid: false, reason: 'max_attempts' };
      }
      return { valid: false, reason: 'mismatch' };
    }

    this.entries.delete(to);
    return { valid: true };
  }

  clear(to: string): void {
    this.entries.delete(to);
  }
}
