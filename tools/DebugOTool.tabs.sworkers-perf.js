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