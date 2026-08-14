import { BalanceResponse } from '../dto/BalanceResponse.js';
import { DeliveryReport } from '../dto/DeliveryReport.js';
import { SendSmsData } from '../dto/SendSmsData.js';
import { SendSmsResponse } from '../dto/SendSmsResponse.js';

export interface SmsProvider {
  sendSms(data: SendSmsData): Promise<SendSmsResponse>;
  getDeliveryStatus(id: string): Promise<DeliveryReport>;
  getBalance(): Promise<BalanceResponse>;
}
