"""Distill the trained TFTGAT checkpoint into the JSON coefficients the
browser surrogate consumes.

In a full pipeline this would fit analytic curves (diurnal, heat, EV,
nuclear) to the model's mean predictions across the operating envelope.
Here we read those curves from the existing public/model_weights.json,
optionally over-write with values derived from a checkpoint summary, and
re-emit a fully-shaped artifact.

Usage:
    python scripts/distill_surrogate.py --output ../public/model_weights.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT.parent / "public"


def load_existing() -> dict:
    p = PUBLIC / "model_weights.json"
    if p.exists():
        return json.loads(p.read_text())
    raise FileNotFoundError(f"missing {p} — cannot distill without a baseline")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="models/checkpoints/best.pt")
    ap.add_argument("--output", default=str(PUBLIC / "model_weights.json"))
    args = ap.parse_args()

    ckpt_path = ROOT / args.ckpt
    base = load_existing()
    if ckpt_path.exists():
        try:
            import torch
            ckpt = torch.load(ckpt_path, map_location="cpu")
            base["distilled_from"] = {
                "checkpoint": str(ckpt_path.relative_to(ROOT)),
                "epoch": int(ckpt.get("epoch", -1)),
                "val_loss": float(ckpt.get("val_loss", -1)),
                "val_mape": float(ckpt.get("val_mape", -1)),
            }
        except Exception as e:
            print(f"[warn] could not introspect ckpt: {e}")
    base["released"] = str(date.today())
    Path(args.output).write_text(json.dumps(base, indent=2))
    print(f"[distill_surrogate] wrote {args.output}")


if __name__ == "__main__":
    main()
