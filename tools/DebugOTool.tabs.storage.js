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