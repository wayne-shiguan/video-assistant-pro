// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "setPlaybackRate") {
    document.querySelectorAll('video').forEach(v => v.playbackRate = request.rate);
  } else if (request.action === "toggleTranslation") {
    if (request.enabled) {
      activateYouTubeNativeTranslation();
    }
  }
});

// 全自动激活 YouTube 原生翻译字幕
async function activateYouTubeNativeTranslation() {
  const host = window.location.hostname;
  if (!host.includes('youtube.com')) return;

  try {
    // 1. 开启 CC 字幕
    const subButton = document.querySelector('.ytp-subtitles-button');
    if (subButton && subButton.getAttribute('aria-pressed') === 'false') {
      subButton.click();
    }

    // 2. 打开设置菜单
    const settingsButton = document.querySelector('.ytp-settings-button');
    if (settingsButton) {
      settingsButton.click();
      await sleep(300);

      // 3. 找到“字幕”菜单项并点击
      const menuItems = document.querySelectorAll('.ytp-menuitem');
      let subtitleMenu = Array.from(menuItems).find(item => 
        item.innerText.includes('字幕') || item.innerText.includes('Subtitles')
      );

      if (subtitleMenu) {
        subtitleMenu.click();
        await sleep(300);

        // 4. 找到“自动翻译”并点击
        const subMenuItems = document.querySelectorAll('.ytp-menuitem');
        let autoTranslate = Array.from(subMenuItems).find(item => 
          item.innerText.includes('自动翻译') || item.innerText.includes('Auto-translate')
        );

        if (autoTranslate) {
          autoTranslate.click();
          await sleep(300);

          // 5. 找到“中文（简体）”并点击
          const langItems = document.querySelectorAll('.ytp-menuitem');
          let targetLang = Array.from(langItems).find(item => 
            item.innerText.includes('中文（简体）') || item.innerText.includes('Chinese (Simplified)')
          );

          if (targetLang) {
            targetLang.click();
            console.log("YouTube 原生中文翻译已激活");
          }
        }
      }
      // 关闭设置菜单（如果还开着）
      if (settingsButton.getAttribute('aria-expanded') === 'true') {
        settingsButton.click();
      }
    }
  } catch (error) {
    console.error("激活原生翻译失败:", error);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
