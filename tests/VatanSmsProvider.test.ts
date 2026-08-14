import { afterEach, describe, expect, it, vi } from 'vitest';
import { VatanSmsProvider } from '../src/providers/vatansms/VatanSmsProvider.js';

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VatanSmsProvider', () => {
  it('sendSms başarılı yanıtta id döner ve api_id/api_key gövdeye eklenir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 200, status: 'success', data: { id: 'abc123' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new VatanSmsProvider({ apiId: 'id', apiKey: 'key', defaultSender: 'BASLIK' });
    const res = await provider.sendSms({ to: '905321234567', message: 'Merhaba' });

    expect(res.id).toBe('abc123');
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ api_id: 'id', api_key: 'key', sender: 'BASLIK' });
  });

  it('gerçek hata yanıtı (canlı doğrulanmış şekil) SendFailedError fırlatır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ code: 400, status: 'error', description: 'Geçersiz api bilgileri.' })),
    );

    const provider = new VatanSmsProvider({ apiId: 'id', apiKey: 'key', defaultSender: 'BASLIK' });
    await expect(provider.sendSms({ to: '905321234567', message: 'Merhaba' })).rejects.toThrow(/Geçersiz api bilgileri/);
  });

  it('sender verilmezse ve defaultSender yoksa hata fırlatır', async () => {
    const provider = new VatanSmsProvider({ apiId: 'id', apiKey: 'key' });
    await expect(provider.sendSms({ to: '905321234567', message: 'Merhaba' })).rejects.toThrow(/gönderici başlığı/);
  });

  it('getBalance data.credit alanını okur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 200, status: 'success', data: { credit: 42 } })));

    const provider = new VatanSmsProvider({ apiId: 'id', apiKey: 'key' });
    const balance = await provider.getBalance();

    expect(balance).toMatchObject({ amount: 42, unit: 'credit' });
  });
});
