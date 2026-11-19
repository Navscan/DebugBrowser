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