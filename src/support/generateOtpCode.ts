import { randomInt } from 'node:crypto';

/** `length` haneli, kriptografik olarak güvenli rastgele bir sayısal kod üretir (baştaki sıfırlar korunur). */
export function generateOtpCode(length: number): string {
  const max = 10 ** length;
  const code = randomInt(0, max);
  return code.toString().padStart(length, '0');
}
