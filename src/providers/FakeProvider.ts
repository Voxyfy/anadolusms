import type { SmsProvider } from '../contracts/SmsProvider.js';
import { BalanceResponse } from '../dto/BalanceResponse.js';
import { DeliveryReport } from '../dto/DeliveryReport.js';
import { SendSmsData } from '../dto/SendSmsData.js';
import { SendSmsResponse } from '../dto/SendSmsResponse.js';
import { SmsStatus } from '../support/SmsStatus.js';

interface FakeSentSms {
  id: string;
  to: string;
  message: string;
  sender?: string;
}

/** Gerçek bir sağlayıcıya bağlanmadan test yazmak veya örnek göstermek için bellek içi sahte driver. */
export class FakeProvider implements SmsProvider {
  private counter = 0;
  readonly sent: FakeSentSms[] = [];

  async sendSms(data: SendSmsData): Promise<SendSmsResponse> {
    this.counter += 1;
    const id = `fake-${this.counter}`;
    this.sent.push({ id, to: data.to, message: data.message, sender: data.sender });
    return { id, raw: { echoed: data } };
  }

  async getDeliveryStatus(id: string): Promise<DeliveryReport> {
    const found = this.sent.find((s) => s.id === id);
    return {
      id,
      status: found ? SmsStatus.Delivered : SmsStatus.Unknown,
    };
  }

  async getBalance(): Promise<BalanceResponse> {
    return { amount: 1000, unit: 'credit' };
  }
}
