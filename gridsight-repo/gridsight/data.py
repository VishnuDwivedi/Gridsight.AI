"""Data loaders for the offline training pipeline.

In the real repo these read from local copies of:
  • Pecan Street Dataport (per-customer hourly load CSVs)
  • NREL NSRDB (Phoenix grid cell, hourly GHI/DNI)
  • NOAA ASOS KPHX (hourly weather)

This module ships a synthetic generator so `scripts/train.py` runs end-to-end
on any machine without licensed datasets — useful for the hackathon snapshot
and CI.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from .topology import build_topology

FEATURES = [
    "hour_of_day",
    "temp_F",
    "ghi_Wm2",
    "ev_share",
    "ac_share",
    "is_weekend",
    "neighbor_load_lag1",
]


def synthetic_dataset(n_days: int = 60, seed: int = 0) -> pd.DataFrame:
    """Generate a synthetic feeder-load dataset shaped like the real one.

    Returns a long-format DataFrame:
        bus_id, ts, hour_of_day, temp_F, ghi_Wm2, ev_share, ac_share,
        is_weekend, neighbor_load_lag1, load_kw
    """
    rng = np.random.default_rng(seed)
    buses, _ = build_topology()
    rows = []
    n_hours = n_days * 24

    # Diurnal scaffold (matches the JS surrogate so train/eval are consistent)
    diurnal = np.array([
        0.55, 0.50, 0.48, 0.47, 0.50, 0.58, 0.70, 0.78,
        0.74, 0.70, 0.72, 0.78, 0.82, 0.85, 0.88, 0.90,
        0.92, 0.94, 0.97, 1.00, 0.96, 0.88, 0.78, 0.65,
    ])

    for t in range(n_hours):
        h = t % 24
        day = t // 24
        # Phoenix-ish summer temp curve, hot afternoons
        temp = 95 + 10 * np.sin((h - 5) / 24 * 2 * np.pi) + rng.normal(0, 2)
        ghi = max(0, 950 * np.sin(max(0, (h - 6) / 12) * np.pi)) if 6 <= h <= 18 else 0
        is_weekend = int(day % 7 in (5, 6))
        for b in buses[1:]:  # skip substation
            heat_uplift = 1 + max(0, temp - 100) * 0.018 * np.exp(-((h - 16) / 4.5) ** 2)
            ev = b.ev_share * (0.1 + 0.9 * np.exp(-((h - 20) / 1.6) ** 2)) if 17 <= h <= 23 else b.ev_share * 0.05
            load = b.base_load_kw * diurnal[h] * (1 + (heat_uplift - 1) * b.ac_share) + b.base_load_kw * ev
            load *= 1 + rng.normal(0, 0.04)
            rows.append({
                "bus_id": b.id,
                "ts": t,
                "hour_of_day": h,
                "temp_F": float(temp),
                "ghi_Wm2": float(ghi),
                "ev_share": b.ev_share,
                "ac_share": b.ac_share,
                "is_weekend": is_weekend,
                "neighbor_load_lag1": 0.0,  # filled below
                "load_kw": float(max(0, load)),
            })

    df = pd.DataFrame(rows).sort_values(["bus_id", "ts"]).reset_index(drop=True)
    df["neighbor_load_lag1"] = df.groupby("bus_id")["load_kw"].shift(1).bfill()
    return df


def windowed(df: pd.DataFrame, lookback: int = 48):
    """Yield (X, y) sliding windows: 48h lookback → 24h horizon."""
    horizon = 24
    for bus_id, g in df.groupby("bus_id"):
        g = g.reset_index(drop=True)
        for i in range(len(g) - lookback - horizon):
            x = g.loc[i : i + lookback - 1, FEATURES].to_numpy(dtype="float32")
            y = g.loc[i + lookback : i + lookback + horizon - 1, "load_kw"].to_numpy(dtype="float32")
            yield bus_id, x, y
