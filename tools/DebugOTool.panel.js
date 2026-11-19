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