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