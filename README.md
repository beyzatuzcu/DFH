# Digital Fraud Hub — Sigorta Fraud Erken Uyarı MVP

Açık kaynak haber içeriklerinde geçen trafik kazalarını ve plakaları tespit edip şirket içi **üretim/poliçe** ve **hasar** verileriyle eşleştiren, fraud araştırma ekiplerine erken uyarı sağlayan Next.js MVP uygulamasıdır.

> Bu sürüm otomatik hasar reddi / ödeme kararı üretmez. İnceleme önceliği ve risk sinyali sağlar.

## Özellikler

- Dashboard KPI ve son uyarılar
- Haber metninden Türkiye plaka formatı çıkarımı
- Anahtar kelime tabanlı risk sinyalleri (alkol, kaçma, ağır hasar, yaralanma vb.)
- Aktif poliçe eşleştirmesi
- Hasar dosyası eşleştirmesi
- Hasar henüz yoksa “erken uyarı” sinyali
- 0–100 risk skoru ve LOW / MEDIUM / HIGH / CRITICAL sınıflaması
- Manuel haber girişi
- Tek tık demo haber ingest
- Generic harici Haber API adaptörü
- Poliçe ve hasar CSV içe aktarma
- Kurumsal servis adapter’ına geçirilebilir mimari

## Teknoloji

- Next.js 16 / App Router
- React 19
- TypeScript
- JSON tabanlı yerel MVP store (kurumsal ortamda DB / servis adapter’ı ile değiştirilir)

Next.js 16 için Node.js 20.9+ gereklidir. Önerilen: Node 22 LTS.

## Kurulum

```bash
npm install
npm run dev
```

Tarayıcı: `http://localhost:3000`

Production build:

```bash
npm run build
npm start
```

## Demo

Dashboard üzerindeki **Demo Haberi Çek** butonuna bas. Uygulama örnek bir yerel haber oluşturur, plakayı çıkarır ve `data/db.json` içindeki poliçe / hasar kayıtlarıyla eşleştirir.

Demo plakalar:
- `74 ABC 741` — aktif poliçe, hasar ihbarı yok → erken uyarı
- `06 FRD 61` — aktif poliçe + açık hasar
- `34 TKS 2026` — aktif poliçe + geçmiş hasar

## CSV içe aktarma

### Poliçe CSV

```csv
policyNo,plate,insured,product,status,startDate,endDate
KSK-1,34 ABC 123,Demo Müşteri,Kasko,ACTIVE,2026-01-01,2027-01-01
```

### Hasar CSV

```csv
claimNo,plate,status,lossDate,noticeDate,reserve
HSR-1,34 ABC 123,OPEN,2026-08-01,2026-08-02,500000
```

## Harici Haber API

`.env.local`:

```env
NEWS_API_URL=https://provider.example/api/news?q=kaza+plaka
NEWS_API_KEY=your-key
```

Sonrasında:

```bash
curl -X POST http://localhost:3000/api/ingest/external
```

Adapter şu tip payload bekler:

```json
{
  "articles": [
    {
      "title": "...",
      "description": "...",
      "content": "...",
      "url": "https://...",
      "publishedAt": "2026-08-07T08:00:00Z",
      "source": { "name": "Kaynak" }
    }
  ]
}
```

Gerçek sağlayıcı farklı alan isimleri dönüyorsa `app/api/ingest/external/route.ts` içindeki mapping değiştirilir.

## Risk motoru

`lib/fraud.ts` içindedir. Örnek sinyaller:

- Alkol / promil: +35
- Olay yerinden kaçma: +30
- Ölümlü kaza: +30
- Ağır hasar: +20
- Yaralanma: +10
- Takla / savrulma: +10
- Aktif poliçe eşleşmesi: +25
- Hasar dosyası eşleşmesi: +15
- Aktif poliçe var, hasar henüz yok: +10

Skor 100 ile sınırlandırılır.

## Kurumsal canlıya geçişte yapılacaklar

1. JSON store yerine SQL Server / PostgreSQL veya kurum içi servis kullanımı.
2. Poliçe ve hasar servis adapter’ları.
3. SSO / LDAP / Entra ID kimlik doğrulaması ve rol bazlı yetki.
4. Haber sağlayıcı sözleşmesi, lisans ve kullanım koşulları.
5. KVKK / Bilgi Güvenliği değerlendirmesi ve veri minimizasyonu.
6. Audit log, kullanıcı aksiyon logu ve alarm kapanış nedeni.
7. Haber tekilleştirme / deduplication.
8. Görsel içindeki plaka için OCR/vision PoC (ayrı faz önerilir).
9. Scheduled job / queue ve retry mekanizması.
10. Monitoring, health check, secret management ve CI/CD.

## Git'e atma

```bash
git init
git add .
git commit -m "feat: digital fraud early warning MVP"
git branch -M main
git remote add origin <REPO_URL>
git push -u origin main
```

## Proje yapısı

```text
app/
  api/                 # Haber ingest, demo, CSV import
  haberler/            # Haber ekranı
  uyarilar/            # Fraud uyarı ekranı
  veri/                # Poliçe / hasar envanteri
  ayarlar/             # Entegrasyon açıklaması
components/
lib/
  fraud.ts             # Plaka çıkarımı + risk motoru
  store.ts             # MVP veri katmanı
data/db.json           # Demo veri
```

## Not

Bu repo kickoff / PoC / MVP gösterimi için doğrudan çalıştırılabilir şekilde hazırlanmıştır. Kurumsal üretim ortamında güvenlik ve entegrasyon maddeleri tamamlanmadan canlı hasar süreçlerine bağlanmamalıdır.

## Paket erişimi olmayan bilgisayarda (bağımlılıksız demo)

Repo ayrıca yalnızca Node.js standart kütüphanesini kullanan taşınabilir demo içerir; `npm install` gerekmez:

```bash
node portable/server.mjs
```

veya npm mevcutsa:

```bash
npm run portable
```

Tarayıcı: `http://localhost:3000`

Bu modda da haber/plaka tespiti, poliçe-hasar eşleştirmesi, risk skoru, demo ingest, manuel haber ekleme ve uyarı durum güncelleme çalışır.
