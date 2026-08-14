import { afterEach, describe, expect, it, vi } from 'vitest';
import { IletiMerkeziProvider } from '../src/providers/iletimerkezi/IletiMerkeziProvider.js';
import { SmsStatus } from '../src/support/SmsStatus.js';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IletiMerkeziProvider', () => {
  it('sendSms başarılı yanıtta order id döner', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ response: { status: { code: 200, message: 'İşlem başarılı' }, order: { id: '312891245' } } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new IletiMerkeziProvider({ key: 'k', hash: 'h', defaultSender: 'BASLIK' });
    const res = await provider.sendSms({ to: '905321234567', message: 'Merhaba' });

    expect(res.id).toBe('312891245');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.iletimerkezi.com/v1/send-sms/json',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sender verilmezse ve defaultSender yoksa hata fırlatır', async () => {
    const provider = new IletiMerkeziProvider({ key: 'k', hash: 'h' });
    await expect(provider.sendSms({ to: '905321234567', message: 'Merhaba' })).rejects.toThrow(/gönderici başlığı/);
  });

  it('status code 200 değilse SendFailedError fırlatır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ response: { status: { code: 401, message: 'Yetkisiz' } } })),
    );

    const provider = new IletiMerkeziProvider({ key: 'k', hash: 'h', defaultSender: 'BASLIK' });
    await expect(provider.sendSms({ to: '905321234567', message: 'Merhaba' })).rejects.toThrow(/Yetkisiz/);
  });

  it('getDeliveryStatus mesaj durumlarını doğru eşler', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          response: {
            status: { code: 200, message: 'ok' },
            order: { status: '114' },
            message: [{ status: '111', number: '905321234567' }],
          },
        }),
      ),
    );

    const provider = new IletiMerkeziProvider({ key: 'k', hash: 'h' });
    const report = await provider.getDeliveryStatus('312891245');

    expect(report.status).toBe(SmsStatus.Delivered);
    expect(report.recipients).toEqual([{ to: '905321234567', status: SmsStatus.Delivered }]);
  });

  it('getBalance bakiyeyi TL olarak döner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ response: { status: { code: 200, message: 'ok' }, balance: { amount: 10.5, sms: 67 } } })),
    );

    const provider = new IletiMerkeziProvider({ key: 'k', hash: 'h' });
    const balance = await provider.getBalance();

    expect(balance).toMatchObject({ amount: 10.5, unit: 'try' });
  });
});
