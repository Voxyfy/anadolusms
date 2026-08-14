import type { SmsProvider } from '../../contracts/SmsProvider.js';
import { BalanceResponse } from '../../dto/BalanceResponse.js';
import { DeliveryReport } from '../../dto/DeliveryReport.js';
import { SendSmsData } from '../../dto/SendSmsData.js';
import { SendSmsResponse } from '../../dto/SendSmsResponse.js';
import { SendFailedError } from '../../errors/AnadoluSmsError.js';
import { SmsStatus } from '../../support/SmsStatus.js';

export interface IletiMerkeziConfig {
  /** panel.iletimerkezi.com > Ayarlar > Güvenlik > API Erişimi'nden alınan API anahtarı. */
  key: string;
  /** Aynı sayfadan alınan API hash'i — kendiniz hesaplamazsınız, panelden olduğu gibi kullanılır. */
  hash: string;
  /** Onaylı varsayılan gönderici başlığı (max 11 karakter), her gönderimde ayrıca override edilebilir. */
  defaultSender?: string;
}

const BASE_URL = 'https://api.iletimerkezi.com/v1';

interface IletiMerkeziEnvelope<T> {
  response: {
    status: { code: number; message: string };
  } & T;
}

interface SendSmsResult {
  order?: { id: string };
}

interface ReportMessage {
  status: string;
  // Dokümantasyon per-alıcı numara alanının tam adını belirtmiyor; hem
  // "receipent" hem "number" olası isimler olarak eşleniyor, hangisi
  // gelirse okunur.
  receipent?: string;
  number?: string;
}

interface ReportResult {
  order?: {
    status: string;
    total?: string;
    delivered?: string;
    undelivered?: string;
    waiting?: string;
  };
  message?: ReportMessage[];
}

interface BalanceResult {
  balance?: { amount: number; sms: number };
}

function mapMessageStatus(status: string): SmsStatus {
  switch (status) {
    case '111':
      return SmsStatus.Delivered;
    case '112':
      return SmsStatus.Failed;
    case '110':
      return SmsStatus.Sent;
    default:
      return SmsStatus.Unknown;
  }
}

function mapOrderStatus(report: ReportResult): SmsStatus {
  if (report.message && report.message.length > 0) {
    const statuses = report.message.map((m) => mapMessageStatus(m.status));
    if (statuses.some((s) => s === SmsStatus.Failed)) return SmsStatus.Failed;
    if (statuses.every((s) => s === SmsStatus.Delivered)) return SmsStatus.Delivered;
    if (statuses.some((s) => s === SmsStatus.Sent)) return SmsStatus.Sent;
  }

  switch (report.order?.status) {
    case '114':
      return SmsStatus.Delivered;
    case '115':
      return SmsStatus.Failed;
    case '113':
      return SmsStatus.Pending;
    default:
      return SmsStatus.Unknown;
  }
}

/**
 * İleti Merkezi (iletimerkezi.com) — REST/JSON SMS API sürücüsü.
 *
 * Kimlik doğrulama, panelden hazır alınan bir `key` + `hash` çiftiyle
 * yapılır; hash'i kendiniz hesaplamazsınız (bkz. panel.iletimerkezi.com >
 * Ayarlar > Güvenlik > API Erişimi). Gerçek dokümantasyona
 * (iletimerkezi.com/docs/api) dayanarak yazıldı ve doğrulandı.
 */
export class IletiMerkeziProvider implements SmsProvider {
  constructor(private readonly config: IletiMerkeziConfig) {}

  private auth() {
    return { key: this.config.key, hash: this.config.hash };
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<IletiMerkeziEnvelope<T>> {
    const res = await fetch(`${BASE_URL}/${path}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as IletiMerkeziEnvelope<T>;

    if (json.response?.status?.code !== 200) {
      throw new SendFailedError(
        `İleti Merkezi API hatası: ${json.response?.status?.message ?? 'bilinmeyen hata'} (kod: ${json.response?.status?.code})`,
        json,
      );
    }

    return json;
  }

  async sendSms(data: SendSmsData): Promise<SendSmsResponse> {
    const sender = data.sender ?? this.config.defaultSender;
    if (!sender) {
      throw new SendFailedError('İleti Merkezi için bir gönderici başlığı (sender) gerekli.');
    }

    const json = await this.post<SendSmsResult>('send-sms', {
      request: {
        authentication: this.auth(),
        order: {
          sender,
          iys: data.commercial ? '1' : '0',
          ...(data.commercial ? { iysList: 'BIREYSEL' } : {}),
          message: {
            text: data.message,
            receipents: { number: [data.to] },
          },
        },
      },
    });

    const id = json.response.order?.id;
    if (!id) {
      throw new SendFailedError('İleti Merkezi yanıtında sipariş (order) ID bulunamadı.', json);
    }

    return { id, raw: json };
  }

  async getDeliveryStatus(id: string): Promise<DeliveryReport> {
    const json = await this.post<ReportResult>('get-report', {
      request: {
        authentication: this.auth(),
        order: { id, page: '1', rowCount: '1000' },
      },
    });

    return {
      id,
      status: mapOrderStatus(json.response),
      recipients: (json.response.message ?? []).map((m) => ({
        to: m.receipent ?? m.number ?? '',
        status: mapMessageStatus(m.status),
      })),
      raw: json,
    };
  }

  async getBalance(): Promise<BalanceResponse> {
    const json = await this.post<BalanceResult>('get-balance', {
      request: { authentication: this.auth() },
    });

    return {
      amount: json.response.balance?.amount ?? 0,
      unit: 'try',
      raw: json,
    };
  }
}
