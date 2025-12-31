let subtitleContainer = null;
let xOffset = 0;
let yOffset = 0;
let observer = null;
let recognition = null;
let lastCleanText = "";
let subtitleQueue = []; // 存储最近的两行翻译结果

const style = document.createElement('style');
style.id = 'va-hide-native-subtitles';
style.innerHTML = `
  .ytp-caption-window-container, .bpx-player-subtitle, .subtitle-item, .video-caption { 
    display: none !important; 
  }
`;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "setPlaybackRate") {
    document.querySelectorAll('video').forEach(v => v.playbackRate = request.rate);
  } else if (request.action === "toggleTranslation") {
    if (request.enabled) {
      stopMic();
      document.head.appendChild(style);
      autoEnableSubtitles();
      initSubtitleObserver();
    } else {
      if (document.getElementById('va-hide-native-subtitles')) style.remove();
      stopSubtitleObserver();
    }
  } else if (request.action === "toggleMic") {
    if (request.enabled) {
      stopSubtitleObserver();
      startMic(request.lang);
    } else {
      stopMic();
    }
  }
});

function autoEnableSubtitles() {
  const host = window.location.hostname;
  if (host.includes('youtube.com')) {
    const btn = document.querySelector('.ytp-subtitles-button');
    if (btn && btn.getAttribute('aria-pressed') === 'false') btn.click();
  } else if (host.includes('bilibili.com')) {
    const btn = document.querySelector('.squirtle-subtitles-item') || document.querySelector('.bpx-player-ctrl-subtitle');
    if (btn) btn.click();
  }
}

function createSubtitleUI() {
  if (document.getElementById('va-draggable-subtitles')) return;
  subtitleContainer = document.createElement('div');
  subtitleContainer.id = 'va-draggable-subtitles';
  subtitleContainer.style.cssText = `
    position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.8); color: white; padding: 15px 30px;
    border-radius: 12px; z-index: 2147483647; cursor: move;
    text-align: center; max-width: 85%; min-width: 300px; line-height: 1.5;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1.5px solid #ff9800; user-select: none;
  `;
  subtitleContainer.innerHTML = `<div id="va-content" style="color: #ffffff; font-size: 24px; font-weight: bold;">等待翻译内容...</div>`;
  document.body.appendChild(subtitleContainer);
  
  subtitleContainer.onmousedown = (e) => {
    let startX = e.clientX - xOffset;
    let startY = e.clientY - yOffset;
    document.onmousemove = (ev) => {
      xOffset = ev.clientX - startX;
      yOffset = ev.clientY - startY;
      subtitleContainer.style.transform = `translate(calc(-50% + ${xOffset}px), ${yOffset}px)`;
    };
    document.onmouseup = () => document.onmousemove = null;
  };
}

function initSubtitleObserver() {
  createSubtitleUI();
  subtitleContainer.style.display = 'block';
  subtitleQueue = []; // 重置队列
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    let text = "";
    const host = window.location.hostname;
    if (host.includes('youtube.com')) {
      const segments = document.querySelectorAll('.ytp-caption-segment');
      text = Array.from(segments).map(s => s.innerText).join(' ');
    } else if (host.includes('bilibili.com')) {
      text = Array.from(document.querySelectorAll('.bpx-player-subtitle-content')).map(s => s.innerText).join(' ');
    }
    if (text) updateSubtitleText(text);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopSubtitleObserver() {
  if (observer) observer.disconnect();
  if (subtitleContainer) subtitleContainer.style.display = 'none';
  lastCleanText = "";
  subtitleQueue = [];
}

function startMic(lang) {
  createSubtitleUI();
  subtitleContainer.style.display = 'block';
  subtitleQueue = [];
  if (recognition) recognition.stop();
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        updateSubtitleText(event.results[i][0].transcript);
      }
    }
  };
  recognition.onend = () => { if (recognition) recognition.start(); };
  recognition.start();
}

function stopMic() {
  if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
  if (subtitleContainer) subtitleContainer.style.display = 'none';
  lastCleanText = "";
  subtitleQueue = [];
}

async function updateSubtitleText(text) {
  const cleanText = text.replace(/英语（自动生成）|中文（简体）|点击查看设置|>>|字幕/g, '').trim();
  
  // 严格去重逻辑
  if (!cleanText || cleanText === lastCleanText || lastCleanText.includes(cleanText)) return;
  
  lastCleanText = cleanText;
  const translated = await translateText(cleanText);
  
  // 维护双行队列
  if (subtitleQueue.length === 0 || subtitleQueue[subtitleQueue.length - 1] !== translated) {
    subtitleQueue.push(translated);
    if (subtitleQueue.length > 2) {
      subtitleQueue.shift(); // 始终保持最多两行
    }
    renderRollingSubtitles();
  }
}

function renderRollingSubtitles() {
  const contentEl = document.getElementById('va-content');
  if (!contentEl) return;
  
  // 渲染两行字幕，旧的在上，新的在下
  contentEl.innerHTML = subtitleQueue.map((line, index) => `
    <div style="opacity: ${index === 0 && subtitleQueue.length === 2 ? '0.6' : '1'}; 
                font-size: ${index === 0 && subtitleQueue.length === 2 ? '20px' : '26px'};
                margin-bottom: ${index === 0 ? '8px' : '0'};
                transition: all 0.3s ease;">
      ${line}
    </div>
  `).join('');
}

async function translateText(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data[0][0][0];
  } catch (e) { return "翻译中..."; }
}
