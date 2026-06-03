# Quantum Traffic Control

An interactive demo showcasing how [Pasqal](https://www.pasqal.com)'s quantum computing technology solves complex traffic routing problems. Place intersection nodes on a coordinate grid and let either a classical brute-force solver or a real Rydberg-blockade quantum simulation find the optimal set of traffic lights that can all go green simultaneously.

![Quantum Traffic Control UI](https://raw.githubusercontent.com/Mohamed-AH/QuantumTraffic/main/docs/preview.png)

---

## How It Works

Traffic light scheduling is a **Maximum Independent Set (MIS)** problem: given a graph of intersections connected by shared road corridors, find the largest subset of intersections that can all be active at the same time with no two adjacent nodes conflicting.

Pasqal's approach maps this directly onto physics:

| Traffic concept | Quantum analog |
|---|---|
| Intersection | Rubidium atom held by an optical tweezer |
| Conflict corridor | Atoms within Rydberg blockade radius (~4 µm) |
| Green light | Atom excited to Rydberg state (`1`) |
| Red light | Atom in ground state (`0`) |

When an adiabatic laser pulse is applied, the atom array naturally evolves to its lowest-energy ground state — a state that physically encodes the MIS solution as a bitstring of `1`s and `0`s.

---

## Features

- **Interactive SVG grid** — click or tap to place up to 12 intersection nodes; conflict edges appear automatically within the 4 µm blockade radius
- **Classical solver** — in-browser backtracking algorithm (O(2ᴺ)), instant for small graphs
- **Quantum solver** — dispatches to Pasqal's EMU_FREE cloud emulator via the Pasqal Cloud SDK; returns a probability distribution over bitstrings
- **Guided demo tours** — three preset scenarios (Corridor, Crossroad, Frustrated Triangle) with narrative explanations
- **"How This Works" accordion** — three-tab explainer covering the problem, the physics, and how to read results
- **Mobile-friendly** — responsive layout with touch-event support on the canvas
- **Async job pipeline** — Express backend spawns the Python solver asynchronously; frontend polls for completion with a live step tracker

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS · Tailwind CSS CDN · Lucide Icons · SVG canvas |
| Backend | Node.js 18+ · Express 4 |
| Quantum layer | Python 3 · [Pulser](https://github.com/pasqal-io/Pulser) · [QuTiP](https://qutip.org) |
| Cloud execution | [Pasqal Cloud SDK](https://github.com/pasqal-io/pasqal-cloud) (SA region) |
| Optional DB | MongoDB Atlas via Mongoose (falls back to in-memory if `MONGO_URI` is unset) |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Python 3.9+ with `pulser`, `pulser-simulation`, and `qutip` installed
- A Pasqal Cloud account (only required for cloud execution)

### Install Python dependencies

```bash
pip install pulser pulser-simulation qutip pasqal-cloud
```

### Install Node dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env` file in the project root:

```env
# Required only for Pasqal Cloud execution
PASQAL_USERNAME=your_email@example.com
PASQAL_PASSWORD=your_password
PASQAL_PROJECT_ID=your_project_id

# Optional: MongoDB Atlas connection string
# If omitted, the app runs in fast in-memory mode
MONGO_URI=mongodb+srv://...
```

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API

### `POST /api/quantum/solve`

Dispatches a new solver job.

**Request body**

```json
{
  "coordinates": [[1.5, 5.0], [4.0, 5.0], [6.5, 5.0], [9.0, 5.0]],
  "useCloud": false
}
```

| Field | Type | Description |
|---|---|---|
| `coordinates` | `[x, y][]` | Node positions in µm (0–10 range, 2–12 nodes) |
| `useCloud` | `boolean` | `true` → Pasqal Cloud EMU_FREE, `false` → local QuTiP emulator |

**Response `202`**

```json
{
  "jobId": "uuid",
  "message": "Asynchronous simulation processing initiated.",
  "backend": "Local Quantum Emulator"
}
```

---

### `GET /api/quantum/jobs/:id`

Polls job status.

**Response**

```json
{
  "id": "uuid",
  "status": "completed",
  "backend": "local_emulator",
  "results": [
    { "bitstring": "1010", "occurrences": 312, "probability": 0.624 },
    { "bitstring": "0101", "occurrences": 98,  "probability": 0.196 }
  ]
}
```

`status` values: `queued` → `processing` → `completed` | `failed`

---

## Project Structure

```
QuantumTraffic/
├── public/
│   └── index.html              # Full frontend (Tailwind, vanilla JS, SVG canvas)
├── src/
│   ├── server.js               # Express API server
│   └── quantum/
│       ├── local_emulator.py   # Pulser + QuTiP local simulation
│       └── cloud_solver.py     # Pulser + Pasqal Cloud SDK dispatch
├── package.json
├── .env                        # (not committed) secrets & config
└── CLAUDE.md                   # Project source of truth & development log
```

---

## Physics Detail

Both Python solvers apply a `scale_factor = 1.5` to the raw µm coordinates before constructing the Pulser `Register`. This aligns the physical Rydberg blockade radius produced by the adiabatic pulse (which depends on the peak Rabi frequency Ω) with the 4.0 µm interaction circles rendered in the UI.

The pulse shape is a 3000 ns adiabatic sweep:
- **Amplitude:** Blackman waveform with area 4π
- **Detuning:** Linear ramp from −10 to +10 rad/µs

This is sufficient to drive the atom array into the MIS ground state for graphs up to ~12 nodes.

---

## Known Limitations

- **Subprocess scaling** — a fresh `python3` process is spawned per request. Under moderate concurrency this will exhaust CPU. A FastAPI worker queue is the planned long-term fix.
- **In-memory rate limiter** — resets on cold starts (e.g. Vercel/Render serverless). Acceptable for demos; replace with Redis for production.
- **12-node cap** — enforced server-side to keep emulation times reasonable.

---

## Author

Mohamed AH — [github.com/mohamed-ah](https://github.com/mohamed-ah)
