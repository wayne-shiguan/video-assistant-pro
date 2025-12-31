document.addEventListener('DOMContentLoaded', function() {
  const rateButtons = document.querySelectorAll('.btn-group button');
  const translateToggle = document.getElementById('translateToggle');
  const micToggle = document.getElementById('micToggle');
  const micSettings = document.getElementById('micSettings');
  const micLang = document.getElementById('micLang');

  // 初始化状态
  chrome.storage.local.get(['playbackRate', 'translationEnabled', 'micEnabled', 'selectedLang'], function(data) {
    if (data.playbackRate) setActiveRateButton(data.playbackRate);
    if (data.translationEnabled) translateToggle.checked = data.translationEnabled;
    if (data.micEnabled) {
      micToggle.checked = data.micEnabled;
      micSettings.style.display = 'block';
    }
    if (data.selectedLang) micLang.value = data.selectedLang;
  });

  rateButtons.forEach(button => {
    button.addEventListener('click', function() {
      const rate = parseFloat(this.getAttribute('data-rate'));
      setActiveRateButton(rate);
      chrome.storage.local.set({ playbackRate: rate });
      sendMessageToActiveTab({ action: "setPlaybackRate", rate: rate });
    });
  });

  translateToggle.addEventListener('change', function() {
    const enabled = this.checked;
    if (enabled) {
      micToggle.checked = false;
      micSettings.style.display = 'none';
      chrome.storage.local.set({ micEnabled: false });
    }
    chrome.storage.local.set({ translationEnabled: enabled });
    sendMessageToActiveTab({ action: "toggleTranslation", enabled: enabled });
  });

  micToggle.addEventListener('change', function() {
    const enabled = this.checked;
    micSettings.style.display = enabled ? 'block' : 'none';
    if (enabled) {
      translateToggle.checked = false;
      chrome.storage.local.set({ translationEnabled: false });
      sendMessageToActiveTab({ action: "toggleTranslation", enabled: false });
    }
    chrome.storage.local.set({ micEnabled: enabled });
    sendMessageToActiveTab({ action: "toggleMic", enabled: enabled, lang: micLang.value });
  });

  micLang.addEventListener('change', function() {
    chrome.storage.local.set({ selectedLang: this.value });
    if (micToggle.checked) {
      sendMessageToActiveTab({ action: "toggleMic", enabled: true, lang: this.value });
    }
  });

  function setActiveRateButton(rate) {
    rateButtons.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.getAttribute('data-rate')) === rate);
    });
  }

  function sendMessageToActiveTab(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, message);
    });
  }
});
