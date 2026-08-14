import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/providers/FakeProvider.js';
import { SmsStatus } from '../src/support/SmsStatus.js';

describe('FakeProvider', () => {
  it('gönderilen SMS için bir id döner ve kaydeder', async () => {
    const provider = new FakeProvider();
    const res = await provider.sendSms({ to: '905321234567', message: 'Merhaba' });

    expect(res.id).toBe('fake-1');
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: '905321234567', message: 'Merhaba' });
  });

  it('bilinen bir id için Delivered, bilinmeyen için Unknown döner', async () => {
    const provider = new FakeProvider();
    const res = await provider.sendSms({ to: '905321234567', message: 'Merhaba' });

    const known = await provider.getDeliveryStatus(res.id);
    const unknown = await provider.getDeliveryStatus('yok-boyle-bir-id');

    expect(known.status).toBe(SmsStatus.Delivered);
    expect(unknown.status).toBe(SmsStatus.Unknown);
  });

  it('getBalance sabit bir kredi döner', async () => {
    const provider = new FakeProvider();
    const balance = await provider.getBalance();
    expect(balance.amount).toBeGreaterThan(0);
    expect(balance.unit).toBe('credit');
  });
});
