/**
 * Forecast engine — surrogate forward pass over the IEEE 123-bus topology.
 *
 *   inputs (heat/EV/nuclear) → feature builder → surrogate → per-bus 24h kW
 *
 * The surrogate is a deterministic, distilled approximation of the trained
 * TFT + GAT model documented in MODEL_CARD.md. It runs in <1 ms so the UI
 * stays at 60fps as the user drags sliders.
 *
 * Every load value is decomposed into four explainable components:
 *   load(h) = (base + heat + ev) * (1 - nuclearOffset)
 */

import { BUSES, EDGES, FEEDERS, type Bus } from "../grid-topology";
import { buildBusFeatures, type ScenarioInputs } from "../features/build";
import { getWeights } from "./weights";

export type { ScenarioInputs } from "../features/build";
export { DEFAULT_SCENARIO } from "../features/build";

/** Per-hour decomposition for one bus — what the explain panel shows. */
export type HourlyComponents = {
  base: number;       // diurnal-shaped base load (kW)
  heat: number;       // additional kW from AC ramp at peakTempF
  ev: number;         // additional kW from EV evening charging
  nuclearOffset: number; // kW SUBTRACTED by nuclear baseload (positive number)
  total: number;      // base + heat + ev - nuclearOffset, floored at 0
};

export type BusForecast = {
  busId: number;
  hourly: number[];           // total kW per hour (24)
  components: HourlyComponents[]; // per-hour decomposition (24)
  peak: number;
  peakHour: number;
};

function forecastBus(
  bus: Bus,
  s: ScenarioInputs,
  totalGridLoadMW: number,
): BusForecast {
  const w = getWeights();
  const features = buildBusFeatures(bus, s, w.diurnal_load_shape, w, totalGridLoadMW);

  const hourly: number[] = [];
  const components: HourlyComponents[] = [];

  for (const f of features) {
    const base = f.baseLoadKw;
    // AC heat uplift only applies to the residential AC-share portion of base load
    const heat = base * bus.acShare * (f.heatMult - 1);
    const ev = bus.baseLoad * f.evShareFactor;
    const gross = base + heat + ev;
    const nuclearOffset = gross * f.nuclearOffset;
    const total = Math.max(0, gross - nuclearOffset);

    hourly.push(total);
    components.push({ base, heat, ev, nuclearOffset, total });
  }

  let peak = 0;
  let peakHour = 0;
  hourly.forEach((v, i) => { if (v > peak) { peak = v; peakHour = i; } });
  return { busId: bus.id, hourly, components, peak, peakHour };
}

export type FeederForecast = {
  id: string;
  name: string;
  zone: string;
  hourly: number[];
  /** Per-hour decomposition aggregated across the feeder's buses. */
  components: HourlyComponents[];
  peakKw: number;
  peakHour: number;
  capacityKw: number;
  utilizationPct: number;
  stressLevel: "low" | "med" | "high" | "critical";
  busCount: number;
  topStressBuses: number[];
};

function stressBucket(util: number): FeederForecast["stressLevel"] {
  const w = getWeights().stress_thresholds_pct;
  if (util < w.low) return "low";
  if (util < w.medium) return "med";
  if (util < w.high) return "high";
  return "critical";
}

export type GridForecast = {
  inputs: ScenarioInputs;
  totalLoadMW: number[];
  peakLoadMW: number;
  peakHour: number;
  feeders: FeederForecast[];
  busForecasts: Map<number, BusForecast>;
};

export function runForecast(s: ScenarioInputs): GridForecast {
  // Pass 1: gross peak (no nuclear) so we can size the offset fraction.
  const grossTotalMW =
    BUSES.reduce((sum, b) => {
      const bf = forecastBus(b, { ...s, nuclearMW: 0 }, 0);
      return sum + bf.peak;
    }, 0) / 1000;

  // Pass 2: full forecast with nuclear sizing.
  const busForecasts = new Map<number, BusForecast>();
  BUSES.forEach((b) => busForecasts.set(b.id, forecastBus(b, s, grossTotalMW)));

  const totalLoadMW: number[] = Array(24).fill(0);
  busForecasts.forEach((bf) => {
    bf.hourly.forEach((kw, h) => { totalLoadMW[h] += kw / 1000; });
  });

  let peakLoadMW = 0;
  let peakHour = 0;
  totalLoadMW.forEach((mw, h) => { if (mw > peakLoadMW) { peakLoadMW = mw; peakHour = h; } });

  const feeders: FeederForecast[] = FEEDERS.map((f) => {
    const hourly = Array(24).fill(0);
    const components: HourlyComponents[] = Array.from({ length: 24 }, () => ({
      base: 0, heat: 0, ev: 0, nuclearOffset: 0, total: 0,
    }));

    f.busIds.forEach((bid) => {
      const bf = busForecasts.get(bid);
      if (!bf) return;
      bf.hourly.forEach((kw, h) => { hourly[h] += kw; });
      bf.components.forEach((c, h) => {
        components[h].base += c.base;
        components[h].heat += c.heat;
        components[h].ev += c.ev;
        components[h].nuclearOffset += c.nuclearOffset;
        components[h].total += c.total;
      });
    });

    let pk = 0; let ph = 0;
    hourly.forEach((v, i) => { if (v > pk) { pk = v; ph = i; } });

    const rootEdge = EDGES.find((e) => e.from === 1 && e.to === f.rootBus);
    const capacityKw = (rootEdge?.capacity ?? 1000) * (f.busIds.length / 25);
    const utilizationPct = (pk / capacityKw) * 100;

    const ranked = [...f.busIds]
      .map((bid) => {
        const b = BUSES.find((x) => x.id === bid);
        const bf = busForecasts.get(bid);
        if (!b || !bf) return null;
        return { bid, ratio: bf.peak / Math.max(1, b.baseLoad) };
      })
      .filter((x): x is { bid: number; ratio: number } => x !== null)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3)
      .map((x) => x.bid);

    return {
      id: f.id,
      name: f.name,
      zone: f.zone,
      hourly,
      components,
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
