console.log("Bionluk Bildirici: wallet content script yuklendi.");

let walletObserver = null;
let walletReadySent = false;
const WALLET_MAX_RETRY = 5;
let walletRetryCount = 0;

function getBalanceData() {
    // Bakiye elementini bul: p.balance
    const balanceEl = document.querySelector('p.balance');
    if (!balanceEl) return null;

    // Bakiye metnini al (TL kısmını temizle)
    let balanceText = balanceEl.textContent.trim();
    // "0,00TL" veya "0,00 TL" formatında olabilir
    balanceText = balanceText.replace(/TL/gi, '').trim();

    return {
        balance: balanceText,
        timestamp: Date.now()
    };
}

function processWalletAndNotify() {
    if (walletReadySent) return;

    const balanceData = getBalanceData();
    if (balanceData) {
        if (walletObserver) {
            walletObserver.disconnect();
            walletObserver = null;
        }
        walletReadySent = true;

        try {
            chrome.runtime.sendMessage({
                type: "WALLET_BALANCE_DATA",
                payload: balanceData
            });
            console.log("Bakiye verisi background'a gonderildi:", balanceData.balance);
        } catch (e) {
            console.error("Bakiye mesaj gonderme hatasi:", e);
            walletReadySent = false;
        }
    } else {
        walletRetryCount++;
        if (walletRetryCount < WALLET_MAX_RETRY) {
            console.log(`Bakiye bulunamadi, tekrar denenecek (${walletRetryCount}/${WALLET_MAX_RETRY})`);
        }
    }
}

function initializeWalletObserver() {
    if (walletObserver) walletObserver.disconnect();
    walletReadySent = false;
    walletRetryCount = 0;

    // Ilk direkt kontrol
    const balanceEl = document.querySelector('p.balance');
    if (balanceEl) {
        processWalletAndNotify();
        return;
    }

    // DOM degisikliklerini izle
    walletObserver = new MutationObserver(() => {
        if (walletReadySent) return;
        const el = document.querySelector('p.balance');
        if (el) {
            processWalletAndNotify();
        }
    });

    if (document.body) {
        walletObserver.observe(document.body, { childList: true, subtree: true });

        // Fallback: 2 saniye sonra
        setTimeout(() => {
            if (!walletReadySent) processWalletAndNotify();
        }, 2000);

        // Son fallback: 5 saniye
        setTimeout(() => {
            if (!walletReadySent) processWalletAndNotify();
        }, 5000);
    }
}

// Mesaj dinleyici - background'dan gelen talepler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "GET_WALLET_BALANCE") {
        const data = getBalanceData();
        sendResponse({ type: "WALLET_BALANCE_RESPONSE", payload: data });
    }
    return true;
});

initializeWalletObserver();
