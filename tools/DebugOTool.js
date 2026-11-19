
// ============================================================
// BEGIN DebugOTool.core.js
// ============================================================
// DebugOTool.core.js – v5.4
// Foundation: state, utilities, shadow DOM host, <style>, toast, copy.
// Every other DebugOTool.*.js file attaches to window.DT.
// Load order: core → ui.bars → tabs.* → actions → panel → (bundle step)

(function () {
    'use strict';

    if (window.DT && window.DT.__loaded) {
        // Guard against double injection (SPA re-navigation, double onPageFinished)
        console.warn('🐞 DebugOTool core already loaded – skipping re-init');
        return;
    }

    const DT = {};
    DT.__loaded = true;
    DT.SCRIPT_VERSION = '5.4';
    DT.PANEL_TABS = ['Console', 'Network', 'Elements', 'Storage', 'Files', 'Service Workers', 'Performance'];

    // ---------- STATE ----------
    DT.consoleLogs = [];
    DT.networkLogs = [];
    DT.currentFile = null;
    DT.panelVisible = false;

    // ---------- UTILITY ----------
    DT.escapeHtml = function (text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    // v5.4 FIX: safe className reader for both HTML (string) and SVG (SVGAnimatedString).
    // This is the fix for the "Elements tab empty / SVG crash / [object SVGAnimatedString]"
    // bug. On <svg>/<path>/<circle>/etc., el.className is an SVGAnimatedString whose
    // string value lives in .baseVal. On HTML, it's a plain string.
    DT.classNameOf = function (el) {
        if (!el) return '';
        const c = el.className;
        if (typeof c === 'string') return c;
        if (c && typeof c.baseVal === 'string') return c.baseVal;
        return '';
    };

    DT.formatSize = function (bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    };

    DT.getExt = function (name) {
        const i = name.lastIndexOf('.');
        return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
    };

    DT.detectLanguage = function (ext) {
        const map = {
            kt: 'Kotlin', java: 'Java', xml: 'XML', json: 'JSON', js: 'JavaScript',
            ts: 'TypeScript', css: 'CSS', html: 'HTML', md: 'Markdown',
            gradle: 'Gradle', properties: 'Properties', yaml: 'YAML', yml: 'YAML',
            sh: 'Shell', py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust',
            c: 'C', cpp: 'C++', h: 'Header', php: 'PHP', sql: 'SQL',
            txt: 'Text', log: 'Log', csv: 'CSV'
        };
        return map[ext] || null;
    };

    DT.hexDump = function (buffer, maxBytes) {
        const bytes = new Uint8Array(buffer.slice(0, maxBytes));
        let out = '';
        for (let i = 0; i < bytes.length; i += 16) {
            const chunk = bytes.slice(i, i + 16);
            const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const ascii = Array.from(chunk).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
            out += i.toString(16).padStart(8, '0') + '  ' + hex.padEnd(47) + '  ' + ascii + '\n';
        }
        return out;
    };

    // ---------- SHADOW DOM HOST ----------
    DT.host = document.createElement('div');
    DT.host.id = 'debugContainer';
    document.body.appendChild(DT.host);
    DT.shadow = DT.host.attachShadow({ mode: 'open' });

    // ---------- STYLE ----------
    const style = document.createElement('style');
    style.textContent = `
        * { box-sizing: border-box; }
        :host { all: initial; display: block; font-family: 'Segoe UI', 'SF Mono', monospace; }
        body { padding-bottom: 52px !important; }

        #debugPanel {
            display: none;
            position: fixed; bottom: 70px; right: 10px;
            width: 92%; max-width: 620px; max-height: 78vh;
            background: #0f1724; border: 1px solid #2a3a4a; border-radius: 18px;
            padding: 12px 16px 12px; padding-top: 0;
            z-index: 99999;
            box-shadow: 0 12px 48px rgba(0,0,0,0.7);
            backdrop-filter: blur(12px);
            overflow-y: auto;
            color: #e8edf5;
            font-family: 'Segoe UI', 'SF Mono', monospace;
            font-size: 12px;
            scroll-behavior: smooth;
            transition: all 0.3s ease;
        }
        #debugPanel.debug-panel-minimized {
            max-height: 52px; overflow: hidden; bottom: 60px; right: 20px;
            width: auto; min-width: 200px; padding: 8px 16px;
        }
        #debugPanel.debug-panel-minimized .panel-tabs,
        #debugPanel.debug-panel-minimized .tab-content { display: none !important; }
        #debugPanel.debug-panel-minimized #debugPanelHeader { border-bottom: none; padding: 4px 0; }
        #debugPanel.debug-panel-fullscreen {
            width: 100% !important; max-width: 100% !important;
            height: 100% !important; max-height: 100% !important;
            top: 0 !important; left: 0 !important; bottom: 0 !important; right: 0 !important;
            border-radius: 0 !important; padding: 12px 16px;
            box-shadow: none; border: none; z-index: 999999;
        }
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
        .header-actions { display: flex; gap: 5px; flex-wrap: wrap; }
        .header-btn {
            background: transparent; border: 1px solid #2a3a4a; color: #8a9bb0;
            padding: 2px 8px; border-radius: 4px; cursor: pointer;
            font-size: 14px; line-height: 1.4; transition: all 0.15s;
        }
        .header-btn:hover { border-color: #f5c842; color: #f5c842; }

        .panel-tabs {
            display: flex; gap: 2px; border-bottom: 1px solid #1e2d3d;
            margin-bottom: 8px; overflow-x: auto; flex-wrap: nowrap;
        }
        .panel-tabs .tab {
            padding: 6px 10px; font-size: 11px; font-weight: 600;
            color: #8a9bb0; cursor: pointer; border-bottom: 2px solid transparent;
            white-space: nowrap; transition: all 0.15s; user-select: none;
        }
        .panel-tabs .tab.active { color: #f5c842; border-bottom-color: #f5c842; }

        .tab-content { display: none; overflow-y: auto; max-height: 60vh; }
        .tab-content.active { display: block; }

        .log-container, .network-container, .storage-container, .worker-container, .perf-container {
            background: #080e18; border-radius: 6px; padding: 6px 8px;
            max-height: 300px; overflow-y: auto; font-family: 'SF Mono', monospace;
            font-size: 10px; white-space: pre-wrap; color: #d0d9e8;
            margin-top: 4px; border: 1px solid #1a2332;
        }
        .log-entry { padding: 2px 0; border-bottom: 1px solid #121c2a; display: flex; gap: 6px; align-items: baseline; font-size: 10px; }
        .log-time { color: #5a6f82; min-width: 60px; font-size: 9px; }
        .log-type { font-weight: 700; min-width: 40px; font-size: 10px; text-transform: uppercase; }
        .log-type.log { color: #4cd9b2; } .log-type.error { color: #ff6b6b; }
        .log-type.warn { color: #f5b342; } .log-type.info { color: #6bc9ff; }
        .log-msg { word-break: break-word; color: #c8d0e0; flex: 1; }
        .log-stack { font-size: 9px; color: #8a9bb0; padding-left: 10px; display: block; }

        .net-entry { padding: 2px 0; border-bottom: 1px solid #121c2a; font-size: 10px; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
        .net-time { color: #5a6f82; min-width: 60px; font-size: 9px; }
        .net-status { font-weight: 700; min-width: 32px; font-size: 10px; }
        .net-status.ok { color: #4cd9b2; } .net-status.err { color: #ff6b6b; }
        .net-method { color: #f5c842; font-weight: 600; min-width: 40px; font-size: 10px; }
        .net-url { color: #8a9bb0; word-break: break-all; font-size: 10px; }
        .net-body { font-size: 9px; color: #6a7a8a; margin-left: 10px; display: block; max-height: 80px; overflow-y: auto; background: #0a0f18; padding: 4px; border-radius: 4px; width: 100%; }

        .storage-item { padding: 2px 0; border-bottom: 1px solid #121c2a; display: flex; gap: 8px; font-size: 10px; align-items: center; }
        .skey { color: #4cd9b2; font-weight: 600; min-width: 80px; }
        .sval { color: #c8d0e0; word-break: break-all; flex: 1; }
        .sdel { background: transparent; border: none; color: #ff6b6b; cursor: pointer; font-size: 12px; padding: 0 4px; }

        .worker-entry { padding: 4px 0; border-bottom: 1px solid #121c2a; display: flex; justify-content: space-between; align-items: center; font-size: 10px; }
        .worker-url { color: #c8d0e0; word-break: break-all; }
        .worker-unreg { background: #ff6b6b; color: #0a0f18; border: none; border-radius: 4px; padding: 2px 8px; font-size: 9px; cursor: pointer; }

        .perf-item { padding: 2px 0; border-bottom: 1px solid #121c2a; display: flex; justify-content: space-between; font-size: 10px; }
        .perf-label { color: #8a9bb0; } .perf-value { color: #4cd9b2; font-weight: 600; }

        .filter-input { width: 100%; background: #080e18; border: 1px solid #1e2d3d; border-radius: 4px; padding: 4px 8px; color: #e8edf5; font-family: inherit; font-size: 10px; outline: none; margin-bottom: 4px; }
        .filter-input:focus { border-color: #f5c842; }

        .btn-small {
            background: transparent; border: 1px solid #1e2d3d; color: #8a9bb0;
            padding: 2px 10px; border-radius: 4px; cursor: pointer;
            font-size: 10px; transition: all 0.15s; white-space: nowrap;
            display: inline-flex; align-items: center; gap: 3px; height: 22px;
        }
        .btn-small:hover { border-color: #f5c842; color: #f5c842; background: rgba(245,200,66,0.06); }
        .btn-small.copy-btn { border-color: #2a4a5a; } .btn-small.copy-btn:hover { border-color: #4cd9b2; color: #4cd9b2; }
        .btn-small.danger-btn { border-color: #3a2a2a; } .btn-small.danger-btn:hover { border-color: #ff6b6b; color: #ff6b6b; }
        .btn-small.primary-btn { border-color: #f5c842; color: #f5c842; } .btn-small.primary-btn:hover { background: rgba(245,200,66,0.12); }

        .debug-toast {
            position: fixed; bottom: 70px; right: 20px;
            background: #1a2332; border: 1px solid #f5c842; color: #e8edf5;
            padding: 8px 18px; border-radius: 10px; font-family: 'Segoe UI', sans-serif;
            font-size: 13px; z-index: 999999; box-shadow: 0 6px 24px rgba(0,0,0,0.5);
            opacity: 0; transform: translateY(12px);
            transition: opacity 0.25s ease, transform 0.25s ease; pointer-events: none;
        }
        .debug-toast.show { opacity: 1; transform: translateY(0); }
        .debug-toast.success { border-color: #4cd9b2; } .debug-toast.error { border-color: #ff6b6b; }

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
        #goldBarTitle { font-weight: 700; color: #f5c842; cursor: pointer; user-select: none; }
        #goldBarTitle:hover { text-decoration: underline; }
        #goldBar .token-label { color: #4cd9b2; }
        #copyTokenBtn {
            background: #f5c842; color: #0a0f18; border: none; border-radius: 4px;
            padding: 2px 12px; font-weight: 700; font-size: 11px; cursor: pointer;
        }

        .output-toolbar { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }

        .file-viewer {
            background: #080e18; border-radius: 4px; padding: 8px;
            font-family: 'SF Mono', monospace; font-size: 10px; color: #c8d0e0;
            max-height: 380px; overflow: auto; white-space: pre-wrap; word-break: break-all;
            border: 1px solid #1a2332; margin-top: 4px;
        }
        .file-meta { font-size: 10px; color: #8a9bb0; padding: 4px 0; }
        .file-meta b { color: #4cd9b2; }
        .file-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; background: #1a2332; color: #f5c842; font-size: 9px; margin-right: 4px; }
        .code-line-num { color: #5a6f82; user-select: none; margin-right: 8px; }
    `;
    DT.shadow.appendChild(style);

    // ---------- SHADOW QUERY ----------
    DT.getShadowElement = function (id) { return DT.shadow.getElementById(id); };

    // ---------- TOAST ----------
    let toastTimer = null;
    DT.showToast = function (msg, type) {
        let el = DT.getShadowElement('debugToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'debugToast';
            el.className = 'debug-toast';
            DT.shadow.appendChild(el);
        }
        clearTimeout(toastTimer);
        el.textContent = msg;
        el.className = 'debug-toast ' + (type || '');
        void el.offsetWidth;
        el.classList.add('show');
        toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    };

    // ---------- CLIPBOARD (v5.4 FIX) ----------
    // The v5.2/v5.3 code had two different fallbackCopy scopes and relied on
    // navigator.clipboard.writeText() resolving. In Android WebView it often
    // REJECTS silently (no user gesture recognized), so `await writeText()`
    // produced no visible feedback and no fallback. The "Copy to txt" button
    // looked dead.
    //
    // This version:
    //   1. Tries the modern API first.
    //   2. On ANY failure (reject, throw, timeout, or unavailable):
    //      immediately runs a SYNCHRONOUS execCommand('copy') fallback
    //      while still inside the user-gesture handler tick.
    //   3. ALWAYS toasts — success or failure. Silent failure is what made
    //      the v5.3 "Copy" button look broken.
    DT.copyToClipboard = function (text, successMsg) {
        const msg = successMsg || 'Copied!';
        if (!text) { DT.showToast('Nothing to copy', 'error'); return; }

        const syncFallback = function () {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.top = '0';
                ta.style.left = '0';
                ta.style.opacity = '0';
                ta.setAttribute('readonly', '');
                document.body.appendChild(ta);
                ta.select();
                try { ta.setSelectionRange(0, ta.value.length); } catch (_) {}
                const ok = document.execCommand('copy');
                ta.remove();
                if (ok) {
                    DT.showToast('✅ ' + msg, 'success');
                } else {
                    DT.showToast('❌ Copy blocked by WebView. Select All → long-press → Copy.', 'error');
                }
            } catch (e) {
                DT.showToast('❌ Copy failed: ' + (e.message || 'unknown'), 'error');
            }
        };

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                const p = navigator.clipboard.writeText(text);
                if (p && typeof p.then === 'function') {
                    p.then(function () { DT.showToast('✅ ' + msg, 'success'); })
                     .catch(function () { syncFallback(); });
                    return;
                }
            } catch (_) { /* fall through to sync */ }
        }
        syncFallback();
    };

    // ---------- EXPORT ----------
    window.DT = DT;
    console.log('🐞 DebugOTool core v' + DT.SCRIPT_VERSION + ' loaded');
})();
// ============================================================
// END DebugOTool.core.js
// ============================================================


// ============================================================
// BEGIN DebugOTool.ui.bars.js
// ============================================================
// DebugOTool.ui.bars.js – v5.4
// Builds the gold bar (bottom) and the debug panel shell (hidden by default).
// Depends on: DebugOTool.core.js (window.DT)

(function () {
    'use strict';
    const DT = window.DT;
    if (!DT) { console.error('DebugOTool.ui.bars.js: core not loaded'); return; }

    // ============================================================
    //  GOLD BAR
    // ============================================================
    DT.buildGoldBar = function () {
        const token = localStorage.getItem('authToken') || 'No token';
        let clientCode = 'N/A', email = 'N/A';
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                clientCode = payload.clientCode || 'N/A';
                email = payload.email || 'N/A';
            }
        } catch (_) {}
        const franchise = localStorage.getItem('selectedFranchiseCode') || 'N/A';
        const tokenDisplay = token.length > 30 ? token.slice(0, 28) + '…' : token;

        const bar = document.createElement('div');
        bar.id = 'goldBar';
        bar.innerHTML = `
            <span id="goldBarTitle">🐞 Debug v${DT.SCRIPT_VERSION}</span>
            <span>Token: <span class="token-label">${tokenDisplay}</span></span>
            <span>Client: <span class="token-label">${clientCode}</span></span>
            <span>Email: <span class="token-label">${email}</span></span>
            <span>Franchise: <span class="token-label">${franchise}</span></span>
            <button id="copyTokenBtn">📋 Copy Token</button>
        `;
        DT.shadow.appendChild(bar);

        // Copy token button – uses the unified v5.4 clipboard helper
        bar.querySelector('#copyTokenBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            DT.copyToClipboard(token, 'Token copied');
        });

        // Panel opens ONLY via the gold bar title now.
        bar.querySelector('#goldBarTitle').addEventListener('click', function () {
            DT.togglePanel();
        });
    };

    // ============================================================
    //  PANEL SHELL
    // ============================================================
    DT.buildPanel = function () {
        const panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.innerHTML = `
            <div id="debugPanelHeader">
                <span class="title"><span>🐞</span> DebugOTool v${DT.SCRIPT_VERSION}</span>
                <div class="header-actions">
                    <button id="toggleAddressBtn" class="header-btn" title="Toggle address bar">⊞</button>
                    <button id="minimizeBtn" class="header-btn" title="Minimize panel">−</button>
                    <button id="fullscreenBtn" class="header-btn" title="Toggle fullscreen">□</button>
                    <button id="debugExportBtn" class="btn-small copy-btn" title="Export full report">📤</button>
                    <button id="clearAllBtn" class="btn-small danger-btn" title="Clear logs">🗑️</button>
                </div>
            </div>
            <div class="panel-tabs" id="panelTabs">
                ${DT.PANEL_TABS.map(t => `<span class="tab ${t === 'Console' ? 'active' : ''}" data-tab="${t.toLowerCase().replace(/ /g, '_')}">${t}</span>`).join('')}
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
                <div id="jsOutput" style="background:#080e18; border-radius:4px; padding:4px; font-family:monospace; font-size:10px; color:#c8d0e0; max-height:120px; overflow-y:auto; margin-top:4px; white-space:pre-wrap;">&gt; Ready</div>
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
            <div class="tab-content" id="tab_files">
                <div style="display:flex; gap:4px; margin-bottom:4px; flex-wrap:wrap;">
                    <button id="pickFileBtn" class="btn-small primary-btn">📂 Open File</button>
                    <button id="clearFileBtn" class="btn-small danger-btn">Clear</button>
                    <input type="file" id="filePicker" style="display:none"
                           accept=".kt,.java,.xml,.json,.txt,.md,.js,.ts,.css,.html,.htm,.gradle,.properties,.yaml,.yml,.csv,.log,.sh,.py,.sql,.apk,.aab,.jar,.dex,application/octet-stream,*/*" />
                </div>
                <div id="fileInfo" class="file-meta">No file loaded. Tap <b>Open File</b> to inspect .kt, .xml, .java, .apk and more.</div>
                <div id="fileViewer" class="file-viewer">(empty)</div>
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
        DT.shadow.appendChild(panel);
    };

    console.log('🐞 DebugOTool ui.bars v' + DT.SCRIPT_VERSION + ' loaded');
})();
// ============================================================
// END DebugOTool.ui.bars.js
// ============================================================


// ============================================================
// BEGIN DebugOTool.tabs.console-network.js
// ============================================================
// DebugOTool.tabs.console-network.js – v5.4
// Console + network interceptors and their renderers.
// Depends on: DebugOTool.core.js (window.DT)

(function () {
    'use strict';
    const DT = window.DT;
    if (!DT) { console.error('DebugOTool.tabs.console-network.js: core not loaded'); return; }

    const escapeHtml = DT.escapeHtml;

    // ============================================================
    //  CONSOLE INTERCEPTOR
    // ============================================================
    DT.addConsoleEntry = function (type, args, stack) {
        const message = args.map(a => typeof a === 'object'
            ? (a === null ? 'null' : JSON.stringify(a, null, 0))
            : String(a)
        ).join(' ');
        DT.consoleLogs.push({ type, time: new Date().toISOString(), message, stack: stack || '' });
        DT.updateConsoleDisplay();
    };

    // Keep a reference to the originals so we can still emit to the real console.
    // We prefix with [DT] so the user doesn't confuse debugger-internal logs
    // with page logs when scrolling their own DevTools.
    const origLog = console.log.bind(console);
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    const origInfo = console.info.bind(console);

    console.log = function (...args) {
        try { DT.addConsoleEntry('log', args); } catch (_) {}
        origLog(...args);
    };
    console.error = function (...args) {
        let stack = '';
        try { throw new Error(); } catch (e) { stack = e.stack || ''; }
        try { DT.addConsoleEntry('error', args, stack); } catch (_) {}
        origError(...args);
    };
    console.warn = function (...args) {
        try { DT.addConsoleEntry('warn', args); } catch (_) {}
        origWarn(...args);
    };
    console.info = function (...args) {
        try { DT.addConsoleEntry('info', args); } catch (_) {}
        origInfo(...args);
    };

    // ============================================================
    //  CONSOLE RENDERER
    // ============================================================
    DT.updateConsoleDisplay = function () {
        const container = DT.getShadowElement('consoleLogContainer');
        if (!container) return;
        const filter = (DT.getShadowElement('consoleFilter') || {}).value || '';
        const filtered = DT.consoleLogs.filter(e => {
            if (!filter) return true;
            const s = filter.toLowerCase();
            return e.type.includes(s) || e.message.toLowerCase().includes(s);
        });
        if (filtered.length === 0) {
            container.innerHTML = '<div style="color:#4a5a6a;font-style:italic;padding:4px 0;">(no matching logs)</div>';
            return;
        }
        container.innerHTML = filtered.map(entry => {
            const stackHtml = entry.stack
                ? `<span class="log-stack">${escapeHtml(entry.stack)}</span>`
                : '';
            return `<div class="log-entry">
                <span class="log-time">${entry.time.slice(5, 16)}</span>
                <span class="log-type ${entry.type}">${entry.type}</span>
                <span class="log-msg">${escapeHtml(entry.message)}</span>
                ${stackHtml}
            </div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    };

    // ============================================================
    //  NETWORK INTERCEPTOR (fetch)
    // ============================================================
    const origFetch = window.fetch ? window.fetch.bind(window) : null;

    if (origFetch) {
        window.fetch = function (...args) {
            const url = args[0];
            const options = args[1] || {};
            const method = (options.method || 'GET').toUpperCase();
            let body = options.body;
            if (body && typeof body === 'string') {
                try { body = JSON.parse(body); } catch (_) {}
            }
            const startTime = performance.now();
            return origFetch(...args).then(async (response) => {
                const cloned = response.clone();
                let resBody;
                try {
                    const text = await cloned.text();
                    try { resBody = JSON.parse(text); } catch (_) { resBody = text; }
                } catch (_) {
                    resBody = 'Unable to read response';
                }
                DT.networkLogs.push({
                    time: new Date().toISOString(),
                    url: String(url),
                    method,
                    request: body,
                    response: { status: response.status, body: resBody },
                    duration: Math.round(performance.now() - startTime)
                });
                DT.updateNetworkDisplay();
                return response;
            }).catch(err => {
                DT.networkLogs.push({
                    time: new Date().toISOString(),
                    url: String(url),
                    method,
                    request: body,
                    response: { status: 'ERROR', body: err.message },
                    duration: 0
                });
                DT.updateNetworkDisplay();
                throw err;
            });
        };
    }

    // ============================================================
    //  NETWORK RENDERER
    // ============================================================
    DT.updateNetworkDisplay = function () {
        const container = DT.getShadowElement('networkContainer');
        if (!container) return;
        if (DT.networkLogs.length === 0) {
            container.innerHTML = '<div style="color:#4a5a6a;font-style:italic;padding:4px 0;">(no network requests)</div>';
            return;
        }
        container.innerHTML = DT.networkLogs.map(e => {
            const statusClass = (e.response.status === 'ERROR' || e.response.status >= 400) ? 'err' : 'ok';
            const statusText = typeof e.response.status === 'number' ? e.response.status : 'ERR';
            const bodyStr = typeof e.response.body === 'string'
                ? e.response.body
                : JSON.stringify(e.response.body, null, 2);
            const bodyDisplay = bodyStr
                ? `<span class="net-body">${escapeHtml(bodyStr.slice(0, 500))}${bodyStr.length > 500 ? '…' : ''}</span>`
                : '';
            return `<div class="net-entry">
                <span class="net-time">${e.time.slice(5, 16)}</span>
                <span class="net-status ${statusClass}">${statusText}</span>
                <span class="net-method">${e.method}</span>
                <span class="net-url">${escapeHtml(e.url)}</span>
                <span style="color:#5a6f82;font-size:9px;">${e.duration}ms</span>
                ${bodyDisplay}
            </div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    };

    console.log('🐞 DebugOTool tabs.console-network v' + DT.SCRIPT_VERSION + ' loaded');
})();
// ============================================================
// END DebugOTool.tabs.console-network.js
// ============================================================


// ============================================================
// BEGIN DebugOTool.tabs.elements.js
// ============================================================
// DebugOTool.tabs.elements.js – v5.4
// Elements tab: collapsible DOM tree.
// v5.4 FIXES:
//   A) classNameOf() handles SVGAnimatedString (was [object SVGAnimatedString])
//   B) depth threshold raised to 2 (body children visible on first open)
//   C) renderElements() wrapped in try/catch with in-tab error rendering
//   D) dead root-expand hack replaced with a real childrenContainer reference
// Depends on: DebugOTool.core.js (window.DT)

(function () {
    'use strict';
    const DT = window.DT;
    if (!DT) { console.error('DebugOTool.tabs.elements.js: core not loaded'); return; }

    const escapeHtml = DT.escapeHtml;

    // ============================================================
    //  BUILD ONE TREE NODE
    // ============================================================
    DT.buildTreeElement = function (el, depth) {
        depth = depth || 0;
        const node = document.createElement('div');
        node.className = 'tree-node';

        const header = document.createElement('div');
        header.className = 'node-header';
        header.style.cssText = 'display:flex; align-items:center; cursor:pointer; padding:1px 0; border-radius:2px; user-select:none;';
        header.addEventListener('mouseover', () => { header.style.background = 'rgba(255,255,255,0.05)'; });
        header.addEventListener('mouseout',  () => { header.style.background = 'transparent'; });

        const icon = document.createElement('span');
        icon.className = 'toggle-icon';
        icon.textContent = '▶';
        icon.style.cssText = 'display:inline-block; width:16px; text-align:center; color:#5a6f82; font-size:10px; flex-shrink:0;';
        header.appendChild(icon);

        const nameSpan = document.createElement('span');
        if (el.nodeType === Node.ELEMENT_NODE) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            // v5.4 FIX A: classNameOf handles HTML (string) AND SVG (SVGAnimatedString.baseVal)
            const rawClasses = DT.classNameOf(el);
            const classes = rawClasses ? `.${rawClasses.replace(/\s+/g, '.')}` : '';
            let attrs = '';
            if (el.attributes) {
                const arr = [];
                for (let i = 0; i < el.attributes.length; i++) {
                    const a = el.attributes[i];
                    if (a.name !== 'id' && a.name !== 'class') arr.push(`${a.name}="${a.value}"`);
                }
                if (arr.length) attrs = ' ' + arr.join(' ');
            }
            nameSpan.innerHTML =
                `<span style="color:#4cd9b2;">&lt;${tag}</span>` +
                `<span style="color:#6bc9ff;">${escapeHtml(id)}</span>` +
                `<span style="color:#f5b342;">${escapeHtml(classes)}</span>` +
                `<span style="color:#8a9bb0;">${escapeHtml(attrs)}</span>` +
                `<span style="color:#4cd9b2;">&gt;</span>`;
            node._element = el;
        } else if (el.nodeType === Node.TEXT_NODE) {
            const text = el.textContent.trim();
            if (!text) return null;
            nameSpan.innerHTML = `<span style="color:#8a9bb0;font-style:italic;">#text "${escapeHtml(text.slice(0, 50))}${text.length > 50 ? '…' : ''}"</span>`;
            node._element = el;
        } else if (el.nodeType === Node.COMMENT_NODE) {
            nameSpan.innerHTML = `<span style="color:#5a6f82;">&lt;!-- ${escapeHtml(el.textContent.slice(0, 50))} --&gt;</span>`;
            node._element = el;
        } else {
            return null;
        }

        header.appendChild(nameSpan);
        node.appendChild(header);

        // Children container
        const childrenContainer = document.createElement('div');
        childrenContainer.style.cssText = 'padding-left:20px; display:block;';
        // v5.4 FIX B: depth 2 so <body> children are visible on first open
        if (depth >= 2) {
            childrenContainer.style.display = 'none';
            icon.style.transform = 'rotate(-90deg)';
        }
        node._childrenContainer = childrenContainer;

        // Recurse
        let hasVisibleChildren = false;
        if (el.nodeType === Node.ELEMENT_NODE) {
            for (const child of el.childNodes) {
                const childNode = DT.buildTreeElement(child, depth + 1);
                if (childNode) {
                    childrenContainer.appendChild(childNode);
                    hasVisibleChildren = true;
                }
            }
        }

        if (hasVisibleChildren) {
            node.appendChild(childrenContainer);
            header.addEventListener('click', function (e) {
                e.stopPropagation();
                const collapsed = childrenContainer.style.display === 'none';
                if (collapsed) {
                    childrenContainer.style.display = 'block';
                    icon.style.transform = 'rotate(0deg)';
                    icon.textContent = '▼';
                } else {
                    childrenContainer.style.display = 'none';
                    icon.style.transform = 'rotate(-90deg)';
                    icon.textContent = '▶';
                }
                if (node._element && node._element.nodeType === Node.ELEMENT_NODE) {
                    window.debugHighlightElement(node._element);
                }
            });
        } else {
            icon.style.visibility = 'hidden';
            header.addEventListener('click', function (e) {
                e.stopPropagation();
                if (node._element && node._element.nodeType === Node.ELEMENT_NODE) {
                    window.debugHighlightElement(node._element);
                }
            });
        }

        return node;
    };

    // ============================================================
    //  RENDER ELEMENTS (with error boundary)
    // ============================================================
    DT.renderElements = function () {
        const container = DT.getShadowElement('elementContainer');
        if (!container) return;
        container.innerHTML = '';

        try {
            const rootNode = DT.buildTreeElement(document.documentElement, 0);
            if (!rootNode) {
                container.innerHTML = '<div style="color:#f5b342;padding:6px;">(empty document)</div>';
                return;
            }

            // v5.4 FIX D: expand the root by directly touching its children container.
            // The old v5.3 "querySelector('div')" hack returned the header div, not
            // the children container, so it was cosmetic-only (rotated the icon but
            // left children collapsed). This is the real fix.
            const rootChildren = rootNode._childrenContainer;
            const rootIcon = rootNode.querySelector('.toggle-icon');
            if (rootChildren) {
                rootChildren.style.display = 'block';
                if (rootIcon) {
                    rootIcon.style.transform = 'rotate(0deg)';
                    rootIcon.textContent = '▼';
                }
            }

            container.appendChild(rootNode);
        } catch (err) {
            // v5.4 FIX C: paint the error inside the tab instead of a blank box.
            const msg = (err && err.message) ? err.message : String(err);
            const stack = (err && err.stack) ? err.stack.split('\n').slice(0, 6).join('\n') : '';
            container.innerHTML =
                '<div style="color:#ff6b6b;background:#1a0e0e;border:1px solid #ff6b6b;' +
                'border-radius:4px;padding:8px;font-family:monospace;font-size:10px;' +
                'white-space:pre-wrap;">' +
                '🐞 Elements tab error:\n' +
                escapeHtml(msg) +
                (stack ? '\n\n' + escapeHtml(stack) : '') +
                '</div>';
            console.error('DebugOTool: renderElements threw', err);
        }
    };

    // ============================================================
    //  HIGHLIGHT
    // ============================================================
    window.debugHighlightElement = function (el) {
        if (!el || !el.nodeType) return;
        if (el.nodeType !== Node.ELEMENT_NODE) return;
        try {
            document.querySelectorAll('.debug-highlight').forEach(h => h.remove());
            const highlight = document.createElement('div');
            highlight.className = 'debug-highlight';
            const rect = el.getBoundingClientRect();
            highlight.style.cssText =
                `position: fixed; top: ${rect.top}px; left: ${rect.left}px;` +
                `width: ${rect.width}px; height: ${rect.height}px;` +
                `border: 2px solid #f5c842; background: rgba(245,200,66,0.15);` +
                `pointer-events: none; z-index: 9999999;`;
            document.body.appendChild(highlight);
            setTimeout(() => highlight.remove(), 2500);
            showToastSafe('Highlighted: ' + el.tagName.toLowerCase());
        } catch (_) {}
    };

    function showToastSafe(msg) {
        try { DT.showToast(msg, 'success'); } catch (_) {}
    }

    console.log('🐞 DebugOTool tabs.elements v' + DT.SCRIPT_VERSION + ' loaded (SVG-safe, depth 2, error boundary)');
})();
// ============================================================
// END DebugOTool.tabs.elements.js
// ============================================================


// ============================================================
// BEGIN DebugOTool.tabs.storage.js
// ============================================================
// DebugOTool.tabs.storage.js – v5.4
// Storage tab: localStorage, sessionStorage, cookies.
// Renders with inline onclick handlers that call globals on window.
// Depends on: DebugOTool.core.js (window.DT)

(function () {
    'use strict';
    const DT = window.DT;
    if (!DT) { console.error('DebugOTool.tabs.storage.js: core not loaded'); return; }

    const escapeHtml = DT.escapeHtml;

    // ============================================================
    //  RENDER STORAGE
    // ============================================================
    DT.renderStorage = function () {
        const container = DT.getShadowElement('storageContainer');
        if (!container) return;

        const ls = localStorage;
        const ss = sessionStorage;
        const cookies = document.cookie.split(';').filter(c => c.trim()).map(c => {
            const [k, ...v] = c.trim().split('=');
            return { key: k, value: v.join('=') };
        });

        let html = '<div style="padding:4px 0;"><strong>localStorage</strong> ' +
            '<button class="btn-small danger-btn" onclick="window.debugClearStorage(\'localStorage\')">Clear All</button></div>';
        if (ls.length > 0) {
            for (let i = 0; i < ls.length; i++) {
                const k = ls.key(i);
                const v = ls.getItem(k);
                html += `<div class="storage-item">` +
                    `<span class="skey">${escapeHtml(k)}</span>` +
                    `<span class="sval">${escapeHtml(v)}</span>` +
                    `<button class="sdel" onclick="window.debugDeleteStorage('localStorage','${escapeHtml(k).replace(/'/g, "\\'")}')">✕</button>` +
                    `</div>`;
            }
        } else {
            html += '<div style="color:#4a5a6a;padding:4px 0;">(empty)</div>';
        }

        html += '<div style="padding:4px 0;margin-top:8px;"><strong>sessionStorage</strong> ' +
            '<button class="btn-small danger-btn" onclick="window.debugClearStorage(\'sessionStorage\')">Clear All</button></div>';
        if (ss.length > 0) {
            for (let i = 0; i < ss.length; i++) {
                const k = ss.key(i);
                const v = ss.getItem(k);
                html += `<div class="storage-item">` +
                    `<span class="skey">${escapeHtml(k)}</span>` +
                    `<span class="sval">${escapeHtml(v)}</span>` +
                    `<button class="sdel" onclick="window.debugDeleteStorage('sessionStorage','${escapeHtml(k).replace(/'/g, "\\'")}')">✕</button>` +
                    `</div>`;
            }
        } else {
            html += '<div style="color:#4a5a6a;padding:4px 0;">(empty)</div>';
        }

        html += '<div style="padding:4px 0;margin-top:8px;"><strong>Cookies</strong> ' +
            '<button class="btn-small danger-btn" onclick="window.debugClearCookies()">Clear All</button></div>';
        if (cookies.length > 0) {
            for (const c of cookies) {
                html += `<div class="storage-item">` +
                    `<span class="skey">${escapeHtml(c.key)}</span>` +
                    `<span class="sval">${escapeHtml(c.value)}</span>` +
                    `<button class="sdel" onclick="window.debugDeleteCookie('${escapeHtml(c.key).replace(/'/g, "\\'")}')">✕</button>` +
                    `</div>`;
            }
        } else {
            html += '<div style="color:#4a5a6a;padding:4px 0;">(empty)</div>';
        }

        container.innerHTML = html;
    };

    // ============================================================
    //  MUTATION HELPERS (called from inline onclick)
    // ============================================================
    window.debugClearStorage = function (type) {
        try {
            if (type === 'localStorage') localStorage.clear();
            else if (type === 'sessionStorage') sessionStorage.clear();
            DT.renderStorage();
            DT.showToast('Cleared ' + type, 'success');
        } catch (e) {
            DT.showToast('Clear failed: ' + e.message, 'error');
        }
    };

    window.debugDeleteStorage = function (type, key) {
        try {
            if (type === 'localStorage') localStorage.removeItem(key);
            else if (type === 'sessionStorage') sessionStorage.removeItem(key);
            DT.renderStorage();
            DT.showToast('Deleted ' + key, 'success');
        } catch (e) {
            DT.showToast('Delete failed: ' + e.message, 'error');
        }
    };

    window.debugClearCookies = function () {
        try {
            document.cookie.split(';').forEach(c => {
                document.cookie = c.trim().split('=')[0] + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            });
            DT.renderStorage();
            DT.showToast('Cookies cleared', 'success');
        } catch (e) {
            DT.showToast('Clear cookies failed: ' + e.message, 'error');
        }
    };

    window.debugDeleteCookie = function (name) {
        try {
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            DT.renderStorage();
            DT.showToast('Cookie deleted', 'success');
        } catch (e) {
            DT.showToast('Delete cookie failed: ' + e.message, 'error');
        }
    };

    console.log('🐞 DebugOTool tabs.storage v' + DT.SCRIPT_VERSION + ' loaded');
})();
// ============================================================
// END DebugOTool.tabs.storage.js
// ============================================================


// ============================================================
// BEGIN DebugOTool.tabs.files.js
// ============================================================
// DebugOTool.tabs.files.js – v5.4
// Files tab: pick a file, classify it, render as text / image / hex / APK-info.
// Depends on: DebugOTool.core.js (window.DT)

(function () {
    'use strict';
    const DT = window.DT;
    if (!DT) { console.error('DebugOTool.tabs.files.js: core not loaded'); return; }

    const escapeHtml = DT.escapeHtml;
    const formatSize = DT.formatSize;
    const getExt = DT.getExt;
    const detectLanguage = DT.detectLanguage;
    const hexDump = DT.hexDump;

    // ============================================================
    //  CLASSIFICATION TABLES
    // ============================================================
    DT.TEXT_EXT = ['kt','java','xml','json','txt','md','js','ts','jsx','tsx','css','html','htm',
        'gradle','properties','yaml','yml','csv','log','sh','bash','py','rb','go','rs','c','cpp',
        'h','hpp','php','sql','svg','env','gitignore','pro','toml','ini','conf','cfg'];

    DT.BINARY_EXT = ['apk','aab','jar','dex','class','so','png','jpg','jpeg','gif','webp','bmp',
        'ico','mp3','mp4','wav','ogg','pdf','zip','tar','gz','7z','rar','woff','woff2','ttf','otf','eot'];

    // ============================================================
    //  FILE READERS
    // ============================================================
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsText(file);
        });
    }

    function readFileAsBuffer(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsArrayBuffer(file);
        });
    }

    // ============================================================
    //  HANDLER
    // ============================================================
    DT.handleFile = async function (file) {
        DT.currentFile = file;
        const ext = getExt(file.name);
        const infoEl = DT.getShadowElement('fileInfo');
        const viewerEl = DT.getShadowElement('fileViewer');
        if (!infoEl || !viewerEl) return;

        let kind = 'Binary';
        if (DT.TEXT_EXT.includes(ext)) kind = 'Text';
        else if (DT.BINARY_EXT.includes(ext)) kind = 'Binary';
        else if (file.type && file.type.startsWith('text/')) kind = 'Text';
        else if (file.type && (file.type.startsWith('image/') ||
                               file.type.startsWith('audio/') ||
                               file.type.startsWith('video/'))) kind = 'Media';

        const lang = detectLanguage(ext);
        infoEl.innerHTML =
            `<span class="file-badge">${kind}</span>` +
            (lang ? `<span class="file-badge">${lang}</span>` : '') +
            `<b>${escapeHtml(file.name)}</b> · ${formatSize(file.size)} · ${escapeHtml(file.type || 'unknown')}` +
            `<br><span style="color:#5a6f82;">Last modified: ${new Date(file.lastModified).toLocaleString()}</span>`;

        try {
            if (kind === 'Text') {
                const text = await readFileAsText(file);
                viewerEl.innerHTML = escapeHtml(text);
                DT.showToast('✅ Loaded ' + file.name, 'success');
                return;
            }

            if (kind === 'Media' && file.type && file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                viewerEl.innerHTML = `<div style="text-align:center;">` +
                    `<img src="${url}" style="max-width:100%; max-height:300px; border-radius:4px;" />` +
                    `</div>`;
                DT.showToast('✅ Loaded image', 'success');
                return;
            }

            if (ext === 'apk' || ext === 'aab' || ext === 'jar' || ext === 'zip') {
                const buf = await readFileAsBuffer(file);
                const head = hexDump(buf, 512);
                const sig = new Uint8Array(buf.slice(0, 4));
                const isZip = sig[0] === 0x50 && sig[1] === 0x4B;
                viewerEl.innerHTML =
                    `<b style="color:#f5c842;">${ext.toUpperCase()} file analysis:</b>\n` +
                    `Signature: ${Array.from(sig).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}\n` +
                    `ZIP container: ${isZip ? '✅ Yes (valid PK header)' : '❌ No'}\n` +
                    `Total size: ${formatSize(file.size)}\n\n` +
                    `<b style="color:#f5c842;">First 512 bytes (hex + ASCII):</b>\n${escapeHtml(head)}`;
                DT.showToast('✅ ' + ext.toUpperCase() + ' header loaded', 'success');
                return;
            }

            // Fallback: raw binary preview
            const buf = await readFileAsBuffer(file);
            viewerEl.textContent = hexDump(buf, 1024);
            DT.showToast('✅ Binary preview loaded', 'success');
        } catch (e) {
            viewerEl.textContent = '❌ Could not read file: ' + (e && e.message ? e.message : String(e));
            DT.showToast('❌ Read failed', 'error');
        }
    };

    console.log('🐞 DebugOTool tabs.files v' + DT.SCRIPT_VERSION + ' loaded');
})();
// ============================================================
// END DebugOTool.tabs.files.js
// ============================================================


// ============================================================
// BEGIN DebugOTool.tabs.sworkers-perf.js
// ============================================================
// DebugOTool.tabs.sworkers-perf.js – v5.4
// Service Workers tab + Performance tab (FPS + navigation timing + memory).
// Depends on: DebugOTool.core.js (window.DT)

(function () {
    'use strict';
    const DT = window.DT;
    if (!DT) { console.error('DebugOTool.tabs.sworkers-perf.js: core not loaded'); return; }

    const escapeHtml = DT.escapeHtml;

    // ============================================================
    //  SERVICE WORKERS
    // ============================================================
    DT.renderWorkers = async function () {
        const container = DT.getShadowElement('workerContainer');
        if (!container) return;

        if (!navigator.serviceWorker) {
            container.innerHTML = '<div style="color:#4a5a6a;padding:4px 0;">Service Worker API not supported.</div>';
            return;
        }
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            if (regs.length === 0) {
                container.innerHTML = '<div style="color:#4a5a6a;padding:4px 0;">(no service workers registered)</div>';
                return;
            }
            container.innerHTML = regs.map(reg => {
                const scope = reg.scope || 'unknown';
                const active = reg.active ? '✅ Active' : '⛔ Inactive';
                const scopeEsc = escapeHtml(scope).replace(/'/g, "\\'");
                return `<div class="worker-entry">` +
                    `<span class="worker-url">${escapeHtml(scope)} - ${active}</span>` +
                    `<button class="worker-unreg" onclick="window.debugUnregisterWorker('${scopeEsc}')">Unregister</button>` +
                    `</div>`;
            }).join('');
        } catch (e) {
            container.innerHTML = '<div style="color:#ff6b6b;padding:4px 0;">Error reading service workers: ' +
                escapeHtml(e.message || String(e)) + '</div>';
        }
    };

    window.debugUnregisterWorker = async function (scope) {
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const reg of regs) {
                if (reg.scope === scope) {
                    await reg.unregister();
                    DT.showToast('Worker unregistered', 'success');
                    DT.renderWorkers();
                    return;
                }
            }
            DT.showToast('Worker not found: ' + scope, 'error');
        } catch (e) {
            DT.showToast('Failed to unregister: ' + (e.message || 'unknown'), 'error');
        }
    };

    // ============================================================
    //  PERFORMANCE
    // ============================================================
    let fpsCounter = 0;
    let fpsValue = 0;
    let lastFpsTime = 0;
    let fpsLoopRunning = false;

    function updateFPS() {
        const now = performance.now();
        if (lastFpsTime === 0) { lastFpsTime = now; fpsCounter = 0; }
        fpsCounter++;
        const elapsed = now - lastFpsTime;
        if (elapsed >= 1000) {
            fpsValue = Math.round(fpsCounter * 1000 / elapsed);
            fpsCounter = 0;
            lastFpsTime = now;
            const el = DT.getShadowElement('fpsValue');
            if (el) el.textContent = fpsValue + ' FPS';
        }
        if (fpsLoopRunning) requestAnimationFrame(updateFPS);
    }

    DT.renderPerformance = function () {
        const container = DT.getShadowElement('perfContainer');
        if (!container) return;

        const nav = performance.getEntriesByType('navigation')[0];
        const mem = performance.memory || null;
        let html = '';
        if (nav) {
            html += `<div class="perf-item"><span class="perf-label">DOMContentLoaded</span><span class="perf-value">${Math.round(nav.domContentLoadedEventEnd - nav.fetchStart)}ms</span></div>`;
            html += `<div class="perf-item"><span class="perf-label">Load Complete</span><span class="perf-value">${Math.round(nav.loadEventEnd - nav.fetchStart)}ms</span></div>`;
            html += `<div class="perf-item"><span class="perf-label">DNS</span><span class="perf-value">${Math.round(nav.domainLookupEnd - nav.domainLookupStart)}ms</span></div>`;
            html += `<div class="perf-item"><span class="perf-label">TCP</span><span class="perf-value">${Math.round(nav.connectEnd - nav.connectStart)}ms</span></div>`;
        }
        if (mem) {
            html += `<div class="perf-item"><span class="perf-label">Memory Used</span><span class="perf-value">${Math.round(mem.usedJSHeapSize / 1024 / 1024)} MB</span></div>`;
        }
        html += `<div class="perf-item"><span class="perf-label">FPS</span><span class="perf-value" id="fpsValue">${fpsValue || '--'}</span></div>`;
        container.innerHTML = html;

        if (!fpsLoopRunning) {
            fpsLoopRunning = true;
            lastFpsTime = 0;
            requestAnimationFrame(updateFPS);
        }
    };

    console.log('🐞 DebugOTool tabs.sworkers-perf v' + DT.SCRIPT_VERSION + ' loaded');
})();
// ============================================================
// END DebugOTool.tabs.sworkers-perf.js
// ============================================================


// ============================================================
// BEGIN DebugOTool.actions.js
// ============================================================
// DebugOTool.actions.js – v5.4
// Native bridge toggle, full report export, download handler.
// Depends on: DebugOTool.core.js (window.DT)

(function () {
    'use strict';
    const DT = window.DT;
    if (!DT) { console.error('DebugOTool.actions.js: core not loaded'); return; }

    const escapeHtml = DT.escapeHtml;

    // ============================================================
    //  ADDRESS BAR TOGGLE (native bridge)
    // ============================================================
    DT.toggleAddressBar = function () {
        if (window.Android && typeof window.Android.toggleAddressBar === 'function') {
            try {
                window.Android.toggleAddressBar();
                DT.showToast('Address bar toggled', 'success');
            } catch (e) {
                DT.showToast('Bridge error: ' + (e.message || 'unknown'), 'error');
            }
        } else {
            DT.showToast('Native bridge not available', 'error');
        }
    };

    // ============================================================
    //  EXPORT REPORT
    // ============================================================
    DT.exportReport = async function () {
        const now = new Date().toISOString();
        const token = localStorage.getItem('authToken') || 'No token';
        const clientCode = localStorage.getItem('clientCode') || 'N/A';
        const email = localStorage.getItem('email') || 'N/A';
        const franchise = localStorage.getItem('selectedFranchiseCode') || 'N/A';

        let report = `=== DEBUG REPORT (v${DT.SCRIPT_VERSION}) ===\n`;
        report += `Generated: ${now}\n`;
        report += `URL: ${window.location.href}\n`;
        report += `Token: ${token}\nClient: ${clientCode}\nEmail: ${email}\nFranchise: ${franchise}\n\n`;

        // Console
        report += `--- CONSOLE LOGS (${DT.consoleLogs.length}) ---\n`;
        for (const e of DT.consoleLogs) {
            report += `[${e.time}] [${e.type.toUpperCase()}] ${e.message}\n`;
            if (e.stack) report += `Stack: ${e.stack}\n`;
        }
        report += `\n`;

        // Network
        report += `--- NETWORK REQUESTS (${DT.networkLogs.length}) ---\n`;
        for (const n of DT.networkLogs) {
            report += `[${n.time}] ${n.method} ${n.url} → ${n.response.status} (${n.duration}ms)\n`;
            if (n.request) report += `  Request: ${JSON.stringify(n.request, null, 2)}\n`;
            if (n.response.body) report += `  Response: ${typeof n.response.body === 'string' ? n.response.body : JSON.stringify(n.response.body, null, 2)}\n`;
        }
        report += `\n`;

        // Storage
        report += `--- STORAGE ---\n`;
        report += 'localStorage:\n';
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            report += `  ${k} = ${localStorage.getItem(k)}\n`;
        }
        report += 'sessionStorage:\n';
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            report += `  ${k} = ${sessionStorage.getItem(k)}\n`;
        }
        report += `Cookies: ${document.cookie}\n\n`;

        // DOM
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
                        report += `Scope: ${reg.scope}\n  Active: ${reg.active ? '✅ Yes' : '⛔ No'}\n`;
                        if (reg.active) report += `  Script: ${reg.active.scriptURL}\n  State: ${reg.active.state}\n`;
                    }
                }
            } catch (e) {
                report += `Error reading service workers: ${e.message}\n`;
            }
        } else {
            report += 'Service Worker API not supported.\n';
        }
        report += `\n`;

        // Performance
        report += `--- PERFORMANCE METRICS ---\n`;
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
            report += `DOMContentLoaded: ${Math.round(nav.domContentLoadedEventEnd - nav.fetchStart)}ms\n`;
            report += `Load Complete: ${Math.round(nav.loadEventEnd - nav.fetchStart)}ms\n`;
            report += `DNS: ${Math.round(nav.domainLookupEnd - nav.domainLookupStart)}ms\n`;
            report += `TCP: ${Math.round(nav.connectEnd - nav.connectStart)}ms\n`;
        }
        if (performance.memory) {
            report += `Memory Used: ${Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)} MB\n`;
        }
        report += `\n`;

        // System
        report += `--- SYSTEM INFO ---\n`;
        report += `User Agent: ${navigator.userAgent}\n`;
        report += `Screen Size: ${screen.width}x${screen.height}\n`;
        report += `Device Pixel Ratio: ${window.devicePixelRatio}\n`;
        report += `\n=== END ===\n`;

        // ---- MODAL ----
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position: fixed; top:0; left:0; width:100%; height:100%;' +
            'background: rgba(0,0,0,0.85); z-index: 9999999;' +
            'display: flex; justify-content: center; align-items: center; padding: 20px;';

        const box = document.createElement('div');
        box.style.cssText =
            'background: #0f1724; color: #e8edf5; max-width: 90%; max-height: 80%;' +
            'padding: 20px; border-radius: 12px; overflow: auto;' +
            'font-family: monospace; font-size: 12px; white-space: pre-wrap;' +
            'border: 1px solid #f5c842; width: 100%;';

        const pre = document.createElement('pre');
        pre.textContent = report;
        pre.style.cssText =
            'max-height: 50vh; overflow-y: auto; margin-bottom: 12px;' +
            'background: #080e18; padding: 8px; border-radius: 4px;' +
            'font-family: monospace; font-size: 11px; white-space: pre-wrap;' +
            'color: #c8d0e0; user-select: text;';
        box.appendChild(pre);

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;';

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 Copy to Clipboard';
        copyBtn.style.cssText = 'background: #4cd9b2; color: #0a0f18; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;';
        copyBtn.onclick = function () {
            DT.copyToClipboard(report, 'Report copied');
        };
        btnContainer.appendChild(copyBtn);

        if (navigator.share) {
            const shareBtn = document.createElement('button');
            shareBtn.textContent = '📤 Share';
            shareBtn.style.cssText = 'background: #6bc9ff; color: #0a0f18; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;';
            shareBtn.onclick = async function () {
                try {
                    const file = new File([report], `debug_report_${now.slice(0, 10)}.txt`, { type: 'text/plain' });
                    await navigator.share({ files: [file], title: 'Debug Report' });
                    DT.showToast('✅ Shared!', 'success');
                } catch (e) {
                    if (e.name !== 'AbortError') DT.showToast('❌ Share failed', 'error');
                }
            };
            btnContainer.appendChild(shareBtn);
        }

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '⬇️ Download .txt';
        downloadBtn.style.cssText = 'background: #f5c842; color: #0a0f18; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;';
        downloadBtn.onclick = function () { DT.downloadReport(report, now); };
        btnContainer.appendChild(downloadBtn);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Close';
        closeBtn.style.cssText = 'background: #ff6b6b; color: #0a0f18; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;';
        closeBtn.onclick = function () { overlay.remove(); };
        btnContainer.appendChild(closeBtn);

        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    };

    // ============================================================
    //  DOWNLOAD HANDLER (scoped-storage safe)
    // ============================================================
    DT.downloadReport = function (report, now) {
        const fileName = `debug_report_${now.slice(0, 10)}_${Date.now()}.txt`;

        // 1) Native bridge (preferred – writes to app-scoped dir, no permission needed)
        if (window.Android && typeof window.Android.downloadReport === 'function') {
            try {
                const result = window.Android.downloadReport(report, fileName);
                if (typeof result === 'string' && result.startsWith('ok:')) {
                    DT.showToast('✅ Saved: ' + result.slice(3), 'success');
                    return;
                } else if (typeof result === 'string' && result.startsWith('error:')) {
                    DT.showToast('❌ Native save failed: ' + result.slice(6), 'error');
                    // fall through to JS fallback
                } else {
                    // Older bridge returning void – assume success
                    DT.showToast('📥 Download started (native)', 'success');
                    return;
                }
            } catch (e) {
                DT.showToast('Bridge threw: ' + (e.message || 'unknown') + ' – trying fallback', 'error');
            }
        } else {
            DT.showToast('Native bridge not available – using JS fallback', 'error');
        }

        // 2) JS Blob fallback
        try {
            const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 200);
            DT.showToast('📥 JS download attempt (may be blocked in WebView)', 'success');
        } catch (e) {
            DT.showToast('❌ All download methods failed. Use Copy instead.', 'error');
        }
    };

    console.log('🐞 DebugOTool actions v' + DT.SCRIPT_VERSION + ' loaded');
})();
// ============================================================
// END DebugOTool.actions.js
// ============================================================


// ============================================================
// BEGIN DebugOTool.panel.js
// ============================================================
// DebugOTool.panel.js – v5.4
// Panel toggle + all event wiring + START block.
// Depends on: DebugOTool.core.js, DebugOTool.ui.bars.js,
//             DebugOTool.tabs.console-network.js, DebugOTool.tabs.elements.js,
//             DebugOTool.tabs.storage.js, DebugOTool.tabs.files.js,
//             DebugOTool.tabs.sworkers-perf.js, DebugOTool.actions.js
//
// Load order matters: this file MUST come last before the bundle tail.

(function () {
    'use strict';
    const DT = window.DT;
    if (!DT) { console.error('DebugOTool.panel.js: core not loaded'); return; }

    // ============================================================
    //  PANEL TOGGLE
    // ============================================================
    DT.togglePanel = function () {
        const panel = DT.getShadowElement('debugPanel');
        if (!panel) return;
        DT.panelVisible = !DT.panelVisible;
        panel.style.display = DT.panelVisible ? 'block' : 'none';

        if (DT.panelVisible) {
            // Restore saved position (unless fullscreen)
            const savedTop = localStorage.getItem('debugPanelTop');
            const savedLeft = localStorage.getItem('debugPanelLeft');
            if (savedTop && savedLeft && !panel.classList.contains('debug-panel-fullscreen')) {
                panel.style.bottom = 'auto';
                panel.style.right = 'auto';
                panel.style.top = savedTop + 'px';
                panel.style.left = savedLeft + 'px';
            } else if (!panel.classList.contains('debug-panel-fullscreen')) {
                panel.style.bottom = '70px';
                panel.style.right = '10px';
                panel.style.top = 'auto';
                panel.style.left = 'auto';
            }

            // Refresh visible tabs
            DT.updateConsoleDisplay();
            DT.updateNetworkDisplay();
            DT.renderStorage();
            DT.renderElements();
            DT.renderPerformance();
            DT.renderWorkers();
        }
    };

    // ============================================================
    //  INIT PANEL – wires every button and tab
    // ============================================================
    DT.initPanel = function () {
        const panel = DT.getShadowElement('debugPanel');
        const header = DT.getShadowElement('debugPanelHeader');
        if (!panel || !header) { console.error('DebugOTool: panel DOM missing'); return; }

        // ---------- Minimize / Fullscreen ----------
        let isMinimized = false;
        let isFullscreen = false;

        const minBtn = DT.getShadowElement('minimizeBtn');
        if (minBtn) {
            minBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                isMinimized = !isMinimized;
                panel.classList.toggle('debug-panel-minimized', isMinimized);
                if (isMinimized && isFullscreen) {
                    isFullscreen = false;
                    panel.classList.remove('debug-panel-fullscreen');
                }
                DT.showToast(isMinimized ? 'Panel minimized' : 'Panel expanded', 'success');
            });
        }

        const fsBtn = DT.getShadowElement('fullscreenBtn');
        if (fsBtn) {
            fsBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                isFullscreen = !isFullscreen;
                panel.classList.toggle('debug-panel-fullscreen', isFullscreen);
                if (isFullscreen && isMinimized) {
                    isMinimized = false;
                    panel.classList.remove('debug-panel-minimized');
                }
                DT.showToast(isFullscreen ? 'Fullscreen mode' : 'Restored size', 'success');
            });
        }

        // ---------- Panel drag (header) ----------
        let isDraggingPanel = false;
        let panelOffsetX = 0, panelOffsetY = 0;

        header.addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) return;
            if (panel.classList.contains('debug-panel-fullscreen')) return;
            isDraggingPanel = true;
            const rect = panel.getBoundingClientRect();
            panelOffsetX = e.clientX - rect.left;
            panelOffsetY = e.clientY - rect.top;
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
            panel.style.top = rect.top + 'px';
            panel.style.left = rect.left + 'px';
            header.style.cursor = 'grabbing';
        });
        document.addEventListener('mousemove', function (e) {
            if (!isDraggingPanel) return;
            e.preventDefault();
            panel.style.top = (e.clientY - panelOffsetY) + 'px';
            panel.style.left = (e.clientX - panelOffsetX) + 'px';
            try {
                localStorage.setItem('debugPanelTop', panel.style.top);
                localStorage.setItem('debugPanelLeft', panel.style.left);
            } catch (_) {}
        });
        document.addEventListener('mouseup', function () {
            if (isDraggingPanel) {
                isDraggingPanel = false;
                header.style.cursor = 'grab';
            }
        });

        // ---------- Tabs ----------
        DT.shadow.querySelectorAll('.panel-tabs .tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                DT.shadow.querySelectorAll('.panel-tabs .tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const tabId = this.dataset.tab;
                DT.shadow.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const target = DT.getShadowElement('tab_' + tabId);
                if (target) target.classList.add('active');
                // Lazy render on tab activation
                if (tabId === 'console') DT.updateConsoleDisplay();
                if (tabId === 'network') DT.updateNetworkDisplay();
                if (tabId === 'elements') DT.renderElements();
                if (tabId === 'storage') DT.renderStorage();
                if (tabId === 'service_workers') DT.renderWorkers();
                if (tabId === 'performance') DT.renderPerformance();
            });
        });

        // ---------- Console tab ----------
        const consoleFilter = DT.getShadowElement('consoleFilter');
        if (consoleFilter) {
            consoleFilter.addEventListener('input', function () { DT.updateConsoleDisplay(); });
        }

        const clearConsoleBtn = DT.getShadowElement('clearConsoleBtn');
        if (clearConsoleBtn) {
            clearConsoleBtn.addEventListener('click', function () {
                DT.consoleLogs.length = 0;
                DT.updateConsoleDisplay();
                DT.showToast('Console cleared', 'success');
            });
        }

        const copyConsoleBtn = DT.getShadowElement('copyConsoleBtn');
        if (copyConsoleBtn) {
            copyConsoleBtn.addEventListener('click', function () {
                const text = DT.consoleLogs.map(function (e) {
                    return `[${e.time}] [${e.type.toUpperCase()}] ${e.message}` + (e.stack ? '\n' + e.stack : '');
                }).join('\n');
                DT.copyToClipboard(text, 'Console logs copied');
            });
        }

        // ---------- JS Runner ----------
        const jsCommand = DT.getShadowElement('jsCommand');
        const jsOutput = DT.getShadowElement('jsOutput');
        const runJsBtn = DT.getShadowElement('runJsBtn');
        if (runJsBtn && jsCommand && jsOutput) {
            runJsBtn.addEventListener('click', function () {
                const cmd = jsCommand.value.trim();
                if (!cmd) return;
                try {
                    const result = eval(cmd);
                    const output = typeof result !== 'undefined'
                        ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result))
                        : 'undefined';
                    jsOutput.textContent += `> ${cmd}\n${output}\n\n`;
                } catch (e) {
                    jsOutput.textContent += `> ${cmd}\n❌ ${e.message}\n\n`;
                }
                jsCommand.value = '';
                jsOutput.scrollTop = jsOutput.scrollHeight;
            });
            jsCommand.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    runJsBtn.click();
                }
            });
        }

        const clearJsOutput = DT.getShadowElement('clearJsOutput');
        if (clearJsOutput && jsOutput) {
            clearJsOutput.addEventListener('click', function () { jsOutput.textContent = '> Cleared'; });
        }

        const selectAllBtn = DT.getShadowElement('selectAllOutput');
        if (selectAllBtn && jsOutput) {
            selectAllBtn.addEventListener('click', function () {
                const range = document.createRange();
                range.selectNodeContents(jsOutput);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                DT.showToast('All output selected', 'success');
            });
        }

        const copyOutputBtn = DT.getShadowElement('copyOutput');
        if (copyOutputBtn && jsOutput) {
            copyOutputBtn.addEventListener('click', function () {
                let text = window.getSelection().toString();
                if (!text) text = jsOutput.textContent;
                if (text) DT.copyToClipboard(text, 'Output copied');
                else DT.showToast('No text to copy', 'error');
            });
        }

        // ---------- Network tab ----------
        const clearNetBtn = DT.getShadowElement('clearNetBtn');
        if (clearNetBtn) {
            clearNetBtn.addEventListener('click', function () {
                DT.networkLogs.length = 0;
                DT.updateNetworkDisplay();
                DT.showToast('Network cleared', 'success');
            });
        }

        const copyNetBtn = DT.getShadowElement('copyNetBtn');
        if (copyNetBtn) {
            copyNetBtn.addEventListener('click', function () {
                const text = DT.networkLogs.map(function (n) {
                    const reqStr = n.request ? JSON.stringify(n.request, null, 2) : '';
                    const resStr = typeof n.response.body === 'string'
                        ? n.response.body
                        : JSON.stringify(n.response.body, null, 2);
                    return `[${n.time}] ${n.method} ${n.url} → ${n.response.status} (${n.duration}ms)\n` +
                        (reqStr ? `Request: ${reqStr}\n` : '') +
                        (resStr ? `Response: ${resStr}\n` : '');
                }).join('\n');
                DT.copyToClipboard(text, 'Network logs copied');
            });
        }

        // ---------- Elements tab ----------
        const refreshElements = DT.getShadowElement('refreshElements');
        if (refreshElements) {
            refreshElements.addEventListener('click', function () { DT.renderElements(); });
        }

        // ---------- Storage tab ----------
        const refreshStorage = DT.getShadowElement('refreshStorage');
        if (refreshStorage) {
            refreshStorage.addEventListener('click', function () { DT.renderStorage(); });
        }

        // ---------- Files tab ----------
        const filePicker = DT.getShadowElement('filePicker');
        const pickFileBtn = DT.getShadowElement('pickFileBtn');
        if (pickFileBtn && filePicker) {
            pickFileBtn.addEventListener('click', function () { filePicker.click(); });
            filePicker.addEventListener('change', function (e) {
                const f = e.target.files && e.target.files[0];
                if (f) DT.handleFile(f);
                filePicker.value = '';
            });
        }
        const clearFileBtn = DT.getShadowElement('clearFileBtn');
        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', function () {
                DT.currentFile = null;
                const info = DT.getShadowElement('fileInfo');
                const viewer = DT.getShadowElement('fileViewer');
                if (info) info.textContent = 'No file loaded. Tap Open File to inspect .kt, .xml, .java, .apk and more.';
                if (viewer) viewer.textContent = '(empty)';
            });
        }

        // ---------- Service Workers tab ----------
        const refreshWorkers = DT.getShadowElement('refreshWorkers');
        if (refreshWorkers) {
            refreshWorkers.addEventListener('click', function () { DT.renderWorkers(); });
        }

        // ---------- Header actions ----------
        const toggleAddressBtn = DT.getShadowElement('toggleAddressBtn');
        if (toggleAddressBtn) {
            toggleAddressBtn.addEventListener('click', function () { DT.toggleAddressBar(); });
        }

        const exportBtn = DT.getShadowElement('debugExportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () { DT.exportReport(); });
        }

        const clearAllBtn = DT.getShadowElement('clearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', function () {
                DT.consoleLogs.length = 0;
                DT.networkLogs.length = 0;
                DT.updateConsoleDisplay();
                DT.updateNetworkDisplay();
                DT.showToast('All logs cleared', 'success');
            });
        }

        // ---------- Initial paint ----------
        setTimeout(function () {
            try {
                DT.updateConsoleDisplay();
                DT.updateNetworkDisplay();
                DT.renderStorage();
                DT.renderElements();
                DT.renderWorkers();
                DT.renderPerformance();
            } catch (e) {
                console.error('DebugOTool: initial render partial failure', e);
            }
            console.log(`🐞 DebugOTool v${DT.SCRIPT_VERSION} loaded – tap the gold bar title to open.`);
            DT.showToast(`🐞 DebugOTool v${DT.SCRIPT_VERSION} ready`, 'success');
        }, 500);
    };

    // ============================================================
    //  START
    // ============================================================
    try {
        DT.buildGoldBar();
        DT.buildPanel();
        DT.initPanel();
        console.log(`🐞 DebugOTool v${DT.SCRIPT_VERSION} – floating button removed; panel opens via gold bar title.`);
    } catch (e) {
        // Last-resort catch: if bootstrapping fails, at least log it loudly so the
        // MainActivity evaluateJavascript callback shows it in the WebView console.
        console.error('🐞 DebugOTool bootstrap FAILED:', e);
    }
})();
// ============================================================
// END DebugOTool.panel.js
// ============================================================

