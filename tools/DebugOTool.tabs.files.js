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