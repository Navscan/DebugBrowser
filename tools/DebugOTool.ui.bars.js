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