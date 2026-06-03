# CLAUDE.md — Source of Truth

> **Instructions:** Check this file at the start of every session. Update `Project State` and `To-Do List` after every significant change.

---

## Project Overview

**Quantum Traffic Control** — A full-stack web app that visualizes quantum optimization of traffic-light scheduling. Users place "atom nodes" on an SVG grid; the app finds the Maximum Independent Set (MIS) using either a classical brute-force solver (in-browser) or a real Rydberg-blockade quantum simulation dispatched to Pasqal Cloud (SA region).

**Stack:** Node.js/Express backend · Vanilla JS + Tailwind CSS frontend · Python (Pulser + QuTiP) quantum layer

---

## Project State

**As of: 2026-06-03 — Session 1 (Planning)**

- Codebase reviewed and understood end-to-end.
- No code changes made yet.
- Branch: `claude/busy-rubin-q1wjA`

### Current Known Issues
1. **[CRITICAL] Blockade Radius Physics Bug** — The Python pulse waveform produces an effective blockade radius of ~6.5 µm, larger than the 4.0 µm circle shown on-screen. Classical and quantum results diverge for the same layout (e.g., 4-node line: classical=1010, quantum=0001). Root cause: peak Rabi frequency (Ω) is too low. Fix: apply `scale_factor = 1.5` to coordinates before building the Pulser `Register`.
2. **[HIGH] No Onboarding / Intro** — User is dumped onto a blank grid with no explanation of what nodes, blockades, or MIS mean in plain English.
3. **[HIGH] Not Mobile-Friendly** — `overflow-hidden` on `body` and rigid `lg:grid-cols-12` layout breaks on mobile. No touch-event handlers on the SVG canvas.
4. **[MEDIUM] Low Accessibility Contrast** — Axis labels (`[0,0] µm`, `[10,10] µm`) use `text-slate-600` on `slate-950` — below 3:1 WCAG ratio. Fix: upgrade to `text-slate-400`.
5. **[MEDIUM] Subprocess Scaling Bottleneck** — `spawn('python3')` is called per HTTP request; will exhaust CPU under modest concurrency. Longer-term fix: a FastAPI/Flask worker queue that Express hits via HTTP.
6. **[MEDIUM] In-Memory Rate Limiter** — `requestCounts` resets on cold starts (Vercel/Render). Fine for demos but breaks under serverless deployment.
7. **[LOW] Dense "How This Works" Card** — Static walls of text. Could be an interactive accordion with three tabs: The Problem / The Physics / The Results.
8. **[LOW] Results Typography Tightness** — "Prob: 34.4%" labels lack breathing room (padding/margin).

---

## Implementation Plan

Work in priority order. Each step is self-contained and independently testable.

### Step 1 — Fix the Physics Bug (Blockade Radius Alignment)
**Files:** `src/quantum/local_emulator.py`, `src/quantum/cloud_solver.py`

Apply coordinate scaling before building the `Register` so the physical blockade radius matches the 4.0 µm visual grid:

```python
scale_factor = 1.5
scaled_coords = {f"Node_{i}": np.array(c) * scale_factor for i, c in enumerate(coordinates)}
reg = Register(scaled_coords)
```

Replace the existing `coords_dict` / `reg` lines in both Python files.

---

### Step 2 — Fix Accessibility Contrast
**File:** `public/index.html`

Change axis boundary labels from `text-slate-600` to `text-slate-400`:

```html
<!-- Before -->
<span class="absolute bottom-4 left-4 text-sm text-slate-600 ...
<span class="absolute top-4 right-4 text-sm text-slate-600 ...

<!-- After -->
<span class="absolute bottom-4 left-4 text-sm text-slate-400 ...
<span class="absolute top-4 right-4 text-sm text-slate-400 ...
```

---

### Step 3 — Add Onboarding "Quick Start" Overlay
**File:** `public/index.html`

Add a dismissible modal/overlay that appears on first load (localStorage flag `qt_intro_seen`). Content:

- **Headline:** "Welcome to Quantum Traffic Control"
- **Core analogy (3 bullet points):**
  - Nodes = Intersections that want a Green Light
  - Conflict Lines = Roads connecting them (shared traffic corridor)
  - Rydberg Blockade = The physical law preventing two adjacent intersections from going Green simultaneously (to avoid crashes)
- **CTA:** "Got it — Start Building" button that dismisses and sets the localStorage flag.

---

### Step 4 — Make the App Mobile-Friendly
**File:** `public/index.html`

Three targeted changes:

1. **Body overflow:** Change `overflow-hidden` → `overflow-y-auto lg:overflow-hidden` on `<body>`.
2. **Main grid:** Change `h-[calc(100vh-130px)] overflow-hidden` on `<main>` to allow vertical stacking on mobile (`lg:h-[calc(100vh-130px)] lg:overflow-hidden`).
3. **SVG touch events:** Add a `touchstart` listener on `canvasContainer` that mirrors the existing `click` handler, translating `e.touches[0].clientX/Y` to coordinates.

---

### Step 5 — Improve Results Panel Typography
**File:** `public/index.html`

In `renderQuantumResults()` and `runClassicalSolver()`, add `py-2` or `py-3` padding to probability label rows and increase the `text-xs` span to `text-sm` for readability.

---

### Step 6 — Refactor "How This Works" Card to Accordion
**File:** `public/index.html`

Replace the static text block with a 3-tab accordion:
- **Tab 1: The Problem** — Traffic gridlock, N-intersection scheduling
- **Tab 2: The Physics** — Rydberg blockade, adiabatic sweep, MIS mapping
- **Tab 3: The Results** — How to read the bitstring output

Each tab collapses/expands with a chevron icon.

---

### Step 7 — (Future) Subprocess Architecture Upgrade
**Files:** New `src/worker/app.py` (FastAPI), update `src/server.js`

Replace `spawn('python3')` with an HTTP call to a local FastAPI worker that pre-loads the Pulser environment. Reduces cold-start latency from ~2000 ms to ~200 ms. Out of scope for the current sprint — document here as a known future improvement.

---

## To-Do List

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Fix blockade radius physics bug (scale_factor in both .py files) | CRITICAL | ⬜ Not started |
| 2 | Fix accessibility contrast on axis labels | HIGH | ⬜ Not started |
| 3 | Add onboarding Quick Start overlay | HIGH | ⬜ Not started |
| 4 | Make layout mobile-friendly + add touch handlers | HIGH | ⬜ Not started |
| 5 | Improve results panel typography/padding | MEDIUM | ⬜ Not started |
| 6 | Refactor "How This Works" card to accordion | MEDIUM | ⬜ Not started |
| 7 | (Future) FastAPI worker queue to replace subprocess spawn | LOW | 🔵 Backlog |

---

## File Map

```
QuantumTraffic/
├── public/
│   └── index.html          # Full frontend (Tailwind, vanilla JS, SVG canvas)
├── src/
│   ├── server.js            # Express API: /api/quantum/solve, /api/quantum/jobs/:id
│   └── quantum/
│       ├── local_emulator.py   # Pulser + QuTiP local simulation
│       └── cloud_solver.py     # Pulser + Pasqal Cloud SDK dispatch
├── package.json
├── project.md               # Project evaluation & recommendations (read-only reference)
└── CLAUDE.md                # ← YOU ARE HERE (Source of Truth)
```
