export class AnadoluSmsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnadoluSmsError';
  }
}

export class DriverNotFoundError extends AnadoluSmsError {
  constructor(driver: string) {
    super(`"${driver}" adında bir SMS sağlayıcı driver'ı bulunamadı.`);
    this.name = 'DriverNotFoundError';
  }
}

export class SendFailedError extends AnadoluSmsError {
  constructor(
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'SendFailedError';
  }
}

export class OtpVerificationError extends AnadoluSmsError {
  constructor(message: string) {
    super(message);
    this.name = 'OtpVerificationError';
  }
}

export class UnsupportedCapabilityError extends AnadoluSmsError {
  constructor(driver: string, capability: string) {
    super(`"${driver}" sürücüsü "${capability}" özelliğini desteklemiyor.`);
    this.name = 'UnsupportedCapabilityError';
  }
}
