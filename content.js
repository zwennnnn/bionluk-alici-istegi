// Bionluk sayfasından veri okuma ve arka plana gönderme işlemleri burada olacak
console.log("Content script: Yüklendi ve çalışıyor.");

function getLatestRequestsData() {
    console.log("Content script: getLatestRequestsData fonksiyonu başladı.");
    const requestBoxes = document.querySelectorAll('div[data-v-bd6dfef6].request-box');
    console.log(`Content script: ${requestBoxes.length} adet request-box bulundu.`);
    let requests = [];

    if (requestBoxes.length === 0) {
        console.warn("Content script: Hiç request-box bulunamadı. Sayfa yapısı değişmiş olabilir veya istek yok.");
        return requests;
    }

    requestBoxes.forEach((box, index) => {
      
        const usernameElement = box.querySelector('.username');
        const titleElement = box.querySelector('.body-title');
        const bodyTextElement = box.querySelector('.body-text');
        const dateElement = box.querySelector('.foot-date');
        const budgetElement = box.querySelector('.foot-right .item:nth-child(1) .foot-value');
        const durationElement = box.querySelector('.foot-right .item:nth-child(2) .foot-value');
        const offersElement = box.querySelector('.foot-right .item:nth-child(3) .foot-value');
        const readMoreDiv = box.querySelector('.read-more');
        const requestLinkElement = titleElement ? titleElement.closest('a') : (box.querySelector('.body a') || box.querySelector('a'));

        if (!usernameElement) console.warn(`Content script: Box ${index + 1} için .username bulunamadı.`);
        if (!titleElement) console.warn(`Content script: Box ${index + 1} için .body-title bulunamadı.`);
        
        const uniqueTitlePart = titleElement ? titleElement.textContent.trim() : `request_index_${index}`;
        const uniqueUserPart = usernameElement ? usernameElement.textContent.trim() : `user_index_${index}`;
        const uniqueDatePart = dateElement ? dateElement.textContent.trim() : `date_index_${index}`;
        const id = `${uniqueDatePart}_${uniqueUserPart}_${uniqueTitlePart}`.replace(/\s+/g, '_');

        let detailUrl = null;
        if (requestLinkElement && requestLinkElement.href) {
            detailUrl = requestLinkElement.href;
        }

        requests.push({
            id: id,
            username: usernameElement ? usernameElement.textContent.trim() : "",
            title: titleElement ? titleElement.textContent.trim() : "",
            bodyText: bodyTextElement ? bodyTextElement.textContent.trim() : "",
            date: dateElement ? dateElement.textContent.trim() : "",
            budget: budgetElement ? budgetElement.textContent.trim() : "",
            duration: durationElement ? durationElement.textContent.trim() : "",
            offers: offersElement ? offersElement.textContent.trim() : "",
            hasReadMore: readMoreDiv ? (readMoreDiv.offsetParent !== null) : false,
            detailUrl: detailUrl,
            fullBodyText: ""
        });
    });
    console.log("Content script: getLatestRequestsData fonksiyonu tamamlandı, istek sayısı:", requests.length);
    return requests;
}

let observer = null; // Observer'ı global veya daha erişilebilir bir scope'ta tanımla
let readyMessageSent = false; // CONTENT_SCRIPT_READY mesajının birden fazla gönderilmesini engelle

function processPageContentAndNotify() {
    if (readyMessageSent) return; // Eğer mesaj zaten gönderildiyse tekrar gönderme

    console.log("Content script: processPageContentAndNotify çağrıldı.");
    const requests = getLatestRequestsData();
    if (requests.length > 0) {
        console.log("Content script: İstekler bulundu, background'a gönderiliyor.");
        try {
            if (observer) {
                observer.disconnect();
                console.log("Content script: MutationObserver durduruldu (veri bulunduktan sonra).");
            }
            chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY", payload: { initialRequests: requests } });
            readyMessageSent = true; // Mesajın gönderildiğini işaretle
            console.log("Content script: CONTENT_SCRIPT_READY (ilk verilerle) mesajı gönderildi.");
        } catch (e) {
            console.error("Content script: CONTENT_SCRIPT_READY (ilk verilerle) gönderilirken hata:", e);
        }
    } else {
        console.warn("Content script: processPageContentAndNotify çağrıldı ama istek bulunamadı.");
 
    }
}

function initializeObserver() {
    if (observer) { // Eğer observer zaten varsa, tekrar başlatma
        observer.disconnect();
    }
    readyMessageSent = false; // Her yeni sayfa yüklemesinde sıfırla

    observer = new MutationObserver((mutationsList, obsInstance) => {
        const requestBoxes = document.querySelectorAll('div[data-v-bd6dfef6].request-box');
        if (requestBoxes.length > 0 && !readyMessageSent) {
            console.log("Content script: MutationObserver .request-box elementlerini tespit etti.");
            processPageContentAndNotify();
        }
    });

    const targetNode = document.body;
    if (targetNode) {
        observer.observe(targetNode, { childList: true, subtree: true });
        console.log("Content script: MutationObserver dinlemeye başladı (document.body).");

        // Sayfa zaten yüklendiğinde .request-box'lar mevcut olabilir, ilk kontrolü yapalım.
        setTimeout(() => {
            if (readyMessageSent) return;
            console.log("Content script: İlk kontrol (setTimeout sonrası) yapılıyor...");
            const initialRequestBoxes = document.querySelectorAll('div[data-v-bd6dfef6].request-box');
            if (initialRequestBoxes.length > 0) {
                console.log("Content script: İlk kontrolde .request-box bulundu.");
                processPageContentAndNotify();
            } else {
                console.log("Content script: İlk kontrolde .request-box bulunamadı, observer bekleniyor.");
            }
        }, 1500); // Gecikmeyi biraz artırdım
    } else {
        console.error("Content script: MutationObserver için targetNode (document.body) bulunamadı!");
    }
}

// Arka plan betiğinden gelen mesajları dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script: Mesaj alındı - Tip: ", request.type);
  if (request.type === "GET_LATEST_REQUESTS") {
    console.log("Content script: GET_LATEST_REQUESTS isteği işleniyor (Observer sonrası model). Bazen bu gereksiz olabilir.");
    try {
        const latestRequests = getLatestRequestsData();
        sendResponse({ type: "LATEST_REQUESTS_DATA", payload: latestRequests });
    } catch (e) {
        console.error("Content script: getLatestRequestsData içinde hata (Observer sonrası model):", e);
        sendResponse({ type: "LATEST_REQUESTS_DATA", payload: [], error: e.message });
    }
  } else if (request.type === "GET_FULL_TEXT") {
    console.log("Content script: GET_FULL_TEXT isteği işleniyor, ID:", request.payload.requestId);
    const requestId = request.payload.requestId;
    const requestBoxes = document.querySelectorAll('div[data-v-bd6dfef6].request-box');
    let fullText = "";
    let found = false;

    for (let i = 0; i < requestBoxes.length; i++) {
        const box = requestBoxes[i];
        const usernameElement = box.querySelector('.username');
        const titleElement = box.querySelector('.body-title');
        const dateElement = box.querySelector('.foot-date');
        
        const uniqueTitlePart = titleElement ? titleElement.textContent.trim() : `request_index_${i}`;
        const uniqueUserPart = usernameElement ? usernameElement.textContent.trim() : `user_index_${i}`;
        const uniqueDatePart = dateElement ? dateElement.textContent.trim() : `date_index_${i}`;
        const currentId = `${uniqueDatePart}_${uniqueUserPart}_${uniqueTitlePart}`.replace(/\s+/g, '_');

        if (currentId === requestId) {
            found = true;
            const readMoreDiv = box.querySelector('.read-more');
            if (readMoreDiv && readMoreDiv.offsetParent !== null) {
                const readMoreButton = readMoreDiv.querySelector('p');
                if (readMoreButton) {
                    readMoreButton.click();
                    setTimeout(() => {
                        const updatedBodyTextElement = box.querySelector('.body-text');
                        fullText = updatedBodyTextElement ? updatedBodyTextElement.textContent.trim() : "Detay alınamadı.";
                        console.log("Content script: Detay metni (tamamlandı/timeout):", fullText);
                        sendResponse({ type: "FULL_TEXT_DATA", payload: { requestId: requestId, fullText: fullText } });
                    }, 500);
                    return true; 
                } else {
                    fullText = "'Devamını Oku' butonu bulunamadı.";
                }
            } else {
                const bodyTextElement = box.querySelector('.body-text');
                fullText = bodyTextElement ? bodyTextElement.textContent.trim() : "";
            }
            break;
        }
    }
    if (!found) fullText = "İstek bulunamadı.";
    
    if (!(found && requestBoxes.some(box => {
        const usernameElement = box.querySelector('.username');
        const titleElement = box.querySelector('.body-title');
        const dateElement = box.querySelector('.foot-date');
        const uniqueTitlePart = titleElement ? titleElement.textContent.trim() : `request_index_placeholder`;
        const uniqueUserPart = usernameElement ? usernameElement.textContent.trim() : `user_index_placeholder`;
        const uniqueDatePart = dateElement ? dateElement.textContent.trim() : `date_index_placeholder`;
        const currentId = `${uniqueDatePart}_${uniqueUserPart}_${uniqueTitlePart}`.replace(/\s+/g, '_');
        return currentId === requestId && box.querySelector('.read-more p');
    }))) {
       sendResponse({ type: "FULL_TEXT_DATA", payload: { requestId: requestId, fullText: fullText } });
    }
  }
  return true; 
});

console.log("Content script: Mesaj dinleyici kuruldu.");
initializeObserver();  