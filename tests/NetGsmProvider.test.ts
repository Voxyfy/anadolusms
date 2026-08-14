import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetGsmProvider } from '../src/providers/netgsm/NetGsmProvider.js';
import { UnsupportedCapabilityError } from '../src/errors/AnadoluSmsError.js';
import { SmsStatus } from '../src/support/SmsStatus.js';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NetGsmProvider', () => {
  it('sendSms Basic Auth header ile 10 haneli numara gönderir, jobid döner', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: '00', description: 'Başarılı', jobid: 'job-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new NetGsmProvider({ username: 'apiuser', password: 'sifre', defaultSender: 'BASLIK' });
    const res = await provider.sendSms({ to: '905321234567', message: 'Merhaba' });

    expect(res.id).toBe('job-1');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.netgsm.com.tr/sms/rest/v2/send');
    expect(options.headers.Authorization).toMatch(/^Basic /);
    const body = JSON.parse(options.body);
    expect(body.messages[0].no).toBe('5321234567');
    expect(body.msgheader).toBe('BASLIK');
  });

  it('HTTP hata durumunda SendFailedError fırlatır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: '30', description: 'Geçersiz kullanıcı', jobs: null }, false)));

    const provider = new NetGsmProvider({ username: 'apiuser', password: 'sifre', defaultSender: 'BASLIK' });
    await expect(provider.sendSms({ to: '905321234567', message: 'Merhaba' })).rejects.toThrow(/Geçersiz kullanıcı/);
  });

  it('getDeliveryStatus deliveredDate varsa Delivered döner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ code: '00', description: 'ok', jobs: [{ jobid: 'job-1', number: '5321234567', status: 1, deliveredDate: '14.08.2026 10:00:00' }] }),
      ),
    );

    const provider = new NetGsmProvider({ username: 'apiuser', password: 'sifre' });
    const report = await provider.getDeliveryStatus('job-1');

    expect(report.status).toBe(SmsStatus.Delivered);
  });

  it('getBalance desteklenmiyor, UnsupportedCapabilityError fırlatır', async () => {
    const provider = new NetGsmProvider({ username: 'apiuser', password: 'sifre' });
    await expect(provider.getBalance()).rejects.toThrow(UnsupportedCapabilityError);
  });
});
