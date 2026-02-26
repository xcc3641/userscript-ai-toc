// ==UserScript==
// @name         AI Chat TOC - 智能侧边目录
// @namespace    http://tampermonkey.net/
// @version      2.6.5
// @description  为 ChatGPT, Claude, Gemini, DeepSeek, Kimi 等 AI 聊天页面添加精致的侧边目录导航。支持穿透 Shadow DOM 适配 Gemini。
// @author       xcc3641
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=openai.com
// @homepageURL  https://github.com/xcc3641/userscript-ai-toc
// @supportURL   https://github.com/xcc3641/userscript-ai-toc/issues
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://claude.ai/*
// @match        https://gemini.google.com/*
// @match        https://www.deepseek.com/*
// @match        https://chat.deepseek.com/*
// @match        https://kimi.moonshot.cn/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

/**
 * [INPUT]: 依赖 Tampermonkey 环境提供的 GM_addStyle 和标准 DOM API
 * [OUTPUT]: 挂载 #ai-toc-root 悬浮窗，提供实时目录导航
 * [POS]: 项目核心入口脚本，整合了 UI 渲染、拖拽逻辑与标题提取算法
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

(function() {
    'use strict';

    const ROOT_ID = 'ai-toc-root';
    const CONTENT_ID = 'ai-toc-content';
    let tocData = [];
    let activeId = null;
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    // --- 1. 样式注入 ---
    GM_addStyle(`
        :root {
            --toc-bg-gradient: linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.70) 100%);
            --toc-border-color: #FFFFFF;
            --toc-header-border: rgba(0, 0, 0, 0.08); 
            --toc-radius: 12px;
            --toc-text: #1f1f1f;
            --toc-hover: rgba(0, 0, 0, 0.04);
            --toc-active-bg: rgba(0, 0, 0, 0.08);
            --toc-accent: #10a37f;
        }

        [data-theme='dark'] :root, .dark :root {
            --toc-bg-gradient: linear-gradient(180deg, rgba(40, 40, 40, 0.45) 0%, rgba(40, 40, 40, 0.75) 100%);
            --toc-border-color: rgba(255, 255, 255, 0.2);
            --toc-header-border: rgba(255, 255, 255, 0.12);
            --toc-text: #ececec;
            --toc-hover: rgba(255, 255, 255, 0.06);
            --toc-active-bg: rgba(255, 255, 255, 0.15);
        }

        #ai-toc-root {
            position: fixed; top: 100px; right: 20px; width: 240px;
            transition: left 0.4s cubic-bezier(0.25, 1, 0.5, 1), right 0.4s cubic-bezier(0.25, 1, 0.5, 1), top 0.4s cubic-bezier(0.25, 1, 0.5, 1), max-height 0.3s ease-in-out;
            max-height: 75vh; z-index: 2147483647;
            background: var(--toc-bg-gradient) !important;
            border: 1px solid var(--toc-border-color) !important;
            border-radius: var(--toc-radius) !important;
            backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12); color: var(--toc-text);
            display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            overflow: hidden; user-select: none;
        }

        #ai-toc-root.collapsed { max-height: 40px !important; }

        .ai-toc-header {
            height: 40px; min-height: 40px; padding: 0 10px;
            display: flex; align-items: center; justify-content: space-between;
            border-bottom: 1px solid var(--toc-header-border) !important;
            background: transparent; cursor: move;
        }

        #ai-toc-toggle-btn, #ai-toc-refresh-btn {
            background: none; border: none; cursor: pointer; color: var(--toc-text);
            padding: 4px; border-radius: 4px; display: flex; transition: all 0.2s; opacity: 0.5;
        }
        #ai-toc-toggle-btn:hover, #ai-toc-refresh-btn:hover { background: var(--toc-hover); opacity: 1; }

        .collapsed #ai-toc-toggle-btn { transform: rotate(-90deg); }

        .ai-toc-title { font-size: 11px; font-weight: 700; text-transform: uppercase; opacity: 0.6; letter-spacing: 0.8px; flex: 1; margin-left: 6px; }

        .ai-toc-content { overflow-y: auto; padding: 4px 0; flex: 1; }
        .collapsed .ai-toc-content { display: none; }

        .ai-toc-item {
            margin: 2px 6px; padding: 8px 10px; font-size: 13px; cursor: pointer;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            border-radius: 4px; transition: background 0.2s; color: var(--toc-text); opacity: 0.8;
        }
        .ai-toc-item:hover { background: var(--toc-hover); opacity: 1; }
        .ai-toc-item.active { background: var(--toc-active-bg) !important; font-weight: 500; opacity: 1; }
        .ai-toc-item.level-3 { padding-left: 22px; font-size: 12px; opacity: 0.6; }

        .ai-toc-content::-webkit-scrollbar { width: 3px; }
        .ai-toc-content::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 10px; }
    `);

    // --- 2. 核心算法：Shadow DOM 深度穿透扫描 ---
    function querySelectorAllDeep(selector, root = document) {
        let nodes = Array.from(root.querySelectorAll(selector));
        const walk = (node) => {
            if (node.shadowRoot) {
                nodes = nodes.concat(Array.from(node.shadowRoot.querySelectorAll(selector)));
                Array.from(node.shadowRoot.querySelectorAll('*')).forEach(walk);
            }
        };
        root.querySelectorAll('*').forEach(walk);
        return nodes;
    }

    function collectHeadings() {
        const results = [];
        const seenText = new Set();
        
        // 针对不同平台优化选择器
        const isGemini = window.location.hostname.includes('gemini.google.com');
        const selectors = isGemini ? ['h2', 'h3'] : ['h2', 'h3', '.markdown h2', '.markdown h3'];
        
        // 使用深度穿透扫描
        const headings = querySelectorAllDeep(selectors.join(', '));
        
        headings.forEach((h, index) => {
            if (h.closest('#' + ROOT_ID) || 
                h.classList.contains('cdk-visually-hidden') ||
                h.innerText.trim().length < 2) return;
            
            const text = h.innerText.replace(/#+/g, '').trim();
            if (seenText.has(text)) return;
            seenText.add(text);
            
            const id = h.id || `ai-toc-node-${index}`;
            h.id = id;
            results.push({ level: h.tagName === 'H2' ? 2 : 3, text: text, id: id, node: h });
        });
        return results;
    }
    
    // 暴露调试接口
    const api = {
        collect: collectHeadings,
        refresh: () => { tocData = collectHeadings(); renderTOC(); }
    };
    
    if (typeof unsafeWindow !== 'undefined') {
        unsafeWindow.__AI_TOC__ = api;
    }
    window.__AI_TOC__ = api; // 双重挂载，确保万无一失

    // --- 3. UI 渲染逻辑 ---
    function renderTOC() {
        const container = document.getElementById(CONTENT_ID);
        if (!container) return;
        if (tocData.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;font-size:11px;opacity:0.4;">等待内容生成...</div>';
            return;
        }
        container.innerHTML = '';
        tocData.forEach(item => {
            const div = document.createElement('div');
            const isActive = activeId === item.id;
            div.className = `ai-toc-item level-${item.level}${isActive ? ' active' : ''}`;
            div.innerText = item.text;
            div.onclick = (e) => {
                e.stopPropagation();
                activeId = item.id;
                renderTOC();
                item.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
            container.appendChild(div);
        });
    }

    // --- 4. 拖拽与吸附逻辑 ---
    function applySnapping(root, xPos) {
        const windowWidth = window.innerWidth;
        const rect = root.getBoundingClientRect();
        const centerX = xPos + rect.width / 2;
        root.style.transition = 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        
        let config = JSON.parse(localStorage.getItem('ai-toc-pos') || '{}');
        if (centerX < windowWidth / 2) {
            root.style.left = '20px'; root.style.right = 'auto';
            config.side = 'left';
        } else {
            root.style.left = 'auto'; root.style.right = '20px';
            config.side = 'right';
        }
        config.top = root.style.top;
        localStorage.setItem('ai-toc-pos', JSON.stringify(config));
    }

    function setupDragging(root) {
        const header = root.querySelector('.ai-toc-header');
        header.onmousedown = function(e) {
            if (e.target.closest('button')) return;
            isDragging = true;
            root.style.transition = 'none';
            startX = e.clientX; startY = e.clientY;
            const rect = root.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top;

            const onMouseMove = (ev) => {
                if (!isDragging) return;
                root.style.left = (initialLeft + (ev.clientX - startX)) + 'px';
                root.style.top = (initialTop + (ev.clientY - startY)) + 'px';
                root.style.right = 'auto';
            };

            const onMouseUp = (ev) => {
                isDragging = false;
                applySnapping(root, initialLeft + (ev.clientX - startX));
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    }

    // --- 5. 挂载 UI ---
    function mountUI() {
        if (document.getElementById(ROOT_ID)) return;
        const root = document.createElement('div');
        root.id = ROOT_ID;
        
        const savedConfig = JSON.parse(localStorage.getItem('ai-toc-pos') || '{}');
        if (savedConfig.top) root.style.top = savedConfig.top;
        if (savedConfig.side === 'left') { root.style.left = '20px'; root.style.right = 'auto'; }
        else { root.style.left = 'auto'; root.style.right = '20px'; }
        if (savedConfig.collapsed) root.classList.add('collapsed');

        root.innerHTML = `
            <div class="ai-toc-header">
                <button id="ai-toc-toggle-btn" title="折叠/展开">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 4L7 10L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <span class="ai-toc-title">AI TOC Navigation</span>
                <button id="ai-toc-refresh-btn" title="手动刷新">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M9.49 13.17C8.64 13.53 7.75 13.7 6.86 13.7C5.08 13.7 3.32 13.01 2.01 11.7C0.72 10.41 0 8.68002 0 6.85002C0 5.02002 0.72 3.30002 2.01 2.00002L2.62 1.40002L3.77 5.55002L1.85 5.70002C1.76 6.07002 1.72 6.46002 1.72 6.85002C1.72 8.23002 2.25 9.52002 3.22 10.49C4.75 12.01 7.08 12.42 9.03 11.51L9.49 13.17Z" fill="currentColor"/><path d="M13.72 6.85C13.72 8.68 13 10.4 11.71 11.7L11.1 12.31L9.94998 8.15L11.87 8.01C11.96 7.63 12 7.24 12 6.85C12 5.48 11.47 4.19 10.49 3.21C8.96998 1.69 6.63998 1.28 4.68998 2.2L4.22998 0.53C6.76998 -0.54 9.73998 0.04 11.71 2C13 3.3 13.72 5.02 13.72 6.85Z" fill="currentColor"/></svg>
                </button>
            </div>
            <div id="${CONTENT_ID}" class="ai-toc-content"></div>
        `;

        document.body.appendChild(root);
        setupDragging(root);

        document.getElementById('ai-toc-toggle-btn').onclick = function(e) {
            e.stopPropagation();
            const isCollapsed = root.classList.toggle('collapsed');
            let config = JSON.parse(localStorage.getItem('ai-toc-pos') || '{}');
            config.collapsed = isCollapsed;
            localStorage.setItem('ai-toc-pos', JSON.stringify(config));
        };

        document.getElementById('ai-toc-refresh-btn').onclick = function(e) {
            e.stopPropagation();
            this.style.transform = 'rotate(360deg)';
            setTimeout(() => { this.style.transform = 'rotate(0deg)'; }, 500);
            tocData = collectHeadings();
            renderTOC();
        };
    }

    // --- 6. 初始化逻辑 ---
    function init() {
        mountUI();
        let timer;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const newData = collectHeadings();
                if (newData.length !== tocData.length) { 
                    tocData = newData; 
                    renderTOC(); 
                }
            }, 1000); // 将 1500ms 缩短到 1000ms，让 Gemini 的流式生成显得更及时
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true }); // 增加 characterData 监听
        
        // 针对 Gemini 等单页应用的路由跳转监听
        window.addEventListener('popstate', () => {
            setTimeout(() => { tocData = collectHeadings(); renderTOC(); }, 1000);
        });
        
        window.addEventListener('resize', () => {
            const root = document.getElementById(ROOT_ID);
            if (root) {
                const rect = root.getBoundingClientRect();
                if (rect.top > window.innerHeight - 100) root.style.top = (window.innerHeight - 100) + 'px';
            }
        });
        setTimeout(() => { tocData = collectHeadings(); renderTOC(); }, 2000);
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
