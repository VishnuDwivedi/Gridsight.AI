/**
 * IEEE 123-bus radial test feeder — simplified topology.
 * Coordinates are laid out for clean SVG rendering, not geographically accurate.
 * Source: IEEE PES Distribution Test Feeders, 123-bus case.
 */

export type Bus = {
  id: number;
  x: number;
  y: number;
  /** kW base load */
  baseLoad: number;
  /** % of load that's residential AC-dominated (heat-sensitive) */
  acShare: number;
  /** % of load expected to shift to evening EV charging */
  evShare: number;
  /** zone label for grouping */
  zone: "north" | "central" | "south" | "east" | "west";
};

export type Edge = {
  from: number;
  to: number;
  /** thermal capacity in kW */
  capacity: number;
};

// Generate a 123-bus radial tree procedurally with a deterministic seed
// so the layout matches the IEEE 123 spirit (radial branches off a substation).
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildTopology(): { buses: Bus[]; edges: Edge[] } {
  const rand = seeded(42);
  const buses: Bus[] = [];
  const edges: Edge[] = [];

  // Substation at center
  const cx = 500;
  const cy = 320;
  buses.push({ id: 1, x: cx, y: cy, baseLoad: 0, acShare: 0, evShare: 0, zone: "central" });

  // 5 main feeders radiating out at different angles
  const branches = [
    { angle: -Math.PI / 2, zone: "north" as const, count: 26 },
    { angle: -Math.PI / 6, zone: "east" as const, count: 24 },
    { angle: Math.PI / 3, zone: "south" as const, count: 25 },
    { angle: (Math.PI * 5) / 6, zone: "west" as const, count: 24 },
    { angle: Math.PI, zone: "central" as const, count: 23 },
  ];

  let nextId = 2;
  for (const br of branches) {
    let prev = 1;
    let px = cx;
    let py = cy;
    let dirA = br.angle;

    for (let i = 0; i < br.count; i++) {
      // small angle drift for organic radial branches
      dirA += (rand() - 0.5) * 0.35;
      const stepLen = 18 + rand() * 14;
      px += Math.cos(dirA) * stepLen;
      py += Math.sin(dirA) * stepLen;

      const id = nextId++;
      const acShare = 0.35 + rand() * 0.45; // 35-80% AC share
      const evShare = 0.05 + rand() * 0.25; // 5-30% EV potential
      const baseLoad = 25 + rand() * 95; // 25-120 kW per bus

      buses.push({
        id,
        x: Math.max(40, Math.min(960, px)),
        y: Math.max(40, Math.min(600, py)),
        baseLoad,
        acShare,
        evShare,
        zone: br.zone,
      });

      // Thermal capacity tapers further from substation
      const capacity = Math.max(180, 1100 - i * 32);
      edges.push({ from: prev, to: id, capacity });
      prev = id;

      // Occasionally branch a lateral
      if (rand() < 0.18 && i > 1 && nextId <= 123) {
        const lid = nextId++;
        const latA = dirA + (rand() < 0.5 ? 1 : -1) * (0.6 + rand() * 0.5);
        const lx = px + Math.cos(latA) * 22;
        const ly = py + Math.sin(latA) * 22;
        buses.push({
          id: lid,
          x: Math.max(40, Math.min(960, lx)),
          y: Math.max(40, Math.min(600, ly)),
          baseLoad: 25 + rand() * 80,
          acShare: 0.35 + rand() * 0.45,
          evShare: 0.05 + rand() * 0.25,
          zone: br.zone,
        });
        edges.push({ from: id, to: lid, capacity: Math.max(150, 700 - i * 20) });
      }
    }
  }

  return { buses: buses.slice(0, 123), edges };
}

export const { buses: BUSES, edges: EDGES } = buildTopology();

/** Aggregate buses into "feeders" by mapping each bus to its branch root. */
export const FEEDERS = (() => {
  const map = new Map<number, number[]>();
  // BFS from substation
  const adj = new Map<number, number[]>();
  EDGES.forEach((e) => {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  });

  // The 5 children of bus 1 are feeder roots
  const feederRoots = adj.get(1) || [];
  feederRoots.forEach((root) => {
    const visited = new Set<number>([1]);
    const queue = [root];
    const members: number[] = [];
    while (queue.length) {
      const n = queue.shift()!;
      if (visited.has(n)) continue;
      visited.add(n);
      members.push(n);
      (adj.get(n) || []).forEach((c) => !visited.has(c) && queue.push(c));
    }
    map.set(root, members);
  });

  return Array.from(map.entries()).map(([root, members], i) => {
    const zone = BUSES.find((b) => b.id === root)?.zone || "central";
    return {
      id: `F-${String(i + 1).padStart(2, "0")}`,
      name: `Feeder ${zone.toUpperCase()}-${i + 1}`,
      zone,
      rootBus: root,
      busIds: members,
    };
  });
})();
