console.log("Bionluk Bildirici: background script v2 yuklendi.");

const DEFAULT_CHECK_INTERVAL = 1;
const BIONLUK_URL = "https://www.bionluk.com/panel/alici-istekleri";
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const READY_TIMEOUT_MS = 20000;

let pendingReadyTabs = new Set();

// ---- OFFSCREEN (ses icin) ----
async function hasOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const matchedClients = await clients.matchAll();
    return matchedClients.some(c => c.url === offscreenUrl);
}

async function playSoundViaOffscreen(soundFile) {
    try {
        const { soundEnabled } = await chrome.storage.local.get('soundEnabled');
        if (soundEnabled === false) return;

        if (!await hasOffscreenDocument(OFFSCREEN_DOCUMENT_PATH)) {
            await chrome.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
                justification: 'Bildirim sesi calma',
            });
        }
        chrome.runtime.sendMessage({
            type: 'PLAY_SOUND',
            payload: { soundFile: chrome.runtime.getURL(soundFile) },
            target: 'offscreen'
        });
    } catch (e) {
        console.error("Ses calma hatasi:", e);
    }
}

// ---- BADGE ----
function updateBadge(count) {
    const text = count > 0 ? String(count) : '';
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#6c5ce7' : '#333' });
}

async function refreshBadge() {
    const { notifiedRequests } = await chrome.storage.local.get('notifiedRequests');
    updateBadge((notifiedRequests || []).length);
}

// ---- ALARM / INSTALL ----
chrome.runtime.onInstalled.addListener(async () => {
    console.log("Eklenti yuklendi/guncellendi.");
    const { checkInterval } = await chrome.storage.local.get('checkInterval');
    const interval = checkInterval || DEFAULT_CHECK_INTERVAL;

    chrome.alarms.create("bionlukCheck", {
        delayInMinutes: 0.2,
        periodInMinutes: interval
    });

    const existing = await chrome.storage.local.get([
        'lastKnownRequestId', 'notifiedRequests', 'ignoredRequests',
        'archivedRequests', 'allRequestsData', 'isInitialRunComplete',
        'soundEnabled', 'keywords', 'minBudgetFilter', 'seenRequestIds',
        'tgBotToken', 'tgChatId'
    ]);

    await chrome.storage.local.set({
        lastKnownRequestId: existing.lastKnownRequestId || null,
        notifiedRequests: existing.notifiedRequests || [],
        ignoredRequests: existing.ignoredRequests || [],
        archivedRequests: existing.archivedRequests || [],
        isExtensionActive: true,
        allRequestsData: existing.allRequestsData || {},
        isInitialRunComplete: existing.isInitialRunComplete || false,
        soundEnabled: existing.soundEnabled !== undefined ? existing.soundEnabled : true,
        keywords: existing.keywords || '',
        minBudgetFilter: existing.minBudgetFilter || 0,
        checkInterval: existing.checkInterval || DEFAULT_CHECK_INTERVAL,
        seenRequestIds: existing.seenRequestIds || [],
        tgBotToken: existing.tgBotToken || '',
        tgChatId: existing.tgChatId || ''
    });

    refreshBadge();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "bionlukCheck") {
        const { isExtensionActive } = await chrome.storage.local.get("isExtensionActive");
        if (isExtensionActive) {
            console.log("Alarm tetiklendi, kontrol ediliyor...");
            await checkBionlukPage();
        }
    }
});

// ---- ANA KONTROL ----
async function checkBionlukPage() {
    let bionlukTab = null;
    try {
        const tabs = await chrome.tabs.query({ url: "*://*.bionluk.com/panel/alici-istekleri*" });

        if (tabs.length > 0) {
            bionlukTab = tabs[0];
            try {
                await chrome.tabs.reload(bionlukTab.id);
            } catch (err) {
                if (err.message.includes("No tab with id") || err.message.includes("Invalid tab ID")) {
                    bionlukTab = await chrome.tabs.create({ url: BIONLUK_URL, active: false });
                } else {
                    console.warn("Sekme yenileme hatasi:", err.message);
                    return;
                }
            }
        } else {
            bionlukTab = await chrome.tabs.create({ url: BIONLUK_URL, active: false });
        }

        if (!bionlukTab?.id) return;

        pendingReadyTabs.add(bionlukTab.id);
        await chrome.storage.local.set({ lastCheckTime: Date.now() });

        setTimeout(() => {
            if (pendingReadyTabs.has(bionlukTab.id)) {
                console.warn(`Timeout: Sekme ${bionlukTab.id} yanit vermedi.`);
                pendingReadyTabs.delete(bionlukTab.id);
            }
        }, READY_TIMEOUT_MS);

    } catch (e) {
        console.error("checkBionlukPage hatasi:", e);
    }
}

// ---- KEYWORD & BUDGET FILTER ----
function matchesFilters(request, keywords, minBudget) {
    if (keywords && keywords.trim()) {
        const keywordList = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        if (keywordList.length > 0) {
            const text = `${request.title} ${request.bodyText} ${request.fullBodyText || ''}`.toLowerCase();
            const matched = keywordList.some(kw => text.includes(kw));
            if (!matched) return false;
        }
    }

    if (minBudget && minBudget > 0 && request.budget) {
        const budgetNum = parseInt(request.budget.replace(/[^\d]/g, ''));
        if (!isNaN(budgetNum) && budgetNum < minBudget) return false;
    }

    return true;
}

// ---- MESAJ DINLEME ----
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CONTENT_SCRIPT_READY" && sender.tab?.id) {
        handleContentReady(request, sender.tab.id);
        sendResponse({ status: "ok" });
    } else if (request.type === "FULL_TEXT_DATA" && sender.tab) {
        updateRequestFullText(request.payload.requestId, request.payload.fullText);
        sendResponse({ status: "ok" });
    } else if (request.type === 'CHECK_NOW') {
        checkBionlukPage();
        sendResponse({ status: "ok" });
    } else if (request.type === 'UPDATE_BADGE') {
        updateBadge(request.payload.count);
        sendResponse({ status: "ok" });
    } else if (request.type === 'SETTINGS_UPDATED') {
        handleSettingsUpdate(request.payload);
        sendResponse({ status: "ok" });
    }
    return true;
});

async function handleSettingsUpdate(settings) {
    if (settings.checkInterval) {
        await chrome.alarms.clear("bionlukCheck");
        chrome.alarms.create("bionlukCheck", {
            delayInMinutes: settings.checkInterval,
            periodInMinutes: settings.checkInterval
        });
        console.log(`Kontrol araligi ${settings.checkInterval} dk olarak guncellendi.`);
    }

    const toStore = {};
    if (typeof settings.soundEnabled === 'boolean') {
        toStore.soundEnabled = settings.soundEnabled;
    }
    if (typeof settings.keywords === 'string') {
        toStore.keywords = settings.keywords;
    }
    if (typeof settings.minBudgetFilter === 'number') {
        toStore.minBudgetFilter = settings.minBudgetFilter;
    }
    if (typeof settings.tgBotToken === 'string') {
        toStore.tgBotToken = settings.tgBotToken;
    }
    if (typeof settings.tgChatId === 'string') {
        toStore.tgChatId = settings.tgChatId;
    }

    if (Object.keys(toStore).length > 0) {
        await chrome.storage.local.set(toStore);
    }
}

async function handleContentReady(message, tabId) {
    if (!pendingReadyTabs.has(tabId)) return;
    pendingReadyTabs.delete(tabId);

    if (message.payload?.initialRequests) {
        await processNewRequests(message.payload.initialRequests, tabId);
    } else {
        try {
            const response = await chrome.tabs.sendMessage(tabId, { type: "GET_LATEST_REQUESTS" });
            if (response?.type === "LATEST_REQUESTS_DATA") {
                await processNewRequests(response.payload, tabId);
            }
        } catch (e) {
            console.error("Fallback veri alma hatasi:", e);
        }
    }
}

async function updateRequestFullText(requestId, fullText) {
    const data = await chrome.storage.local.get("allRequestsData");
    let all = data.allRequestsData || {};
    if (all[requestId]) {
        all[requestId].fullBodyText = fullText;
        await chrome.storage.local.set({ allRequestsData: all });
    }
}

// ---- TELEGRAM ----
async function sendTelegramNotification(req, botToken, chatId) {
    try {
        const textLines = [];
        textLines.push(`Yeni Bionluk istegi 🎯`);
        if (req.title) textLines.push(`Baslik: ${req.title}`);
        if (req.budget) textLines.push(`Butce: ${req.budget}`);
        if (req.duration) textLines.push(`Sure: ${req.duration}`);
        if (req.offers) textLines.push(`Teklif: ${req.offers}`);
        const url = req.detailUrl || BIONLUK_URL;
        textLines.push(`Link: ${url}`);

        const body = {
            chat_id: chatId,
            text: textLines.join('\n')
        };

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error('Telegram bildirimi gonderilemedi:', e);
    }
}

// ---- YENI ISTEK ISLEME ----
async function processNewRequests(newRequests, tabId) {
    if (!newRequests?.length) return;

    const data = await chrome.storage.local.get([
        "notifiedRequests", "ignoredRequests", "archivedRequests",
        "allRequestsData", "isInitialRunComplete",
        "keywords", "minBudgetFilter", "seenRequestIds",
        "tgBotToken", "tgChatId"
    ]);

    let notified = data.notifiedRequests || [];
    let allData = data.allRequestsData || {};
    let isInitial = data.isInitialRunComplete || false;
    let seenIds = data.seenRequestIds || [];
    const keywords = data.keywords || '';
    const minBudget = data.minBudgetFilter || 0;
    const tgToken = data.tgBotToken || '';
    const tgChatId = data.tgChatId || '';

    const seenSet = new Set(seenIds);

    // Tum istekleri kaydet
    for (const req of newRequests) {
        if (!req.id) continue;
        allData[req.id] = {
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

    if (!isInitial) {
        // Ilk calistirma: tum mevcut istekleri "goruldu" olarak isaretle, bildirim gonderme
        console.log("Ilk calistirma. Tum mevcut istekler goruldu olarak isaretleniyor.");
        for (const req of newRequests) {
            if (req.id) seenSet.add(req.id);
        }
        await chrome.storage.local.set({
            allRequestsData: allData,
            isInitialRunComplete: true,
            seenRequestIds: Array.from(seenSet)
        });
        refreshBadge();
        return;
    }

    // Sayfadaki tum istekleri "goruldu" olarak isaretle (sonraki kontrolde sapıtmasın)
    for (const req of newRequests) {
        if (req.id) seenSet.add(req.id);
    }

    // Sadece listenin en basindaki (gercekten yeni gelen) istek bildirilsin
    const topRequest = newRequests[0];
    const topIdWasNew = topRequest?.id && !(data.seenRequestIds || []).includes(topRequest.id);
    let newCount = 0;

    if (topIdWasNew && matchesFilters(topRequest, keywords, minBudget)) {
        notified.push(topRequest.id);
        newCount = 1;

        chrome.notifications.create("bionlukReq_" + topRequest.id, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("images/icon128.png"),
            title: "Yeni Bionluk Istegi!",
            message: topRequest.title || "Yeni bir alici istegi var",
            priority: 2,
        });

        if (tgToken && tgChatId) {
            sendTelegramNotification(topRequest, tgToken, tgChatId).catch((err) => {
                console.error("Telegram gonderim hatasi:", err);
            });
        }

        if (topRequest.hasReadMore) {
            try {
                chrome.tabs.sendMessage(tabId, {
                    type: "GET_FULL_TEXT",
                    payload: { requestId: topRequest.id }
                });
            } catch (e) { /* tab kapanmis olabilir */ }
        }
    }

    if (newCount > 0) {
        await playSoundViaOffscreen("sound/notification.mp3");
        console.log(`${newCount} yeni istek bildirildi.`);
    }

    await chrome.storage.local.set({
        notifiedRequests: notified,
        allRequestsData: allData,
        seenRequestIds: Array.from(seenSet)
    });

    refreshBadge();
}

// Bildirime tiklaninca
chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith("bionlukReq_")) {
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

// Baslangicta badge'i guncelle
refreshBadge();
