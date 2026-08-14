import { describe, expect, it } from 'vitest';
import { createAnadoluSms } from '../src/AnadoluSms.js';
import { FakeProvider } from '../src/providers/FakeProvider.js';
import { DriverNotFoundError } from '../src/errors/AnadoluSmsError.js';

function build() {
  const fake = new FakeProvider();
  const anadolusms = createAnadoluSms({ drivers: { fake: () => fake } });
  return { anadolusms, fake };
}

describe('AnadoluSms', () => {
  it('driver() aynı ismi verince önbellekten aynı örneği döner', () => {
    const { anadolusms, fake } = build();
    expect(anadolusms.driver('fake')).toBe(fake);
    expect(anadolusms.driver('fake')).toBe(anadolusms.driver('fake'));
  });

  it('tanımsız bir driver istenince DriverNotFoundError fırlatır', () => {
    const { anadolusms } = build();
    expect(() => anadolusms.driver('yok')).toThrow(DriverNotFoundError);
  });

  it('available() yapılandırılmış tüm driver adlarını döner', () => {
    const { anadolusms } = build();
    expect(anadolusms.available()).toEqual(['fake']);
  });

  it('sendOtp ile gönderilen kod verifyOtp ile doğru şekilde doğrulanabilir', async () => {
    const { anadolusms, fake } = build();
    await anadolusms.sendOtp('fake', '905321234567');

    const sentMessage = fake.sent[0]!.message;
    const code = sentMessage.match(/\d{6}/)![0];

    const result = anadolusms.verifyOtp('905321234567', code);
    expect(result).toEqual({ valid: true });
  });

  it('yanlış kod girilirse mismatch, aynı kod tekrar denenirse not_found döner (bir kere kullanılır)', async () => {
    const { anadolusms } = build();
    await anadolusms.sendOtp('fake', '905321234567');

    const wrong = anadolusms.verifyOtp('905321234567', '000000');
    expect(wrong).toEqual({ valid: false, reason: 'mismatch' });
  });

  it('hiç OTP gönderilmemiş bir numara için not_found döner', () => {
    const { anadolusms } = build();
    const result = anadolusms.verifyOtp('905000000000', '123456');
    expect(result).toEqual({ valid: false, reason: 'not_found' });
  });

  it('maxAttempts aşılırsa max_attempts döner ve kayıt silinir', async () => {
    const fake = new FakeProvider();
    const anadolusms = createAnadoluSms({ drivers: { fake: () => fake }, otp: { maxAttempts: 2 } });
    await anadolusms.sendOtp('fake', '905321234567');

    anadolusms.verifyOtp('905321234567', 'yanlis1');
    const second = anadolusms.verifyOtp('905321234567', 'yanlis2');

    expect(second).toEqual({ valid: false, reason: 'max_attempts' });
    expect(anadolusms.verifyOtp('905321234567', 'yanlis3')).toEqual({ valid: false, reason: 'not_found' });
  });

  it('clearOtp ile beklemedeki kod elle silinebilir', async () => {
    const { anadolusms } = build();
    await anadolusms.sendOtp('fake', '905321234567');
    anadolusms.clearOtp('905321234567');

    expect(anadolusms.verifyOtp('905321234567', '000000')).toEqual({ valid: false, reason: 'not_found' });
  });

  it('özel messageTemplate ile OTP metni özelleştirilebilir', async () => {
    const fake = new FakeProvider();
    const anadolusms = createAnadoluSms({
      drivers: { fake: () => fake },
      otp: { messageTemplate: (code) => `Kodunuz: ${code} (5dk)` },
    });
    await anadolusms.sendOtp('fake', '905321234567');

    expect(fake.sent[0]!.message).toMatch(/^Kodunuz: \d{6} \(5dk\)$/);
  });
});
