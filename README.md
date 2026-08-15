# @voxyfy/anadolusms — Türkiye SMS API ve OTP Doğrulama Kütüphanesi

<p align="center">
  <img src=".github/banner.png" alt="anadolusms" width="640">
</p>

**anadolusms**, İleti Merkezi, Verimor, VatanSMS ve NetGSM gibi Türkiye'deki
SMS/toplu mesajlaşma sağlayıcılarını tek bir arayüz altında birleştiren;
kayıt, şifre sıfırlama ve iki adımlı doğrulama (2FA) akışları için hazır bir
**OTP (tek kullanımlık şifre) üretme/gönderme/doğrulama motoruyla** gelen,
tamamen ücretsiz ve açık kaynaklı bir **Node.js / TypeScript kütüphanesidir**.
[AnadoluPay](https://github.com/Voxyfy/anadolupay-node) (ödeme) ve
[AnadoluShip](https://github.com/Voxyfy/anadoluship) (kargo) ile aynı
sürücü (driver) mimarisini paylaşır: sağlayıcı değiştirmek bir entegrasyon
projesi değil, bir konfigürasyon satırıdır.

## Bu kütüphane neden var, hangi soruna çözüm sunuyor?

Neredeyse her Türk yazılım projesi, er ya da geç aynı işi tekrar yazmak
zorunda kalıyor: kullanıcı kaydında telefon doğrulama, şifre sıfırlamada
SMS kodu, ödeme onayında 2FA. Sağlayıcı seçimi bile karmaşık — İleti
Merkezi'nin REST/JSON API'si, Verimor'un GET/POST + IP whitelist zorunluluğu,
VatanSMS'in kendi JSON şeması, NetGSM'in Basic Auth'lu REST'i — hepsi farklı
kimlik doğrulama, farklı istek formatı, farklı hata kodu kullanıyor. Üstüne,
**hiçbiri gerçek bir "OTP doğrulama servisi" sunmuyor** — hepsi düz SMS
taşıyıcı; kod üretme, süre yönetimi ve doğrulama mantığını her ekip kendi
projesinde sıfırdan yazıyor.

`anadolusms` bu işi tek, test edilmiş bir katmana indiriyor: sağlayıcı
farkını `SmsProvider` arayüzünün arkasına gizliyor, OTP mantığını da
kütüphanenin çekirdeğinde (sağlayıcıdan bağımsız) hazır veriyor.

> ⚠️ **Önemli — dürüstçe bilmeniz gerekenler:** Bu kütüphanedeki sürücüler
> her sağlayıcının **resmi dokümantasyonuna** (ve mümkün olan yerde canlı
> olarak doğrulanmış hata yanıtlarına) dayanarak yazıldı, ama **gerçek bir
> hesapla uçtan uca test edilmedi** — üretime almadan önce kendi test
> hesabınızla bir SMS gönderip doğrulamanızı öneririz. Ayrıntılar için
> [Sınırlamalar](#sınırlamalar) bölümüne bakın.

## Kurulum

```bash
npm install @voxyfy/anadolusms
```

## Hızlı başlangıç — 30 saniyede kullanım

```ts
import { createAnadoluSms, IletiMerkeziProvider } from '@voxyfy/anadolusms';

const anadolusms = createAnadoluSms({
  drivers: {
    iletimerkezi: () =>
      new IletiMerkeziProvider({
        key: process.env.ILETIMERKEZI_API_KEY!,
        hash: process.env.ILETIMERKEZI_API_HASH!,
        defaultSender: process.env.ILETIMERKEZI_SENDER,
      }),
  },
});

await anadolusms.driver('iletimerkezi').sendSms({
  to: '905321234567',
  message: 'Merhaba, siparişiniz kargoya verildi.',
});
```

### Örnek 2 — OTP (doğrulama kodu) gönderme ve kontrol etme

OTP mantığı sağlayıcıdan bağımsız olarak kütüphanenin kendisinde
çalışır — hangi driver'ı kullanırsanız kullanın `sendOtp`/`verifyOtp`
aynı şekilde davranır:

```ts
// 1) Kullanıcı "kod gönder" dediğinde:
await anadolusms.sendOtp('iletimerkezi', '905321234567');

// 2) Kullanıcı kodu girdiğinde:
const result = anadolusms.verifyOtp('905321234567', kullanicininGirdigiKod);

if (result.valid) {
  // doğrulama başarılı, kullanıcıyı içeri al
} else {
  // result.reason: 'not_found' | 'expired' | 'mismatch' | 'max_attempts'
  console.log('Doğrulama başarısız:', result.reason);
}
```

### Örnek 3 — Express ile telefon doğrulama akışı

```ts
import express from 'express';

const app = express();
app.use(express.json());

app.post('/otp/gonder', async (req, res) => {
  await anadolusms.sendOtp('iletimerkezi', req.body.telefon);
  res.json({ ok: true });
});

app.post('/otp/dogrula', (req, res) => {
  const result = anadolusms.verifyOtp(req.body.telefon, req.body.kod);
  if (!result.valid) return res.status(400).json({ hata: result.reason });
  res.json({ ok: true });
});
```

### Örnek 4 — OTP ayarlarını özelleştirmek (süre, hane sayısı, metin)

```ts
const anadolusms = createAnadoluSms({
  drivers: { iletimerkezi: () => new IletiMerkeziProvider({ /* ... */ }) },
  otp: {
    length: 4,              // varsayılan: 6
    ttlSeconds: 300,        // varsayılan: 180 (3 dakika)
    maxAttempts: 3,         // varsayılan: 5
    messageTemplate: (code) => `AnadoluApp doğrulama kodunuz: ${code}. Kimseyle paylaşmayın.`,
  },
});
```

### Örnek 5 — Birden fazla sağlayıcı tanımlamak, birini yedek olarak kullanmak

```ts
import { createAnadoluSms, IletiMerkeziProvider, VerimorProvider } from '@voxyfy/anadolusms';

const anadolusms = createAnadoluSms({
  drivers: {
    iletimerkezi: () => new IletiMerkeziProvider({ key: '...', hash: '...' }),
    verimor: () => new VerimorProvider({ username: '908501234567', password: '...' }),
  },
});

async function saglamGonder(to: string, message: string) {
  try {
    return await anadolusms.driver('iletimerkezi').sendSms({ to, message });
  } catch {
    // birincil sağlayıcı başarısız olursa yedek sağlayıcıya geç
    return await anadolusms.driver('verimor').sendSms({ to, message });
  }
}
```

### Örnek 6 — Teslimat durumu sorgulama

```ts
const { id } = await anadolusms.driver('iletimerkezi').sendSms({
  to: '905321234567',
  message: 'Kargonuz yolda.',
});

const rapor = await anadolusms.driver('iletimerkezi').getDeliveryStatus(id);
console.log(rapor.status); // SmsStatus.Delivered | Failed | Pending | Sent | Unknown
```

### Örnek 7 — Bakiye sorgulama

```ts
const bakiye = await anadolusms.driver('verimor').getBalance();
console.log(`${bakiye.amount} ${bakiye.unit}`); // örn. "123 credit"
```

> NetGSM'in resmi REST API'sinde bakiye sorgulama endpoint'i bulunmuyor —
> `netgsm` driver'ında `getBalance()` çağırırsanız `UnsupportedCapabilityError`
> fırlatılır.

### Örnek 8 — Testlerde gerçek bir sağlayıcıya bağlanmadan `FakeProvider` kullanmak

```ts
import { createAnadoluSms, FakeProvider } from '@voxyfy/anadolusms';

const fake = new FakeProvider();
const anadolusms = createAnadoluSms({ drivers: { fake: () => fake } });

await anadolusms.driver('fake').sendSms({ to: '905321234567', message: 'test' });
console.log(fake.sent); // gönderilen tüm mesajlar bellekte
```

## Desteklenen sağlayıcılar

| Sağlayıcı | Driver | API tipi | Doğrulama durumu |
|---|---|---|---|
| **İleti Merkezi** | `IletiMerkeziProvider` | REST/JSON | Resmi dokümantasyona göre yazıldı, gerçek hesapla test edilmedi |
| **Verimor** | `VerimorProvider` | GET/POST | Resmi GitHub dokümanına (github.com/verimor/SMS-API) göre yazıldı, gerçek hesapla test edilmedi |
| **VatanSMS** | `VatanSmsProvider` | REST/JSON | Base URL ve hata yanıtı şekli canlı olarak doğrulandı; başarı yanıtının bazı alan adları dokümante edilmediği için çıkarımla yazıldı |
| **NetGSM** | `NetGsmProvider` | REST/JSON (Basic Auth) | Resmi OpenAPI spesifikasyonuna (github.com/netgsm/netgsm-sms-js) göre yazıldı, gerçek hesapla test edilmedi. Bakiye sorgulama bu API'de yok. |

### Test/deneme ortamı erişimi (sağlayıcı bazında)

Bu kütüphane hiçbir sağlayıcının sandbox'ına bizim adımıza bağlanmadı —
aşağıdaki bilgiler her sağlayıcının kendi genel/herkese açık
dokümantasyonundan alınmıştır; gerçek test için kendi hesabınızı
açmanız gerekir.

| Sağlayıcı | Ücretsiz deneme hesabı | Not |
|---|---|---|
| **İleti Merkezi** | ✅ Var — "Ücretsiz Üye" kaydıyla panelden test kredisi tanımlanıyor | Test gönderimlerinde `sender` alanına `"APITEST"` yazılabiliyor (onaylı başlık gerekmiyor) |
| **Verimor** | ✅ Var — kredi kartı istemeden 1000 SMS deneme kredisi | Kayıt sonrası **panelde gönderim yapacağınız sunucunun IP adresini tanımlamanız zorunlu** (BTK yönergesi) — tanımlamazsanız her istek 401 döner |
| **VatanSMS** | ✅ Var — ücretsiz demo kayıtla 10 SMS hediye kredi | Taahhütsüz; gerçek kimlik bilgisi olmadan da API'nin canlı olduğunu ve hata şeklini doğrulayabildik (bkz. yukarıdaki "Doğrulama durumu") |
| **NetGSM** | ⚠️ Belirsiz | Kayıt akışı müşteri temsilcisi görüşmesi ve onaylı gönderici başlığı istiyor gibi görünüyor; herkese açık dokümantasyonda ücretsiz test kredisi ibaresine rastlanmadı — kendi hesabınızla teyit etmeniz gerekir |

Test ederken gerçek bir numaraya SMS gitmesini istemiyorsanız, önce
[`FakeProvider`](#örnek-8--testlerde-gerçek-bir-sağlayıcıya-bağlanmadan-fakeprovider-kullanmak)
ile uygulama akışınızı (OTP gönder/doğrula, hata yönetimi vb.) deneyin;
gerçek sağlayıcıya sadece son adımda geçin.

## API

### `AnadoluSms`

| Metot | Açıklama |
|---|---|
| `driver(name)` | Belirtilen sürücüyü döner (ilk çağrıda üretir, sonra önbellekten verir). Tanımsız isimde `DriverNotFoundError` fırlatır. |
| `available()` | Yapılandırılmış tüm driver adlarını döner. |
| `sendOtp(driver, to, options?)` | OTP kodu üretir, verilen driver ile gönderir, doğrulama için saklar. `{ id }` döner. |
| `verifyOtp(to, code)` | Girilen kodu saklanan kodla karşılaştırır. `{valid: true}` veya `{valid: false, reason}` döner. |
| `clearOtp(to)` | Bir numara için beklemede olan OTP kaydını elle siler. |

### `SmsProvider` (her driver'ın uyguladığı arayüz)

| Metot | Açıklama |
|---|---|
| `sendSms(data)` | `{to, message, sender?, commercial?}` alır, `{id, raw?}` döner. |
| `getDeliveryStatus(id)` | Teslimat durumu raporu döner (`SmsStatus` ve varsa alıcı bazlı detay). |
| `getBalance()` | Kalan bakiye/kredi döner. Desteklenmiyorsa `UnsupportedCapabilityError` fırlatabilir. |

## Sınırlamalar — dürüstçe neyi yapmadığını bilin

- **OTP kayıtları bellek içi (in-memory) tutulur.** Uygulamanızı birden
  fazla process/sunucuda (horizontal scaling, PM2 cluster, çoklu container)
  çalıştırıyorsanız, bir process'te gönderilen OTP başka bir process'te
  doğrulanamaz — istek load balancer tarafından farklı bir örneğe
  yönlendirilirse doğrulama `not_found` döner. Tek process'te veya
  sticky-session arkasında çalışan uygulamalar için sorun yoktur; dağıtık
  ortamlar için kendi Redis tabanlı bir OTP deposu yazmanız gerekir (bkz.
  [Yol haritası](#yol-haritası)).
- **Hiçbir sağlayıcı gerçek hesapla test edilmedi.** Sürücüler resmi
  dokümantasyona (ve mümkün olduğunda canlı doğrulanmış hata yanıtlarına)
  dayanıyor ama üretime almadan önce kendi kimlik bilgilerinizle bir test
  göndermeniz şiddetle önerilir.
- **VatanSMS başarı yanıtının tüm alan adları dokümante değil.** `data.id`
  gibi alan adları en makul varsayımla eşlendi — gerçek bir yanıtta farklı
  çıkarsa `VatanSmsProvider`'ı kendi projenizde küçük bir düzeltmeyle
  uyarlamanız gerekebilir.
- **NetGSM'in `status` alanı resmi şemada enum olarak tanımlı değil**,
  bu yüzden teslimat durumu `deliveredDate`/`errorCode` alanlarından
  çıkarılıyor (heuristic) — sayısal `status` koduna güvenilmiyor.
- **Verimor, gönderim yapılan sunucunun IP adresinin önceden panelde
  tanımlanmasını zorunlu tutar** (BTK yönergeleri gereği). Bu adımı
  atlarsanız "Hesabınızda izinli IP ayarları yapılmamış" hatası alırsınız.
- **Uluslararası SMS, İYS (İleti Yönetim Sistemi) kaydı, ticari ileti
  onayları gibi konular kapsam dışıdır** — `commercial` bayrağı bazı
  sağlayıcılarda temel bir IYS alanını doldurur ama İYS entegrasyonunun
  kendisini yönetmez.

## Yol haritası

1. Çekirdek sürücü mimarisi + 4 sağlayıcı (İleti Merkezi, Verimor,
   VatanSMS, NetGSM) + bellek içi OTP motoru — ✅ tamamlandı
2. Dağıtık ortamlar için değiştirilebilir (pluggable) OTP deposu arayüzü
   (Redis vb. ile) — planlanıyor
3. Ek sağlayıcılar (Mutlucell, kurumsal anlaşmayla Turkcell) — geri
   bildirime bağlı

## Sıkça sorulan sorular

**OTP kodunu SMS sağlayıcısı mı üretiyor, yoksa kütüphane mi?**
Kütüphane. Araştırdığımız hiçbir Türk SMS sağlayıcısı gerçek bir "OTP
doğrulama servisi" sunmuyor — hepsi düz SMS taşıyıcı. Kod üretme, süre
yönetimi ve doğrulama tamamen `anadolusms` içinde, sağlayıcıdan bağımsız
çalışır.

**Sağlayıcı değiştirmek zor mu?**
Hayır — `drivers` haritasına yeni sağlayıcıyı ekleyip `driver('yeniAd')`
ile çağırmanız yeterli, uygulama kodunuzun geri kalanı değişmez.

**Birden fazla sunucuda (load balancer arkasında) OTP doğrulama çalışır mı?**
Şu an için hayır, bkz. [Sınırlamalar](#sınırlamalar). Tek process/sticky
session için sorunsuz çalışır.

## İlgili projeler

Aynı ekip tarafından geliştirilen, aynı sade ve tek amaca odaklı yaklaşımla
yazılmış diğer açık kaynak kütüphaneler:

- **[Voxyfy/anadolusms-example](https://github.com/Voxyfy/anadolusms-example)**
  — bu paketin gerçek SMS sağlayıcı hesaplarına karşı denendiği Express test
  projesi. OTP gönder/doğrula, düz SMS, teslimat durumu ve bakiye sorgusu için
  basit bir arayüz içerir.
- **[Voxyfy/anadolupay](https://github.com/Voxyfy/anadolupay)** (PHP/Laravel)
  ve **[Voxyfy/anadolupay-node](https://github.com/Voxyfy/anadolupay-node)**
  ([npm](https://www.npmjs.com/package/@voxyfy/anadolupay)) — Türk banka ve
  ödeme sağlayıcıları için tek arayüzlü ödeme kütüphanesi.
- **[Voxyfy/anadoluship](https://github.com/Voxyfy/anadoluship)**
  ([npm](https://www.npmjs.com/package/@voxyfy/anadoluship)) — Türk kargo
  firmaları için tek arayüzlü kargo ve gönderi takip kütüphanesi.
- **[Voxyfy/anadolushield](https://github.com/Voxyfy/anadolushield)**
  ([npm](https://www.npmjs.com/package/@voxyfy/anadolushield)) — yapay
  zeka servislerine göndermeden önce kişisel verileri maskeleyen KVKK
  kütüphanesi.
- **[Voxyfy/anadolucookie](https://github.com/Voxyfy/anadolucookie)**
  ([npm](https://www.npmjs.com/package/@voxyfy/anadolucookie)) — KVKK/GDPR
  uyumlu çerez rıza (cookie consent) banner kütüphanesi.

## Lisans

MIT
