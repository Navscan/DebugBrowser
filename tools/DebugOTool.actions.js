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