let subtitleContainer = null;
let xOffset = 0;
let yOffset = 0;
let observer = null;
let recognition = null;
let subtitleQueue = []; 
let lastProcessedText = "";

// 注入 CSS 强制隐藏原生字幕并统一黄色样式
const style = document.createElement('style');
style.id = 'va-global-styles';
style.innerHTML = `
  .ytp-caption-window-container, .bpx-player-subtitle, .subtitle-item, .video-caption { 
    display: none !important; 
  }
  #va-draggable-subtitles * {
    color: #ff9800 !important;
    font-family: "Helvetica Neue", Helvetica, Arial, "Microsoft YaHei", sans-serif !important;
  }
`;
document.head.appendChild(style);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "setPlaybackRate") {
    document.querySelectorAll('video').forEach(v => v.playbackRate = request.rate);
  } else if (request.action === "toggleTranslation") {
    if (request.enabled) {
      stopMic();
      autoEnableSubtitles();
      initSubtitleObserver();
    } else {
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
    background-color: rgba(0, 0, 0, 0.85); padding: 15px 30px;
    border-radius: 12px; z-index: 2147483647; cursor: move;
    text-align: center; max-width: 85%; min-width: 350px; line-height: 1.5;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1.5px solid #ff9800; user-select: none;
  `;
  subtitleContainer.innerHTML = `<div id="va-content"></div>`;
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
  subtitleQueue = [];
  lastProcessedText = "";
  if (observer) observer.disconnect();
  
  observer = new MutationObserver(() => {
    let text = "";
    const host = window.location.hostname;
    if (host.includes('youtube.com')) {
      const segments = document.querySelectorAll('.ytp-caption-segment');
      text = Array.from(segments).map(s => s.innerText).join(' ').trim();
    } else if (host.includes('bilibili.com')) {
      text = Array.from(document.querySelectorAll('.bpx-player-subtitle-content')).map(s => s.innerText).join(' ').trim();
    }
    
    if (text && text !== lastProcessedText) {
      lastProcessedText = text;
      processSubtitle(text);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function processSubtitle(text) {
  const cleanText = text.replace(/英语（自动生成）|中文（简体）|点击查看设置|>>|字幕/g, '').trim();
  if (!cleanText) return;

  const translated = await translateText(cleanText);
  if (!translated) return;

  // 严格 20 字限制与断句逻辑
  let finalLines = splitByLengthAndPunctuation(translated, 20);
  
  // 更新队列：始终保持最近两行
  subtitleQueue = finalLines.slice(-2);
  renderSubtitles();
}

function splitByLengthAndPunctuation(text, maxLength) {
  // 简单的断句逻辑：按标点符号分割
  const sentences = text.split(/([。？！；,，!?;])/).filter(s => s.length > 0);
  let lines = [];
  let currentLine = "";

  for (let i = 0; i < sentences.length; i++) {
    let part = sentences[i];
    if ((currentLine + part).length > maxLength) {
      if (currentLine) lines.push(currentLine);
      currentLine = part;
    } else {
      currentLine += part;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function renderSubtitles() {
  const contentEl = document.getElementById('va-content');
  if (!contentEl) return;
  
  // 强制纯黄显示，严格两行
  contentEl.innerHTML = subtitleQueue.map((line, index) => `
    <div style="color: #ff9800 !important; 
                font-size: ${index === 0 && subtitleQueue.length === 2 ? '20px' : '26px'};
                opacity: ${index === 0 && subtitleQueue.length === 2 ? '0.6' : '1'};
                margin-bottom: ${index === 0 && subtitleQueue.length === 2 ? '8px' : '0'};
                font-weight: bold;">
      ${line}
    </div>
  `).join('');
}

function stopSubtitleObserver() {
  if (observer) observer.disconnect();
  if (subtitleContainer) subtitleContainer.style.display = 'none';
  subtitleQueue = [];
}

function startMic(lang) {
  createSubtitleUI();
  subtitleContainer.style.display = 'block';
  subtitleQueue = [];
  if (recognition) recognition.stop();
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = lang;
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1][0].transcript;
    processSubtitle(result);
  };
  recognition.onend = () => { if (recognition) recognition.start(); };
  recognition.start();
}

function stopMic() {
  if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
  if (subtitleContainer) subtitleContainer.style.display = 'none';
  subtitleQueue = [];
}

async function translateText(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data[0][0][0];
  } catch (e) { return ""; }
}
