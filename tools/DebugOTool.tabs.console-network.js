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