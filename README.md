# AI Chat TOC Userscript

为主流 AI 聊天页面添加精致的侧边目录导航。支持 ChatGPT, Claude, Gemini, DeepSeek, Kimi。

> 💡 **致敬与参考**: 本项目受 [leongao/ai-toc-extension](https://github.com/leongao/ai-toc-extension) 的启发进行油猴脚本化重构，旨在提供更轻量、跨平台的原生目录体验。

## 🚀 功能特性

- **极致 UI**: 磨砂玻璃质感，支持系统级深色模式切换。
- **智能吸附**: 支持左/右边缘自动吸附，记忆拖拽位置。
- **实时同步**: 基于 DOM 监听，内容生成时自动同步目录。
- **全平台支持**: ChatGPT, Claude, Gemini, DeepSeek, Kimi 等。

## 📦 安装方式

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击下方链接安装脚本：
   - **[通过 GreasyFork 安装 (推荐)](https://greasyfork.org/zh-CN/scripts/567604-ai-chat-toc-%E6%99%BA%E8%83%BD%E4%BE%A7%E8%BE%B9%E7%9B%AE%E5%BD%95)**
   - [通过 GitHub 直接安装](https://github.com/xcc3641/userscript-ai-toc/raw/main/ai-toc.user.js)

## 🛠️ 技术细节

- **无依赖**: 纯原生 JS + CSS 注入，无第三方库开销。
- **防抖处理**: 1.5s 生成监听，保障页面运行性能。

## 📄 License

MIT © xcc3641
