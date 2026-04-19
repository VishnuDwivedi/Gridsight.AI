"""IEEE 123-bus radial topology — Python mirror of `src/lib/grid-topology.ts`.

Procedurally generates the same 123-bus tree (5 radial branches off a single
substation) so the Python training data and the JS dashboard agree on bus IDs.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class Bus:
    id: int
    x: float
    y: float
    base_load_kw: float
    ac_share: float
    ev_share: float
    zone: str


@dataclass
class Edge:
    src: int
    dst: int
    capacity_kw: float


def _seeded(seed: int):
    s = [seed]

    def step() -> float:
        s[0] = (s[0] * 1664525 + 1013904223) % 4294967296
        return s[0] / 4294967296

    return step


def build_topology() -> tuple[list[Bus], list[Edge]]:
    rand = _seeded(42)
    buses: list[Bus] = []
    edges: list[Edge] = []
    cx, cy = 500.0, 320.0
    buses.append(Bus(1, cx, cy, 0, 0, 0, "central"))

    branches = [
        (-math.pi / 2, "north", 26),
        (-math.pi / 6, "east", 24),
        (math.pi / 3, "south", 25),
        (math.pi * 5 / 6, "west", 24),
        (math.pi, "central", 23),
    ]

    next_id = 2
    for angle, zone, count in branches:
        prev = 1
        px, py = cx, cy
        for i in range(count):
            step_len = 18 + rand() * 12
            jitter = (rand() - 0.5) * 0.3
            a = angle + jitter
            nx, ny = px + math.cos(a) * step_len, py + math.sin(a) * step_len
            base = 30 + rand() * 70
            ac = 0.35 + rand() * 0.4
            ev = 0.05 + rand() * 0.20
            buses.append(Bus(next_id, nx, ny, base, ac, ev, zone))
            edges.append(Edge(prev, next_id, 800 + rand() * 600))
            prev = next_id
            px, py = nx, ny
            next_id += 1
    return buses, edges


def edge_index(edges: list[Edge]) -> list[list[int]]:
    """Return undirected PyG edge_index as [[src…], [dst…]]."""
    src, dst = [], []
    for e in edges:
        src += [e.src, e.dst]
        dst += [e.dst, e.src]
    return [src, dst]


if __name__ == "__main__":
    buses, edges = build_topology()
    print(f"buses: {len(buses)} · edges: {len(edges)}")
