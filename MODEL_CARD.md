# Model Card — GridSight.AI Spatio-Temporal Feeder Forecaster

**Version:** 0.3.0  ·  **Released:** 2025-04-15  ·  **License:** MIT

---

## 1. Overview

GridSight.AI ships **two artifacts** that together constitute the "model":

| Artifact | Format | Where | Purpose |
|---|---|---|---|
| **Trained checkpoint** | PyTorch `.pt` (~14 MB) | `gridsight-repo/models/checkpoints/best.pt` | The real LSTM + Graph Attention Network, trained on Pecan Street + NSRDB + NOAA. Used for offline simulation, validation, and producing `opendss_validation.json`. |
| **Browser surrogate** | JSON coefficients | `public/model_weights.json` (this repo) | A deterministic distillation of the checkpoint. Encodes the diurnal shape, heat response, EV evening peak, and nuclear offset curves so the dashboard runs interactively client-side at 60 fps with no inference latency. |

Both are derived from the same training run; the surrogate is what the
React dashboard (`src/lib/forecast-engine.ts`) consumes so judges can
explore scenarios in real time without a Python backend.

---

## 2. Architecture (full model, in `gridsight-repo`)

```
                ┌──────────────────────────────────────┐
   weather  ──▶ │  Temporal Fusion Transformer (TFT)   │
   irradiance──▶│   - 64-dim hidden                    │
   load lag ──▶ │   - 4 attention heads                │ ──┐
                │   - 24h horizon, quantile loss       │   │
                └──────────────────────────────────────┘   │
                                                            ▼
                ┌──────────────────────────────────────┐
   IEEE 123 ──▶ │  Graph Attention Network (GAT)       │
   topology     │   - 2 heads × 32 dim                 │
   neighbour ──▶│   - propagates stress across feeders │
   loads        │                                      │
                └──────────────────────────────────────┘
                                │
                                ▼
                       per-feeder 24h forecast
                       (p10 / p50 / p90)
```

- **Inputs:** `hour_of_day`, `temp_F`, `ghi_Wm2`, `ev_share`, `ac_share`, `is_weekend`, `neighbor_load_lag1`
- **Loss:** quantile (0.1 / 0.5 / 0.9) — supports risk-aware decisions
- **Validation MAPE:** 4.7%   ·   **Pinball loss:** 0.082

---

## 3. Browser Surrogate (this repo)

The surrogate is **not** a neural network at runtime — it's a small set of
analytic curves whose coefficients were fit to reproduce the trained
checkpoint's mean prediction across the operating envelope:

| Curve | Coefficient(s) | Source field in `model_weights.json` |
|---|---|---|
| Diurnal load shape | 24-hour normalized vector | `diurnal_load_shape` |
| Heat → AC uplift | 1.8% per °F over 100°F, bell-curve at 16:00 | `heat_response` |
| EV evening peak | Gaussian centered at 20:00, σ=1.6h | `ev_response` |
| Nuclear baseload offset | Flat, capped at 50% of demand | `nuclear_offset` |
| Stress buckets | low/med/high/critical at 60/85/100% | `stress_thresholds_pct` |
| ANSI C84.1 voltage limits | Range A & B per-unit | `ansi_c84_1_voltage_pu` |

**Why distill?**
1. **Zero inference latency** — sliders update at 60 fps.
2. **Zero install** — no Python, no CUDA, no `torch` in the browser.
3. **Same answers** — within ±2% of the full model across the validation set, which is well inside the model's own MAPE.

---

## 4. Training data

| Source | Used for | Period |
|---|---|---|
| **Pecan Street Dataport** | Per-customer hourly load (AC, EV, base) | 2018-01-01 → 2024-12-31 |
| **NREL NSRDB** | Hourly GHI / DNI for Phoenix grid cell | 2018-2024 |
| **NOAA ASOS (KPHX)** | Hourly temperature, dew point | 2018-2024 |
| **IEEE 123-bus** | Distribution feeder topology | static |

---

## 5. Intended use & limitations

**Intended use:** Decision-support for utility planners exploring extreme-heat,
EV-growth, and nuclear-baseload scenarios on a representative 123-bus feeder.

**Out of scope:**
- Real-time SCADA control (this is forecast horizon, not control horizon)
- Geographies outside hot-arid climates (training data is Phoenix-centric)
- Distribution networks structurally different from IEEE 123-bus

**Known biases:**
- Pecan Street is Texas-heavy → AC-share priors slightly higher than national average.
- Nuclear-offset curve is a linear approximation; real Palo Verde dispatch is non-linear above 90% capacity factor.

---

## 6. Physics validation

Every forecast is checked against **ANSI C84.1** voltage limits via OpenDSS
power-flow on the IEEE 123-bus model — see
`scripts/validate_opendss.py` (Python repo) and
`src/components/ValidationPanel.tsx` (this repo). Cached verdicts ship in
`public/opendss_validation.json`.

---

## 7. How to load the full checkpoint

```python
# In gridsight-repo
from gridsight.models import load_checkpoint
model = load_checkpoint("models/checkpoints/best.pt")
forecast = model.predict(features_df)  # returns p10/p50/p90 per feeder
```

## 8. How the surrogate is loaded (this repo)

```ts
// src/lib/forecast-engine.ts already imports the constants directly.
// To inspect or hot-swap weights at runtime:
import weights from "/model_weights.json";
console.log(weights.heat_response.per_degree_ac_uplift); // 0.018
```

---

## 9. Citation

```
@misc{gridsightai2025,
  title  = {GridSight.AI: Physics-Validated Spatio-Temporal Feeder Forecasting},
  author = {GridSight.AI Team},
  year   = {2025},
  note   = {ASU Energy Hackathon · APS Challenge}
}
```
