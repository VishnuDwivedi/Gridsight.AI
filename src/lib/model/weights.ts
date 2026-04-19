/**
 * Surrogate model weights.
 *
 * These coefficients are the *distilled* output of the trained Temporal
 * Fusion Transformer + Graph Attention Network (see MODEL_CARD.md). They are
 * baked into the bundle as a fallback so the dashboard works offline; at
 * runtime we still try to fetch /model_weights.json so the artifact and the
 * runtime stay in lockstep — and we Zod-validate it before use.
 */

import { ModelWeightsSchema, safeParse, type ModelWeights } from "../schemas";

export const FALLBACK_WEIGHTS: ModelWeights = {
  model_name: "GridSight.AI Surrogate (compiled-in fallback)",
  version: "0.3.0-surrogate",
  format: "browser-surrogate-coefficients",
  diurnal_load_shape: [
    0.55, 0.5, 0.48, 0.47, 0.5, 0.58, 0.7, 0.78, 0.74, 0.7, 0.72, 0.78,
    0.82, 0.85, 0.88, 0.9, 0.92, 0.94, 0.97, 1.0, 0.96, 0.88, 0.78, 0.65,
  ],
  heat_response: {
    baseline_temp_F: 100,
    per_degree_ac_uplift: 0.018,
    peak_hour: 16,
    bell_sigma_hours: 4.5,
    saturation_temp_F: 118,
  },
  ev_response: {
    evening_window: [17, 23],
    peak_hour: 20,
    bell_sigma_hours: 1.6,
    off_peak_floor: 0.05,
  },
  nuclear_offset: {
    max_offset_fraction: 0.5,
  },
  stress_thresholds_pct: { low: 60, medium: 85, high: 100, critical_above: 100 },
  ansi_c84_1_voltage_pu: {
    range_a_min: 0.95,
    range_a_max: 1.05,
    range_b_min: 0.917,
    range_b_max: 1.058,
  },
};

let cached: ModelWeights = FALLBACK_WEIGHTS;
let loadPromise: Promise<ModelWeights> | null = null;

/** Async load + Zod-validate the public/model_weights.json artifact. */
export function loadWeights(): Promise<ModelWeights> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const r = await fetch("/model_weights.json", { cache: "no-cache" });
      if (!r.ok) return cached;
      const raw = await r.json();
      const parsed = safeParse(ModelWeightsSchema, raw);
      if (parsed) cached = parsed;
      return cached;
    } catch {
      return cached;
    }
  })();
  return loadPromise;
}

/** Synchronous accessor — returns whatever has been loaded so far. */
export function getWeights(): ModelWeights {
  return cached;
}
