import { afterEach, describe, expect, it, vi } from 'vitest';
import { VerimorProvider } from '../src/providers/verimor/VerimorProvider.js';
import { SmsStatus } from '../src/support/SmsStatus.js';

function textResponse(body: string, ok = true) {
  return { ok, text: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VerimorProvider', () => {
  it('sendSms başarılı yanıtta kampanya id metnini döner', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('20212'));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new VerimorProvider({ username: '908501234567', password: 'sifre', defaultSender: 'BASLIK' });
    const res = await provider.sendSms({ to: '905321234567', message: 'Merhaba' });

    expect(res.id).toBe('20212');
    expect(fetchMock).toHaveBeenCalledWith('https://sms.verimor.com.tr/v2/send.json', expect.objectContaining({ method: 'POST' }));
  });

  it('başarısız yanıtta (400) SendFailedError fırlatır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse('INSUFFICIENT_CREDITS', false)));

    const provider = new VerimorProvider({ username: '908501234567', password: 'sifre', defaultSender: 'BASLIK' });
    await expect(provider.sendSms({ to: '905321234567', message: 'Merhaba' })).rejects.toThrow(/INSUFFICIENT_CREDITS/);
  });

  it('getDeliveryStatus DELIVERED durumunu doğru eşler', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        textResponse(
          JSON.stringify([{ campaign_id: 20121, message_id: '1', dest: '905321234567', status: 'DELIVERED' }]),
        ),
      ),
    );

    const provider = new VerimorProvider({ username: '908501234567', password: 'sifre' });
    const report = await provider.getDeliveryStatus('20121');

    expect(report.status).toBe(SmsStatus.Delivered);
    expect(report.recipients).toEqual([{ to: '905321234567', status: SmsStatus.Delivered }]);
  });

  it('getBalance sayısal krediyi döner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse('123')));

    const provider = new VerimorProvider({ username: '908501234567', password: 'sifre' });
    const balance = await provider.getBalance();

    expect(balance).toMatchObject({ amount: 123, unit: 'credit' });
  });
});
