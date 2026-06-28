const canvas = document.getElementById('orbitVisualizer');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');

const modeSelect = document.getElementById('mode');
const genreSelect = document.getElementById('genre');
const distanceInput = document.getElementById('distance');
const periodInput = document.getElementById('period');

// При открытии пульта сразу запрашиваем актуальный статус у фона
chrome.runtime.sendMessage({ type: 'get-current-status' });

chrome.runtime.onMessage.addListener((message) => {
  if (message.target === 'popup') {
    if (message.type === 'status-update') syncUI(message);
    if (message.type === 'renderFrame') {
      syncUI(message.state);
      drawRadar(message.state);
    }
  }
});

function syncUI(state) {
  const isEngineActive = (state.state === 'active' || state.isPlaying === true);
  const isEnginePaused = (state.state === 'paused' || state.isPaused === true);
  const isEngineStopped = (state.state === 'stopped' || (!isEngineActive && !isEnginePaused));

  startBtn.disabled = isEngineActive || isEnginePaused;
  pauseBtn.disabled = isEngineStopped;
  stopBtn.disabled = isEngineStopped;

  pauseBtn.innerText = isEnginePaused ? 'СТАРТ' : 'ПАУЗА';
  pauseBtn.style.background = isEnginePaused ? '#00ffcc' : '#ffcc00';

  if (state.currentMode) modeSelect.value = state.currentMode;
  if (state.currentGenre) genreSelect.value = state.currentGenre;
  
  if (state.baseRadius !== undefined) {
    distanceInput.value = state.baseRadius;
    document.getElementById('distVal').innerText = parseFloat(state.baseRadius).toFixed(1);
  }
  if (state.cyclePeriodInSeconds !== undefined) {
    periodInput.value = state.cyclePeriodInSeconds;
    document.getElementById('periodVal').innerText = parseFloat(state.cyclePeriodInSeconds).toFixed(1);
  }
}

function sendParamsUpdate() {
  chrome.runtime.sendMessage({
    type: 'control-quantum',
    action: 'update-params',
    currentMode: modeSelect.value,
    currentGenre: genreSelect.value,
    baseRadius: parseFloat(distanceInput.value),
    cyclePeriodInSeconds: parseFloat(periodInput.value)
  });
  chrome.storage.local.set({
    savedMode: modeSelect.value,
    savedGenre: genreSelect.value,
    savedRadius: parseFloat(distanceInput.value),
    savedPeriod: parseFloat(periodInput.value)
  });
}

modeSelect.addEventListener('change', sendParamsUpdate);
genreSelect.addEventListener('change', sendParamsUpdate);
distanceInput.addEventListener('input', (e) => {
  document.getElementById('distVal').innerText = parseFloat(e.target.value).toFixed(1);
  sendParamsUpdate();
});
periodInput.addEventListener('input', (e) => {
  document.getElementById('periodVal').innerText = parseFloat(e.target.value).toFixed(1);
  sendParamsUpdate();
});

startBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    chrome.runtime.sendMessage({
      type: 'control-quantum',
      action: 'start',
      tabId: tabs.id,
      currentMode: modeSelect.value,
      currentGenre: genreSelect.value,
      baseRadius: parseFloat(distanceInput.value),
      cyclePeriodInSeconds: parseFloat(periodInput.value)
    });
  });
});

pauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'control-quantum', action: 'toggle-pause' });
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'control-quantum', action: 'stop' });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function drawRadar(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  ctx.strokeStyle = '#14141f'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.ellipse(centerX, centerY, 80, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(centerX, centerY, 40, 9, 0, 0, Math.PI * 2);
  ctx.moveTo(centerX, 0); ctx.lineTo(centerX, canvas.height);
  ctx.moveTo(0, centerY); ctx.lineTo(canvas.width, centerY); ctx.stroke();

  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(centerX, centerY, 5, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(0, 255, 204, 0.05)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let t = 0; t < Math.PI * 2; t += 0.05) {
    let tx = 0, tz = 0;
    if (state.currentMode === '8d') {
      tx = Math.sin(t) * (state.baseRadius * 1.5); tz = Math.cos(t) * (state.baseRadius * 0.35);
    } else {
      let td = 1 + Math.sin(t) * Math.sin(t);
      tx = (state.baseRadius * 1.6 * Math.cos(t)) / td; tz = (state.baseRadius * 0.65 * Math.sin(t) * Math.cos(t)) / td;
    }
    let sx = centerX + (tx * (centerX / 16)); let sz = centerY + (tz * (centerY / 16));
    if (t === 0) ctx.moveTo(sx, sz); else ctx.lineTo(sx, sz);
  }
  ctx.stroke();

  const screenX = centerX + (state.currentX * (centerX / 16));
  const screenZ = centerY + (state.currentZ * (centerY / 16));
  ctx.shadowBlur = 6; ctx.shadowColor = '#00ffcc'; ctx.fillStyle = '#00ffcc';
  ctx.beginPath(); ctx.arc(screenX, screenZ, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
}