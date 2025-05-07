// Offscreen document için JavaScript
chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target !== 'offscreen') {
        return;
    }

    if (message.type === 'PLAY_SOUND') {
        const audio = new Audio(message.payload.soundFile); 
                                                          
                                                          
        try {
            await audio.play();
            console.log("Offscreen: Ses çalındı:", message.payload.soundFile);
        } catch (error) {
            console.error("Offscreen: Ses çalınırken hata:", error);
        }
    }
}); 