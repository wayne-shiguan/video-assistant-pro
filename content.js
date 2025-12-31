let subtitleContainer = null;
let xOffset = 0;
let yOffset = 0;
let observer = null;
let recognition = null;
let lastCleanText = ""; // 用于记录最后一次处理的纯净文本

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
    text-align: center; max-width: 85%; line-height: 1.4;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1.5px solid #ff9800; user-select: none;
  `;
  subtitleContainer.innerHTML = `<div id="va-content" style="color: #ffffff; font-size: 26px; font-weight: bold;">等待翻译内容...</div>`;
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
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    let text = "";
    const host = window.location.hostname;
    if (host.includes('youtube.com')) {
      // 针对 YouTube 优化：只取当前显示的最新片段
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
}

function startMic(lang) {
  createSubtitleUI();
  subtitleContainer.style.display = 'block';
  if (recognition) recognition.stop();
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;
  recognition.onresult = (event) => {
    let transcript = '';
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
}

async function updateSubtitleText(text) {
  // 文本清洗：过滤系统提示词和特殊符号
  const cleanText = text.replace(/英语（自动生成）|中文（简体）|点击查看设置|>>|字幕/g, '').trim();
  
  // 严格去重：如果清洗后的文本与上一次相同，或者包含在上一次中，则跳过
  if (!cleanText || cleanText === lastCleanText || lastCleanText.includes(cleanText)) return;
  
  // 如果新文本包含旧文本，说明是追加，我们只翻译完整的新文本
  lastCleanText = cleanText;
  
  const translated = await translateText(cleanText);
  renderSingleSubtitle(translated);
}

function renderSingleSubtitle(translated) {
  const contentEl = document.getElementById('va-content');
  if (!contentEl) return;
  // 永远只显示最新的一行翻译
  contentEl.innerText = translated;
}

async function translateText(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data[0][0][0];
  } catch (e) { return "翻译中..."; }
}
