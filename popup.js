document.addEventListener('DOMContentLoaded', () => {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const extensionToggle = $('#extensionToggle');
    const searchInput = $('#searchInput');
    const settingsBtn = $('#settingsBtn');
    const closeSettings = $('#closeSettings');
    const settingsPanel = $('#settingsPanel');
    const checkNowBtn = $('#checkNowBtn');
    const saveSettingsBtn = $('#saveSettings');
    const clearAllDataBtn = $('#clearAllData');
    const checkIntervalInput = $('#checkInterval');
    const intervalValueSpan = $('#intervalValue');
    const soundToggle = $('#soundToggle');
    const keywordFilter = $('#keywordFilter');
    const minBudget = $('#minBudget');
    const tgBotTokenInput = $('#tgBotToken');
    const tgChatIdInput = $('#tgChatId');
    const walletBalanceEl = $('#walletBalance');
    const walletLastCheckEl = $('#walletLastCheck');
    const walletRefreshBtn = $('#walletRefreshBtn');
    const walletCard = $('#walletCard');

    // Tab switching
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.tab').forEach(t => t.classList.remove('active'));
            $$('.tab-content').forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            $(`#tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // Extension toggle
    chrome.storage.local.get(['isExtensionActive'], (data) => {
        extensionToggle.checked = data.isExtensionActive !== undefined ? data.isExtensionActive : true;
    });

    extensionToggle.addEventListener('change', () => {
        chrome.storage.local.set({ isExtensionActive: extensionToggle.checked });
        showToast(extensionToggle.checked ? 'Eklenti aktif' : 'Eklenti pasif');
    });

    // Settings panel
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('open');
        loadSettings();
    });

    closeSettings.addEventListener('click', () => {
        settingsPanel.classList.remove('open');
    });

    // Load settings values
    function loadSettings() {
        chrome.storage.local.get(['checkInterval', 'soundEnabled', 'keywords', 'minBudgetFilter', 'tgBotToken', 'tgChatId'], (data) => {
            checkIntervalInput.value = data.checkInterval || 1;
            intervalValueSpan.textContent = `${data.checkInterval || 1} dk`;
            soundToggle.checked = data.soundEnabled !== undefined ? data.soundEnabled : true;
            keywordFilter.value = data.keywords || '';
            minBudget.value = data.minBudgetFilter || '';
            tgBotTokenInput.value = data.tgBotToken || '';
            tgChatIdInput.value = data.tgChatId || '';
        });
    }

    checkIntervalInput.addEventListener('input', () => {
        intervalValueSpan.textContent = `${checkIntervalInput.value} dk`;
    });

    // Save settings
    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            checkInterval: parseInt(checkIntervalInput.value),
            soundEnabled: soundToggle.checked,
            keywords: keywordFilter.value.trim(),
            minBudgetFilter: parseInt(minBudget.value) || 0,
            tgBotToken: tgBotTokenInput.value.trim(),
            tgChatId: tgChatIdInput.value.trim()
        };
        chrome.storage.local.set(settings, () => {
            chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', payload: settings });
            showToast('Ayarlar kaydedildi');
            settingsPanel.classList.remove('open');
        });
    });

    // Clear all data
    clearAllDataBtn.addEventListener('click', () => {
        if (confirm('Tum veriler silinecek. Emin misin?')) {
            chrome.storage.local.set({
                lastKnownRequestId: null,
                notifiedRequests: [],
                ignoredRequests: [],
                archivedRequests: [],
                allRequestsData: {},
                isInitialRunComplete: false,
                seenRequestIds: [],
                walletBalance: '0,00',
                walletLastCheck: null
            }, () => {
                showToast('Tum veriler temizlendi');
                loadAndDisplayLists();
            });
        }
    });

    // Check now
    checkNowBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CHECK_NOW' });
        showToast('Kontrol baslatildi...');
    });

    // Search
    searchInput.addEventListener('input', () => {
        loadAndDisplayLists();
    });

    // Load last check time
    chrome.storage.local.get(['lastCheckTime'], (data) => {
        if (data.lastCheckTime) {
            $('#lastCheckTime').textContent = formatTime(data.lastCheckTime);
        }
    });

    loadAndDisplayLists();
    loadWalletBalance();

    // Her 60 saniyede bakiye guncelle
    setInterval(loadWalletBalance, 60000);

    // Wallet refresh butonu
    walletRefreshBtn.addEventListener('click', () => {
        walletRefreshBtn.classList.add('spinning');
        chrome.runtime.sendMessage({ type: 'CHECK_WALLET_NOW' });
        showToast('Bakiye kontrol ediliyor...');
        // 5 saniye sonra spinning kaldir + balance guncelle
        setTimeout(() => {
            walletRefreshBtn.classList.remove('spinning');
            loadWalletBalance();
        }, 5000);
    });

    function loadWalletBalance() {
        chrome.runtime.sendMessage({ type: 'GET_WALLET_STATUS' }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('Wallet status alinamadi:', chrome.runtime.lastError);
                return;
            }
            if (response) {
                const balance = response.balance || '0,00';
                const lastCheck = response.lastCheck;

                // Bakiye degisti mi kontrol et
                const prevBalance = walletBalanceEl.textContent;
                walletBalanceEl.textContent = balance;

                // Bakiye artarsa animasyon goster
                const prevNum = parseFloat(prevBalance.replace(',', '.'));
                const newNum = parseFloat(balance.replace(',', '.'));
                if (!isNaN(prevNum) && !isNaN(newNum) && newNum > prevNum) {
                    walletCard.classList.add('wallet-glow');
                    setTimeout(() => walletCard.classList.remove('wallet-glow'), 3000);
                }

                // Sifirdan buyukse yesil, degilse normal
                if (newNum > 0) {
                    walletBalanceEl.classList.add('has-balance');
                } else {
                    walletBalanceEl.classList.remove('has-balance');
                }

                if (lastCheck) {
                    walletLastCheckEl.textContent = formatTime(lastCheck);
                }
            }
        });
    }

    function loadAndDisplayLists() {
        chrome.storage.local.get(['notifiedRequests', 'archivedRequests', 'ignoredRequests', 'allRequestsData'], (data) => {
            const notified = data.notifiedRequests || [];
            const archived = data.archivedRequests || [];
            const ignored = data.ignoredRequests || [];
            const allData = data.allRequestsData || {};
            const searchTerm = searchInput.value.toLowerCase().trim();

            // Update stats
            $('#statNew').textContent = notified.length;
            $('#statArchived').textContent = archived.length;
            $('#statIgnored').textContent = ignored.length;
            $('#statTotal').textContent = Object.keys(allData).length;
            $('#badgeNew').textContent = notified.length;

            renderList($('#notifiedRequestsList'), notified, allData, 'notified', searchTerm);
            renderList($('#archivedRequestsList'), archived, allData, 'archived', searchTerm);
            renderList($('#ignoredRequestsList'), ignored, allData, 'ignored', searchTerm);
        });
    }

    function renderList(ulElement, requestIds, allData, listType, searchTerm) {
        ulElement.innerHTML = '';

        if (requestIds.length === 0) {
            ulElement.innerHTML = renderEmptyState(listType);
            return;
        }

        const displayIds = listType === 'notified'
            ? requestIds.slice(-15).reverse()
            : requestIds.slice().reverse();

        let hasVisible = false;

        displayIds.forEach((id, index) => {
            const info = allData[id] || { title: id, bodyText: '', date: '', budget: '', duration: '', offers: '' };

            if (searchTerm) {
                const searchable = `${info.title} ${info.bodyText} ${info.username || ''}`.toLowerCase();
                if (!searchable.includes(searchTerm)) return;
            }

            hasVisible = true;
            const li = document.createElement('li');
            li.className = 'request-card';
            li.style.animationDelay = `${index * 0.05}s`;

            li.innerHTML = `
                <div class="card-username">${escapeHtml(info.username || 'Bilinmeyen')}</div>
                <div class="card-header">
                    <div class="card-title">${escapeHtml(info.title || id)}</div>
                    ${listType === 'notified' ? '<div class="new-indicator"></div>' : ''}
                </div>
                ${info.bodyText ? `<div class="card-body">${escapeHtml(info.bodyText)}</div>` : ''}
                <div class="card-meta">
                    ${info.budget ? `
                        <div class="meta-item meta-budget">
                            ${escapeHtml(info.budget)}
                        </div>` : ''}
                    ${info.duration ? `
                        <div class="meta-item">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                            ${escapeHtml(info.duration)}
                        </div>` : ''}
                    ${info.offers ? `
                        <div class="meta-item meta-offers">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                            ${escapeHtml(info.offers)} teklif
                        </div>` : ''}
                    ${info.date ? `
                        <div class="meta-item meta-date">
                            ${escapeHtml(info.date)}
                        </div>` : ''}
                </div>
                <div class="card-actions">
                    ${getActionButtons(listType, id)}
                </div>
            `;

            // Title click -> open bionluk
            li.querySelector('.card-title').addEventListener('click', (e) => {
                e.stopPropagation();
                const url = info.detailUrl || 'https://www.bionluk.com/panel/alici-istekleri';
                chrome.tabs.create({ url });
            });
            li.querySelector('.card-title').style.cursor = 'pointer';

            // Action button events
            li.querySelectorAll('.btn-action').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    const targetList = btn.dataset.target;
                    moveRequest(id, listType, targetList);
                });
            });

            ulElement.appendChild(li);
        });

        if (!hasVisible && searchTerm) {
            ulElement.innerHTML = `
                <div class="empty-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    <p>"${escapeHtml(searchTerm)}" icin sonuc bulunamadi</p>
                </div>
            `;
        }
    }

    function getActionButtons(listType, id) {
        if (listType === 'notified') {
            return `
                <button class="btn-action btn-archive" data-action="move" data-target="archived">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
                    Arsivle
                </button>
                <button class="btn-action btn-ignore" data-action="move" data-target="ignored">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    Yok Say
                </button>
            `;
        } else if (listType === 'archived') {
            return `
                <button class="btn-action btn-restore" data-action="move" data-target="notified">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-8.36L1 10"/></svg>
                    Geri Al
                </button>
            `;
        } else {
            return `
                <button class="btn-action btn-restore" data-action="move" data-target="notified">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-8.36L1 10"/></svg>
                    Geri Al
                </button>
            `;
        }
    }

    function renderEmptyState(listType) {
        const messages = {
            notified: 'Henuz yeni istek yok',
            archived: 'Arsivde istek yok',
            ignored: 'Yok sayilan istek yok'
        };
        return `
            <div class="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                <p>${messages[listType]}</p>
            </div>
        `;
    }

    async function moveRequest(requestId, fromList, toList) {
        const data = await chrome.storage.local.get(['notifiedRequests', 'archivedRequests', 'ignoredRequests']);

        let from = data[fromList + 'Requests'] || [];
        let to = data[toList + 'Requests'] || [];

        from = from.filter(id => id !== requestId);
        if (!to.includes(requestId)) {
            to.push(requestId);
        }

        const updateData = {};
        updateData[fromList + 'Requests'] = from;
        updateData[toList + 'Requests'] = to;

        await chrome.storage.local.set(updateData);
        updateBadgeCount(updateData.notifiedRequests || from);
        loadAndDisplayLists();

        const actionNames = { archived: 'Arsivlendi', ignored: 'Yok sayildi', notified: 'Geri alindi' };
        showToast(actionNames[toList] || 'Tasinan');
    }

    function updateBadgeCount(notifiedList) {
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', payload: { count: notifiedList.length } });
    }

    function showToast(message) {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function formatTime(timestamp) {
        const d = new Date(timestamp);
        return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
