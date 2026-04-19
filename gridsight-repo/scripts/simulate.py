"""Run a scenario sweep using the trained checkpoint.

Usage:
    python scripts/simulate.py --scenario heat_ev_nuclear
    python scripts/simulate.py --temp 118 --ev-growth 3 --nuclear-mw 3000
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
import torch

from gridsight.data import FEATURES, synthetic_dataset, windowed
from gridsight.models import load_checkpoint

PRESETS = {
    "today":            {"temp": 105, "ev_growth": 1.0, "nuclear_mw": 0},
    "heat_wave":        {"temp": 118, "ev_growth": 1.2, "nuclear_mw": 0},
    "ev_2030":          {"temp": 110, "ev_growth": 3.0, "nuclear_mw": 0},
    "heat_ev_nuclear":  {"temp": 118, "ev_growth": 3.0, "nuclear_mw": 3000},
}


def apply_scenario(df, temp_F: float, ev_growth: float):
    df = df.copy()
    # Bias temperature distribution toward the requested peak
    df["temp_F"] = df["temp_F"] * (temp_F / df["temp_F"].max())
    df["ev_share"] = df["ev_share"] * ev_growth
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", choices=list(PRESETS), default=None)
    ap.add_argument("--temp", type=float, default=None)
    ap.add_argument("--ev-growth", type=float, default=None)
    ap.add_argument("--nuclear-mw", type=float, default=None)
    ap.add_argument("--ckpt", default="models/checkpoints/best.pt")
    args = ap.parse_args()

    if args.scenario:
        s = PRESETS[args.scenario]
    else:
        s = {
            "temp": args.temp or 105,
            "ev_growth": args.ev_growth or 1.0,
            "nuclear_mw": args.nuclear_mw or 0,
        }

    ckpt_path = ROOT / args.ckpt
    if not ckpt_path.exists():
        print(f"[warn] checkpoint not found at {ckpt_path}; "
              "run scripts/train.py first to produce real predictions.")
        print(json.dumps({"scenario": s, "status": "no-ckpt"}, indent=2))
        return

    model = load_checkpoint(ckpt_path)
    df = synthetic_dataset(n_days=7, seed=42)
    df = apply_scenario(df, s["temp"], s["ev_growth"])

    samples = list(windowed(df))[:200]
    X = torch.from_numpy(np.stack([r[1] for r in samples]))
    with torch.no_grad():
        pred = model(X)  # (B, 24, 3)
    p50 = pred[..., 1].numpy()
    peak = float(p50.sum(axis=0).max())  # crude grid-wide MW analog
    nuclear_offset = min(0.5, s["nuclear_mw"] / max(1, peak)) * peak
    print(json.dumps({
        "scenario": s,
        "horizon_h": 24,
        "predicted_peak_kw_grid_window": peak,
        "nuclear_offset_kw": nuclear_offset,
        "net_peak_kw": peak - nuclear_offset,
    }, indent=2))


if __name__ == "__main__":
    main()
