// Arka plan işlemleri, alarm yönetimi, bildirimler ve depolama burada olacak.
console.log("Bionluk Alıcı İsteği background script yüklendi.");

const CHECK_INTERVAL_MINUTES = 1; // Kontrol aralığı (dakika cinsinden)
const BIONLUK_URL = "https://www.bionluk.com/panel/alici-istekleri";
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Hangi sekmelerden CONTENT_SCRIPT_READY mesajı beklediğimizi takip eder
let pendingReadyTabs = new Set();
// READY_TIMEOUT_MS, content.js'in ilk veriyi göndermesi için beklenecek süre.
// MutationObserver kullandığımız için bu süreyi biraz daha uzun tutabiliriz.
const READY_TIMEOUT_MS = 15000; // 15 saniye

async function hasOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const matchedClients = await clients.matchAll();
    for (const client of matchedClients) {
        if (client.url === offscreenUrl) {
            return true;
        }
    }
    return false;
}

async function playSoundViaOffscreen(soundFileRelativePath) {
    try {
        const offscreenDocumentExists = await hasOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
        if (!offscreenDocumentExists) {
            await chrome.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
                justification: 'Yeni Bionluk isteği için bildirim sesi çalma',
            });
        }
      
        const soundFileFullPath = chrome.runtime.getURL(soundFileRelativePath);
        chrome.runtime.sendMessage({ 
            type: 'PLAY_SOUND', 
            payload: { soundFile: soundFileFullPath },
            target: "offscreen"
         });
    } catch (e) {
        console.error("Background: playSoundViaOffscreen içinde hata:", e);
    }
}

// Eklenti ilk yüklendiğinde veya güncellendiğinde çalışır
chrome.runtime.onInstalled.addListener(() => {
  console.log("Eklenti yüklendi/güncellendi.");
  chrome.alarms.create("bionlukCheck", {
    delayInMinutes: 0.2, 
    periodInMinutes: CHECK_INTERVAL_MINUTES
  });
  chrome.storage.local.set({ 
    lastKnownRequestId: null, 
    notifiedRequests: [], 
    ignoredRequests: [], 
    archivedRequests: [],
    isExtensionActive: true, // Eklenti başlangıçta aktif
    allRequestsData: {}, // { requestId: {title, bodyText, detailUrl, date ...} }
    isInitialRunComplete: false // İlk çalıştırma bayrağı
  });
});

// Alarm tetiklendiğinde çalışır
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "bionlukCheck") {
    const { isExtensionActive } = await chrome.storage.local.get("isExtensionActive");
    if (isExtensionActive) {
        console.log("Alarm tetiklendi, Bionluk kontrol ediliyor...");
        await checkBionlukPage();
    } else {
        console.log("Eklenti pasif, Bionluk kontrol edilmiyor.");
    }
  }
});

async function checkBionlukPage() {
  let bionlukTab = null;
  try {
    // Daha esnek bir URL kalıbı ile sorgula
    const tabs = await chrome.tabs.query({ url: "*://*.bionluk.com/panel/alici-istekleri*" });

    if (tabs.length > 0) {
      bionlukTab = tabs[0];
      console.log(`Mevcut Bionluk sekmesi bulundu: ID ${bionlukTab.id}, URL: ${bionlukTab.url}`);
      try {
        await chrome.tabs.reload(bionlukTab.id);
        console.log(`Mevcut Bionluk sekmesi (${bionlukTab.id}) başarıyla yenilendi (F5).`);
      } catch (error) {
        console.error(`Mevcut Bionluk sekmesi (${bionlukTab.id}) yenilenirken (F5) hata oluştu:`, error);
        if (error.message.includes("No tab with id") || error.message.includes("Invalid tab ID")) {
          console.log("Yenileme hatası nedeniyle yeni bir Bionluk sekmesi açılıyor...");
          bionlukTab = await chrome.tabs.create({ url: BIONLUK_URL, active: false }); // Yeni açarken spesifik URL'yi kullan
          console.log(`Yeni Bionluk sekmesi (${bionlukTab.id}) açıldı (arka planda).`);
        } else {
          console.warn("Beklenmedik sekme yenileme hatası, bu kontrol periyodu atlanıyor.");
          return; 
        }
      }
    } else {
      console.log("Açık Bionluk sekmesi bulunamadı, yeni bir sekme açılıyor...");
      bionlukTab = await chrome.tabs.create({ url: BIONLUK_URL, active: false }); // Yeni açarken spesifik URL'yi kullan
      console.log(`Yeni Bionluk sekmesi (${bionlukTab.id}) açıldı (arka planda).`);
    }

   
    const tabIdToWatch = bionlukTab.id;
    // Sekme ID'sinin geçerli olduğundan emin olalım (create hata fırlatabilir nadiren)
    if (!tabIdToWatch) {
        console.error("Geçerli bir bionlukTab.id elde edilemedi, checkBionlukPage sonlandırılıyor.");
        return;
    }

    console.log(`Sekme ${tabIdToWatch} için yüklenme ve CONTENT_SCRIPT_READY (ilk verilerle) bekleniyor.`);
    pendingReadyTabs.add(tabIdToWatch);

    setTimeout(() => {
      if (pendingReadyTabs.has(tabIdToWatch)) {
        console.warn(`Zaman aşımı: Sekme ${tabIdToWatch} için CONTENT_SCRIPT_READY mesajı (ilk verilerle) alınamadı.`);
        pendingReadyTabs.delete(tabIdToWatch);
      }
    }, READY_TIMEOUT_MS);

  } catch (e) {
    console.error("Background: checkBionlukPage içinde genel bir hata:", e);
  }
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log(`Background: Mesaj alındı - Tip: ${request.type}, Gönderen Sekme ID: ${sender.tab ? sender.tab.id : 'Yok'}`);

  if (request.type === "CONTENT_SCRIPT_READY" && sender.tab && sender.tab.id) {
    const readyTabId = sender.tab.id;
    if (pendingReadyTabs.has(readyTabId)) {
      console.log(`CONTENT_SCRIPT_READY mesajı sekme ${readyTabId} için alındı.`);
      pendingReadyTabs.delete(readyTabId); 
      
      if (request.payload && request.payload.initialRequests) {
        console.log(`Sekme ${readyTabId} için ilk veriler (initialRequests) alındı:`, request.payload.initialRequests);
        await processNewRequests(request.payload.initialRequests, readyTabId);
      } else {
        console.warn(`Sekme ${readyTabId} için CONTENT_SCRIPT_READY mesajında initialRequests bulunamadı. Yeniden veri isteniyor...`);
        try {
            const response = await chrome.tabs.sendMessage(readyTabId, { type: "GET_LATEST_REQUESTS" });
            if (response && response.type === "LATEST_REQUESTS_DATA") {
              console.log(`Sekme ${readyTabId} için LATEST_REQUESTS_DATA (fallback) alındı:`, response.payload);
              await processNewRequests(response.payload, readyTabId);
            } else {
              console.warn(`Sekme ${readyTabId} için fallback GET_LATEST_REQUESTS yanıtı hatalı.`, response);
            }
        } catch (error) {
            console.error(`Sekme ${readyTabId} için fallback GET_LATEST_REQUESTS gönderilirken/yanıt alınırken hata:`, error);
        }
      }
    } else {
      console.log(`CONTENT_SCRIPT_READY mesajı beklenmeyen/zaman aşımına uğramış sekme ${readyTabId} için alındı.`);
    }
    sendResponse({ status: "CONTENT_SCRIPT_READY işlendi" });
  } else if (request.type === "FULL_TEXT_DATA" && sender.tab) {
    console.log("Content script'ten detay metni alındı:", request.payload);
    await updateRequestWithFullText(request.payload.requestId, request.payload.fullText);
    sendResponse({status: "Detay metni işlendi"});
  } else if (request.type === 'PLAY_SOUND' && request.target === 'offscreen') {
    console.log("Offscreen için PLAY_SOUND mesajı yönlendiriliyor (veya zaten yönlendirildi).");
  }
  return true; 
});

async function updateRequestWithFullText(requestId, fullText) {
    console.log(`Background: ID ${requestId} için tam metin güncelleniyor: ${fullText}`);
    const data = await chrome.storage.local.get("allRequestsData");
    let allRequestsData = data.allRequestsData || {};
    if (allRequestsData[requestId]) {
        allRequestsData[requestId].fullBodyText = fullText;
        await chrome.storage.local.set({ allRequestsData });
        console.log("Background: allRequestsData güncellendi (tam metin ile).");
    } else {
        console.warn(`Background: Tam metin için ${requestId} ID'li istek allRequestsData'da bulunamadı.`);
    }
}

async function processNewRequests(newRequests, tabId) {
  console.log(`Background: processNewRequests çağrıldı - ${newRequests ? newRequests.length : 0} yeni istek var, sekme ID: ${tabId}`);
  if (!newRequests || newRequests.length === 0) {
    console.log("Background: Yeni istek bulunamadı veya veri yok (processNewRequests).");
    return;
  }

  const data = await chrome.storage.local.get([
    "notifiedRequests", "ignoredRequests", "archivedRequests", "lastKnownRequestId", "allRequestsData", "isInitialRunComplete"
  ]);
  const notifiedRequests = data.notifiedRequests || [];
  const ignoredRequests = data.ignoredRequests || [];
  const archivedRequests = data.archivedRequests || [];
  let lastKnownRequestId = data.lastKnownRequestId;
  let allRequestsData = data.allRequestsData || {}; 
  let isInitialRunComplete = data.isInitialRunComplete || false;

  const latestRequestFromPage = newRequests[0]; 

  for (const req of newRequests) {
      if (req.id) { 
        allRequestsData[req.id] = {
            title: req.title,
            bodyText: req.bodyText, 
            fullBodyText: req.fullBodyText || "", 
            detailUrl: req.detailUrl,
            date: req.date,
            budget: req.budget,
            duration: req.duration,
            offers: req.offers,
            username: req.username,
            hasReadMore: req.hasReadMore
        };
      }
  }

  if (!latestRequestFromPage || !latestRequestFromPage.id) {
    console.warn("Background: Geçerli bir latestRequestFromPage.id bulunamadı. İşlem durduruluyor.");
    await chrome.storage.local.set({ allRequestsData }); // En azından toplanan veriyi kaydet
    return;
  }

  if (!isInitialRunComplete) {
    console.log("Background: Eklentinin ilk çalışması. Sadece son istek ID'si kaydedilecek, bildirim/ses yok.");
    lastKnownRequestId = latestRequestFromPage.id;
    isInitialRunComplete = true;
    await chrome.storage.local.set({ lastKnownRequestId, allRequestsData, isInitialRunComplete });
    console.log(`Background: İlk çalıştırma tamamlandı. lastKnownRequestId: ${lastKnownRequestId}`);
  } else {
    if (latestRequestFromPage.id !== lastKnownRequestId) {
      if (!notifiedRequests.includes(latestRequestFromPage.id) && 
          !ignoredRequests.includes(latestRequestFromPage.id) && 
          !archivedRequests.includes(latestRequestFromPage.id)) {
        
        console.log("Background: Yeni bir alıcı isteği bulundu (ilk çalıştırma sonrası):", latestRequestFromPage.title);
        let messageText = latestRequestFromPage.title;
        if (latestRequestFromPage.hasReadMore) {
            try {
                console.log(`Background: 'Devamını oku' için content script'e (${tabId}) mesaj gönderiliyor: ${latestRequestFromPage.id}`);
                 chrome.tabs.sendMessage(tabId, { 
                    type: "GET_FULL_TEXT", 
                    payload: { requestId: latestRequestFromPage.id }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn(`Background: Detay metni istenirken hata oluştu (sekme ${tabId} - muhtemelen kapandı):`, chrome.runtime.lastError.message);
                    } else if (response && response.type === "FULL_TEXT_DATA") {
                        console.log(`Background: Anlık detay metni yanıtı (sekme ${tabId}):`, response.payload.fullText);
                    }
                });
                messageText += " (Detaylar alınıyor...)";
            } catch (e) {
                console.warn("Background: Detay metni istenirken (sendMessage anında) hata:", e);
            }
        }

        chrome.notifications.create("bionlukReq_" + latestRequestFromPage.id, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("images/icon128.png"),
          title: "Yeni Bionluk Alıcı İsteği!",
          message: messageText,
          priority: 2,
        });
        
        await playSoundViaOffscreen("sound/notification.mp3");
        notifiedRequests.push(latestRequestFromPage.id);
        lastKnownRequestId = latestRequestFromPage.id;
        await chrome.storage.local.set({ notifiedRequests, lastKnownRequestId, allRequestsData });
      } else {
        console.log("Background: Bulunan farklı istek zaten daha önce bildirilmiş/yok sayılmış/arşivlenmiş:", latestRequestFromPage.title);
        if (latestRequestFromPage.id !== lastKnownRequestId) { 
            lastKnownRequestId = latestRequestFromPage.id; 
        }
        // Her durumda allRequestsData ve (gerekirse) lastKnownRequestId güncellenir.
        await chrome.storage.local.set({ lastKnownRequestId, allRequestsData });
      }
    } else {
      console.log("Background: En son istek değişmemiş (ilk çalıştırma sonrası).");
      await chrome.storage.local.set({ allRequestsData }); // Sadece allRequestsData'yı güncelle (içerik değişmiş olabilir)
    }
  }
}

// Bildirime tıklanınca ne olacağı
chrome.notifications.onClicked.addListener((notificationId) => {
    console.log("Background: Bildirime tıklandı:", notificationId);
    // notificationId formatımız: "bionlukReq_ISTEKIDSI"
    if (notificationId.startsWith("bionlukReq_")) {
        // const requestId = notificationId.substring("bionlukReq_".length);
        // İlgili Bionluk sayfasına veya isteğin detayına gitmek için:
        chrome.tabs.query({ url: BIONLUK_URL + "*" }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { active: true });
                chrome.windows.update(tabs[0].windowId, { focused: true });
            } else {
                chrome.tabs.create({ url: BIONLUK_URL });
            }
        });
    }
    chrome.notifications.clear(notificationId);
});

console.log("Background script dinlemeye hazır (v4 - ilk çalıştırma mantığı eklendi)."); 