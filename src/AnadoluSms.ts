import type { SmsProvider } from './contracts/SmsProvider.js';
import { DriverNotFoundError, SendFailedError } from './errors/AnadoluSmsError.js';
import { generateOtpCode } from './support/generateOtpCode.js';
import { OtpStore, OtpVerifyResult } from './support/OtpStore.js';

export interface AnadoluSmsOtpConfig {
  /** OTP kodunun hane sayısı. Varsayılan: 6. */
  length?: number;
  /** Kodun geçerlilik süresi (saniye). Varsayılan: 180 (3 dakika). */
  ttlSeconds?: number;
  /** Bir numara için kaç yanlış deneme sonra kod geçersiz sayılır. Varsayılan: 5. */
  maxAttempts?: number;
  /** Kod SMS metnine nasıl yerleştirilir. Varsayılan: `Doğrulama kodunuz: ${code}`. */
  messageTemplate?: (code: string) => string;
}

export interface AnadoluSmsConfig {
  /** Driver adı → fabrika fonksiyonu. Her fabrika bir `SmsProvider` üretir. */
  drivers: Record<string, () => SmsProvider>;
  otp?: AnadoluSmsOtpConfig;
}

const DEFAULT_OTP_LENGTH = 6;
const DEFAULT_OTP_TTL_SECONDS = 180;
const DEFAULT_OTP_MAX_ATTEMPTS = 5;

function defaultMessageTemplate(code: string): string {
  return `Doğrulama kodunuz: ${code}`;
}

/**
 * AnadoluSms İstemcisi
 *
 * Türkiye'deki SMS sağlayıcılarını tek bir arayüz altında yönetir.
 * Hiçbir sağlayıcı gerçek bir "OTP doğrulama servisi" sunmadığı için
 * (hepsi sadece SMS taşıyıcıdır), kod üretme/saklama/doğrulama mantığı
 * kütüphanenin kendisinde tutulur — driver'lar sadece `sendSms()`'i bilir.
 *
 *     const anadolusms = createAnadoluSms({
 *       drivers: { fake: () => new FakeSmsProvider() },
 *     });
 *
 *     const sms = anadolusms.driver('fake');
 *     await sms.sendSms({ to: '905XXXXXXXXX', message: 'Merhaba' });
 */
export class AnadoluSms {
  private readonly resolved = new Map<string, SmsProvider>();
  private readonly otpStore: OtpStore;
  private readonly otpConfig: Required<AnadoluSmsOtpConfig>;

  constructor(private readonly config: AnadoluSmsConfig) {
    this.otpConfig = {
      length: config.otp?.length ?? DEFAULT_OTP_LENGTH,
      ttlSeconds: config.otp?.ttlSeconds ?? DEFAULT_OTP_TTL_SECONDS,
      maxAttempts: config.otp?.maxAttempts ?? DEFAULT_OTP_MAX_ATTEMPTS,
      messageTemplate: config.otp?.messageTemplate ?? defaultMessageTemplate,
    };
    this.otpStore = new OtpStore(this.otpConfig.maxAttempts);
  }

  /** Belirtilen SMS sağlayıcı driver'ını döndürür (ilk çağrıda üretir, sonra önbellekten verir). */
  driver(name: string): SmsProvider {
    const cached = this.resolved.get(name);

    if (cached) {
      return cached;
    }

    const factory = this.config.drivers[name];

    if (!factory) {
      throw new DriverNotFoundError(name);
    }

    const instance = factory();

    if (
      typeof instance?.sendSms !== 'function' ||
      typeof instance?.getDeliveryStatus !== 'function' ||
      typeof instance?.getBalance !== 'function'
    ) {
      throw new SendFailedError(`Driver '${name}' bir SmsProvider olarak uygulanmamış.`);
    }

    this.resolved.set(name, instance);

    return instance;
  }

  /** Yapılandırılmış tüm driver anahtarlarını döndürür. */
  available(): string[] {
    return Object.keys(this.config.drivers);
  }

  /**
   * Belirtilen numaraya bir OTP kodu üretir, gönderir ve doğrulama için
   * saklar. Aynı numaraya tekrar çağrılırsa önceki kod geçersiz sayılır.
   */
  async sendOtp(driverName: string, to: string, options?: { message?: (code: string) => string }): Promise<{ id: string }> {
    const code = generateOtpCode(this.otpConfig.length);
    const template = options?.message ?? this.otpConfig.messageTemplate;

    const response = await this.driver(driverName).sendSms({ to, message: template(code) });
    this.otpStore.set(to, code, this.otpConfig.ttlSeconds);

    return { id: response.id };
  }

  /** Kullanıcının girdiği kodu, `sendOtp()` ile o numara için saklanan kodla karşılaştırır. */
  verifyOtp(to: string, code: string): OtpVerifyResult {
    return this.otpStore.verify(to, code);
  }

  /** Bir numara için beklemede olan OTP kaydını (varsa) siler. */
  clearOtp(to: string): void {
    this.otpStore.clear(to);
  }
}

/** `new AnadoluSms(config)` için kısa yol. */
export function createAnadoluSms(config: AnadoluSmsConfig): AnadoluSms {
  return new AnadoluSms(config);
}
