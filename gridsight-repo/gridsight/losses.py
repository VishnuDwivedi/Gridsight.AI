"""Quantile (pinball) loss for risk-aware forecasting."""

from __future__ import annotations

import torch


def quantile_loss(
    pred: torch.Tensor,
    target: torch.Tensor,
    quantiles: tuple[float, ...] = (0.1, 0.5, 0.9),
) -> torch.Tensor:
    """
    pred:   (batch, horizon, n_quantiles)
    target: (batch, horizon)
    """
    target = target.unsqueeze(-1)  # (B, H, 1)
    losses = []
    for i, q in enumerate(quantiles):
        diff = target - pred[..., i : i + 1]
        losses.append(torch.maximum(q * diff, (q - 1) * diff))
    return torch.cat(losses, dim=-1).mean()
