# 视频助手 Pro (Video Assistant Pro)

![Icon](icons/icon128.png)

一款简洁、智能的 Chrome 浏览器插件，专为提升视频观看体验而设计。支持 YouTube、Bilibili、小红书等主流平台。

## 核心功能

- **🚀 播放倍速调节**：支持 1x, 2x, 3x, 4x 快速切换。
- **✨ 原生字幕增强**：自动提取 YouTube/B站 原生字幕，转化为可拖动的中英双语对照模式。
- **🙈 智能隐藏**：开启插件后自动隐藏网站原生字幕，界面更纯净。
- **🎙️ 语音实时同传**：支持通过麦克风实时识别英语、日语、粤语并翻译为中文。
- **🧹 文本清洗**：自动过滤“自动生成”、“点击查看设置”等系统杂质字符。
- **🎨 简洁设计**：采用橘黄色与白色的企业级配色，搭配极简马头图标。

## 安装方法

1. 下载本仓库代码并解压。
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择解压后的文件夹即可。

## 使用说明

1. **原生字幕模式**：在 YouTube 或 B 站打开视频，点击插件图标开启“实时翻译”。插件会自动激活并接管原生字幕。
2. **语音同传模式**：针对无字幕视频或直播，开启“麦克风语音同传”，并选择对应的识别语种（英/日/粤）。
3. **位置调整**：字幕框支持鼠标自由拖动，可放置在屏幕任何位置。

## 技术栈

- Manifest V3
- Chrome Extension API (TabCapture, Scripting, Storage)
- Web Speech API (webkitSpeechRecognition)
- Google Translate API (Public Interface)

## 许可证

MIT License
