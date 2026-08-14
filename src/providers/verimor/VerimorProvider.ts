import type { SmsProvider } from '../../contracts/SmsProvider.js';
import { BalanceResponse } from '../../dto/BalanceResponse.js';
import { DeliveryReport } from '../../dto/DeliveryReport.js';
import { SendSmsData } from '../../dto/SendSmsData.js';
import { SendSmsResponse } from '../../dto/SendSmsResponse.js';
import { SendFailedError } from '../../errors/AnadoluSmsError.js';
import { SmsStatus } from '../../support/SmsStatus.js';

export interface VerimorConfig {
  /** Verimor hesap kullanıcı adınız — 12 haneli telefon numarası formatında, örn. "908501234567". */
  username: string;
  /** OİM panelinden (oim.verimor.com.tr/sms_settings/edit) tanımladığınız API şifresi. */
  password: string;
  /** Onaylı varsayılan gönderici başlığı, her gönderimde ayrıca override edilebilir. */
  defaultSender?: string;
}

const BASE_URL = 'https://sms.verimor.com.tr/v2';

const DELIVERED_STATUSES = new Set(['DELIVERED', 'SENT']);
const PENDING_STATUSES = new Set(['SENDING', 'WAITING']);

function mapReportStatus(status: string): SmsStatus {
  if (DELIVERED_STATUSES.has(status)) return SmsStatus.Delivered;
  if (PENDING_STATUSES.has(status)) return SmsStatus.Pending;
  if (status === '') return SmsStatus.Unknown;
  return SmsStatus.Failed;
}

interface VerimorStatusEntry {
  campaign_id: number;
  message_id: string;
  dest: string;
  status: string;
}

/**
 * Verimor (verimor.com.tr) — GET/POST SMS API sürücüsü.
 *
 * Verimor, gönderim yapılacak sunucunun IP adresinin OİM panelinde
 * (SMS Ayarlarım) önceden tanımlanmasını zorunlu tutar (BTK yönergeleri
 * kapsamında) — bu tanımlama yapılmadan istekler "401 Hesabınızda
 * izinli IP ayarları yapılmamış" hatası döner. Resmi dokümantasyona
 * (github.com/verimor/SMS-API) dayanarak yazıldı ve doğrulandı.
 */
export class VerimorProvider implements SmsProvider {
  constructor(private readonly config: VerimorConfig) {}

  async sendSms(data: SendSmsData): Promise<SendSmsResponse> {
    const res = await fetch(`${BASE_URL}/send.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
        source_addr: data.sender ?? this.config.defaultSender,
        is_commercial: Boolean(data.commercial),
        ...(data.commercial ? { iys_recipient_type: 'BIREYSEL' } : {}),
        messages: [{ msg: data.message, dest: data.to }],
      }),
    });

    const text = (await res.text()).trim();

    if (!res.ok) {
      throw new SendFailedError(`Verimor API hatası: ${text}`, text);
    }

    return { id: text, raw: text };
  }

  async getDeliveryStatus(id: string): Promise<DeliveryReport> {
    const url = new URL(`${BASE_URL}/status`);
    url.searchParams.set('id', id);
    url.searchParams.set('username', this.config.username);
    url.searchParams.set('password', this.config.password);

    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      throw new SendFailedError(`Verimor API hatası: ${text}`, text);
    }

    const entries = JSON.parse(text) as VerimorStatusEntry[];
    const statuses = entries.map((e) => mapReportStatus(e.status));

    let overall = SmsStatus.Unknown;
    if (statuses.length > 0) {
      if (statuses.some((s) => s === SmsStatus.Failed)) overall = SmsStatus.Failed;
      else if (statuses.every((s) => s === SmsStatus.Delivered)) overall = SmsStatus.Delivered;
      else overall = SmsStatus.Pending;
    }

    return {
      id,
      status: overall,
      recipients: entries.map((e) => ({ to: e.dest, status: mapReportStatus(e.status) })),
      raw: entries,
    };
  }

  async getBalance(): Promise<BalanceResponse> {
    const url = new URL(`${BASE_URL}/balance`);
    url.searchParams.set('username', this.config.username);
    url.searchParams.set('password', this.config.password);

    const res = await fetch(url);
    const text = (await res.text()).trim();

    if (!res.ok) {
      throw new SendFailedError(`Verimor API hatası: ${text}`, text);
    }

    return { amount: Number(text), unit: 'credit', raw: text };
  }
}
