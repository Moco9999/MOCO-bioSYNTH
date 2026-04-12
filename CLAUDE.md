# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MOCO (Multi-Omics Computational Orchestrator) is a client-side bioinformatics platform with no backend. All data persistence uses `localStorage`. It's a multi-page application (not an SPA) — each feature is its own HTML file linked via standard `<a href>` navigation.

## Architecture

**10 HTML pages + 1 shared JS file (`nav.js`):**

- `index.html` — Landing page / login. Uses Tailwind CSS (CDN). Does NOT include `nav.js`. Hardcoded demo accounts.
- `dashboard.html` — Post-login hub with static stats and quick-launch shortcuts
- `library.html` — Dual-mode page: "Analysis" (tool cards gated by tier) and "Library" (read-only protocol browser). Three tabs: DNA, RNA, Protein. Launches tools via `tool.html?id=...&name=...`
- `lab.html` — Pipeline workbench with preset pipelines
- `visualization.html` — RNA-seq heatmap, volcano plot, GO enrichment (hardcoded data)
- `project.html` — Project overview (hardcoded)
- `resources.html` — Compute infrastructure monitor (static)
- `settings.html` — Profile, appearance (theme switching via CSS variables), settings, help tabs. URL-param tab: `?tab=profile`
- `subscription.html` — Three-tier plan selector (Free/Standard/Premium)
- `admin.html` — Admin-only panel: tool tier config, promo code CRUD, user management
- `tool.html` — Generic tool execution page with real client-side computation for 18 bioinformatics tools (GC content, reverse complement, transcription, translation, codon analysis, ORF finding, primer design, restriction mapping, mutation analysis, etc.). Also makes real NCBI eutils API calls.

**`nav.js`** is the shared infrastructure included by every authenticated page. It injects the full topbar + sidebar + CSS theme via `injectNav(activePage)`. It also provides auth functions (`getUser`, `requireAuth`, `logout`, `isAdmin`), tier access control (`canAccess`, `getPlan`, `getToolConfig`), and the dropdown toggle.

## Key Patterns

- **Inter-page communication** uses URL parameters (`tool.html?id=gc-content&name=GC+Content`, `library.html?mode=analysis&tab=dna`) and `localStorage` keys (`moco_user`, `moco_users`, `moco_tool_config`, `moco_protocol_overrides`, `moco_admin_promos`)
- **Auth is client-side only** — `localStorage.moco_user` stores `{email, name, role, plan}`. No tokens, no expiry, no server validation
- **Tier system**: `free` → only free tools, `standard` → free + standard tools, `premium` → all tools. `canAccess()` in `nav.js` is the gatekeeper. Admin overrides always pass
- **Two design systems**: `index.html` uses Tailwind CSS (CDN) with Material Design aesthetics; all other pages use custom CSS variables injected by `nav.js` (`--bg`, `--surface`, `--cyan`, etc.) with a cyberpunk/biotech theme

## Development

No build tools, package manager, or bundler. To preview, open `index.html` in a browser directly or use any static file server:

```bash
# Python
python -m http.server 8000

# Node.js (npx)
npx serve .
```

There are no tests, no linting, and no CI configuration.

## Known Inconsistencies

- Promo codes are defined independently in `index.html` (`MOCOSTANDARD`, `MOCOPREMIUM`) and `subscription.html`/`admin.html` (`MOCO-ALPHA`, `MOCO-BETA`, etc.) — these sets are not synchronized
- Google login assigns `plan: 'google'` which is not a recognized tier in `canAccess()`, effectively defaulting to `free` access
- `logo.png` is referenced in `index.html` but does not exist in the repo