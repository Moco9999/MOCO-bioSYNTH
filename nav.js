// MOCO Shared Navigation & Auth
function getUser() {
  return JSON.parse(localStorage.getItem('moco_user') || 'null');
}
function requireAuth() {
  if (!getUser()) window.location.href = 'index.html';
}
function logout() {
  localStorage.removeItem('moco_user');
  window.location.href = 'index.html';
}
function isAdmin() {
  const u = getUser(); return u && u.role === 'admin';
}
function getPlan() {
  const u = getUser(); return u ? u.plan : 'free';
}
function canAccess(toolTier) {
  if (isAdmin()) return true;
  const plan = getPlan();
  if (plan === 'premium') return true;
  if (plan === 'standard') return toolTier !== 'premium';
  return toolTier === 'free';
}

// Tool access config - admin can change this
function getToolConfig() {
  return JSON.parse(localStorage.getItem('moco_tool_config') || JSON.stringify({
    // DNA Tools
    'bwa-mem': 'premium', 'bowtie2': 'premium', 'gatk': 'premium',
    'freebayes': 'standard', 'vblast': 'standard', 'ngs-core': 'premium',
    'fastqc': 'standard', 'adapter-trim': 'standard', 'crispr': 'premium',
    'mutation-analysis': 'standard', 'mutation-finder': 'standard',
    'ncbi-lookup': 'free', 'organism-id': 'standard',
    'restriction': 'standard', 'orf-finder': 'free', 'primer-design': 'standard',
    'gc-content': 'free', 'reverse-complement': 'free', 'transcription': 'free',
    // RNA Tools
    'star-aligner': 'premium', 'deseq2': 'premium', '3reads': 'premium',
    '3race': 'premium', '10x-genomics': 'premium', 'smart-seq2': 'premium',
    'drop-seq': 'standard', 'mars-seq': 'standard', 'cite-seq': 'premium',
    'atac-seq': 'premium', 'snrna-seq': 'standard', 'bulk-rnaseq': 'standard',
    'long-read': 'premium', 'spatial-tx': 'premium', 'chip-seq': 'premium',
    'codon-analysis': 'free', 'translation': 'free', 'secondary-struct': 'free',
    // Protein Tools
    'alphafold': 'premium', 'protein-3d': 'premium', 'mol-dynamics': 'premium',
    'mol-docking': 'premium', 'cadd': 'premium', 'drug-protein': 'premium',
    'hotspot': 'standard', 'protein-finder': 'standard',
    'amino-acid': 'free', 'mol-weight': 'free',
    'mutation-hotspot': 'standard', 'msms': 'premium', 'western-blot': 'standard',
  }));
}

function injectNav(activePage) {
  const user = getUser();
  if (!user) return;
  const plan = user.plan;
  const planColors = { free: '#5a8a9a', standard: '#00ff88', premium: '#bf5fff' };
  const planColor = planColors[plan] || '#5a8a9a';

  const navHTML = `
  <style>
    :root {
      --bg: #050a0e; --surface: #0a1520; --surface2: #0f1e2e;
      --border: #1a3040; --cyan: #00e5ff; --cyan-dim: #00b8cc;
      --green: #00ff88; --purple: #bf5fff; --red: #ff4444;
      --yellow: #ffcc00; --text: #c8e8f0; --text-dim: #5a8a9a;
      --mono: 'JetBrains Mono', monospace; --sans: 'Space Grotesk', sans-serif;
      --sidebar-w: 220px;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background: var(--bg); color: var(--text); font-family: var(--sans); display: flex; min-height: 100vh; }
    .bg-grid {
      position: fixed; inset: 0;
      background: radial-gradient(circle at 20% 20%, rgba(0,229,255,0.16), transparent 18%),
                  radial-gradient(circle at 80% 15%, rgba(191,95,255,0.12), transparent 20%),
                  radial-gradient(circle at 40% 80%, rgba(0,255,136,0.12), transparent 18%),
                  linear-gradient(145deg, rgba(0,229,255,0.05), transparent 40%),
                  linear-gradient(215deg, rgba(191,95,255,0.05), transparent 35%);
      background-size: 100% 100%, 100% 100%, 100% 100%, 200% 200%, 200% 200%;
      background-blend-mode: screen;
      animation: bgShift 18s linear infinite;
      pointer-events: none; z-index: 0;
    }
    @keyframes bgShift {
      0% { background-position: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%; }
      50% { background-position: 10% 20%, 90% 10%, 20% 80%, 30% 40%, 70% 50%; }
      100% { background-position: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%; }
    }

    /* TOPBAR */
    .topbar {
      position: fixed; top: 0; left: 0; right: 0; height: 52px;
      background: rgba(5,10,14,0.95); border-bottom: 1px solid var(--border);
      backdrop-filter: blur(20px); display: flex; align-items: center;
      padding: 0 20px; gap: 20px; z-index: 100;
    }
    .topbar-logo {
      display: flex; align-items: center; gap: 10px;
      font-family: var(--mono); text-decoration: none;
    }
    .topbar-logo-icon {
      width: 32px; height: 32px; background: linear-gradient(135deg,var(--cyan),var(--cyan-dim));
      border-radius: 8px; display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:14px; color:#050a0e;
    }
    .topbar-logo-text { font-weight:700; font-size:15px; color:var(--cyan); letter-spacing:2px; }
    .topbar-logo-sub { font-size:9px; color:var(--text-dim); letter-spacing:1px; }

    .topbar-nav { display:flex; gap:4px; margin-left:10px; }
    .topbar-nav a {
      padding: 6px 14px; border-radius:6px; font-family:var(--mono);
      font-size:11px; letter-spacing:1px; text-decoration:none;
      color: var(--text-dim); transition:all 0.2s; cursor:pointer;
      border: 1px solid transparent;
    }
    .topbar-nav a:hover { color: var(--text); background: var(--surface2); }
    .topbar-nav a.dna { color:#00e5ff; }
    .topbar-nav a.rna { color:#00ff88; }
    .topbar-nav a.protein { color:#bf5fff; }
    .topbar-nav a.dna:hover { background: rgba(0,229,255,0.1); border-color:rgba(0,229,255,0.2); }
    .topbar-nav a.rna:hover { background: rgba(0,255,136,0.1); border-color:rgba(0,255,136,0.2); }
    .topbar-nav a.protein:hover { background: rgba(191,95,255,0.1); border-color:rgba(191,95,255,0.2); }

    .topbar-right { margin-left:auto; display:flex; align-items:center; gap:12px; }
    .logout-btn {
      padding: 8px 14px; border-radius:999px; border:1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.05); color: var(--text); font-family: var(--mono);
      font-size:11px; letter-spacing:1px; cursor:pointer; transition:all 0.2s;
    }
    .logout-btn:hover { background: rgba(255,255,255,0.08); }
    .plan-badge {
      padding: 3px 10px; border-radius:20px; font-family:var(--mono);
      font-size:9px; letter-spacing:2px; text-transform:uppercase;
      border: 1px solid ${planColor}40; color: ${planColor};
      background: ${planColor}15;
    }
    .status-dot { width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);animation:blink 2s infinite; }
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}
    .account-btn {
      position:relative; width:34px;height:34px; border-radius:50%;
      background: linear-gradient(135deg,var(--cyan-dim),var(--surface2));
      border:1px solid var(--border); cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      font-family:var(--mono);font-size:13px;font-weight:700;color:var(--cyan);
      transition: all 0.2s;
    }
    .account-btn:hover { border-color:var(--cyan); box-shadow:0 0 15px rgba(0,229,255,0.2); }
    .account-dropdown {
      position:absolute; top:calc(100% + 10px); right:0; width:200px;
      background:var(--surface); border:1px solid var(--border); border-radius:12px;
      padding:8px; z-index:200; display:none;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .account-dropdown.show { display:block; }
    .dropdown-header { padding:10px 12px; border-bottom:1px solid var(--border); margin-bottom:6px; }
    .dropdown-header .name { font-size:13px; font-weight:600; color:var(--text); }
    .dropdown-header .email { font-family:var(--mono);font-size:10px;color:var(--text-dim); margin-top:2px; }
    .dropdown-item {
      display:flex; align-items:center; gap:10px; padding:9px 12px;
      border-radius:8px; cursor:pointer; transition:all 0.15s;
      font-size:13px; color:var(--text-dim); text-decoration:none;
    }
    .dropdown-item:hover { background:var(--surface2); color:var(--text); }
    .dropdown-item svg { width:14px;height:14px; flex-shrink:0; }
    .dropdown-item.danger { color:var(--red); }
    .dropdown-item.danger:hover { background:rgba(255,68,68,0.1); }
    .dropdown-divider { height:1px;background:var(--border);margin:6px 0; }

    /* SIDEBAR */
    .sidebar {
      position:fixed; left:0; top:52px; bottom:0; width:var(--sidebar-w);
      background:var(--surface); border-right:1px solid var(--border);
      display:flex;flex-direction:column; padding:16px 0; z-index:50;
      overflow-y:auto;
    }
    .nav-section-label {
      font-family:var(--mono); font-size:9px; letter-spacing:2px;
      text-transform:uppercase; color:var(--text-dim);
      padding:0 16px; margin:8px 0 4px;
    }
    .nav-item {
      display:flex; align-items:center; gap:10px; padding:9px 16px;
      cursor:pointer; transition:all 0.15s; font-size:13px;
      color:var(--text-dim); text-decoration:none; position:relative;
      border-left:2px solid transparent; margin:1px 0;
    }
    .nav-item:hover { background:var(--surface2); color:var(--text); }
    .nav-item.active {
      background:rgba(0,229,255,0.08); color:var(--cyan);
      border-left-color:var(--cyan);
    }
    .nav-item svg { width:16px;height:16px;flex-shrink:0; }
    .nav-divider { height:1px;background:var(--border);margin:8px 16px; }

    .nav-bottom {
      margin-top:auto; padding:12px 16px;
      border-top:1px solid var(--border);
    }
    .system-info {
      font-family:var(--mono); font-size:9px; color:var(--text-dim);
      letter-spacing:1px;
    }
    .system-info .online { color:var(--green); }

    /* MAIN CONTENT */
    .main-content {
      margin-left:var(--sidebar-w); margin-top:52px;
      flex:1; padding:32px; position:relative; z-index:1; min-height:calc(100vh - 52px);
    }
    .page-header { margin-bottom:28px; }
    .page-title { font-size:26px;font-weight:700;color:var(--text);letter-spacing:-0.5px; }
    .page-sub { font-size:13px;color:var(--text-dim);margin-top:4px; }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <div class="bg-grid"></div>

  <nav class="topbar">
    <a class="topbar-logo" href="dashboard.html">
      <div class="topbar-logo-icon">M</div>
      <div>
        <div class="topbar-logo-text">MOCO</div>
        <div class="topbar-logo-sub">Multi Omics Computational Orchestrator</div>
      </div>
    </a>
    <div class="topbar-nav">
      <a class="dna" href="library.html?tab=dna">⬡ DNA</a>
      <a class="rna" href="library.html?tab=rna">≋ RNA</a>
      <a class="protein" href="library.html?tab=protein">✦ Protein</a>
    </div>
    <div class="topbar-right">
      <div class="status-dot"></div>
      <span style="font-family:var(--mono);font-size:10px;color:var(--text-dim)">ONLINE</span>
      <div class="plan-badge">${plan}</div>
      <button class="logout-btn" onclick="logout()">Sign Out</button>
      <div class="account-btn" onclick="toggleDropdown()" id="acct-btn">
        ${(user.name||'U')[0].toUpperCase()}
        <div class="account-dropdown" id="acct-dropdown">
          <div class="dropdown-header">
            <div class="name">${user.name || 'Researcher'}</div>
            <div class="email">${user.email}</div>
          </div>
          <a class="dropdown-item" href="settings.html?tab=profile">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Profile
          </a>
          <a class="dropdown-item" href="settings.html?tab=appearance">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            Appearance
          </a>
          <a class="dropdown-item" href="subscription.html">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            Subscription
          </a>
          <a class="dropdown-item" href="settings.html?tab=settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
            Settings
          </a>
          <a class="dropdown-item" href="settings.html?tab=help">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
            Help
          </a>
          ${isAdmin() ? `
          <div class="dropdown-divider"></div>
          <a class="dropdown-item" href="admin.html" style="color:var(--yellow)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            Admin Panel
          </a>` : ''}
          <div class="dropdown-divider"></div>
          <div class="dropdown-item danger" onclick="logout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Sign Out
          </div>
        </div>
      </div>
    </div>
  </nav>

  <aside class="sidebar">
    <div class="nav-section-label">Navigation</div>
    <a class="nav-item ${activePage==='dashboard'?'active':''}" href="dashboard.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      Dashboard
    </a>
    <a class="nav-item ${activePage==='lab'?'active':''}" href="lab.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11l3 3 3-3V3M5 9H3M21 9h-2"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/></svg>
      Lab
    </a>
    <a class="nav-item ${activePage==='visualization'?'active':''}" href="visualization.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Visualization
    </a>
    <a class="nav-item ${activePage==='project'?'active':''}" href="project.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      Project
    </a>
    <a class="nav-item ${activePage==='resources'?'active':''}" href="resources.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      Resources
    </a>
    <a class="nav-item ${activePage==='library'?'active':''}" href="library.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      Library
    </a>
    <div class="nav-divider"></div>
    <div class="nav-section-label">Workbenches</div>
    <a class="nav-item ${activePage==='protein-sim'?'active':''}" href="library.html?tab=protein">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>
      Protein Studio
    </a>
    <a class="nav-item ${activePage==='alignment'?'active':''}" href="library.html?tab=dna&section=alignment">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
      Alignment Lab
    </a>
    <a class="nav-item ${activePage==='docking'?'active':''}" href="library.html?tab=protein&section=docking">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      Mol Docking
    </a>
    <div class="nav-bottom">
      <div class="system-info">
        <span class="online">● SYSTEM ONLINE</span><br>
        MOCO v1.0 · IC Network
      </div>
    </div>
  </aside>`;

  document.body.insertAdjacentHTML('afterbegin', navHTML);
}

function toggleDropdown() {
  document.getElementById('acct-dropdown').classList.toggle('show');
}
document.addEventListener('click', e => {
  const btn = document.getElementById('acct-btn');
  if (btn && !btn.contains(e.target)) {
    const dd = document.getElementById('acct-dropdown');
    if (dd) dd.classList.remove('show');
  }
});
