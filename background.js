let currentEngineState = {
    state: 'stopped', // stopped, active, paused
    currentMode: '8d',
    currentGenre: 'club',
    baseRadius: 5.0,
    cyclePeriodInSeconds: 16.0
};

chrome.runtime.onMessage.addListener(async (message) => {
    // Popup открылся и запрашивает статус и сохраненные параметры
    if (message.type === 'get-current-status') {
        chrome.runtime.sendMessage({
            target: 'popup',
            type: 'status-update',
            state: currentEngineState.state,
            currentMode: currentEngineState.currentMode,
            currentGenre: currentEngineState.currentGenre,
            baseRadius: currentEngineState.baseRadius,
            cyclePeriodInSeconds: currentEngineState.cyclePeriodInSeconds
        });
        return;
    }

    // Динамическое обновление параметров "на лету" без перезапуска потока захвата
    if (message.type === 'control-quantum' && message.action === 'update-params') {
        if (message.currentMode !== undefined) currentEngineState.currentMode = message.currentMode;
        if (message.currentGenre !== undefined) currentEngineState.currentGenre = message.currentGenre;
        if (message.baseRadius !== undefined) currentEngineState.baseRadius = message.baseRadius;
        if (message.cyclePeriodInSeconds !== undefined) currentEngineState.cyclePeriodInSeconds = message.cyclePeriodInSeconds;
        
        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'update-runtime-params',
            currentMode: currentEngineState.currentMode,
            currentGenre: currentEngineState.currentGenre,
            baseRadius: currentEngineState.baseRadius,
            cyclePeriodInSeconds: currentEngineState.cyclePeriodInSeconds
        });
        return;
    }

    if (message.type === 'control-quantum' && message.action === 'start') {
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        
        if (contexts.length > 0 && currentEngineState.state !== 'stopped') {
            chrome.runtime.sendMessage({ 
                target: 'popup', 
                type: 'status-update', 
                state: currentEngineState.state,
                currentMode: currentEngineState.currentMode,
                currentGenre: currentEngineState.currentGenre,
                baseRadius: currentEngineState.baseRadius,
                cyclePeriodInSeconds: currentEngineState.cyclePeriodInSeconds
            });
            return;
        }

        if (contexts.length === 0) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html', // <--- ТЕПЕРЬ ОН ЖЕСТКО ТУТ ЕСТЬ!
                reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
                justification: 'Перехват аудиопотока для квантовой 16D обработки'
            });
        }

        chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId }, (streamId) => {
            if (!streamId) {
                return;
            }
            
            currentEngineState.state = 'active';
            currentEngineState.currentMode = message.currentMode;
            currentEngineState.currentGenre = message.currentGenre;
            currentEngineState.baseRadius = message.baseRadius;
            currentEngineState.cyclePeriodInSeconds = message.cyclePeriodInSeconds;

            chrome.runtime.sendMessage({
                target: 'offscreen',
                type: 'start-capture',
                streamId: streamId,
                currentMode: currentEngineState.currentMode,
                currentGenre: currentEngineState.currentGenre,
                baseRadius: currentEngineState.baseRadius,
                cyclePeriodInSeconds: currentEngineState.cyclePeriodInSeconds
            });
        });
    }

    if (message.type === 'control-quantum' && message.action === 'toggle-pause') {
        if (currentEngineState.state === 'active') {
            currentEngineState.state = 'paused';
        } else if (currentEngineState.state === 'paused') {
            currentEngineState.state = 'active';
        }
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'action-pause', state: currentEngineState.state });
    }

    if (message.type === 'control-quantum' && message.action === 'stop') {
        currentEngineState.state = 'stopped';
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'action-stop' });
        
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (contexts.length > 0) {
            await chrome.offscreen.closeDocument();
        }
    }
});
