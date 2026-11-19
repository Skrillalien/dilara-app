# Mağazaya çıkmadan önce

- [ ] Yasal metin sürümünü artır (`legal/config.js → version`): herkesten yeni gizlilik metni için onay istenir
- [ ] Firebase proje sahibi hesaplarında (kişisel hesap ve kalpkalbe.app@gmail.com) iki adımlı doğrulama açık
- [ ] Firebase / Google Cloud IAM: projede sadece bu iki hesap yetkili
- [ ] (İsteğe bağlı) Google Cloud → IAM → Denetim kayıtları: Cloud Storage ve Cloud Firestore için "Veri okuma" kayıtlarını aç
- [ ] App Check ve API anahtarı kısıtlamaları (sürüm imzası belli olunca)
- [ ] Premium satış açılınca `PREMIUM_ENFORCED = true` (js/app.js ve functions/index.js) — bkz. `PREMIUM.md`

## Sonra düşünülecek

- Uçtan uca şifreleme (belki Premium'un parçası): anahtar paylaşımı, kurtarma, Yılımız ve bildirim önizlemelerine etkisi
