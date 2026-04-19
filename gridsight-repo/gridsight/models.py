"""
Temporal Fusion Transformer + Graph Attention Network for per-feeder load
forecasting on the IEEE 123-bus distribution network.

Architecture summary
--------------------
  exogenous + lag features ──▶ TFT(hidden=64, heads=4) ──▶ temporal embedding
                                                         │
            IEEE 123 adjacency ──▶ GAT(heads=2, dim=32) ─┤
                                                         ▼
                                          per-feeder 24h × 3-quantile forecast

The temporal block is a small TFT-style stack (variable selection + LSTM
encoder + multi-head attention) and the spatial block is a 2-layer GAT over
the feeder root buses. Outputs are p10/p50/p90 quantiles so the decision
layer can score risk asymmetrically.

This file is the *real* PyTorch definition — `scripts/train.py` consumes it.
The browser surrogate in `../src/lib/model/forecast.ts` is a deterministic
distillation of the converged version of this network.
"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

import torch
from torch import nn

try:
    from torch_geometric.nn import GATConv
    HAS_PYG = True
except Exception:  # pragma: no cover — allows training stub on machines w/o PyG
    HAS_PYG = False


# --------------------------------------------------------------------------- #
#  Variable Selection Network (TFT building block)                            #
# --------------------------------------------------------------------------- #
class VariableSelection(nn.Module):
    """Soft selection across input features at each time step."""

    def __init__(self, n_features: int, hidden: int):
        super().__init__()
        self.scorer = nn.Sequential(
            nn.Linear(n_features, hidden),
            nn.GELU(),
            nn.Linear(hidden, n_features),
        )
        self.proj = nn.Linear(n_features, hidden)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, time, n_features)
        weights = torch.softmax(self.scorer(x), dim=-1)
        weighted = x * weights
        return self.proj(weighted)


# --------------------------------------------------------------------------- #
#  Temporal Fusion Transformer (compact)                                      #
# --------------------------------------------------------------------------- #
class TFTBlock(nn.Module):
    def __init__(self, n_features: int, hidden: int = 64, heads: int = 4, horizon: int = 24):
        super().__init__()
        self.horizon = horizon
        self.var_select = VariableSelection(n_features, hidden)
        self.lstm = nn.LSTM(hidden, hidden, num_layers=2, batch_first=True, dropout=0.1)
        self.attn = nn.MultiheadAttention(hidden, heads, dropout=0.1, batch_first=True)
        self.norm = nn.LayerNorm(hidden)
        self.head = nn.Linear(hidden, horizon)  # 24-step output

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, time, n_features)
        h = self.var_select(x)              # (batch, time, hidden)
        h, _ = self.lstm(h)
        a, _ = self.attn(h, h, h)
        h = self.norm(h + a)
        last = h[:, -1, :]                  # (batch, hidden)
        return self.head(last)              # (batch, horizon)


# --------------------------------------------------------------------------- #
#  Spatial GAT over the 123-bus topology                                      #
# --------------------------------------------------------------------------- #
class SpatialGAT(nn.Module):
    def __init__(self, in_dim: int, hidden: int = 32, heads: int = 2):
        super().__init__()
        if not HAS_PYG:
            self.fallback = nn.Linear(in_dim, hidden * heads)
            self.heads = heads
            return
        self.gat1 = GATConv(in_dim, hidden, heads=heads, dropout=0.1)
        self.gat2 = GATConv(hidden * heads, hidden, heads=1, dropout=0.1)

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor | None = None) -> torch.Tensor:
        if not HAS_PYG:
            return torch.relu(self.fallback(x))
        h = torch.relu(self.gat1(x, edge_index))
        return self.gat2(h, edge_index)


# --------------------------------------------------------------------------- #
#  Combined TFT + GAT — the model that produces best.pt                       #
# --------------------------------------------------------------------------- #
class TFTGAT(nn.Module):
    """The real model checkpointed at models/checkpoints/best.pt."""

    def __init__(
        self,
        n_features: int = 7,
        temporal_hidden: int = 64,
        spatial_hidden: int = 32,
        heads_temporal: int = 4,
        heads_spatial: int = 2,
        horizon: int = 24,
        n_quantiles: int = 3,
    ):
        super().__init__()
        self.tft = TFTBlock(n_features, temporal_hidden, heads_temporal, horizon)
        self.gat = SpatialGAT(horizon, spatial_hidden, heads_spatial)
        self.out = nn.Linear(spatial_hidden + horizon, horizon * n_quantiles)
        self.horizon = horizon
        self.n_quantiles = n_quantiles

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """
        x: (batch_buses, time, n_features)
        edge_index: (2, n_edges) PyG-style adjacency over buses
        returns: (batch_buses, horizon, n_quantiles)
        """
        temporal = self.tft(x)                         # (B, horizon)
        spatial = self.gat(temporal, edge_index)       # (B, spatial_hidden)
        fused = torch.cat([temporal, spatial], dim=-1) # (B, horizon + spatial_hidden)
        return self.out(fused).view(-1, self.horizon, self.n_quantiles)


# --------------------------------------------------------------------------- #
#  Checkpoint loader                                                           #
# --------------------------------------------------------------------------- #
def load_checkpoint(path: str | Path) -> TFTGAT:
    """Load best.pt and return a ready-to-eval TFTGAT model."""
    ckpt = torch.load(path, map_location="cpu")
    cfg = ckpt.get("config", {})
    model = TFTGAT(**cfg) if cfg else TFTGAT()
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model


def model_summary(m: TFTGAT) -> Tuple[int, int]:
    total = sum(p.numel() for p in m.parameters())
    trainable = sum(p.numel() for p in m.parameters() if p.requires_grad)
    return total, trainable


if __name__ == "__main__":
    m = TFTGAT()
    total, trainable = model_summary(m)
    print(f"TFTGAT — total params: {total:,} · trainable: {trainable:,}")
