/**
 * Spatio-temporal load forecast simulator.
 *
 * This is the in-browser, deterministic stand-in for what the offline trained
 * model (GNN + temporal transformer) would produce. The Python repo scaffold
 * generated alongside this app contains the actual training pipeline.
 *
 * The synthetic forecast preserves the *shape* a real model would output:
 *  - diurnal load curve with morning/evening peaks
 *  - heat-driven AC ramp tied to per-bus AC share
 *  - EV evening peak shifting load 6-10pm
 *  - nuclear baseload reduces residual feeder demand uniformly
 */

import { BUSES, EDGES, FEEDERS, type Bus } from "./grid-topology";

export type ScenarioInputs = {
  /** °F max daily temp; 100 = baseline summer day, 118 = extreme heat */
  peakTempF: number;
  /** EV adoption multiplier 1.0 = today, 3.0 = aggressive 2030 growth */
  evGrowth: number;
  /** Nuclear baseload contribution in MW available to offset feeder demand.
   *  Palo Verde ≈ 3,937 MW total. SMR add-on 0-600 MW. */
  nuclearMW: number;
};

export const DEFAULT_SCENARIO: ScenarioInputs = {
  peakTempF: 105,
  evGrowth: 1.0,
  nuclearMW: 0,
};

/** Diurnal base load shape, normalized 0..1 across 24 hours */
const DIURNAL = [
  0.55, 0.5, 0.48, 0.47, 0.5, 0.58, 0.7, 0.78, 0.74, 0.7, 0.72, 0.78, // 0-11
  0.82, 0.85, 0.88, 0.9, 0.92, 0.94, 0.97, 1.0, 0.96, 0.88, 0.78, 0.65, // 12-23
];

/** Heat multiplier per hour — AC ramps up with afternoon temperature */
function heatProfile(hour: number, peakTempF: number) {
  const baseT = 100;
  const excess = Math.max(0, peakTempF - baseT);
  // bell curve peaking at 16:00
  const bell = Math.exp(-Math.pow((hour - 16) / 4.5, 2));
  // Each °F over 100 adds ~1.8% to AC load at the peak hour
  return 1 + (excess * 0.018) * bell;
}

/** EV charging shape — sharp evening peak 6-10pm */
function evProfile(hour: number) {
  if (hour < 17 || hour > 23) return 0.05;
  const bell = Math.exp(-Math.pow((hour - 20) / 1.6, 2));
  return 0.1 + bell * 0.9;
}

export type BusForecast = {
  busId: number;
  hourly: number[]; // kW per hour, 24 entries
  peak: number;
  peakHour: number;
};

export function forecastBus(bus: Bus, s: ScenarioInputs, totalGridLoadMW: number): BusForecast {
  const hourly: number[] = [];
  for (let h = 0; h < 24; h++) {
    const base = bus.baseLoad * DIURNAL[h];
    const ac = base * bus.acShare * (heatProfile(h, s.peakTempF) - 1);
    const ev = bus.baseLoad * bus.evShare * s.evGrowth * evProfile(h);
    let kw = base + ac + ev;

    // Nuclear offset: assume nuclear reduces residual by its share of total demand
    if (s.nuclearMW > 0 && totalGridLoadMW > 0) {
      const offsetFraction = Math.min(0.5, s.nuclearMW / totalGridLoadMW);
      // Nuclear is firm baseload — flat reduction across hours, more impact off-solar
      const flatness = 0.85 + 0.15 * (1 - Math.exp(-Math.pow((h - 4) / 8, 2))); // slightly less at solar peak
      kw *= 1 - offsetFraction * flatness;
    }

    hourly.push(Math.max(0, kw));
  }
  let peak = 0;
  let peakHour = 0;
  hourly.forEach((v, i) => { if (v > peak) { peak = v; peakHour = i; } });
  return { busId: bus.id, hourly, peak, peakHour };
}

export type FeederForecast = {
  id: string;
  name: string;
  zone: string;
  hourly: number[];        // kW summed across buses
  peakKw: number;
  peakHour: number;
  capacityKw: number;      // limiting edge thermal capacity at the root
  utilizationPct: number;  // peakKw / capacityKw * 100
  stressLevel: "low" | "med" | "high" | "critical";
  busCount: number;
  topStressBuses: number[]; // bus IDs most over their share
};

function stressBucket(util: number): FeederForecast["stressLevel"] {
  if (util < 60) return "low";
  if (util < 85) return "med";
  if (util < 100) return "high";
  return "critical";
}

export type GridForecast = {
  inputs: ScenarioInputs;
  totalLoadMW: number[];   // per hour, MW
  peakLoadMW: number;
  peakHour: number;
  feeders: FeederForecast[];
  busForecasts: Map<number, BusForecast>;
};

export function runForecast(s: ScenarioInputs): GridForecast {
  // Two-pass: first compute total grid load without nuclear to size offset
  const grossTotal = BUSES.reduce((sum, b) => {
    const bf = forecastBus(b, { ...s, nuclearMW: 0 }, 0);
    return sum + bf.peak;
  }, 0) / 1000; // MW

  const busForecasts = new Map<number, BusForecast>();
  BUSES.forEach((b) => busForecasts.set(b.id, forecastBus(b, s, grossTotal)));

  const totalLoadMW: number[] = Array(24).fill(0);
  busForecasts.forEach((bf) => {
    bf.hourly.forEach((kw, h) => { totalLoadMW[h] += kw / 1000; });
  });

  let peakLoadMW = 0;
  let peakHour = 0;
  totalLoadMW.forEach((mw, h) => { if (mw > peakLoadMW) { peakLoadMW = mw; peakHour = h; } });

  const feeders: FeederForecast[] = FEEDERS.map((f) => {
    const hourly = Array(24).fill(0);
    f.busIds.forEach((bid) => {
      const bf = busForecasts.get(bid);
      if (!bf) return;
      bf.hourly.forEach((kw, h) => { hourly[h] += kw; });
    });
    let pk = 0; let ph = 0;
    hourly.forEach((v, i) => { if (v > pk) { pk = v; ph = i; } });

    // root capacity is the trunk edge from substation
    const rootEdge = EDGES.find((e) => e.from === 1 && e.to === f.rootBus);
    const capacityKw = (rootEdge?.capacity ?? 1000) * (f.busIds.length / 25);

    const utilizationPct = (pk / capacityKw) * 100;

    // Top stress buses = highest peak / baseLoad ratio
    const ranked = [...f.busIds]
      .map((bid) => {
        const b = BUSES.find((x) => x.id === bid)!;
        const bf = busForecasts.get(bid)!;
        return { bid, ratio: bf.peak / Math.max(1, b.baseLoad) };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3)
      .map((x) => x.bid);

    return {
      id: f.id,
      name: f.name,
      zone: f.zone,
      hourly,
      peakKw: pk,
      peakHour: ph,
      capacityKw,
      utilizationPct,
      stressLevel: stressBucket(utilizationPct),
      busCount: f.busIds.length,
      topStressBuses: ranked,
    };
  });

  return { inputs: s, totalLoadMW, peakLoadMW, peakHour, feeders, busForecasts };
}

/** Recommend an intervention based on a feeder's stress profile */
export function recommendAction(f: FeederForecast): { label: string; rationale: string; tone: "primary" | "nuclear" | "warn" | "ok" } {
  if (f.stressLevel === "critical") {
    return {
      label: "Reconductor + DR enrollment",
      rationale: `Feeder is ${f.utilizationPct.toFixed(0)}% loaded at hour ${f.peakHour}:00. Upgrade trunk + enroll customers in demand response.`,
      tone: "warn",
    };
  }
  if (f.stressLevel === "high") {
    return {
      label: "Deploy battery + TOU pricing",
      rationale: `Peak ${f.peakKw.toFixed(0)} kW at ${f.peakHour}:00. 1-2 MWh battery shifts ~15% of evening peak.`,
      tone: "primary",
    };
  }
  if (f.stressLevel === "med") {
    return {
      label: "Monitor + EV managed charging",
      rationale: `Approaching ${f.utilizationPct.toFixed(0)}% utilization. Enroll new EV customers in managed charging.`,
      tone: "nuclear",
    };
  }
  return {
    label: "No action — headroom available",
    rationale: `Comfortable at ${f.utilizationPct.toFixed(0)}% peak utilization.`,
    tone: "ok",
  };
}
