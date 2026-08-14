import type { SmsProvider } from '../../contracts/SmsProvider.js';
import { BalanceResponse } from '../../dto/BalanceResponse.js';
import { DeliveryReport } from '../../dto/DeliveryReport.js';
import { SendSmsData } from '../../dto/SendSmsData.js';
import { SendSmsResponse } from '../../dto/SendSmsResponse.js';
import { SendFailedError, UnsupportedCapabilityError } from '../../errors/AnadoluSmsError.js';
import { SmsStatus } from '../../support/SmsStatus.js';

export interface NetGsmConfig {
  /** NetGSM API alt-kullanıcı adı (panelden oluşturulan API kullanıcısı, ana hesap kullanıcı adı değil). */
  username: string;
  /** API kullanıcısının şifresi. */
  password: string;
  /** Onaylı varsayılan gönderici başlığı (msgheader), her gönderimde ayrıca override edilebilir. */
  defaultSender?: string;
  /** Raporlarda geriye kaç gün taranacağı (getDeliveryStatus için) — varsayılan 30. */
  reportLookbackDays?: number;
}

const BASE_URL = 'https://api.netgsm.com.tr';

interface NetGsmBaseResponse {
  code: string;
  description: string;
}

interface NetGsmSendResponse extends NetGsmBaseResponse {
  jobid?: string;
}

interface NetGsmReportJob {
  jobid: string;
  number: string;
  status: number;
  errorCode?: number;
  deliveredDate?: string;
}

interface NetGsmReportResponse extends NetGsmBaseResponse {
  jobs?: NetGsmReportJob[] | null;
}

/** NetGSM'in 10 haneli numara formatı (başında 0/90 olmadan, örn. 5XXXXXXXXX) bekler. */
function toNetGsmPhone(to: string): string {
  const digits = to.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function formatNetGsmDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * NetGSM (netgsm.com.tr) — resmi REST/JSON SMS API sürücüsü.
 *
 * Resmi OpenAPI spesifikasyonuna (github.com/netgsm/netgsm-sms-js/
 * openapi.json) dayanarak yazıldı: kimlik doğrulama HTTP Basic Auth
 * (API alt-kullanıcı adı + şifre) ile yapılır. NetGSM'in bu API'sinde
 * bakiye sorgulama endpoint'i bulunmuyor — `getBalance()` bu yüzden
 * `UnsupportedCapabilityError` fırlatır.
 */
export class NetGsmProvider implements SmsProvider {
  constructor(private readonly config: NetGsmConfig) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
  }

  private async request<T extends NetGsmBaseResponse>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const json = (await res.json()) as T;

    if (!res.ok) {
      throw new SendFailedError(`NetGSM API hatası: ${json.description ?? 'bilinmeyen hata'} (kod: ${json.code})`, json);
    }

    return json;
  }

  async sendSms(data: SendSmsData): Promise<SendSmsResponse> {
    const msgheader = data.sender ?? this.config.defaultSender;
    if (!msgheader) {
      throw new SendFailedError('NetGSM için bir gönderici başlığı (msgheader) gerekli.');
    }

    const json = await this.request<NetGsmSendResponse>('POST', '/sms/rest/v2/send', {
      msgheader,
      messages: [{ msg: data.message, no: toNetGsmPhone(data.to) }],
    });

    if (!json.jobid) {
      throw new SendFailedError('NetGSM yanıtında jobid bulunamadı.', json);
    }

    return { id: json.jobid, raw: json };
  }

  async getDeliveryStatus(id: string): Promise<DeliveryReport> {
    const stopdate = new Date();
    const startdate = new Date(stopdate.getTime() - (this.config.reportLookbackDays ?? 30) * 24 * 60 * 60 * 1000);

    const json = await this.request<NetGsmReportResponse>('POST', '/sms/rest/v2/report', {
      jobids: [id],
      startdate: formatNetGsmDate(startdate),
      stopdate: formatNetGsmDate(stopdate),
    });

    const job = (json.jobs ?? []).find((j) => j.jobid === id);

    if (!job) {
      return { id, status: SmsStatus.Unknown, raw: json };
    }

    // NetGSM'in resmi şeması `status` alanını sayısal bir kod olarak
    // tanımlıyor ama olası değerleri listelemiyor; bu yüzden durum,
    // dokümante edilmiş `deliveredDate`/`errorCode` alanlarından
    // çıkarılıyor (sayısal `status` koduna güvenilmiyor).
    let status = SmsStatus.Pending;
    if (job.deliveredDate) status = SmsStatus.Delivered;
    else if (job.errorCode && job.errorCode > 0) status = SmsStatus.Failed;

    return {
      id,
      status,
      recipients: [{ to: job.number, status }],
      raw: json,
    };
  }

  async getBalance(): Promise<BalanceResponse> {
    throw new UnsupportedCapabilityError('netgsm', 'getBalance');
  }
}
