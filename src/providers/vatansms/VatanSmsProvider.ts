import type { SmsProvider } from '../../contracts/SmsProvider.js';
import { BalanceResponse } from '../../dto/BalanceResponse.js';
import { DeliveryReport } from '../../dto/DeliveryReport.js';
import { SendSmsData } from '../../dto/SendSmsData.js';
import { SendSmsResponse } from '../../dto/SendSmsResponse.js';
import { SendFailedError } from '../../errors/AnadoluSmsError.js';
import { SmsStatus } from '../../support/SmsStatus.js';

export interface VatanSmsConfig {
  apiId: string;
  apiKey: string;
  /** Onaylı varsayılan gönderici başlığı, her gönderimde ayrıca override edilebilir. */
  defaultSender?: string;
}

const BASE_URL = 'https://api.vatansms.net/api/v1';

interface VatanSmsEnvelope {
  code: number;
  status: 'success' | 'error';
  description?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * VatanSMS (vatansms.net) — REST/JSON SMS API sürücüsü.
 *
 * Temel URL (`https://api.vatansms.net/api/v1`) ve hata yanıtı şekli
 * (`{code, status, description}`) canlı olarak doğrulandı (geçersiz
 * kimlik bilgisiyle istek atılıp gerçek hata yanıtı gözlemlendi).
 * Başarılı yanıtın alan adları resmi dokümantasyonda (vatansms.net/
 * sms-api-turkey) örneklenmediği için `data` içindeki olası alan adları
 * (`id`/`report_id`, `credit`) en makul varsayımla eşleniyor — gerçek bir
 * hesapla ilk kullanımda doğrulamanız önerilir.
 */
export class VatanSmsProvider implements SmsProvider {
  constructor(private readonly config: VatanSmsConfig) {}

  private async post(path: string, body: Record<string, unknown>): Promise<VatanSmsEnvelope> {
    const res = await fetch(`${BASE_URL}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_id: this.config.apiId,
        api_key: this.config.apiKey,
        ...body,
      }),
    });

    const json = (await res.json()) as VatanSmsEnvelope;

    if (json.status !== 'success') {
      throw new SendFailedError(`VatanSMS API hatası: ${json.description ?? 'bilinmeyen hata'} (kod: ${json.code})`, json);
    }

    return json;
  }

  async sendSms(data: SendSmsData): Promise<SendSmsResponse> {
    const sender = data.sender ?? this.config.defaultSender;
    if (!sender) {
      throw new SendFailedError('VatanSMS için bir gönderici başlığı (sender) gerekli.');
    }

    const json = await this.post('1toN', {
      sender,
      message_type: 'normal',
      message: data.message,
      // "bilgi" (bilgilendirme/işlemsel) ve "ticari" (pazarlama) değerleri
      // dokümantasyonda örneklenmiyor, alan adından çıkarımla kullanıldı.
      message_content_type: data.commercial ? 'ticari' : 'bilgi',
      phones: [data.to],
    });

    const id = (json.data?.id ?? json.data?.report_id ?? json.id ?? json.report_id) as string | number | undefined;
    if (id === undefined) {
      throw new SendFailedError('VatanSMS yanıtında gönderim ID bulunamadı.', json);
    }

    return { id: String(id), raw: json };
  }

  async getDeliveryStatus(id: string): Promise<DeliveryReport> {
    const json = await this.post('report/single', { report_id: id });
    const rawStatus = String(json.data?.status ?? json.status ?? '').toLowerCase();

    let status = SmsStatus.Unknown;
    if (rawStatus.includes('teslim') || rawStatus.includes('delivered')) status = SmsStatus.Delivered;
    else if (rawStatus.includes('beklem') || rawStatus.includes('pending')) status = SmsStatus.Pending;
    else if (rawStatus.includes('hata') || rawStatus.includes('fail')) status = SmsStatus.Failed;

    return { id, status, raw: json };
  }

  async getBalance(): Promise<BalanceResponse> {
    const json = await this.post('user/information', {});
    const amount = Number(json.data?.credit ?? json.data?.balance ?? 0);

    return { amount, unit: 'credit', raw: json };
  }
}
