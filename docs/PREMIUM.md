# Kalp Kalbe Premium

Premium çift başınadır (`couples/{id}.premium`). İki kaynağı var:

| Kaynak | Alan | Kim yazar |
| --- | --- | --- |
| Hediye | `premium.gift { until \| null, note, grantedBy }` | Yönetici, Ayarlar → Hediye Premium (`adminGrantPremium`) |
| Abonelik | `premium.store { until, productId, store, buyerUid }` | RevenueCat → `revenuecatWebhook` |

`plan` alanı ikisinden biri aktifse `"premium"`, değilse `"free"` olur. İstemci `premium` ve `plan` alanlarını değiştiremez (firestore.rules).

Şimdilik `PREMIUM_ENFORCED = false` (js/app.js ve functions/index.js) ve `premiumEnforced()` false (firestore.rules): 👑 özellikler herkese açık. Satış başlayınca üçü birlikte `true` yapılır.

Ücretsiz kota: 36 fotoğraf (Fotoğraflarımız + fotoğraflı anılar birlikte) ve 36 şarkı. Sayılar `couples.usage`'ta, sunucu her ekleme/silmede baştan sayar (`recountUsage`). Sınır üç yerde: js/premium.js `FREE_LIMITS`, functions/index.js `FREE_LIMITS`, firestore.rules `freeLimitOk` (36).

## Fiyatlar

- Aylık: 80 TL (`$rc_monthly` paketi)
- Yıllık: 750 TL (`$rc_annual` paketi)
- Ömür boyu yok.

## Yönetici olmak

Firestore'da `admins/{senin uid}` belgesi oluştur (içi boş olabilir). Ayarlar'da "Hediye Premium" bölümü görünür.

## Mağazalar hazır olunca

1. App Store Connect ve Google Play Console'da iki abonelik ürünü (aynı abonelik grubu): aylık ve yıllık.
2. RevenueCat: proje → uygulamalar (iOS `com.kalpkalbe.app`, Android `com.kalpkalbe.app`) → ürünler → entitlement `premium` → offering `default` içinde `$rc_monthly` ve `$rc_annual` paketleri.
3. Public API anahtarlarını `js/capacitor.js` → `REVENUECAT_KEYS` içine yaz.
4. RevenueCat → Integrations → Webhooks:
   - URL: `https://europe-west1-dilara-app-6c7ab.cloudfunctions.net/revenuecatWebhook`
   - Authorization: uzun rastgele bir değer; aynısını `functions/.env` içine `REVENUECAT_WEBHOOK_AUTH=...` olarak yaz ve functions'ı deploy et.
5. `PREMIUM_ENFORCED = true` (js/app.js, functions/index.js) ve firestore.rules → `premiumEnforced()` `true` ve yasal metin sürümünü (`legal/config.js → version`) artır.

Kampanyalar için mağazaların kendi promosyon kodları (App Store "Offer Codes", Google Play "Promo codes") kullanılır; uygulama içinde kod girme alanı yoktur (Apple 3.1.1).
