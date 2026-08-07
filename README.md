# Digital Fraud Hub — GitHub Pages Public Demo

Bu klasör **GitHub Pages üzerinde doğrudan çalışacak statik demo** sürümüdür.

## Neden statik?

GitHub Pages Node.js / Next.js backend çalıştırmaz. Bu nedenle bu sürüm:
- `index.html`
- `styles.css`
- `app.js`

dosyalarından oluşur ve backend gerektirmez.

## Canlı veri

"Canlı Haberleri Çek" butonu GDELT DOC 2.0 açık haber API'sini tarayıcıdan çağırır.

Varsayılan sorgu:
`(crash OR accident OR collision OR driver) sourcelang:turkish sourcecountry:turkey`

## Poliçe / hasar verisi

Public siteye gerçek şirket API anahtarlarını veya iç servis endpointlerini koymayın.

Demo varsayılan olarak sentetik poliçe/hasar kayıtlarıyla açılır. İsterseniz CSV yükleyebilirsiniz:
- Poliçe: `plate,policyNo,status,insured`
- Hasar: `plate,claimNo,status,lossDate`

CSV dosyaları yalnızca ziyaretçinin tarayıcında işlenir; site bir sunucuya yüklemez.

## GitHub Pages'e yayınlama

Repo kökünde bu dosyalar bulunmalı:
- `index.html`
- `styles.css`
- `app.js`
- `.nojekyll`

Sonra:
1. GitHub repo > Settings > Pages
2. Build and deployment: **Deploy from a branch**
3. Branch: **main**
4. Folder: **/(root)**
5. Save

Değişiklikleri push edin:
```bash
git add -A
git commit -m "feat: publish static Digital Fraud Hub demo"
git push origin main
```

Sayfa birkaç dakika içinde:
`https://<kullanici>.github.io/<repo>/`
adresinde güncellenir.
