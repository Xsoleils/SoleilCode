# SoleilCode

SoleilCode, ücretsiz bulut modellerini ve yerel LLM'leri **SoleilRelay** üzerinden
birleştiren, terminalde çalışan açık kaynak bir kodlama ajanıdır.

> Model seçme, amacını söyle. SoleilCode ücretsiz kapasiteni yönetsin.

Terminal maskotu, açık güneşi taşıyan özgün Soleil kedisidir:

```text
 /\_/\
( •.• )
/ >☀
```

Etkileşimli terminalde yeşil Soleil teması tam ekran açılır. Kedi, çalışma modu,
model sayısı ve proje yolu üst başlıkta sabit kalır; konuşma ve araç kayıtları alt
bölgede kayar. `/exit` ile çıkıldığında önceki CMD ekranı geri gelir.

## İlk sürümde neler çalışıyor?

- CMD veya PowerShell içinde etkileşimli `soleil` komutu
- Claude Code benzeri proje klasörü üzerinden çalışma
- Dosya listeleme, okuma ve metin arama
- Onaylı dosya yazma ve güvenli tam-metin değiştirme
- Onaylı terminal komutu çalıştırma
- Git farkını inceleme
- Ücretsiz sağlayıcılar arasında otomatik fallback
- Ollama üzerindeki yerel modelleri otomatik keşfetme
- `auto`, `free`, `local` ve `private` çalışma modları
- Ücretli modele geçmeyen sıfır maliyet kilidi
- Sağlayıcı hata verdiğinde kısa süreli cooldown

SoleilCode henüz erken geliştirme sürümüdür. Her yazma ve komut işlemi varsayılan
olarak kullanıcı onayı ister.

## Windows kurulumu

Node.js 22 veya daha yenisi gereklidir.

1. `install-windows.cmd` dosyasını çalıştırın.
2. Çalışmak istediğiniz proje klasöründe CMD açın.
3. `soleil doctor` ile modelleri kontrol edin.
4. `soleil` yazarak SoleilCode'u başlatın.

İlk ücretsiz modeli eklemenin en kolay yolu:

```powershell
soleil setup
```

Tam ekran model merkezinde Groq, Gemini veya OpenRouter seçilebilir. Token girişi
gizlidir; yazılan değer terminalde görünmez. Aynı sağlayıcı için farklı, meşru
hesaplara ait birden fazla token eklenebilir.

Elle kurulum:

```powershell
npm install
npm run build
npm link
```

Ardından herhangi bir klasörde:

```powershell
soleil
```

Farklı bir proje klasörünü açıkça seçmek için:

```powershell
soleil --cwd C:\projeler\uygulamam
```

## Ücretsiz model bağlama

### Soleil model merkezi

SoleilCode içindeyken aşağıdaki komutlar kullanılabilir:

```text
/setup    Token ekleme, listeleme, öneri ve silme merkezi
/tokens   Bağlı tokenların sağlayıcı, etiket ve gizli kimliklerini göster
/free     Doğrulanmış ücretsiz seçenekleri ve kayıt adreslerini göster
```

Tokenlar `%USERPROFILE%\.soleilcode\credentials.json` altında kullanıcı profiline
özel izinlerle tutulur. Ham token terminalde, model mesajlarında veya durum
ekranında gösterilmez. Bu ilk kasa sürümü işletim sistemi anahtar zinciriyle
şifrelenmiş değildir; cihaz disk şifrelemesi kullanılması önerilir.

Birden fazla token, sahip olduğunuz hesapları tek yerde yönetmek ve bir sağlayıcı
geçici olarak kullanılamadığında diğer meşru rotaya geçmek içindir. Sahte hesap,
kota atlatma veya sağlayıcı koşullarını ihlal eden kullanım desteklenmez. Aynı
kuruluşa ait farklı tokenlar ortak kotayı paylaşabilir.

### Ollama — tamamen yerel

Ollama çalışıyorsa kurulu modeller otomatik bulunur. Belirli bir modeli seçmek için:

```powershell
set OLLAMA_MODEL=qwen2.5-coder:7b
soleil --mode local
```

Kalıcı ortam değişkeni için Windows'ta `setx` kullanılabilir. Değer sonraki terminal
pencerelerinde etkinleşir.

### Groq ücretsiz kotası

```powershell
set GROQ_API_KEY=...
soleil
```

SoleilRelay varsayılan olarak Groq'un güncel ücretsiz planındaki birkaç kodlama
modelini ayrı fallback adayları olarak kullanır. Tek bir model zorlamak isterseniz
`GROQ_MODEL` değerini ayrıca ayarlayın.

### Gemini ücretsiz kotası

```powershell
set GEMINI_API_KEY=...
set GEMINI_MODEL=...
soleil
```

### OpenRouter ücretsiz model

Varsayılan olarak OpenRouter'ın `openrouter/free` yönlendiricisi kullanılır:

```powershell
set OPENROUTER_API_KEY=...
soleil
```

Belirli bir ücretsiz model istenirse `OPENROUTER_MODEL` ayrıca ayarlanabilir.

### Herhangi bir OpenAI uyumlu ücretsiz sunucu

```powershell
set SOLEIL_BASE_URL=http://127.0.0.1:1234/v1
set SOLEIL_MODEL=local-coder
set SOLEIL_API_KEY=
soleil
```

Anahtarlar yapılandırma dosyalarına yazılmaz. `.soleilcode.example.json`, özel
sağlayıcı eklemek için örnektir; gerçek anahtarın yalnızca ortam değişkeninin adı
yazılır.

## Terminal komutları

| Komut | İşlev |
|---|---|
| `/help` | Komutları gösterir |
| `/models` | Bulunan modelleri gösterir |
| `/status` | SoleilRelay durumunu gösterir |
| `/setup` | Ücretsiz model ve token merkezini açar |
| `/tokens` | Bağlı tokenları gizli kimlikleriyle gösterir |
| `/free` | Güncel ücretsiz seçenekleri önerir |
| `/mode auto` | Ücretsiz bulut ve yerel modelleri birlikte kullanır |
| `/mode free` | Yalnızca ücretsiz kaynakları kullanır |
| `/mode local` | Yalnızca yerel modelleri kullanır |
| `/mode private` | Kaynak kodunu cihazdan çıkarmaz |
| `/clear` | Konuşma bağlamını temizler |
| `/exit` | Uygulamadan çıkar |

Dosya ve terminal onaylarını yalnızca kontrollü ortamlarda kapatmak için `--yes`
kullanılabilir.

## SoleilRelay

SoleilRelay her model için öncelik, maliyet türü, geçmiş başarı, hata ve ortalama
gecikme bilgilerini kullanır. Bir model başarısız olduğunda sıradaki ücretsiz veya
yerel modele geçer. Mevcut sürüm ücretli model tanımını kabul etmez.

İstekler ayrıca yerel olarak sınıflandırılır:

- Sohbet ve hızlı sorular
- Proje keşfi ve açıklama
- Kod yazma veya düzenleme
- Hata ayıklama
- Kod/güvenlik incelemesi
- Test ve doğrulama
- Uzun bağlamlı proje analizi

SoleilRelay her görevde o alanda güçlü olarak işaretlenmiş ücretsiz modeli öne
alır. Seçilen model ve seçim nedeni terminalde gösterilir.

> Önemli: SoleilCode yalnızca ücretsiz olarak işaretlenmiş rotaları seçer; bağlı
> sağlayıcı hesabının ücretli plana geçirilmiş olup olmadığını her sağlayıcıda
> teknik olarak doğrulayamaz. Gerçek sıfır maliyet için faturalandırması kapalı,
> ücretsiz katman hesapları kullanın.

```text
Kullanıcı görevi
      ↓
Soleil Agent
      ↓
SoleilRelay → ücretsiz bulut modeli
      │       yerel Ollama modeli
      │       özel OpenAI uyumlu model
      ↓
Dosya / arama / terminal araçları
      ↓
Kullanıcı onayı ve doğrulama
```

## Geliştirme

```powershell
npm run dev
npm test
npm run check
```

## Güvenlik yaklaşımı

- `.env`, `.git`, özel anahtar ve sertifika dosyalarının okunması engellenir.
- Dosya araçları çalışma klasörünün dışına çıkamaz.
- Yazma ve komut çalıştırma işlemleri varsayılan olarak açık onay ister.
- API anahtarları modele veya terminal durum ekranına gönderilmez.
- Kurulum merkezinde token girişi ekranda yankılanmaz.
- Token listesinde yalnızca geri döndürülemez kısa parmak izi gösterilir.
- `private` modunda yalnızca yerel modeller aday olabilir.

## Lisans

MIT
