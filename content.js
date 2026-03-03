console.log("Bionluk Bildirici: content script v2 yuklendi.");

let observer = null;
let readyMessageSent = false;
const MAX_RETRY_COUNT = 5;
let retryCount = 0;

function getLatestRequestsData() {
    const requestBoxes = document.querySelectorAll('div.request-box');
    if (requestBoxes.length === 0) return [];

    const requests = [];

    requestBoxes.forEach((box, index) => {
        try {
            const usernameEl = box.querySelector('.username');
            const titleEl = box.querySelector('.body-title');
            const bodyTextEl = box.querySelector('.body-text');
            const dateEl = box.querySelector('.foot-date');
            const readMoreDiv = box.querySelector('.read-more');

            // Budget, duration, offers - foot-right icerisindeki item'lardan
            const footItems = box.querySelectorAll('.foot-right .item');
            const budgetEl = footItems[0]?.querySelector('.foot-value');
            const durationEl = footItems[1]?.querySelector('.foot-value');
            const offersEl = footItems[2]?.querySelector('.foot-value');

            // Breadcrumb bilgisi
            const breadcrumbs = box.querySelectorAll('.breadcrumb span');
            const category = Array.from(breadcrumbs).map(s => s.textContent.trim()).join(' > ');

            const username = usernameEl?.textContent?.trim() || '';
            const title = titleEl?.textContent?.trim() || '';
            const date = dateEl?.textContent?.trim() || '';

            // Benzersiz ID olustur
            const id = `${date}_${username}_${title}`.replace(/\s+/g, '_').substring(0, 200);

            // Detay URL'si - titleElement'in parent <a> tag'inda olabilir
            const linkEl = titleEl?.closest('a') || box.querySelector('.body a');
            const detailUrl = linkEl?.href || null;

            // readMore gorunur mu
            const hasReadMore = readMoreDiv
                ? (readMoreDiv.style.display !== 'none' && readMoreDiv.offsetParent !== null)
                : false;

            requests.push({
                id,
                username,
                title,
                bodyText: bodyTextEl?.textContent?.trim() || '',
                date,
                budget: budgetEl?.textContent?.trim() || '',
                duration: durationEl?.textContent?.trim() || '',
                offers: offersEl?.textContent?.trim() || '',
                category,
                hasReadMore,
                detailUrl,
                fullBodyText: ''
            });
        } catch (e) {
            console.warn(`Request box ${index} parse hatasi:`, e);
        }
    });

    return requests;
}

function processAndNotify() {
    if (readyMessageSent) return;

    const requests = getLatestRequestsData();
    if (requests.length > 0) {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        readyMessageSent = true;

        try {
            chrome.runtime.sendMessage({
                type: "CONTENT_SCRIPT_READY",
                payload: { initialRequests: requests }
            });
            console.log(`${requests.length} istek background'a gonderildi.`);
        } catch (e) {
            console.error("Mesaj gonderme hatasi:", e);
            readyMessageSent = false;
        }
    } else {
        retryCount++;
        if (retryCount < MAX_RETRY_COUNT) {
            console.log(`Istek bulunamadi, tekrar denenecek (${retryCount}/${MAX_RETRY_COUNT})`);
        }
    }
}

function initializeObserver() {
    if (observer) observer.disconnect();
    readyMessageSent = false;
    retryCount = 0;

    // Ilk once direkt kontrol et
    const initialBoxes = document.querySelectorAll('div.request-box');
    if (initialBoxes.length > 0) {
        processAndNotify();
        return;
    }

    // DOM degisikliklerini izle
    observer = new MutationObserver(() => {
        if (readyMessageSent) return;
        const boxes = document.querySelectorAll('div.request-box');
        if (boxes.length > 0) {
            processAndNotify();
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });

        // Fallback: 2 saniye sonra tekrar dene
        setTimeout(() => {
            if (!readyMessageSent) {
                processAndNotify();
            }
        }, 2000);

        // Son fallback: 5 saniye
        setTimeout(() => {
            if (!readyMessageSent) {
                processAndNotify();
            }
        }, 5000);
    }
}

// Mesaj dinleyici
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "GET_LATEST_REQUESTS") {
        try {
            const data = getLatestRequestsData();
            sendResponse({ type: "LATEST_REQUESTS_DATA", payload: data });
        } catch (e) {
            sendResponse({ type: "LATEST_REQUESTS_DATA", payload: [], error: e.message });
        }
    } else if (request.type === "GET_FULL_TEXT") {
        handleGetFullText(request.payload.requestId, sendResponse);
        return true; // async sendResponse icin
    }
    return true;
});

function handleGetFullText(requestId, sendResponse) {
    const boxes = document.querySelectorAll('div.request-box');

    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const usernameEl = box.querySelector('.username');
        const titleEl = box.querySelector('.body-title');
        const dateEl = box.querySelector('.foot-date');

        const username = usernameEl?.textContent?.trim() || '';
        const title = titleEl?.textContent?.trim() || '';
        const date = dateEl?.textContent?.trim() || '';
        const currentId = `${date}_${username}_${title}`.replace(/\s+/g, '_').substring(0, 200);

        if (currentId !== requestId) continue;

        const readMoreDiv = box.querySelector('.read-more');
        if (readMoreDiv && readMoreDiv.style.display !== 'none' && readMoreDiv.offsetParent !== null) {
            const readMoreBtn = readMoreDiv.querySelector('p');
            if (readMoreBtn) {
                readMoreBtn.click();
                setTimeout(() => {
                    const bodyEl = box.querySelector('.body-text');
                    const fullText = bodyEl?.textContent?.trim() || '';
                    sendResponse({ type: "FULL_TEXT_DATA", payload: { requestId, fullText } });
                }, 600);
                return;
            }
        }

        const bodyEl = box.querySelector('.body-text');
        sendResponse({
            type: "FULL_TEXT_DATA",
            payload: { requestId, fullText: bodyEl?.textContent?.trim() || '' }
        });
        return;
    }

    sendResponse({ type: "FULL_TEXT_DATA", payload: { requestId, fullText: "Istek bulunamadi." } });
}

initializeObserver();
