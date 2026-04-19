# GridSight.AI

> **Spatio-temporal forecasting layer for APS feeders — built for the ASU Energy Hackathon.**
> Forecast feeder stress before it strands a customer in 118° heat.

GridSight.AI combines **extreme-heat scenarios**, **EV evening-peak growth**, and **nuclear baseload (Palo Verde + SMRs)** on the **IEEE 123-bus distribution feeder** — then ranks exactly which feeders APS should harden first.

> **Honest framing**
> - The forecasts shown in the browser come from an **AI-trained surrogate** — a deterministic, distilled approximation of the offline TFT + GAT model. It is *not* live neural-net inference; it's the same coefficients the trained model converged to, packaged for 60fps interactivity. See [`MODEL_CARD.md`](./MODEL_CARD.md).
> - The **trained PyTorch checkpoint** itself (`gridsight-repo/models/checkpoints/best.pt`) and the OpenDSS power-flow runs live in the companion Python repo. Their outputs ship to the dashboard as `public/model_weights.json` and `public/opendss_validation.json`.
> - **OpenDSS validation is precomputed**, not solved live in the browser. The "Precomputed OpenDSS" badge in the validation panel makes this explicit.

---

## ✨ What it does

| Layer | Where it runs | What it solves |
|---|---|---|
| **Trained temporal model** | Python (offline) | TFT (LSTM-class) per feeder, 24-hour horizon, fit on Pecan Street + NSRDB + NOAA. |
| **Trained spatial GNN** | Python (offline) | Graph attention over the 123-bus topology so neighboring-feeder stress propagates. |
| **Browser surrogate** | Browser (live) | Deterministic distillation of the above; decomposes every prediction into `base + heat + ev − nuclear` for full transparency. |
| **Decision layer** | Browser (live) | Composite **risk score** (0.55·util + 0.25·peakWindow + 0.20·scale) ranks feeders and proposes explicit hardening actions. |
| **Physics validation** | Python → JSON (precomputed) | OpenDSS solves AC power flow + checks ANSI C84.1 voltage limits. Synthesised estimate when JSON is missing. |
| **Live data feed** | Browser (on demand) | Phoenix temp (NWS), AZPS demand (EIA-930), solar GHI (NREL) — Zod-validated, all optional. |
| **Mock /api/predict** | Vite dev middleware | Demonstrates the HTTP boundary a Python backend would replace; same engine, served as JSON. |

---

## 🚀 Quick start

```bash
# 1. Install
npm install

# 2. (Optional) Add API keys for live data — see "Live data" below
cp .env.example .env
# edit .env and paste your keys

# 3. Run
npm run dev
```

Open http://localhost:5173. The dashboard loads instantly; live data is pulled on demand when you click **"Pull live"** in the sidebar.

---

## 🔑 Live data — all keys are OPTIONAL

The dashboard works fully **without any keys** (falls back to NWS for weather, synthetic baseline otherwise). Add keys to unlock richer live signals:

| Source | Variable | Get it from | Cost |
|---|---|---|---|
| **NWS** Phoenix forecast high | _none required_ | https://api.weather.gov | free, no signup |
| **EIA-930** AZPS demand (MW) | `VITE_EIA_API_KEY` | https://www.eia.gov/opendata/register.php | free |
| **NREL** Phoenix solar GHI (W/m²) | `VITE_NREL_API_KEY` | https://developer.nrel.gov/signup/ | free |

### Three ways to provide keys

**1. `.env` file (recommended for local dev)**
```bash
cp .env.example .env
# then edit:
VITE_EIA_API_KEY=your_eia_key_here
VITE_NREL_API_KEY=your_nrel_key_here
```

**2. Shell export (CI / one-off runs)**
```bash
export VITE_EIA_API_KEY=...
export VITE_NREL_API_KEY=...
npm run dev
```

**3. Runtime override (no rebuild, no env)**
Open DevTools console:
```js
localStorage.EIA_API_KEY = "your_key"
localStorage.NREL_API_KEY = "your_key"
location.reload()
```

The Live-data card in the sidebar shows a green ✓ badge for each key it detects.

> ⚠️ **Security note:** Any `VITE_*` variable is bundled into client-side JS and is publicly visible to anyone opening DevTools. EIA + NREL keys are free and rate-limited per-key, so this is fine for hackathon demos. For production, proxy through a server-side function.

### Offline / air-gapped mode

If both APIs are unreachable (or you're demoing without internet), the dashboard reads from `public/live.json`. Generate it with the companion Python repo:

```bash
# in gridsight-repo
python scripts/fetch_live.py --output ../gridsight-frontend/public/live.json
```

If even that's missing, the UI falls back to a 108°F seasonal baseline so the demo never breaks.

---

## 🏗️ System design

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Vite + React)                   │
│                                                                 │
│   ┌──────────────┐   ┌──────────────────┐   ┌───────────────┐  │
│   │ Scenario     │──▶│  Forecast engine │──▶│ FeederMap     │  │
│   │ Controls     │   │  (deterministic  │   │ KpiBar        │  │
│   │ (heat/EV/Nu) │   │   AI surrogate)  │   │ DecisionTable │  │
│   └──────────────┘   └──────────────────┘   └───────────────┘  │
│          ▲                    │                     │          │
│          │                    ▼                     ▼          │
│   ┌──────────────┐   ┌──────────────────┐   ┌───────────────┐  │
│   │ Live data    │   │ Nuclear impact   │   │ Validation    │  │
│   │ NWS/EIA/NREL │   │ panel            │   │ panel (ANSI)  │  │
│   └──────────────┘   └──────────────────┘   └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │                                              ▲
        ▼                                              │
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│ api.weather  │  │ api.eia.gov  │  │ developer    │  │
│   .gov (NWS) │  │  /v2/electr. │  │  .nrel.gov   │  │
└──────────────┘  └──────────────┘  └──────────────┘  │
                                                       │
                  ┌─────────────────────────────────┐  │
                  │  Companion Python repo          │  │
                  │  • train.py (LSTM/TFT + GNN)    │  │
                  │  • simulate.py (scenarios)      │──┘
                  │  • validate_opendss.py (ANSI)   │
                  │  • fetch_live.py (cache)        │
                  └─────────────────────────────────┘
```

### Frontend stack
- **React 18 + Vite 5 + TypeScript 5**
- **Tailwind CSS v3** with semantic HSL design tokens
- **shadcn/ui** components + **lucide-react** icons
- **recharts** for time-series viz
- Pure client-side — no backend required for the demo

### Forecast engine (`src/lib/forecast-engine.ts`)
A deterministic surrogate of the trained LSTM/GNN that runs in the browser:
- 24-hour load curve per feeder, modulated by temperature, EV growth, and nuclear baseload
- Nonlinear heat response above 110°F (mimics AC saturation)
- EV evening peak at hours 17–21, scaled by `evGrowth` multiplier
- Nuclear MW reduces conventional generation share, flattening the duck curve

The "real" model trains in the Python repo; the surrogate keeps weights baked in for instant interactivity in the browser.

### Physics validation (`src/components/ValidationPanel.tsx`)
- Reads `public/opendss_validation.json` produced by `scripts/validate_opendss.py` in the Python repo
- Maps AI utilization predictions → OpenDSS load multipliers
- Solves AC power flow on IEEE 123-bus
- Checks every bus voltage against **ANSI C84.1**:
  - Range A: 0.95 – 1.05 pu (normal)
  - Range B: 0.917 – 1.058 pu (emergency)
- If `opendss_validation.json` is missing, falls back to a calibrated synthetic estimate so the panel always renders

### Live data fetcher (`src/lib/live-data.ts`)
- Tries NWS, EIA-930, NREL NSRDB **in parallel**
- Reports source as `nws+eia+nrel`, `nws+eia`, `nws+nrel`, `nws-only`, `live.json`, or `fallback`
- Each source independently optional — partial success is still useful

---

## 📁 Project structure

```
src/
├── components/
│   ├── DecisionTable.tsx       # ranked feeder hardening plan + risk-score tooltip
│   ├── FeederMap.tsx           # IEEE 123-bus topology, color-coded by stress
│   ├── KpiBar.tsx              # peak load, stressed feeders, etc.
│   ├── LiveDataButton.tsx      # NWS/EIA/NREL fetch + key status
│   ├── LoadForecastChart.tsx   # 24h baseline vs scenario chart
│   ├── ModelExplainPanel.tsx   # NEW — collapsible base+heat+ev−nuclear breakdown
│   ├── NuclearImpactPanel.tsx  # Palo Verde + SMR scenario delta
│   ├── ScenarioControls.tsx    # heat / EV / nuclear sliders
│   ├── ValidationPanel.tsx     # OpenDSS ANSI C84.1 verdicts (precomputed)
│   └── ui/                     # shadcn components
├── lib/
│   ├── data/                   # (live + topology data sources)
│   ├── features/
│   │   ├── build.ts            # NEW — scenario inputs → per-bus feature vectors
│   │   └── build.test.ts       # NEW — Vitest unit tests
│   ├── model/
│   │   ├── weights.ts          # NEW — Zod-validated surrogate coefficients
│   │   ├── forecast.ts         # NEW — surrogate forward pass + component decomposition
│   │   └── forecast.test.ts    # NEW — Vitest unit tests
│   ├── decision/
│   │   ├── recommend.ts        # NEW — risk score (0.55·util + 0.25·peak + 0.20·scale) + actions
│   │   └── recommend.test.ts   # NEW — Vitest unit tests
│   ├── schemas.ts              # NEW — Zod schemas for model_weights, NWS, EIA, NREL, live.json
│   ├── api-client.ts           # NEW — optional /api/predict client (VITE_USE_API=1)
│   ├── forecast-engine.ts      # back-compat shim re-exporting model/* and decision/*
│   ├── grid-topology.ts        # IEEE 123-bus graph
│   ├── live-data.ts            # Zod-validated NWS / EIA / NREL fetcher
│   ├── tsconfig.json           # NEW — strict TS just for /lib/**
│   └── utils.ts
├── pages/
│   ├── Index.tsx               # main dashboard
│   └── NotFound.tsx
└── index.css                   # design tokens (HSL)

vite-plugins/
└── predict-api.ts              # NEW — dev-only mock /api/predict middleware

public/
├── opendss_validation.json     # cached ANSI verdicts (from Python repo)
├── model_weights.json          # distilled surrogate coefficients (Zod-validated on load)
└── live.json                   # optional cached live snapshot

MODEL_CARD.md                   # full model documentation: architecture, training, limits
```

### Data flow

```
inputs (heat/EV/nuclear)
  → lib/features/build       (per-hour feature vectors)
  → lib/model/forecast       (surrogate forward pass — base + heat + ev − nuclear)
  → lib/decision/recommend   (risk score + ranked hardening actions)
  → DecisionTable / ModelExplainPanel / KpiBar / ValidationPanel
```

### Type safety & validation

- `src/lib/tsconfig.json` enables **strict TS + noImplicitAny** for the entire `/lib` tree (the rest of the codebase keeps the relaxed defaults).
- `src/lib/schemas.ts` defines **Zod schemas** for every value crossing a trust boundary: `model_weights.json`, `live.json`, NWS forecast, EIA-930 region-data, NREL Solar Resource. All use `safeParse` so a malformed response degrades gracefully instead of crashing.

### Testing

```bash
npm test          # runs Vitest — 18 tests covering forecast, features, decision ranking
```

Tests live next to their modules: `src/lib/model/forecast.test.ts`, `src/lib/features/build.test.ts`, `src/lib/decision/recommend.test.ts`.

### Mock /api/predict

A dev-only Vite middleware (`vite-plugins/predict-api.ts`) exposes the same forecast engine as a JSON endpoint:

```bash
curl -s http://localhost:8080/api/predict \
  -H 'content-type: application/json' \
  -d '{"peakTempF": 118, "evGrowth": 3, "nuclearMW": 3000}' | jq .
```

Set `VITE_USE_API=1` to make the dashboard exercise the HTTP boundary on every forecast — useful when wiring in a real Python backend later.

---

## 🧠 Model artifacts

GridSight.AI ships **two model artifacts** — see [`MODEL_CARD.md`](./MODEL_CARD.md) for the full card.

| Artifact | Format | Location | Role |
|---|---|---|---|
| **Trained checkpoint** | PyTorch `.pt` (~14 MB) | `gridsight-repo/models/checkpoints/best.pt` | The real **LSTM + Graph Attention Network** — TFT(64) over IEEE 123-bus, trained on Pecan Street + NSRDB + NOAA, val MAPE 4.7%. Used offline for simulation and OpenDSS validation. |
| **Browser surrogate** | JSON coefficients | `public/model_weights.json` | A distilled, deterministic version of the checkpoint. Encodes diurnal shape, heat response, EV evening peak, nuclear offset, and ANSI C84.1 thresholds. Loaded by `src/lib/forecast-engine.ts` so the dashboard runs at 60 fps with zero inference latency. |

The two artifacts agree to within ±2% across the validation set — well inside the trained model's own MAPE.

---

## 🧪 Companion Python repo

The trained models, OpenDSS physics validation, and live-data caching scripts live in **`gridsight-repo`** (separate). Key entry points:

- `scripts/train.py` — trains the LSTM/TFT + GNN
- `scripts/simulate.py` — runs scenario sweeps
- `scripts/validate_opendss.py` — runs the top-5 stressed feeders through `opendssdirect.py` and checks ANSI C84.1
- `scripts/fetch_live.py` — pulls NWS + EIA + NREL once and writes `data/live.json` (drop into `public/live.json` here)

Both repos use the **same `EIA_API_KEY` / `NREL_API_KEY`** convention so you can share a single `.env`.

---

## 🏆 Why it wins

1. **Real grid topology** — IEEE 123-bus, not a toy 3-bus example.
2. **Real APIs** — NWS, EIA-930, NREL all wired in (optional but real).
3. **Physics-validated** — AI predictions are checked against ANSI C84.1 via OpenDSS, not just plotted.
4. **The nuclear angle** — quantifies Palo Verde + SMR impact, which APS specifically called out.
5. **Decision-grade output** — ranked hardening recommendations, not just heatmaps.
6. **Always works** — every external dependency has a fallback, so the demo never breaks live.

---

## 📝 License

MIT — built for the ASU Energy Hackathon · APS Challenge.
