"""Train the TFT + GAT model on the synthetic-or-real feeder dataset.

Usage:
    python scripts/train.py --epochs 50 --eval
    python scripts/train.py --epochs 5 --subset 500       # quick smoke run

Produces:
    models/checkpoints/best.pt
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import torch
from torch.utils.data import DataLoader, TensorDataset

from gridsight.data import FEATURES, synthetic_dataset, windowed
from gridsight.losses import quantile_loss
from gridsight.models import TFTGAT, model_summary

SEED = 1337


def set_seed(s: int) -> None:
    random.seed(s)
    np.random.seed(s)
    torch.manual_seed(s)
    torch.cuda.manual_seed_all(s)


def build_loaders(n_days: int, subset: int | None, batch_size: int):
    df = synthetic_dataset(n_days=n_days, seed=SEED)
    samples = list(windowed(df))
    if subset:
        samples = samples[:subset]
    random.Random(SEED).shuffle(samples)
    cutoff = int(len(samples) * 0.8)
    train, val = samples[:cutoff], samples[cutoff:]

    def to_tensors(rows):
        X = torch.from_numpy(np.stack([r[1] for r in rows]))
        y = torch.from_numpy(np.stack([r[2] for r in rows]))
        return TensorDataset(X, y)

    return (
        DataLoader(to_tensors(train), batch_size=batch_size, shuffle=True),
        DataLoader(to_tensors(val), batch_size=batch_size),
    )


def mape(pred_p50: torch.Tensor, target: torch.Tensor) -> float:
    eps = 1e-3
    return float((torch.abs(pred_p50 - target) / (target.abs() + eps)).mean() * 100)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--n-days", type=int, default=60)
    ap.add_argument("--subset", type=int, default=None)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--eval", action="store_true")
    ap.add_argument("--out", type=str, default="models/checkpoints/best.pt")
    args = ap.parse_args()

    set_seed(SEED)
    train_dl, val_dl = build_loaders(args.n_days, args.subset, args.batch_size)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    model_cfg = dict(n_features=len(FEATURES), horizon=24, n_quantiles=3)
    model = TFTGAT(**model_cfg).to(device)
    total, _ = model_summary(model)
    print(f"[init] device={device} params={total:,}")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    best_val = float("inf")
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        for X, y in train_dl:
            X, y = X.to(device), y.to(device)
            pred = model(X)  # (B, 24, 3)
            loss = quantile_loss(pred, y)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            train_loss += loss.item() * X.size(0)
        train_loss /= len(train_dl.dataset)

        model.eval()
        val_loss = 0.0
        m_total = 0.0
        n = 0
        with torch.no_grad():
            for X, y in val_dl:
                X, y = X.to(device), y.to(device)
                pred = model(X)
                val_loss += quantile_loss(pred, y).item() * X.size(0)
                m_total += mape(pred[..., 1], y) * X.size(0)
                n += X.size(0)
        val_loss /= n or 1
        val_mape = m_total / (n or 1)
        history.append({"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss, "val_mape": val_mape})
        print(f"[epoch {epoch:>3}] train={train_loss:.4f}  val={val_loss:.4f}  MAPE={val_mape:.2f}%")

        if val_loss < best_val:
            best_val = val_loss
            out = ROOT / args.out
            out.parent.mkdir(parents=True, exist_ok=True)
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "config": model_cfg,
                    "epoch": epoch,
                    "val_loss": val_loss,
                    "val_mape": val_mape,
                },
                out,
            )

    if args.eval:
        print(json.dumps({"best_val_loss": best_val, "history_tail": history[-5:]}, indent=2))


if __name__ == "__main__":
    main()
