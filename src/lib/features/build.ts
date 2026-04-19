/**
 * Feature builder.
 *
 * Converts user-facing scenario inputs (heat / EV / nuclear) plus a bus's
 * static attributes into the per-hour feature vector the surrogate consumes.
 *
 * Keeping this isolated from the model lets us unit-test inputs → features
 * separately from features → load.
 */

import type { Bus } from "../grid-topology";
import type { ModelWeights } from "../schemas";

export type ScenarioInputs = {
  /** °F max daily temp; 100 = baseline summer day, 118 = extreme heat */
  peakTempF: number;
  /** EV adoption multiplier (1.0 = today, 3.0 = aggressive 2030) */
  evGrowth: number;
  /** Nuclear baseload contribution in MW available to offset feeder demand */
  nuclearMW: number;
};

export const DEFAULT_SCENARIO: ScenarioInputs = {
  peakTempF: 105,
  evGrowth: 1.0,
  nuclearMW: 0,
};

/** Heat multiplier per hour — AC ramps up with afternoon temperature. */
export function heatMultiplier(hour: number, peakTempF: number, w: ModelWeights): number {
  const cappedTemp = Math.min(peakTempF, w.heat_response.saturation_temp_F);
  const excess = Math.max(0, cappedTemp - w.heat_response.baseline_temp_F);
  const sigma = w.heat_response.bell_sigma_hours;
  const bell = Math.exp(-Math.pow((hour - w.heat_response.peak_hour) / sigma, 2));
  return 1 + excess * w.heat_response.per_degree_ac_uplift * bell;
}

/** EV charging shape — sharp evening peak. Returns 0..1 normalized factor. */
export function evShape(hour: number, w: ModelWeights): number {
  const [start, end] = w.ev_response.evening_window;
  if (hour < start || hour > end) return w.ev_response.off_peak_floor;
  const sigma = w.ev_response.bell_sigma_hours;
  const bell = Math.exp(-Math.pow((hour - w.ev_response.peak_hour) / sigma, 2));
  return 0.1 + bell * 0.9;
}

/** Nuclear offset fraction at a given hour (slightly less during solar peak). */
export function nuclearOffsetFraction(
  hour: number,
  nuclearMW: number,
  totalGridLoadMW: number,
  w: ModelWeights,
): number {
  if (nuclearMW <= 0 || totalGridLoadMW <= 0) return 0;
  const raw = Math.min(w.nuclear_offset.max_offset_fraction, nuclearMW / totalGridLoadMW);
  // Slightly less impact during solar production peak (h ≈ 12)
  const flatness = 0.85 + 0.15 * (1 - Math.exp(-Math.pow((hour - 4) / 8, 2)));
  return raw * flatness;
}

/** Per-hour feature vector for one bus — the surrogate's input shape. */
export type HourlyFeatures = {
  hour: number;
  baseLoadKw: number;          // bus.baseLoad * diurnal[hour]
  heatMult: number;            // 1 + AC uplift
  evShareFactor: number;       // bus.evShare * scenario.evGrowth * evShape(hour)
  nuclearOffset: number;       // 0..1 fraction subtracted at the end
};

export function buildBusFeatures(
  bus: Bus,
  scenario: ScenarioInputs,
  diurnal: number[],
  w: ModelWeights,
  totalGridLoadMW: number,
): HourlyFeatures[] {
  const out: HourlyFeatures[] = [];
  for (let h = 0; h < 24; h++) {
    out.push({
      hour: h,
      baseLoadKw: bus.baseLoad * diurnal[h],
      heatMult: heatMultiplier(h, scenario.peakTempF, w),
      evShareFactor: bus.evShare * scenario.evGrowth * evShape(h, w),
      nuclearOffset: nuclearOffsetFraction(h, scenario.nuclearMW, totalGridLoadMW, w),
    });
  }
  return out;
}
