let subtitleContainer = null;
let xOffset = 0;
let yOffset = 0;
let observer = null;
let recognition = null;
let subtitleQueue = []; // 严格存储最近的两行翻译
let lastProcessedText = ""; // 记录最后一次处理的原始文本

// 注入 CSS 强制隐藏原生字幕并统一样式
const style = document.createElement('style');
style.id = 'va-global-styles';
style.innerHTML = `
  .ytp-caption-window-container, .bpx-player-subtitle, .subtitle-item, .video-caption { 
    display: none !important; 
  }
  #va-draggable-subtitles * {
    color: white !important;
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
    background-color: rgba(0, 0, 0, 0.85); padding: 20px 35px;
    border-radius: 15px; z-index: 2147483647; cursor: move;
    text-align: center; max-width: 85%; min-width: 400px; line-height: 1.6;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6); border: 2px solid #ff9800; user-select: none;
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
    
    if (text && isNewContent(text)) {
      processSubtitle(text);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// 深度去重逻辑：判断是否为真正的新内容
function isNewContent(newText) {
  // 过滤掉系统杂质
  const clean = newText.replace(/英语（自动生成）|中文（简体）|点击查看设置|>>|字幕/g, '').trim();
  if (!clean || clean === lastProcessedText) return false;
  
  // 如果新内容只是旧内容的延伸（YouTube 常见情况），则不视为完全的新行，但需要更新
  // 只有当新内容长度显著增加或完全不同时才处理
  if (clean.length > lastProcessedText.length && clean.startsWith(lastProcessedText)) {
    // 这种情况下我们更新最后处理的文本，但可能不需要立即推入新行，除非长度增加很多
    if (clean.length - lastProcessedText.length > 10) {
        lastProcessedText = clean;
        return true;
    }
    lastProcessedText = clean;
    return false;
  }
  
  lastProcessedText = clean;
  return true;
}

async function processSubtitle(text) {
  const translated = await translateText(text);
  if (!translated) return;

  // 严格双行队列管理
  if (subtitleQueue.length === 0 || subtitleQueue[subtitleQueue.length - 1] !== translated) {
    subtitleQueue.push(translated);
    if (subtitleQueue.length > 2) {
      subtitleQueue.shift();
    }
    renderSubtitles();
  }
}

function renderSubtitles() {
  const contentEl = document.getElementById('va-content');
  if (!contentEl) return;
  
  // 强制纯白显示，严格两行
  contentEl.innerHTML = subtitleQueue.map((line, index) => `
    <div style="color: white !important; 
                font-size: ${index === 0 && subtitleQueue.length === 2 ? '20px' : '28px'};
                opacity: ${index === 0 && subtitleQueue.length === 2 ? '0.5' : '1'};
                margin-bottom: ${index === 0 && subtitleQueue.length === 2 ? '10px' : '0'};
                font-weight: bold;
                transition: all 0.2s ease;">
      ${line}
    </div>
  `).join('');
}

function stopSubtitleObserver() {
  if (observer) observer.disconnect();
  if (subtitleContainer) subtitleContainer.style.display = 'none';
  subtitleQueue = [];
  lastProcessedText = "";
}

function startMic(lang) {
  createSubtitleUI();
  subtitleContainer.style.display = 'block';
  subtitleQueue = [];
  if (recognition) recognition.stop();
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false; // 只取最终结果，减少跳动
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
