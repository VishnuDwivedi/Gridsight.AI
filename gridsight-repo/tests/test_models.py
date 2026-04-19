"""Smoke tests for the offline ML package."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import torch

from gridsight.data import FEATURES, synthetic_dataset, windowed
from gridsight.losses import quantile_loss
from gridsight.models import TFTGAT


def test_topology_buses():
    from gridsight.topology import build_topology
    buses, edges = build_topology()
    assert len(buses) >= 100
    assert len(edges) >= 100


def test_model_forward_shape():
    m = TFTGAT(n_features=len(FEATURES), horizon=24, n_quantiles=3)
    X = torch.randn(8, 48, len(FEATURES))
    y = m(X)
    assert y.shape == (8, 24, 3)


def test_quantile_loss_positive():
    pred = torch.randn(4, 24, 3)
    target = torch.randn(4, 24)
    loss = quantile_loss(pred, target)
    assert loss.item() > 0


def test_synthetic_dataset_columns():
    df = synthetic_dataset(n_days=2)
    for col in FEATURES + ["bus_id", "load_kw"]:
        assert col in df.columns


def test_windowed_shapes():
    df = synthetic_dataset(n_days=4)
    sample = next(iter(windowed(df, lookback=48)))
    bus_id, x, y = sample
    assert x.shape == (48, len(FEATURES))
    assert y.shape == (24,)
