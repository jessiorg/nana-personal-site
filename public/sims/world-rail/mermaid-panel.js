/**
 * Supply Chain Twin — live Mermaid topology panel
 *
 * Reads the current topology from window.S (set by index.html's main IIFE)
 * and renders a Mermaid flowchart showing the nodes + edges. Auto-refreshes
 * whenever the topology or scenario changes.
 *
 * Exposes: window.MermaidPanel.setTopology(S), togglePanel(), render()
 */
(function () {
  const PANEL_ID = 'te-mermaid-panel';
  const CONTENT_ID = 'te-mermaid-content';
  let currentS = null;
  let mermaidLib = null;
  let renderId = 0;
  let panelSide = 'left'; // 'left' or 'right' — configurable

  function ensurePanel() {
    if (document.getElementById(PANEL_ID)) return;
    const side = panelSide === 'right'
      ? 'right: 14px;'
      : 'left: 304px;';
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = `
      position: fixed; top: 40px; ${side} width: 380px;
      max-height: calc(100vh - 100px); overflow: auto;
      background: var(--te-bg-panel, #FFFFFF);
      border: 1.5px solid var(--te-border, #1A1A1A);
      z-index: 38; font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      transition: transform 0.2s ease;
    `;
    panel.innerHTML = `
      <div style="padding: 8px 12px; border-bottom: 1.5px solid var(--te-border, #1A1A1A); font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: var(--te-bg-panel, #FFFFFF);" id="te-mermaid-header">
        <span>📊 TOPOLOGY DIAGRAM</span>
        <span id="te-mermaid-toggle" style="font-size: 14px;">−</span>
      </div>
      <div id="${CONTENT_ID}" style="padding: 12px; background: var(--te-bg, #F2F2F0);"></div>
    `;
    document.body.appendChild(panel);
    document.getElementById('te-mermaid-header').onclick = () => togglePanel();
  }

  function togglePanel() {
    const content = document.getElementById(CONTENT_ID);
    const toggle = document.getElementById('te-mermaid-toggle');
    if (!content) return;
    const collapsed = content.style.display === 'none';
    content.style.display = collapsed ? 'block' : 'none';
    if (toggle) toggle.textContent = collapsed ? '−' : '+';
  }

  function buildMermaidSource(S) {
    if (!S || !S.nodes || !S.edges) return 'flowchart LR\n  empty[No topology loaded]';

    // Sanitize ids (mermaid is picky)
    const sanitize = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');
    const idMap = {};
    S.nodes.forEach(n => { idMap[n.id] = sanitize(n.id); });

    const lines = [];
    lines.push('flowchart LR');

    // Class defs per mode
    const modes = S.modes || {};
    lines.push('  classDef default fill:#F2F2F0,stroke:#1A1A1A,color:#0A0A0A,stroke-width:1px');

    // Group nodes by kind
    const byKind = {};
    const filter = window.MermaidPanel._nodeFilter || (() => true);
    for (const n of S.nodes) {
      if (!filter(n)) continue;
      (byKind[n.kind] = byKind[n.kind] || []).push(n);
    }

    // Render nodes with label showing id + kind
    for (const [kind, list] of Object.entries(byKind)) {
      const safe = sanitize(kind);
      lines.push(`  classDef ${safe} fill:#${colorHexForKind(kind)},stroke:#1A1A1A,color:#0A0A0A,stroke-width:1.5px`);
      for (const n of list) {
        const label = n.label || n.id;
        // Escape special chars
        const safeLabel = label.replace(/"/g, "'").replace(/[\[\]]/g, '');
        lines.push(`  ${idMap[n.id]}["${safeLabel}"]:::${safe}`);
      }
    }

    // Edges (only between passing nodes)
    for (const e of S.edges) {
      const from = idMap[e.from];
      const to = idMap[e.to];
      if (!from || !to) continue;
      const a = S.nodes.find(n => n.id === e.from);
      const b = S.nodes.find(n => n.id === e.to);
      if (a && b && (!filter(a) || !filter(b))) continue;
      const arrow = arrowForMode(e.mode);
      const label = e.mode || '';
      lines.push(`  ${from} ${arrow}|${label}| ${to}`);
    }

    return lines.join('\n');
  }

  function arrowForMode(mode) {
    switch (mode) {
      case 'road':
      case 'freight':
        return '-.->'; // dashed
      case 'rail':
      case 'pipeline':
      case 'courier':
      case 'hsr':
        return '==>'; // thick
      case 'sea':
      case 'air':
        return '~~~'; // invisible (Mermaid has no sea-style)
      default:
        return '-->';
    }
  }

  function colorHexForKind(kind) {
    return ({
      source: 'FBBF24',
      hub: 'A78BFA',
      roro: 'FB923C',
      port: 'FB923C',
      destination: 'FB7185',
      workshop: '7C5CFF',
      hrs: 'FF4500',
      junction: 'E5E5E5',
      station: 'A78BFA',
      terminal: 'FB7185',
    })[kind] || 'E5E5E5';
  }

  async function ensureMermaid() {
    if (mermaidLib) return mermaidLib;
    if (typeof window.mermaid !== 'undefined') {
      mermaidLib = window.mermaid;
      mermaidLib.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', flowchart: { useMaxWidth: true, htmlLabels: true } });
      return mermaidLib;
    }
    // Inject Mermaid CDN if missing
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    mermaidLib = window.mermaid;
    mermaidLib.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', flowchart: { useMaxWidth: true, htmlLabels: true } });
    return mermaidLib;
  }

  async function render() {
    if (!currentS) return;
    ensurePanel();
    const content = document.getElementById(CONTENT_ID);
    if (!content) return;
    content.innerHTML = '<div style="color:#6B6B6B; padding: 8px;">Rendering…</div>';
    try {
      const mermaid = await ensureMermaid();
      const src = buildMermaidSource(currentS);
      const myId = `te-mermaid-${++renderId}`;
      const { svg } = await mermaid.render(myId, src);
      content.innerHTML = svg;
    } catch (e) {
      content.innerHTML = `<div style="color:#FB7185; padding: 8px;">Render error: ${e.message}</div>`;
    }
  }

  window.MermaidPanel = {
    setTopology(S) { currentS = S; return render(); },
    setSide(side) { panelSide = side; ensurePanel(); },
    setNodeFilter(fn) { this._nodeFilter = fn; return render(); },
    togglePanel,
    render,
  };
})();
