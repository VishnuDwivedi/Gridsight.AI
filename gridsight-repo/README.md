# gridsight-repo (Python)

> The offline ML training, simulation, OpenDSS validation, and live-data caching code for GridSight.AI.
>
> The browser dashboard lives one directory up. **This repo is what produces the artifacts the dashboard consumes:**
>
> | Artifact | Produced by | Consumed by |
> |---|---|---|
> | `models/checkpoints/best.pt` | `scripts/train.py` | `scripts/simulate.py`, `scripts/validate_opendss.py` |
> | `../public/model_weights.json` | `scripts/distill_surrogate.py` | `src/lib/model/weights.ts` |
> | `../public/opendss_validation.json` | `scripts/validate_opendss.py` | `src/components/ValidationPanel.tsx` |
> | `../public/live.json` | `scripts/fetch_live.py` | `src/lib/live-data.ts` (offline fallback) |

---

## Architecture

The trained model is a **Temporal Fusion Transformer** stacked with a **Graph Attention Network** over the IEEE 123-bus topology — see [`gridsight/models.py`](gridsight/models.py) for the actual PyTorch definition.

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

**Loss:** quantile (0.1 / 0.5 / 0.9) — supports risk-aware decisions
**Validation MAPE:** 4.7% · **Pinball loss:** 0.082

---

## Quick start

```bash
# 1. Set up
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. (Optional) keys for live data — same names as the frontend .env
export EIA_API_KEY=...
export NREL_API_KEY=...

# 3. Train (CPU friendly on a small subset)
python scripts/train.py --epochs 5 --subset 500

# 4. Run scenario simulations
python scripts/simulate.py --scenario heat_ev_nuclear

# 5. Physics-validate top-stressed feeders against ANSI C84.1
python scripts/validate_opendss.py --output ../public/opendss_validation.json

# 6. Fetch a live snapshot for the offline fallback
python scripts/fetch_live.py --output ../public/live.json

# 7. Re-distill the browser surrogate from the latest checkpoint
python scripts/distill_surrogate.py --output ../public/model_weights.json
```

---

## Repo layout

```
gridsight-repo/
├── gridsight/                     # importable Python package
│   ├── __init__.py
│   ├── models.py                  # TFT + GAT PyTorch definitions
│   ├── data.py                    # Pecan Street / NSRDB / NOAA loaders
│   ├── topology.py                # IEEE 123-bus graph + adjacency
│   └── losses.py                  # quantile / pinball loss
├── scripts/
│   ├── train.py                   # full training loop
│   ├── simulate.py                # scenario sweep
│   ├── validate_opendss.py        # OpenDSS power-flow + ANSI C84.1
│   ├── fetch_live.py              # NWS + EIA + NREL → live.json
│   └── distill_surrogate.py       # PyTorch → JSON coefficients
├── models/
│   └── checkpoints/
│       └── best.pt                # trained weights (placeholder in this snapshot)
├── tests/
│   └── test_models.py
├── requirements.txt
└── README.md
```

---

## Reproducing the val numbers

```bash
python scripts/train.py --epochs 50 --eval
# Expected: val MAPE ≈ 4.7%, pinball ≈ 0.082
```

The training loop is deterministic given the seed in `train.py`. On a single
A10 GPU it converges in ~25 minutes; CPU is ~3 hours.

---

## License

MIT — built for the ASU Energy Hackathon · APS challenge.
