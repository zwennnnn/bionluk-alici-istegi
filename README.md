# Bionluk Alıcı İsteği Bildirim Eklentisi

Bu Chrome eklentisi, Bionluk.com'daki "Alıcı İstekleri" sayfasını periyodik olarak kontrol eder ve yeni bir alıcı isteği yayınlandığında kullanıcıyı masaüstü bildirimi ve sesli uyarı ile bilgilendirir. Bu sayede freelance çalışanların yeni iş fırsatlarını kaçırmamasına yardımcı olur.

## Özellikler

*   **Otomatik Kontrol:** Belirlenen aralıklarla (varsayılan olarak 1 dakika) Bionluk alıcı istekleri sayfasını otomatik olarak yeniler ve kontrol eder.
*   **Anlık Bildirim:** Yeni bir istek algılandığında masaüstü bildirimi gösterir.
*   **Sesli Uyarı:** Yeni istek bildirimiyle birlikte sesli bir uyarı çalar.
*   **Akıllı Takip:** Sadece gerçekten yeni olan istekler için bildirim gönderir, daha önce bildirilen veya kullanıcı tarafından görüntülenen istekler için tekrar bildirim yapmaz.
*   **Verimli Çalışma:** Mevcut Bionluk sekmesini bularak yeniler, gereksiz yere yeni sekmeler açmaz.
*   **Dinamik İçerik Uyumu:** Bionluk sayfasındaki isteklerin JavaScript ile dinamik olarak yüklenmesini bekleyerek doğru veriyi alır.
*   **İlk Çalıştırmada Sessizlik:** Eklenti ilk kez çalıştığında veya tarayıcı yeni açıldığında mevcut tüm istekler için bildirim göndermez, sadece eklenti aktifken gelen yeni istekleri bildirir.
*   **Popup Üzerinden Yönetim (Gelecek Özellik):** Bildirimleri yok sayma, arşivleme gibi özelliklerin eklenti popup'ı üzerinden yönetilmesi planlanmaktadır.

## Çalışma Prensibi

1.  **Kurulum:** Eklenti Chrome tarayıcısına kurulur.
2.  **Periyodik Kontrol (`background.js`):** Arka planda çalışan bir betik, `chrome.alarms` API'si ile düzenli aralıklarla Bionluk alıcı istekleri sayfasını kontrol etmek üzere tetiklenir.
3.  **Sekme Yönetimi (`background.js`):** Öncelikle açık sekmeler arasında Bionluk alıcı istekleri sayfası aranır. Bulunursa o sekme yenilenir, bulunamazsa yeni bir sekmede açılır.
4.  **Veri Çekme (`content.js`):** Sayfa yüklendikten ve alıcı istekleri dinamik olarak DOM'a eklendikten sonra, `content.js` betiği sayfadaki en son alıcı isteklerinin detaylarını (kullanıcı adı, başlık, yayın tarihi vb.) toplar. Her isteğe özgü bir kimlik (ID) oluşturulur.
5.  **Veri İletişimi:** `content.js` topladığı verileri `background.js`'e mesajlaşma API'si aracılığıyla iletir.
6.  **Karşılaştırma ve Bildirim (`background.js`):**
    *   `background.js`, `content.js`'den gelen en son isteğin ID'sini, daha önce depoladığı son bilinen istek ID'si (`lastKnownRequestId`) ile karşılaştırır.
    *   Eğer ID'ler farklıysa ve bu istek daha önce bildirilmemiş/yok sayılmamışsa, yeni bir istek olduğu anlaşılır.
    *   Kullanıcıya `chrome.notifications` API'si ile bir masaüstü bildirimi gösterilir.
    *   `Offscreen Document` kullanılarak bir ses dosyası (`notification.mp3`) çalınır.
    *   Yeni isteğin ID'si `lastKnownRequestId` olarak güncellenir.
7.  **İlk Çalıştırma Mantığı:** Eklenti ilk kez çalıştığında veya tarayıcı yeniden başlatıldığında, o an sayfada bulunan istekler için bildirim göndermez. Sadece bu ilk kontrolden *sonra* gelen yeni istekler için bildirimde bulunur.

## Kurulum (Geliştirici Modu)

1.  Bu repoyu bilgisayarınıza klonlayın veya ZIP olarak indirin ve bir klasöre çıkarın.
2.  Chrome tarayıcınızı açın.
3.  Adres çubuğuna `chrome://extensions` yazın ve Enter'a basın.
4.  Sağ üst köşedeki "Geliştirici modu" (Developer mode) seçeneğini aktif hale getirin.
5.  "Paketlenmemiş öğe yükle" (Load unpacked) butonuna tıklayın.
6.  Eklenti dosyalarının bulunduğu klasörü seçin.
7.  Eklenti listenizde "Bionluk Alıcı İsteği Bildirim Eklentisi" görünecektir. Artık kullanıma hazırdır.

## Teknolojiler

*   JavaScript
*   Chrome Extension APIs (Alarms, Tabs, Notifications, Storage, Runtime, Offscreen)
*   HTML (Popup için)
*   CSS (Popup için)
*   `MutationObserver` (Dinamik içerik takibi için)

## Gelecekteki Geliştirmeler

*   Popup arayüzü üzerinden bildirimleri "okundu" olarak işaretleme, sessize alma veya arşivleme.
*   Belirli anahtar kelimelere göre filtreleme yaparak sadece ilgili istekler için bildirim alma.
*   Kullanıcının kontrol aralığını ayarlayabilmesi.
*   Bildirim sesini seçme veya kapatma seçeneği.
