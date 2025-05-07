document.addEventListener('DOMContentLoaded', function() {
    const extensionToggle = document.getElementById('extensionToggle');
    const notifiedRequestsList = document.getElementById('notifiedRequestsList');
    const archivedRequestsList = document.getElementById('archivedRequestsList');
    const ignoredRequestsList = document.getElementById('ignoredRequestsList');

    // Eklenti durumunu yükle ve ayarla
    chrome.storage.local.get("isExtensionActive", (data) => {
        extensionToggle.checked = data.isExtensionActive !== undefined ? data.isExtensionActive : true;
    });

    // Eklenti durumunu değiştirme
    extensionToggle.addEventListener('change', () => {
        chrome.storage.local.set({ isExtensionActive: extensionToggle.checked });
    
        console.log("Eklenti durumu değişti:", extensionToggle.checked);
    });

    // İstek listelerini yükle ve göster
    loadAndDisplayLists();

    function loadAndDisplayLists() {
        chrome.storage.local.get(["notifiedRequests", "archivedRequests", "ignoredRequests", "allRequestsData"], (data) => {
            const notified = data.notifiedRequests || [];
            const archived = data.archivedRequests || [];
            const ignored = data.ignoredRequests || [];
            const allRequestsData = data.allRequestsData || {}; // { requestId: {title: '...', url: '...'} }

            renderList(notifiedRequestsList, notified, allRequestsData, "notified");
            renderList(archivedRequestsList, archived, allRequestsData, "archived");
            renderList(ignoredRequestsList, ignored, allRequestsData, "ignored");
        });
    }

    function renderList(ulElement, requestIds, allRequestsData, listType) {
        ulElement.innerHTML = ''; 
        if (requestIds.length === 0) {
            ulElement.innerHTML = "<li>Liste boş.</li>";
            return;
        }

        // Son 10 bildirimi göster (veya hepsi, isteğe bağlı)
        const displayIds = (listType === "notified") ? requestIds.slice(-10).reverse() : requestIds.reverse();

        displayIds.forEach(id => {
            const requestInfo = allRequestsData[id] || { title: id, bodyText: "Detay yok", detailUrl: null }; // ID'yi başlık olarak kullan
            const li = document.createElement('li');
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = requestInfo.title;
            titleSpan.style.cursor = "pointer";
            titleSpan.addEventListener('click', () => {
                if (requestInfo.detailUrl) {
                    chrome.tabs.create({ url: requestInfo.detailUrl });
                } else {
                   
                    chrome.tabs.create({ url: "https://www.bionluk.com/panel/alici-istekleri" });
                }
            });
            li.appendChild(titleSpan);

            // Butonları ekle (bildirilenler için farklı, diğerleri için farklı)
            if (listType === "notified") {
                const archiveButton = createButton("Arşivle", () => moveRequest(id, "notified", "archived", allRequestsData));
                const ignoreButton = createButton("Yok Say", () => moveRequest(id, "notified", "ignored", allRequestsData));
                li.appendChild(archiveButton);
                li.appendChild(ignoreButton);
            } else if (listType === "archived") {
                const unarchiveButton = createButton("Arşivden Çıkar", () => moveRequest(id, "archived", "notified", allRequestsData)); // Geri bildirilenlere taşı
                li.appendChild(unarchiveButton);
            } else if (listType === "ignored") {
                const unignoreButton = createButton("Yok Saymaktan Vazgeç", () => moveRequest(id, "ignored", "notified", allRequestsData)); // Geri bildirilenlere taşı
                li.appendChild(unignoreButton);
            }

            ulElement.appendChild(li);
        });
    }

    function createButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.addEventListener('click', onClick);
        return button;
    }

    async function moveRequest(requestId, fromListType, toListType, allRequestsData) {
        let data = await chrome.storage.local.get(["notifiedRequests", "archivedRequests", "ignoredRequests", "lastKnownRequestId"]);
        
        let fromList = data[fromListType + "Requests"] || [];
        let toList = data[toListType + "Requests"] || [];

        // İsteği kaynak listeden kaldır
        fromList = fromList.filter(id => id !== requestId);
        // İsteği hedef listeye ekle (eğer zaten yoksa)
        if (!toList.includes(requestId)) {
            toList.push(requestId);
        }

        const updateData = {};
        updateData[fromListType + "Requests"] = fromList;
        updateData[toListType + "Requests"] = toList;

        if ((toListType === 'ignored' || toListType === 'archived') && data.lastKnownRequestId === requestId) {
             updateData.lastKnownRequestId = null;
        }

        await chrome.storage.local.set(updateData);
        loadAndDisplayLists(); // Listeleri yeniden yükle
    }

}); 