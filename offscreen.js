let audioCtx = null;
let streamSource = null;
let panner = null;
let lowPassFilter = null;
let highPassFilter = null;
let delayNodeL = null, delayNodeR = null;
let feedbackGainL = null, feedbackGainR = null;
let channelMerger = null, channelSplitter = null;
let stream = null;

let audioState = {
  isPlaying: false,
  isPaused: false,
  currentMode: '8d',
  currentGenre: 'club',
  baseRadius: 5.0,
  cyclePeriodInSeconds: 16.0,
  pausedTimeOffset: 0,
  lastPauseTimestamp: 0,
  currentX: 0,
  currentZ: 0,
  currentY: 0
};

// Слушаем команды от background.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.target === 'offscreen') {
    if (message.type === 'start-capture') handleStart(message);
    if (message.type === 'update-runtime-params') handleUpdate(message);
    if (message.type === 'action-pause') handlePause(message);
    if (message.type === 'action-stop') handleStop();
  }
});

async function handleStart(msg) {
  audioState.currentMode = msg.currentMode || '8d';
  audioState.currentGenre = msg.currentGenre || 'club';
  audioState.baseRadius = msg.baseRadius !== undefined ? msg.baseRadius : 5.0;
  audioState.cyclePeriodInSeconds = msg.cyclePeriodInSeconds || 16.0;
  audioState.pausedTimeOffset = 0;
  audioState.isPaused = false;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } },
      video: false
    });
    initEngine(stream);
  } catch(err) {
    console.error("Ошибка getUserMedia в оффскрине:", err);
  }
}

function handleUpdate(msg) {
  if (msg.currentMode !== undefined) audioState.currentMode = msg.currentMode;
  if (msg.currentGenre !== undefined) audioState.currentGenre = msg.currentGenre;
  if (msg.baseRadius !== undefined) audioState.baseRadius = msg.baseRadius;
  if (msg.cyclePeriodInSeconds !== undefined) audioState.cyclePeriodInSeconds = msg.cyclePeriodInSeconds;
  if (audioCtx) applyGenreSettings();
}

function handlePause(msg) {
  if (msg.state === 'paused') {
    audioState.isPaused = true;
    audioState.isPlaying = false;
    audioState.lastPauseTimestamp = performance.now();
  } else {
    audioState.isPaused = false;
    audioState.isPlaying = true;
    audioState.pausedTimeOffset += performance.now() - audioState.lastPauseTimestamp;
    updatePhysicsLoop();
  }
}

function handleStop() {
  audioState.isPlaying = false;
  audioState.isPaused = false;
  audioState.pausedTimeOffset = 0;
  if (audioCtx) audioCtx.close().then(() => { audioCtx = null; panner = null; });
  if (stream) { stream.getTracks().forEach(track => track.stop()); }
}

function initEngine(mediaStream) {
  audioCtx = new AudioContext({ latencyHint: 'interactive' });
  streamSource = audioCtx.createMediaStreamSource(mediaStream);

  lowPassFilter = audioCtx.createBiquadFilter(); lowPassFilter.type = 'lowpass';
  highPassFilter = audioCtx.createBiquadFilter(); highPassFilter.type = 'highpass';

  panner = audioCtx.createPanner();
  panner.panningModel = 'HRTF'; panner.distanceModel = 'exponential'; panner.rolloffFactor = 1.5;

  channelSplitter = audioCtx.createChannelSplitter(2); channelMerger = audioCtx.createChannelMerger(2);
  delayNodeL = audioCtx.createDelay(); delayNodeR = audioCtx.createDelay();
  feedbackGainL = audioCtx.createGain(); feedbackGainR = audioCtx.createGain();

  delayNodeL.connect(feedbackGainL); feedbackGainL.connect(delayNodeR);
  delayNodeR.connect(feedbackGainR); feedbackGainR.connect(delayNodeL);

  streamSource.connect(lowPassFilter); streamSource.connect(highPassFilter);
  lowPassFilter.connect(audioCtx.destination);

  highPassFilter.connect(panner);
  highPassFilter.connect(channelSplitter);
  channelSplitter.connect(delayNodeL, 0); channelSplitter.connect(delayNodeR, 1);
  delayNodeL.connect(channelMerger, 0, 0); delayNodeR.connect(channelMerger, 0, 1);
  channelMerger.connect(panner);
  panner.connect(audioCtx.destination);

  applyGenreSettings();
  audioState.isPlaying = true;
  updatePhysicsLoop();
}

function applyGenreSettings() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  if (audioState.currentGenre === 'club') {
    lowPassFilter.frequency.setValueAtTime(130, now); highPassFilter.frequency.setValueAtTime(130, now);
    delayNodeL.delayTime.setValueAtTime(0.022, now); delayNodeR.delayTime.setValueAtTime(0.033, now);
    feedbackGainL.gain.setValueAtTime(0.25, now); feedbackGainR.gain.setValueAtTime(0.25, now);
  } else if (audioState.currentGenre === 'rock') {
    lowPassFilter.frequency.setValueAtTime(320, now); highPassFilter.frequency.setValueAtTime(320, now);
    delayNodeL.delayTime.setValueAtTime(0.008, now); delayNodeR.delayTime.setValueAtTime(0.012, now);
    feedbackGainL.gain.setValueAtTime(0.08, now); feedbackGainR.gain.setValueAtTime(0.08, now);
  } else if (audioState.currentGenre === 'ambient') {
    lowPassFilter.frequency.setValueAtTime(80, now); highPassFilter.frequency.setValueAtTime(80, now);
    delayNodeL.delayTime.setValueAtTime(0.070, now); delayNodeR.delayTime.setValueAtTime(0.085, now);
    feedbackGainL.gain.setValueAtTime(0.48, now); feedbackGainR.gain.setValueAtTime(0.48, now);
  }
}

function updatePhysicsLoop() {
  if (!audioState.isPlaying) return;

  let timestamp = performance.now();
  let adjustedTimestamp = timestamp - audioState.pausedTimeOffset;
  let timeInSeconds = adjustedTimestamp / 1000;
  let baseLinearAngle = (timeInSeconds * 2 * Math.PI) / audioState.cyclePeriodInSeconds;

  let waveShift = Math.sin(baseLinearAngle * 1.3) * 0.85;
  let virtualAngle = baseLinearAngle + waveShift;

  if (audioState.currentMode === '8d') {
    audioState.currentX = Math.sin(virtualAngle) * (audioState.baseRadius * 1.5);
    audioState.currentZ = Math.cos(virtualAngle) * (audioState.baseRadius * 0.35);
    audioState.currentY = 0;
  } else if (audioState.currentMode === '16d') {
    let denom = 1 + Math.sin(virtualAngle) * Math.sin(virtualAngle);
    audioState.currentX = (audioState.baseRadius * 1.6 * Math.cos(virtualAngle)) / denom;
    audioState.currentZ = (audioState.baseRadius * 0.65 * Math.sin(virtualAngle) * Math.cos(virtualAngle)) / denom;
    audioState.currentY = Math.sin(virtualAngle * 2) * (audioState.currentGenre === 'ambient' ? 1.6 : 0.8);
  }

  let dopplerShift = 1.0 + (Math.sin(virtualAngle) * 0.025);
  if (audioCtx && highPassFilter) {
    let targetFreq = audioState.currentGenre === 'club' ? 130 : audioState.currentGenre === 'rock' ? 320 : 80;
    highPassFilter.frequency.setValueAtTime(targetFreq * dopplerShift, audioCtx.currentTime);
  }

  if (panner) {
    panner.positionX.setValueAtTime(audioState.currentX, audioCtx.currentTime);
    panner.positionY.setValueAtTime(audioState.currentY, audioCtx.currentTime);
    panner.positionZ.setValueAtTime(audioState.currentZ, audioCtx.currentTime);
  }

  chrome.runtime.sendMessage({ target: 'popup', type: "renderFrame", state: audioState }).catch(() => {});
  setTimeout(updatePhysicsLoop, 16);
}