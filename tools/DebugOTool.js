// DebugOTool.js – Full Mobile Debugging Suite (v5.2)
// Shadow DOM – completely isolated.
// Elements tab now renders a collapsible DOM tree (like a file explorer).

(function() {
    'use strict';

    const SCRIPT_VERSION = '5.2';
    const PANEL_TABS = ['Console', 'Network', 'Elements', 'Storage', 'Service Workers', 'Performance'];

    // ---------- STATE ----------
    const consoleLogs = [];
    const networkLogs = [];

    // ---------- UTILITY ----------
    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ---------- SHADOW DOM SETUP ----------
    const host = document.createElement('div');
    host.id = 'debugContainer';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // ---------- INJECT STYLES INTO SHADOW ----------
    const style = document.createElement('style');
    style.textContent = `
        * { box-sizing: border-box; }
        :host { all: initial; display: block; font-family: 'Segoe UI', 'SF Mono', monospace; }
        body { padding-bottom: 52px !important; }

        #debugToggleBtn {
            position: fixed; bottom: 60px; right: 20px; z-index: 99999;
            background: #1a2332; color: #f5c842; border: 2px solid #f5c842;
            border-radius: 50%; width: 52px; height: 52px; font-size: 26px;
            display: flex; align-items: center; justify-content: center;
            cursor: grab; box-shadow: 0 4px 16px rgba(0,0,0,0.5);
            transition: transform 0.2s, box-shadow 0.2s; touch-action: none; user-select: none;
        }
        #debugToggleBtn:hover { transform: scale(1.12); box-shadow: 0 6px 24px rgba(245,200,66,0.25); }
        #debugToggleBtn:active { cursor: grabbing; }

        #debugPanel {
            display: none;
            position: fixed; bottom: 120px; right: 10px;
            width: 92%; max-width: 600px; max-height: 70vh;
            background: #0f1724; border: 1px solid #2a3a4a; border-radius: 18px;
            padding: 12px 16px 12px; padding-top: 0;
            z-index: 99999;
            box-shadow: 0 12px 48px rgba(0,0,0,0.7);
            backdrop-filter: blur(12px);
            overflow-y: auto;
            color: #e8edf5;
            font-family: 'Segoe UI', 'SF Mono', monospace;
            font-size: 12px;
            box-sizing: border-box;
            scroll-behavior: smooth;
            transition: all 0.3s ease;
        }
        #debugPanel.debug-panel-minimized {
            max-height: 52px; overflow: hidden; bottom: 70px; right: 20px;
            width: auto; min-width: 200px; border-radius: 18px; padding: 8px 16px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        }
        #debugPanel.debug-panel-minimized .panel-tabs,
        #debugPanel.debug-panel-minimized .tab-content,
        #debugPanel.debug-panel-minimized hr { display: none !important; }
        #debugPanel.debug-panel-minimized #debugPanelHeader {
            border-bottom: none; padding: 4px 0; cursor: grab;
        }
        #debugPanel.debug-panel-minimized #debugPanelHeader .title { font-size: 14px; }
        #debugPanel.debug-panel-fullscreen {
            width: 100% !important; max-width: 100% !important;
            height: 100% !important; max-height: 100% !important;
            top: 0 !important; left: 0 !important; bottom: 0 !important; right: 0 !important;
            border-radius: 0 !important; padding: 12px 16px 12px; padding-top: 0;
            box-shadow: none; border: none; z-index: 999999;
        }
        #debugPanel.debug-panel-fullscreen .tab-content { max-height: 75vh; }

        #debugPanel::-webkit-scrollbar { width: 5px; }
        #debugPanel::-webkit-scrollbar-track { background: #1a2332; border-radius: 8px; }
        #debugPanel::-webkit-scrollbar-thumb { background: #f5c842; border-radius: 8px; }

        #debugPanelHeader {
            cursor: grab; padding: 14px 0 8px; border-bottom: 1px solid #1e2d3d;
            display: flex; justify-content: space-between; align-items: center;
            position: sticky; top: 0; background: #0f1724; z-index: 10;
        }
        #debugPanelHeader .title { font-weight: 700; color: #f5c842; font-size: 14px; }
        #debugPanelHeader .title span { font-size: 18px; }
        #debugPanelHeader .header-actions {
            display: flex; gap: 5px; flex-wrap: wrap;
        }
        .header-btn {
            background: transparent; border: 1px solid #2a3a4a; color: #8a9bb0;
            padding: 2px 8px; border-radius: 4px; cursor: pointer;
            font-size: 14px; line-height: 1.4; transition: all 0.15s;
            font-family: inherit; font-weight: normal; text-transform: none;
        }
        .header-btn:hover { border-color: #f5c842; color: #f5c842; }

        .panel-tabs {
            display: flex; gap: 2px; border-bottom: 1px solid #1e2d3d;
            margin-bottom: 8px; overflow-x: auto; flex-wrap: nowrap;
        }
        .panel-tabs .tab {
            padding: 6px 12px; font-size: 11px; font-weight: 600;
            color: #8a9bb0; cursor: pointer; border-bottom: 2px solid transparent;
            white-space: nowrap; transition: all 0.15s; user-select: none;
        }
        .panel-tabs .tab.active { color: #f5c842; border-bottom-color: #f5c842; }
        .panel-tabs .tab:hover { color: #e8edf5; }

        .tab-content { display: none; height: auto; overflow-y: auto; max-height: 60vh; }
        .tab-content.active { display: block; }

        .log-container, .network-container, .storage-container, .worker-container, .perf-container {
            background: #080e18; border-radius: 6px; padding: 0.4rem 0.5rem;
            max-height: 300px; overflow-y: auto; font-family: 'SF Mono', monospace;
            font-size: 0.7rem; white-space: pre-wrap; color: #d0d9e8;
            margin-top: 0.2rem; border: 1px solid #1a2332;
        }
        .log-container .log-entry {
            padding: 0.1rem 0; border-bottom: 1px solid #121c2a;
            display: flex; gap: 6px; align-items: baseline; font-size: 10px;
        }
        .log-container .log-entry .log-time { color: #5a6f82; min-width: 60px; font-size: 0.5rem; }
        .log-container .log-entry .log-type {
            font-weight: 700; min-width: 44px; font-size: 0.6rem; text-transform: uppercase;
        }
        .log-container .log-entry .log-type.log { color: #4cd9b2; }
        .log-container .log-entry .log-type.error { color: #ff6b6b; }
        .log-container .log-entry .log-type.warn { color: #f5b342; }
        .log-container .log-entry .log-type.info { color: #6bc9ff; }
        .log-container .log-entry .log-msg { word-break: break-word; color: #c8d0e0; }
        .log-container .log-entry .log-stack {
            font-size: 0.5rem; color: #8a9bb0; padding-left: 10px; display: block;
        }

        .network-container .net-entry {
            padding: 0.1rem 0; border-bottom: 1px solid #121c2a;
            font-size: 10px; display: flex; gap: 6px; align-items: baseline;
            color: #b0bccf; flex-wrap: wrap;
        }
        .net-entry .net-time { color: #5a6f82; min-width: 60px; font-size: 0.5rem; }
        .net-entry .net-status {
            font-weight: 700; min-width: 32px; font-size: 0.6rem;
        }
        .net-entry .net-status.ok { color: #4cd9b2; }
        .net-entry .net-status.err { color: #ff6b6b; }
        .net-entry .net-method { color: #f5c842; font-weight: 600; min-width: 40px; font-size: 0.55rem; }
        .net-entry .net-url { color: #8a9bb0; word-break: break-all; font-size: 0.55rem; }
        .net-entry .net-body {
            font-size: 0.5rem; color: #6a7a8a; margin-left: 10px; display: block;
            max-height: 80px; overflow-y: auto; background: #0a0f18; padding: 4px;
            border-radius: 4px; width: 100%;
        }

        .storage-container .storage-item {
            padding: 2px 0; border-bottom: 1px solid #121c2a;
            display: flex; gap: 8px; font-size: 10px; align-items: center;
        }
        .storage-item .skey { color: #4cd9b2; font-weight: 600; min-width: 80px; }
        .storage-item .sval { color: #c8d0e0; word-break: break-all; flex: 1; }
        .storage-item .sdel {
            background: transparent; border: none; color: #ff6b6b;
            cursor: pointer; font-size: 12px; padding: 0 4px;
        }

        .worker-container .worker-entry {
            padding: 4px 0; border-bottom: 1px solid #121c2a;
            display: flex; justify-content: space-between; align-items: center;
            font-size: 10px;
        }
        .worker-entry .worker-url { color: #c8d0e0; word-break: break-all; }
        .worker-entry .worker-unreg {
            background: #ff6b6b; color: #0a0f18; border: none; border-radius: 4px;
            padding: 2px 8px; font-size: 9px; cursor: pointer;
        }

        .perf-container .perf-item {
            padding: 2px 0; border-bottom: 1px solid #121c2a;
            display: flex; justify-content: space-between; font-size: 10px;
        }
        .perf-item .perf-label { color: #8a9bb0; }
        .perf-item .perf-value { color: #4cd9b2; font-weight: 600; }

        .filter-input {
            width: 100%; background: #080e18; border: 1px solid #1e2d3d;
            border-radius: 4px; padding: 4px 8px; color: #e8edf5;
            font-family: inherit; font-size: 10px; outline: none; margin-bottom: 4px;
        }
        .filter-input:focus { border-color: #f5c842; }

        .btn-small {
            background: transparent; border: 1px solid #1e2d3d; color: #8a9bb0;
            padding: 0.15rem 0.7rem; border-radius: 4px; cursor: pointer;
            font-size: 0.65rem; font-family: inherit; transition: all 0.15s;
            white-space: nowrap; display: inline-flex; align-items: center; gap: 3px;
            height: 22px;
        }
        .btn-small:hover { border-color: #f5c842; color: #f5c842; background: rgba(245,200,66,0.06); }
        .btn-small.copy-btn { border-color: #2a4a5a; }
        .btn-small.copy-btn:hover { border-color: #4cd9b2; color: #4cd9b2; }
        .btn-small.danger-btn { border-color: #3a2a2a; }
        .btn-small.danger-btn:hover { border-color: #ff6b6b; color: #ff6b6b; }
        .btn-small.primary-btn { border-color: #f5c842; color: #f5c842; }
        .btn-small.primary-btn:hover { background: rgba(245,200,66,0.12); }

        .debug-toast {
            position: fixed; bottom: 120px; right: 20px;
            background: #1a2332; border: 1px solid #f5c842; color: #e8edf5;
            padding: 8px 18px; border-radius: 10px; font-family: 'Segoe UI', sans-serif;
            font-size: 13px; z-index: 999999; box-shadow: 0 6px 24px rgba(0,0,0,0.5);
            opacity: 0; transform: translateY(12px);
            transition: opacity 0.25s ease, transform 0.25s ease;
            pointer-events: none;
        }
        .debug-toast.show { opacity: 1; transform: translateY(0); }
        .debug-toast.success { border-color: #4cd9b2; }
        .debug-toast.error { border-color: #ff6b6b; }

        @media (max-width: 480px) {
            #debugPanel { width: 96%; right: 2%; bottom: 110px; max-height: 70vh; padding: 10px; }
            #debugToggleBtn { width: 44px; height: 44px; font-size: 20px; bottom: 50px; right: 14px; }
            .panel-tabs .tab { padding: 4px 8px; font-size: 9px; }
            .log-container .log-entry { font-size: 9px; flex-wrap: wrap; }
            .log-container .log-entry .log-time { min-width: 44px; font-size: 0.45rem; }
            .log-container .log-entry .log-type { min-width: 32px; font-size: 0.5rem; }
            .storage-item .skey { min-width: 60px; }
            #debugPanel.debug-panel-minimized { min-width: 160px; padding: 4px 12px; bottom: 60px; }
            .header-btn { padding: 2px 6px; font-size: 14px; }
        }

        #goldBar {
            position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(15,23,36,0.95); backdrop-filter: blur(8px);
            color: #e8edf5; font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 12px; padding: 4px 14px;
            display: flex; justify-content: space-between; align-items: center;
            z-index: 999999; border-top: 2px solid #f5c842;
            box-shadow: 0 -2px 12px rgba(0,0,0,0.4);
            flex-wrap: wrap; gap: 4px 12px;
        }
        #goldBarTitle { font-weight: 700; color: #f5c842; cursor: pointer; }
        #goldBar .token-label { color: #4cd9b2; }
        #copyTokenBtn {
            background: #f5c842; color: #0a0f18; border: none; border-radius: 4px;
            padding: 2px 12px; font-weight: 700; font-size: 11px; cursor: pointer;
        }

        .output-toolbar {
            display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;
        }
        .output-toolbar .btn-small { height: 20px; font-size: 0.6rem; padding: 0 8px; }

        /* ===== TREE STYLES ===== */
        .tree-container {
            font-family: 'SF Mono', monospace;
            font-size: 11px;
            background: #080e18;
            border-radius: 4px;
            padding: 4px 0;
            max-height: 400px;
            overflow-y: auto;
            color: #c8d0e0;
            white-space: nowrap;
        }
        .tree-node {
            padding-left: 4px;
        }
        .node-header {
            display: flex;
            align-items: center;
            cursor: pointer;
            padding: 1px 0;
            border-radius: 2px;
            transition: background 0.1s;
            user-select: none;
        }
        .node-header:hover { background: rgba(255,255,255,0.05); }
        .toggle-icon {
            display: inline-block;
            width: 16px;
            text-align: center;
            color: #5a6f82;
            font-size: 10px;
            transition: transform 0.15s;
            flex-shrink: 0;
        }
        .toggle-icon.collapsed { transform: rotate(-90deg); }
        .tag-name { color: #4cd9b2; }
        .tag-id { color: #6bc9ff; }
        .tag-class { color: #f5b342; }
        .tag-attr { color: #8a9bb0; }
        .text-content { color: #8a9bb0; font-style: italic; }
        .comment-content { color: #5a6f82; }
        .node-children {
            padding-left: 20px;
            display: block;
        }
        .node-children.collapsed { display: none; }
        .tree-root > .node-children { padding-left: 0; }
    `;
    shadow.appendChild(style);

    // ---------- BUILD UI ----------
    function buildGoldBar() {
        const token = localStorage.getItem('authToken') || 'No token';
        let clientCode = 'N/A', email = 'N/A';
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                clientCode = payload.clientCode || 'N/A';
                email = payload.email || 'N/A';
            }
        } catch(_) {}
        const franchise = localStorage.getItem('selectedFranchiseCode') || 'N/A';
        const tokenDisplay = token.length > 30 ? token.slice(0,28)+'…' : token;

        const bar = document.createElement('div');
        bar.id = 'goldBar';
        bar.innerHTML = `
            <span id="goldBarTitle">🐞 Debug v${SCRIPT_VERSION}</span>
            <span>Token: <span class="token-label">${tokenDisplay}</span></span>
            <span>Client: <span class="token-label">${clientCode}</span></span>
            <span>Email: <span class="token-label">${email}</span></span>
            <span>Franchise: <span class="token-label">${franchise}</span></span>
            <button id="copyTokenBtn">📋 Copy Token</button>
        `;
        shadow.appendChild(bar);

        bar.querySelector('#copyTokenBtn').addEventListener('click', function() {
            const text = token;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            } else {
                fallbackCopy(text);
            }
            showToast('✅ Token copied', 'success');
        });
        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }

        bar.querySelector('#goldBarTitle').addEventListener('click', function() {
            const btn = shadow.getElementById('debugToggleBtn');
            if (btn) btn.click();
        });
    }

    // ---------- BUILD TREE (collapsible DOM) ----------
    function buildTreeElement(el, depth) {
        depth = depth || 0;
        const node = document.createElement('div');
        node.className = 'tree-node';

        const header = document.createElement('div');
        header.className = 'node-header';

        // Toggle icon
        const icon = document.createElement('span');
        icon.className = 'toggle-icon';
        icon.textContent = '▶';
        header.appendChild(icon);

        // Determine if it has children
        const childrenList = el.children || [];
        const hasChildren = childrenList.length > 0 || (el.nodeType === Node.TEXT_NODE && el.textContent.trim());

        // Build header text
        const nameSpan = document.createElement('span');
        if (el.nodeType === Node.ELEMENT_NODE) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const classes = el.className ? `.${el.className.replace(/ /g, '.')}` : '';
            let attrs = '';
            if (el.attributes) {
                const attrArr = [];
                for (let i = 0; i < el.attributes.length; i++) {
                    const a = el.attributes[i];
                    if (a.name !== 'id' && a.name !== 'class') {
                        attrArr.push(`${a.name}="${a.value}"`);
                    }
                }
                if (attrArr.length) attrs = ' ' + attrArr.join(' ');
            }
            nameSpan.innerHTML = `<span class="tag-name">&lt;${tag}</span><span class="tag-id">${id}</span><span class="tag-class">${classes}</span><span class="tag-attr">${escapeHtml(attrs)}</span><span class="tag-name">&gt;</span>`;
            // Store reference to the real element
            node._element = el;
        } else if (el.nodeType === Node.TEXT_NODE) {
            const text = el.textContent.trim();
            if (text) {
                nameSpan.innerHTML = `<span class="text-content">#text "${escapeHtml(text.slice(0, 50))}${text.length > 50 ? '…' : ''}"</span>`;
                node._element = el;
            } else {
                // empty text node, skip? we won't add node for empty text
                return null;
            }
        } else if (el.nodeType === Node.COMMENT_NODE) {
            nameSpan.innerHTML = `<span class="comment-content">&lt;!-- ${escapeHtml(el.textContent.slice(0, 50))} --&gt;</span>`;
            node._element = el;
        } else {
            return null;
        }

        header.appendChild(nameSpan);
        node.appendChild(header);

        // Children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'node-children';
        if (depth >= 1) {
            // Collapse deeper levels by default
            childrenContainer.classList.add('collapsed');
            icon.classList.add('collapsed');
        }

        // If the node has children, build them
        let hasVisibleChildren = false;
        if (el.nodeType === Node.ELEMENT_NODE) {
            for (const child of el.childNodes) {
                const childNode = buildTreeElement(child, depth + 1);
                if (childNode) {
                    childrenContainer.appendChild(childNode);
                    hasVisibleChildren = true;
                }
            }
        }

        if (hasVisibleChildren) {
            node.appendChild(childrenContainer);
            // Toggle on header click
            header.addEventListener('click', function(e) {
                e.stopPropagation();
                // Toggle children visibility
                const isCollapsed = childrenContainer.classList.contains('collapsed');
                if (isCollapsed) {
                    childrenContainer.classList.remove('collapsed');
                    icon.classList.remove('collapsed');
                    icon.textContent = '▼';
                } else {
                    childrenContainer.classList.add('collapsed');
                    icon.classList.add('collapsed');
                    icon.textContent = '▶';
                }
                // Also highlight the element if it's an element node
                if (node._element && node._element.nodeType === Node.ELEMENT_NODE) {
                    window.debugHighlightElement(node._element);
                }
            });
        } else {
            // No children – remove toggle icon
            icon.style.visibility = 'hidden';
            // Still highlight on click
            header.addEventListener('click', function(e) {
                e.stopPropagation();
                if (node._element && node._element.nodeType === Node.ELEMENT_NODE) {
                    window.debugHighlightElement(node._element);
                }
            });
        }

        return node;
    }

    // ---------- RENDER ELEMENTS (new tree) ----------
    function renderElements() {
        const container = getShadowElement('elementContainer');
        if (!container) return;
        // Clear container
        container.innerHTML = '';
        const root = document.documentElement;
        const treeRoot = document.createElement('div');
        treeRoot.className = 'tree-container tree-root';
        const rootNode = buildTreeElement(root, 0);
        if (rootNode) {
            treeRoot.appendChild(rootNode);
            // Expand root by default
            const childrenContainer = rootNode.querySelector('.node-children');
            const icon = rootNode.querySelector('.toggle-icon');
            if (childrenContainer) {
                childrenContainer.classList.remove('collapsed');
                if (icon) { icon.classList.remove('collapsed'); icon.textContent = '▼'; }
            }
        }
        container.appendChild(treeRoot);
        container.scrollTop = 0;
    }

    // ---------- HIGHLIGHT (improved) ----------
    window.debugHighlightElement = function(el) {
        if (!el) return;
        if (typeof el === 'string') {
            // fallback – selector string
            try {
                const target = document.querySelector(el);
                if (target) el = target;
                else return;
            } catch(e) { return; }
        }
        try {
            document.querySelectorAll('.debug-highlight').forEach(h => h.remove());
            const highlight = document.createElement('div');
            highlight.className = 'debug-highlight';
            const rect = el.getBoundingClientRect();
            highlight.style.cssText = `
                position: fixed; top: ${rect.top}px; left: ${rect.left}px;
                width: ${rect.width}px; height: ${rect.height}px;
                border: 2px solid #f5c842; background: rgba(245,200,66,0.15);
                pointer-events: none; z-index: 9999999;
            `;
            document.body.appendChild(highlight);
            setTimeout(() => highlight.remove(), 3000);
            showToast(`Highlighted: ${el.tagName ? el.tagName.toLowerCase() : 'element'}`, 'success');
        } catch(e) { /* ignore */ }
    };

    // ---------- SHADOW DOM QUERY HELPERS ----------
    function getShadowElement(id) {
        return shadow.getElementById(id);
    }

    // ---------- TOAST ----------
    let toastTimer = null;
    function showToast(msg, type) {
        let el = getShadowElement('debugToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'debugToast';
            el.className = 'debug-toast';
            shadow.appendChild(el);
        }
        clearTimeout(toastTimer);
        el.textContent = msg;
        el.className = 'debug-toast ' + (type || '');
        void el.offsetWidth;
        el.classList.add('show');
        toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
    }

    // ---------- CONSOLE LOG INTERCEPTOR ----------
    function addConsoleEntry(type, args, stack) {
        const message = args.map(a => typeof a === 'object' ? (a === null ? 'null' : JSON.stringify(a, null, 0)) : String(a)).join(' ');
        const entry = { type, time: new Date().toISOString(), message, stack: stack || '' };
        consoleLogs.push(entry);
        updateConsoleDisplay();
        updateBadge('consoleBadge', consoleLogs.length);
    }
    const origLog = console.log, origError = console.error, origWarn = console.warn, origInfo = console.info;
    console.log = function(...args) { addConsoleEntry('log', args); origLog.apply(console, args); };
    console.error = function(...args) { let stack = ''; try { throw new Error(); } catch(e) { stack = e.stack || ''; } addConsoleEntry('error', args, stack); origError.apply(console, args); };
    console.warn = function(...args) { addConsoleEntry('warn', args); origWarn.apply(console, args); };
    console.info = function(...args) { addConsoleEntry('info', args); origInfo.apply(console, args); };

    function updateConsoleDisplay() {
        const container = getShadowElement('consoleLogContainer');
        if (!container) return;
        const filter = getShadowElement('consoleFilter')?.value || '';
        const filtered = consoleLogs.filter(e => {
            if (!filter) return true;
            const search = filter.toLowerCase();
            return e.type.includes(search) || e.message.toLowerCase().includes(search);
        });
        if (filtered.length === 0) {
            container.innerHTML = '<div style="color:#4a5a6a;font-style:italic;padding:4px 0;">(no matching logs)</div>';
            return;
        }
        container.innerHTML = filtered.map(entry => {
            const stackHtml = entry.stack ? `<span class="log-stack">${escapeHtml(entry.stack)}</span>` : '';
            return `<div class="log-entry">
                <span class="log-time">${entry.time.slice(5,16)}</span>
                <span class="log-type ${entry.type}">${entry.type}</span>
                <span class="log-msg">${escapeHtml(entry.message)}</span>
                ${stackHtml}
            </div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    }

    function updateBadge(id, count) {
        const el = getShadowElement(id);
        if (el) el.textContent = count;
    }

    // ---------- NETWORK INTERCEPTOR ----------
    const origFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        const options = args[1] || {};
        const method = options.method || 'GET';
        let body = options.body;
        if (body && typeof body === 'string') { try { body = JSON.parse(body); } catch(_) {} }
        const startTime = performance.now();
        return origFetch.apply(this, args).then(async (response) => {
            const cloned = response.clone();
            let resBody;
            try { const text = await cloned.text(); try { resBody = JSON.parse(text); } catch(_) { resBody = text; } } catch(_) { resBody = 'Unable to read response'; }
            const endTime = performance.now();
            networkLogs.push({
                time: new Date().toISOString(),
                url: url,
                method: method,
                request: body,
                response: { status: response.status, body: resBody },
                duration: Math.round(endTime - startTime)
            });
            updateNetworkDisplay();
            return response;
        }).catch(err => {
            networkLogs.push({
                time: new Date().toISOString(),
                url: url,
                method: method,
                request: body,
                response: { status: 'ERROR', body: err.message },
                duration: 0
            });
            updateNetworkDisplay();
            throw err;
        });
    };

    function updateNetworkDisplay() {
        const container = getShadowElement('networkContainer');
        if (!container) return;
        if (networkLogs.length === 0) {
            container.innerHTML = '<div style="color:#4a5a6a;font-style:italic;padding:4px 0;">(no network requests)</div>';
            return;
        }
        container.innerHTML = networkLogs.map(e => {
            const statusClass = (e.response.status === 'ERROR' || e.response.status >= 400) ? 'err' : 'ok';
            const statusText = typeof e.response.status === 'number' ? e.response.status : 'ERR';
            const bodyStr = typeof e.response.body === 'string' ? e.response.body : JSON.stringify(e.response.body, null, 2);
            const bodyDisplay = bodyStr ? `<span class="net-body">${escapeHtml(bodyStr.slice(0, 500))}${bodyStr.length > 500 ? '…' : ''}</span>` : '';
            return `<div class="net-entry">
                <span class="net-time">${e.time.slice(5,16)}</span>
                <span class="net-status ${statusClass}">${statusText}</span>
                <span class="net-method">${e.method}</span>
                <span class="net-url">${escapeHtml(e.url)}</span>
                <span style="color:#5a6f82;font-size:0.5rem;">${e.duration}ms</span>
                ${bodyDisplay}
            </div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
        updateBadge('netBadge', networkLogs.length);
    }

    // ---------- STORAGE ----------
    function getStorageData() {
        const ls = localStorage;
        const ss = sessionStorage;
        const cookies = document.cookie.split(';').filter(c => c.trim()).map(c => {
            const [k, ...v] = c.trim().split('=');
            return { key: k, value: v.join('=') };
        });
        return { localStorage: ls, sessionStorage: ss, cookies };
    }

    function renderStorage() {
        const container = getShadowElement('storageContainer');
        if (!container) return;
        const data = getStorageData();
        let html = '<div style="padding:4px 0;"><strong>localStorage</strong> <button class="btn-small danger-btn" onclick="window.debugClearStorage(\'localStorage\')">Clear All</button></div>';
        if (data.localStorage.length > 0) {
            for (let i = 0; i < data.localStorage.length; i++) {
                const key = data.localStorage.key(i);
                const val = data.localStorage.getItem(key);
                html += `<div class="storage-item"><span class="skey">${escapeHtml(key)}</span><span class="sval">${escapeHtml(val)}</span><button class="sdel" onclick="window.debugDeleteStorage('localStorage','${key}')">✕</button></div>`;
            }
        } else {
            html += '<div style="color:#4a5a6a;padding:4px 0;">(empty)</div>';
        }
        html += '<div style="padding:4px 0;margin-top:8px;"><strong>sessionStorage</strong> <button class="btn-small danger-btn" onclick="window.debugClearStorage(\'sessionStorage\')">Clear All</button></div>';
        if (data.sessionStorage.length > 0) {
            for (let i = 0; i < data.sessionStorage.length; i++) {
                const key = data.sessionStorage.key(i);
                const val = data.sessionStorage.getItem(key);
                html += `<div class="storage-item"><span class="skey">${escapeHtml(key)}</span><span class="sval">${escapeHtml(val)}</span><button class="sdel" onclick="window.debugDeleteStorage('sessionStorage','${key}')">✕</button></div>`;
            }
        } else {
            html += '<div style="color:#4a5a6a;padding:4px 0;">(empty)</div>';
        }
        html += '<div style="padding:4px 0;margin-top:8px;"><strong>Cookies</strong> <button class="btn-small danger-btn" onclick="window.debugClearCookies()">Clear All</button></div>';
        if (data.cookies.length > 0) {
            for (const c of data.cookies) {
                html += `<div class="storage-item"><span class="skey">${escapeHtml(c.key)}</span><span class="sval">${escapeHtml(c.value)}</span><button class="sdel" onclick="window.debugDeleteCookie('${c.key}')">✕</button></div>`;
            }
        } else {
            html += '<div style="color:#4a5a6a;padding:4px 0;">(empty)</div>';
        }
        container.innerHTML = html;
    }

    window.debugClearStorage = function(type) {
        if (type === 'localStorage') localStorage.clear();
        else if (type === 'sessionStorage') sessionStorage.clear();
        renderStorage();
        showToast(`Cleared ${type}`, 'success');
    };
    window.debugDeleteStorage = function(type, key) {
        if (type === 'localStorage') localStorage.removeItem(key);
        else if (type === 'sessionStorage') sessionStorage.removeItem(key);
        renderStorage();
        showToast(`Deleted ${key}`, 'success');
    };
    window.debugClearCookies = function() {
        document.cookie.split(';').forEach(c => { document.cookie = c.trim().split('=')[0] + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });
        renderStorage();
        showToast('Cookies cleared', 'success');
    };
    window.debugDeleteCookie = function(name) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        renderStorage();
        showToast('Cookie deleted', 'success');
    };

    // ---------- SERVICE WORKERS ----------
    async function getServiceWorkers() {
        if (!navigator.serviceWorker) return [];
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations;
    }

    async function renderWorkers() {
        const container = getShadowElement('workerContainer');
        if (!container) return;
        try {
            const regs = await getServiceWorkers();
            if (regs.length === 0) {
                container.innerHTML = '<div style="color:#4a5a6a;padding:4px 0;">(no service workers registered)</div>';
                return;
            }
            let html = '';
            for (const reg of regs) {
                const scope = reg.scope || 'unknown';
                const active = reg.active ? '✅ Active' : '⛔ Inactive';
                html += `<div class="worker-entry">
                    <span class="worker-url">${escapeHtml(scope)} - ${active}</span>
                    <button class="worker-unreg" onclick="window.debugUnregisterWorker('${escapeHtml(scope)}')">Unregister</button>
                </div>`;
            }
            container.innerHTML = html;
        } catch(e) {
            container.innerHTML = '<div style="color:#ff6b6b;padding:4px 0;">Error reading service workers</div>';
        }
    }

    window.debugUnregisterWorker = async function(scope) {
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const reg of regs) {
                if (reg.scope === scope) {
                    await reg.unregister();
                    showToast('Worker unregistered', 'success');
                    renderWorkers();
                    break;
                }
            }
        } catch(e) {
            showToast('Failed to unregister', 'error');
        }
    };

    // ---------- PERFORMANCE ----------
    let fpsCounter = 0;
    let fpsValue = 0;
    let lastFpsTime = performance.now();

    function updateFPS() {
        const now = performance.now();
        fpsCounter++;
        if (now - lastFpsTime >= 1000) {
            fpsValue = Math.round(fpsCounter * 1000 / (now - lastFpsTime));
            fpsCounter = 0;
            lastFpsTime = now;
            const fpsEl = getShadowElement('fpsValue');
            if (fpsEl) fpsEl.textContent = fpsValue + ' FPS';
        }
        requestAnimationFrame(updateFPS);
    }

    function renderPerformance() {
        const container = getShadowElement('perfContainer');
        if (!container) return;
        const navTiming = performance.getEntriesByType('navigation')[0];
        const memory = performance.memory ? performance.memory : null;
        let html = '';
        if (navTiming) {
            html += `<div class="perf-item"><span class="perf-label">DOMContentLoaded</span><span class="perf-value">${Math.round(navTiming.domContentLoadedEventEnd - navTiming.fetchStart)}ms</span></div>`;
            html += `<div class="perf-item"><span class="perf-label">Load Complete</span><span class="perf-value">${Math.round(navTiming.loadEventEnd - navTiming.fetchStart)}ms</span></div>`;
            html += `<div class="perf-item"><span class="perf-label">DNS</span><span class="perf-value">${Math.round(navTiming.domainLookupEnd - navTiming.domainLookupStart)}ms</span></div>`;
            html += `<div class="perf-item"><span class="perf-label">TCP</span><span class="perf-value">${Math.round(navTiming.connectEnd - navTiming.connectStart)}ms</span></div>`;
        }
        if (memory) {
            html += `<div class="perf-item"><span class="perf-label">Memory Used</span><span class="perf-value">${Math.round(memory.usedJSHeapSize / 1024 / 1024)} MB</span></div>`;
        }
        html += `<div class="perf-item"><span class="perf-label">FPS</span><span class="perf-value" id="fpsValue">--</span></div>`;
        container.innerHTML = html;
        if (!window._fpsRunning) {
            window._fpsRunning = true;
            requestAnimationFrame(updateFPS);
        }
    }

    // ---------- TOGGLE ADDRESS BAR ----------
    function toggleAddressBar() {
        if (window.Android && window.Android.toggleAddressBar) {
            window.Android.toggleAddressBar();
            showToast('Address bar toggled', 'success');
        } else {
            showToast('Native bridge not available', 'error');
        }
    }

    // ---------- EXPORT ----------
    async function exportReport() {
        const now = new Date().toISOString();
        const token = localStorage.getItem('authToken') || 'No token';
        const clientCode = localStorage.getItem('clientCode') || 'N/A';
        const email = localStorage.getItem('email') || 'N/A';
        const franchise = localStorage.getItem('selectedFranchiseCode') || 'N/A';

        let report = `=== DEBUG REPORT (v${SCRIPT_VERSION}) ===\n`;
        report += `Generated: ${now}\n`;
        report += `URL: ${window.location.href}\n`;
        report += `Token: ${token}\nClient: ${clientCode}\nEmail: ${email}\nFranchise: ${franchise}\n\n`;

        // Console logs
        report += `--- CONSOLE LOGS (${consoleLogs.length}) ---\n`;
        for (const e of consoleLogs) {
            report += `[${e.time}] [${e.type.toUpperCase()}] ${e.message}\n`;
            if (e.stack) report += `Stack: ${e.stack}\n`;
        }
        report += `\n`;

        // Network
        report += `--- NETWORK REQUESTS (${networkLogs.length}) ---\n`;
        for (const n of networkLogs) {
            report += `[${n.time}] ${n.method} ${n.url} → ${n.response.status} (${n.duration}ms)\n`;
            if (n.request) report += `  Request: ${JSON.stringify(n.request, null, 2)}\n`;
            if (n.response.body) report += `  Response: ${typeof n.response.body === 'string' ? n.response.body : JSON.stringify(n.response.body, null, 2)}\n`;
        }
        report += `\n`;

        // Storage
        report += `--- STORAGE ---\n`;
        const ls = localStorage;
        report += 'localStorage:\n';
        for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            report += `  ${k} = ${ls.getItem(k)}\n`;
        }
        const ss = sessionStorage;
        report += 'sessionStorage:\n';
        for (let i = 0; i < ss.length; i++) {
            const k = ss.key(i);
            report += `  ${k} = ${ss.getItem(k)}\n`;
        }
        report += `Cookies: ${document.cookie}\n`;
        report += `\n`;

        // DOM Snapshot
        report += `--- DOM SNAPSHOT (truncated to 5000 chars) ---\n`;
        const html = document.documentElement.outerHTML;
        report += html.substring(0, 5000) + (html.length > 5000 ? '\n... (truncated)' : '');
        report += `\n\n`;

        // Service Workers
        report += `--- SERVICE WORKERS ---\n`;
        if (navigator.serviceWorker) {
            try {
                const regs = await navigator.serviceWorker.getRegistrations();
                if (regs.length === 0) {
                    report += '(none registered)\n';
                } else {
                    for (const reg of regs) {
                        report += `Scope: ${reg.scope}\n`;
                        report += `  Active: ${reg.active ? '✅ Yes' : '⛔ No'}\n`;
                        if (reg.active) {
                            report += `  Script: ${reg.active.scriptURL}\n`;
                        }
                        report += `  State: ${reg.active ? reg.active.state : 'none'}\n`;
                    }
                }
            } catch(e) {
                report += `Error reading service workers: ${e.message}\n`;
            }
        } else {
            report += 'Service Worker API not supported.\n';
        }
        report += `\n`;

        // Performance
        report += `--- PERFORMANCE METRICS ---\n`;
        const navTiming = performance.getEntriesByType('navigation')[0];
        if (navTiming) {
            report += `DOMContentLoaded: ${Math.round(navTiming.domContentLoadedEventEnd - navTiming.fetchStart)}ms\n`;
            report += `Load Complete: ${Math.round(navTiming.loadEventEnd - navTiming.fetchStart)}ms\n`;
            report += `DNS: ${Math.round(navTiming.domainLookupEnd - navTiming.domainLookupStart)}ms\n`;
            report += `TCP: ${Math.round(navTiming.connectEnd - navTiming.connectStart)}ms\n`;
        } else {
            report += '(Navigation timing not available)\n';
        }
        if (performance.memory) {
            report += `Memory Used: ${Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)} MB\n`;
        }
        report += `FPS: ${fpsValue || 'N/A'} FPS\n`;
        report += `\n`;

        // System Info
        report += `--- SYSTEM INFO ---\n`;
        report += `User Agent: ${navigator.userAgent}\n`;
        report += `Screen Size: ${screen.width}x${screen.height}\n`;
        report += `Device Pixel Ratio: ${window.devicePixelRatio}\n`;
        report += `\n=== END ===\n`;

        // Modal
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top:0; left:0; width:100%; height:100%;
            background: rgba(0,0,0,0.85); z-index: 9999999;
            display: flex; justify-content: center; align-items: center;
            padding: 20px;
        `;
        const box = document.createElement('div');
        box.style.cssText = `
            background: #0f1724; color: #e8edf5; max-width: 90%; max-height: 80%;
            padding: 20px; border-radius: 12px; overflow: auto;
            font-family: monospace; font-size: 12px; white-space: pre-wrap;
            border: 1px solid #f5c842; width: 100%;
            box-shadow: 0 12px 48px rgba(0,0,0,0.7);
        `;
        const pre = document.createElement('pre');
        pre.textContent = report;
        pre.style.cssText = `
            max-height: 50vh; overflow-y: auto; margin-bottom: 12px;
            background: #080e18; padding: 8px; border-radius: 4px;
            font-family: monospace; font-size: 11px; white-space: pre-wrap;
            color: #c8d0e0;
        `;
        box.appendChild(pre);

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;`;

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 Copy to Clipboard';
        copyBtn.style.cssText = `background: #4cd9b2; color: #0a0f18; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;`;
        copyBtn.onclick = () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(report).then(() => showToast('✅ Report copied', 'success')).catch(() => fallbackCopy(report));
            } else {
                fallbackCopy(report);
            }
        };
        btnContainer.appendChild(copyBtn);

        if (navigator.share) {
            const shareBtn = document.createElement('button');
            shareBtn.textContent = '📤 Share Report';
            shareBtn.style.cssText = `background: #6bc9ff; color: #0a0f18; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;`;
            shareBtn.onclick = async () => {
                try {
                    const file = new File([report], `debug_report_${now.slice(0,10)}.txt`, { type: 'text/plain' });
                    await navigator.share({ files: [file], title: 'Debug Report' });
                    showToast('✅ Shared!', 'success');
                } catch (e) {
                    if (e.name !== 'AbortError') showToast('❌ Share failed', 'error');
                }
            };
            btnContainer.appendChild(shareBtn);
        }

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '⬇️ Download .txt';
        downloadBtn.style.cssText = `background: #f5c842; color: #0a0f18; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;`;
        downloadBtn.onclick = () => {
            if (window.Android && window.Android.downloadReport) {
                window.Android.downloadReport(report);
                showToast('📥 Download started (native)', 'success');
            } else {
                try {
                    const blob = new Blob([report], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `debug_report_${now.slice(0,10)}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
                    showToast('📥 Download attempt', 'success');
                } catch(e) {
                    showToast('❌ Download failed. Use Copy or Share.', 'error');
                }
            }
        };
        btnContainer.appendChild(downloadBtn);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Close';
        closeBtn.style.cssText = `background: #ff6b6b; color: #0a0f18; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;`;
        closeBtn.onclick = () => overlay.remove();
        btnContainer.appendChild(closeBtn);

        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showToast('✅ Report copied (fallback)', 'success');
        }
    }

    // ---------- BUILD PANEL ----------
    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.innerHTML = `
            <div id="debugPanelHeader">
                <span class="title"><span>🐞</span> DebugOTool v${SCRIPT_VERSION}</span>
                <div class="header-actions">
                    <button id="toggleAddressBtn" class="header-btn" title="Toggle address bar">⊞</button>
                    <button id="minimizeBtn" class="header-btn" title="Minimize panel">−</button>
                    <button id="fullscreenBtn" class="header-btn" title="Toggle fullscreen">□</button>
                    <button id="debugExportBtn" class="btn-small copy-btn" title="Export full report">📤</button>
                    <button id="clearAllBtn" class="btn-small danger-btn" title="Clear console & network logs">🗑️</button>
                </div>
            </div>
            <div class="panel-tabs" id="panelTabs">
                ${PANEL_TABS.map(t => `<span class="tab ${t === 'Console' ? 'active' : ''}" data-tab="${t.toLowerCase().replace(/ /g,'_')}">${t}</span>`).join('')}
            </div>
            <div class="tab-content active" id="tab_console">
                <div style="display:flex; gap:4px; margin-bottom:4px;">
                    <input type="text" id="consoleFilter" class="filter-input" placeholder="Filter logs..." />
                    <button id="clearConsoleBtn" class="btn-small danger-btn">Clear</button>
                    <button id="copyConsoleBtn" class="btn-small copy-btn">Copy</button>
                </div>
                <div class="log-container" id="consoleLogContainer"></div>
                <div style="margin-top:6px;">
                    <input type="text" id="jsCommand" class="filter-input" placeholder="Enter JS command..." />
                    <button id="runJsBtn" class="btn-small primary-btn">Run</button>
                    <button id="clearJsOutput" class="btn-small danger-btn">Clear</button>
                </div>
                <div id="jsOutput" style="background:#080e18; border-radius:4px; padding:4px; font-family:monospace; font-size:10px; color:#c8d0e0; max-height:120px; overflow-y:auto; margin-top:4px; white-space:pre-wrap;">> Ready</div>
                <div class="output-toolbar">
                    <button id="selectAllOutput" class="btn-small">📋 Select All</button>
                    <button id="copyOutput" class="btn-small copy-btn">📋 Copy</button>
                </div>
            </div>
            <div class="tab-content" id="tab_network">
                <div style="display:flex; gap:4px; margin-bottom:4px;">
                    <button id="clearNetBtn" class="btn-small danger-btn">Clear</button>
                    <button id="copyNetBtn" class="btn-small copy-btn">Copy</button>
                </div>
                <div class="network-container" id="networkContainer"></div>
            </div>
            <div class="tab-content" id="tab_elements">
                <div id="elementContainer" class="tree-container" style="max-height:400px; overflow-y:auto; background:#080e18; border-radius:4px; padding:4px 0;"></div>
                <div style="margin-top:4px;">
                    <button id="refreshElements" class="btn-small">Refresh</button>
                </div>
            </div>
            <div class="tab-content" id="tab_storage">
                <div id="storageContainer" class="storage-container"></div>
                <div style="margin-top:4px;">
                    <button id="refreshStorage" class="btn-small">Refresh</button>
                </div>
            </div>
            <div class="tab-content" id="tab_service_workers">
                <div id="workerContainer" class="worker-container"></div>
                <div style="margin-top:4px;">
                    <button id="refreshWorkers" class="btn-small">Refresh</button>
                </div>
            </div>
            <div class="tab-content" id="tab_performance">
                <div id="perfContainer" class="perf-container"></div>
            </div>
        `;
        shadow.appendChild(panel);
    }

    function buildToggleButton() {
        const btn = document.createElement('button');
        btn.id = 'debugToggleBtn';
        btn.textContent = '🐞';
        shadow.appendChild(btn);
        return btn;
    }

    // ---------- INIT ----------
    function initPanel() {
        const toggleBtn = getShadowElement('debugToggleBtn');
        const panel = getShadowElement('debugPanel');
        const header = getShadowElement('debugPanelHeader');

        // Minimize / Fullscreen
        let isMinimized = false;
        let isFullscreen = false;

        getShadowElement('minimizeBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            isMinimized = !isMinimized;
            panel.classList.toggle('debug-panel-minimized', isMinimized);
            if (isMinimized && isFullscreen) {
                isFullscreen = false;
                panel.classList.remove('debug-panel-fullscreen');
            }
            showToast(isMinimized ? 'Panel minimized' : 'Panel expanded', 'success');
        });

        getShadowElement('fullscreenBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            isFullscreen = !isFullscreen;
            panel.classList.toggle('debug-panel-fullscreen', isFullscreen);
            if (isFullscreen && isMinimized) {
                isMinimized = false;
                panel.classList.remove('debug-panel-minimized');
            }
            showToast(isFullscreen ? 'Fullscreen mode' : 'Restored size', 'success');
        });

        // Drag logic for floating button
        let isDraggingBtn = false;
        let dragDistance = 0;
        let btnOffsetX, btnOffsetY, startX, startY;

        function loadBtnPosition() {
            const savedTop = localStorage.getItem('debugBtnTop');
            const savedLeft = localStorage.getItem('debugBtnLeft');
            if (savedTop && savedLeft) {
                toggleBtn.style.top = savedTop + 'px';
                toggleBtn.style.left = savedLeft + 'px';
                toggleBtn.style.bottom = 'auto';
                toggleBtn.style.right = 'auto';
            } else {
                toggleBtn.style.bottom = '60px';
                toggleBtn.style.right = '20px';
                toggleBtn.style.top = 'auto';
                toggleBtn.style.left = 'auto';
            }
        }
        function saveBtnPosition() {
            localStorage.setItem('debugBtnTop', toggleBtn.style.top);
            localStorage.setItem('debugBtnLeft', toggleBtn.style.left);
        }
        loadBtnPosition();

        toggleBtn.addEventListener('mousedown', (e) => {
            const rect = toggleBtn.getBoundingClientRect();
            btnOffsetX = e.clientX - rect.left;
            btnOffsetY = e.clientY - rect.top;
            isDraggingBtn = true;
            startX = e.clientX; startY = e.clientY;
            dragDistance = 0;
            toggleBtn.style.top = rect.top + 'px';
            toggleBtn.style.left = rect.left + 'px';
            toggleBtn.style.bottom = 'auto';
            toggleBtn.style.right = 'auto';
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDraggingBtn) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            dragDistance = Math.sqrt(dx*dx + dy*dy);
            toggleBtn.style.left = (e.clientX - btnOffsetX) + 'px';
            toggleBtn.style.top = (e.clientY - btnOffsetY) + 'px';
            saveBtnPosition();
        });
        document.addEventListener('mouseup', () => {
            isDraggingBtn = false;
            dragDistance = 0;
        });

        toggleBtn.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = toggleBtn.getBoundingClientRect();
            btnOffsetX = touch.clientX - rect.left;
            btnOffsetY = touch.clientY - rect.top;
            isDraggingBtn = true;
            startX = touch.clientX; startY = touch.clientY;
            dragDistance = 0;
            toggleBtn.style.top = rect.top + 'px';
            toggleBtn.style.left = rect.left + 'px';
            toggleBtn.style.bottom = 'auto';
            toggleBtn.style.right = 'auto';
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!isDraggingBtn) return;
            const touch = e.touches[0];
            const dx = touch.clientX - startX, dy = touch.clientY - startY;
            dragDistance = Math.sqrt(dx*dx + dy*dy);
            toggleBtn.style.left = (touch.clientX - btnOffsetX) + 'px';
            toggleBtn.style.top = (touch.clientY - btnOffsetY) + 'px';
            saveBtnPosition();
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchend', () => {
            isDraggingBtn = false;
            dragDistance = 0;
        });

        // Panel drag
        let isDraggingPanel = false;
        let panelOffsetX, panelOffsetY;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            if (panel.classList.contains('debug-panel-fullscreen')) return;
            isDraggingPanel = true;
            const rect = panel.getBoundingClientRect();
            panelOffsetX = e.clientX - rect.left;
            panelOffsetY = e.clientY - rect.top;
            panel.style.bottom = 'auto'; panel.style.right = 'auto';
            panel.style.top = rect.top + 'px'; panel.style.left = rect.left + 'px';
            header.style.cursor = 'grabbing';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDraggingPanel) return;
            e.preventDefault();
            panel.style.top = (e.clientY - panelOffsetY) + 'px';
            panel.style.left = (e.clientX - panelOffsetX) + 'px';
            localStorage.setItem('debugPanelTop', panel.style.top);
            localStorage.setItem('debugPanelLeft', panel.style.left);
        });
        document.addEventListener('mouseup', () => {
            if (isDraggingPanel) { isDraggingPanel = false; header.style.cursor = 'grab'; }
        });

        // Toggle button click
        toggleBtn.addEventListener('click', function(e) {
            if (dragDistance > 5) return;
            const panel = getShadowElement('debugPanel');
            if (!panel) return;
            const isHidden = panel.style.display === 'none';
            if (isHidden) {
                panel.style.display = 'block';
                const savedTop = localStorage.getItem('debugPanelTop');
                const savedLeft = localStorage.getItem('debugPanelLeft');
                if (savedTop && savedLeft && !panel.classList.contains('debug-panel-fullscreen')) {
                    panel.style.bottom = 'auto';
                    panel.style.right = 'auto';
                    panel.style.top = savedTop + 'px';
                    panel.style.left = savedLeft + 'px';
                } else {
                    panel.style.bottom = '120px';
                    panel.style.right = '10px';
                    panel.style.top = 'auto';
                    panel.style.left = 'auto';
                }
                updateConsoleDisplay();
                updateNetworkDisplay();
                renderStorage();
                renderWorkers();
                renderPerformance();
                renderElements();
                console.log('🐞 Panel opened.');
            } else {
                panel.style.display = 'none';
                console.log('🐞 Panel closed.');
            }
        });

        // Tab switching
        shadow.querySelectorAll('.panel-tabs .tab').forEach(tab => {
            tab.addEventListener('click', function() {
                shadow.querySelectorAll('.panel-tabs .tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const tabId = this.dataset.tab;
                shadow.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const target = getShadowElement('tab_' + tabId);
                if (target) target.classList.add('active');
                if (tabId === 'storage') renderStorage();
                if (tabId === 'service_workers') renderWorkers();
                if (tabId === 'performance') renderPerformance();
                if (tabId === 'elements') renderElements();
                if (tabId === 'network') updateNetworkDisplay();
                if (tabId === 'console') updateConsoleDisplay();
            });
        });

        // Console functions
        getShadowElement('consoleFilter')?.addEventListener('input', updateConsoleDisplay);
        getShadowElement('clearConsoleBtn')?.addEventListener('click', function() { consoleLogs.length = 0; updateConsoleDisplay(); updateBadge('consoleBadge', 0); showToast('Console cleared', 'success'); });
        getShadowElement('copyConsoleBtn')?.addEventListener('click', function() {
            const text = consoleLogs.map(e => `[${e.time}] [${e.type.toUpperCase()}] ${e.message}${e.stack ? '\n'+e.stack : ''}`).join('\n');
            copyToClipboard(text, 'Console logs copied');
        });

        // JS Runner
        const jsCommand = getShadowElement('jsCommand');
        const jsOutput = getShadowElement('jsOutput');
        getShadowElement('runJsBtn')?.addEventListener('click', function() {
            const cmd = jsCommand.value.trim();
            if (!cmd) return;
            try {
                const result = eval(cmd);
                const output = typeof result !== 'undefined' ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)) : 'undefined';
                jsOutput.textContent += `> ${cmd}\n${output}\n\n`;
            } catch(e) {
                jsOutput.textContent += `> ${cmd}\n❌ ${e.message}\n\n`;
            }
            jsCommand.value = '';
            jsOutput.scrollTop = jsOutput.scrollHeight;
        });
        jsCommand?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); getShadowElement('runJsBtn').click(); } });
        getShadowElement('clearJsOutput')?.addEventListener('click', function() {
            jsOutput.textContent = '> Cleared';
        });

        // Output toolbar
        const selectAllBtn = getShadowElement('selectAllOutput');
        const copyOutputBtn = getShadowElement('copyOutput');
        selectAllBtn?.addEventListener('click', function() {
            const range = document.createRange();
            range.selectNodeContents(jsOutput);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            showToast('All output selected', 'success');
        });
        copyOutputBtn?.addEventListener('click', function() {
            let text = window.getSelection().toString();
            if (!text) text = jsOutput.textContent;
            if (text) copyToClipboard(text, 'Output copied');
            else showToast('No text to copy', 'error');
        });

        // Network
        getShadowElement('clearNetBtn')?.addEventListener('click', function() { networkLogs.length = 0; updateNetworkDisplay(); updateBadge('netBadge', 0); showToast('Network cleared', 'success'); });
        getShadowElement('copyNetBtn')?.addEventListener('click', function() {
            const text = networkLogs.map(n => `[${n.time}] ${n.method} ${n.url} → ${n.response.status} (${n.duration}ms)\nRequest: ${JSON.stringify(n.request, null, 2)}\nResponse: ${typeof n.response.body === 'string' ? n.response.body : JSON.stringify(n.response.body, null, 2)}`).join('\n');
            copyToClipboard(text, 'Network logs copied');
        });

        // Elements refresh
        getShadowElement('refreshElements')?.addEventListener('click', renderElements);

        // Storage
        getShadowElement('refreshStorage')?.addEventListener('click', renderStorage);

        // Service Workers
        getShadowElement('refreshWorkers')?.addEventListener('click', renderWorkers);

        // Toggle Address Bar
        getShadowElement('toggleAddressBtn')?.addEventListener('click', toggleAddressBar);

        // Export
        getShadowElement('debugExportBtn')?.addEventListener('click', exportReport);

        // Clear all
        getShadowElement('clearAllBtn')?.addEventListener('click', function() {
            consoleLogs.length = 0;
            networkLogs.length = 0;
            updateConsoleDisplay();
            updateNetworkDisplay();
            updateBadge('consoleBadge', 0);
            updateBadge('netBadge', 0);
            showToast('All logs cleared', 'success');
        });

        // Clipboard helper
        function copyToClipboard(text, msg) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showToast(msg || 'Copied!', 'success')).catch(() => fallbackCopy(text, msg));
            } else {
                fallbackCopy(text, msg);
            }
        }
        function fallbackCopy(text, msg) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showToast(msg || 'Copied!', 'success');
        }

        // Initial refresh
        setTimeout(() => {
            updateConsoleDisplay();
            updateNetworkDisplay();
            renderStorage();
            renderWorkers();
            renderPerformance();
            renderElements();
            updateBadge('consoleBadge', consoleLogs.length);
            updateBadge('netBadge', networkLogs.length);
        }, 500);

        console.log('🐞 DebugOTool v5.2 (Shadow DOM) – Elements tab now uses a collapsible tree.');
        showToast('🐞 DebugOTool v5.2 ready – interactive DOM tree!', 'success');
    }

    // ---------- START ----------
    buildGoldBar();
    buildPanel();
    buildToggleButton();
    initPanel();

    console.log('🐞 DebugOTool v5.2 – All UI inside Shadow DOM. Collapsible DOM tree added.');
})();
