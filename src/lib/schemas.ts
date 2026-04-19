/**
 * Runtime schemas (Zod) for any data crossing a trust boundary:
 *  - model_weights.json         (static asset, but still validated on load)
 *  - NWS forecast response      (external API)
 *  - EIA-930 demand response    (external API)
 *  - NREL Solar Resource resp.  (external API)
 *  - /live.json offline cache
 *
 * If validation fails we degrade gracefully — never throw into render.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Surrogate model weights                                            */
/* ------------------------------------------------------------------ */

export const ModelWeightsSchema = z.object({
  model_name: z.string(),
  version: z.string(),
  format: z.string(),
  diurnal_load_shape: z.array(z.number()).length(24),
  heat_response: z.object({
    baseline_temp_F: z.number(),
    per_degree_ac_uplift: z.number(),
    peak_hour: z.number().min(0).max(23),
    bell_sigma_hours: z.number().positive(),
    saturation_temp_F: z.number(),
  }),
  ev_response: z.object({
    evening_window: z.tuple([z.number(), z.number()]),
    peak_hour: z.number().min(0).max(23),
    bell_sigma_hours: z.number().positive(),
    off_peak_floor: z.number().min(0).max(1),
  }),
  nuclear_offset: z.object({
    max_offset_fraction: z.number().min(0).max(1),
  }),
  stress_thresholds_pct: z.object({
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    critical_above: z.number(),
  }),
  ansi_c84_1_voltage_pu: z.object({
    range_a_min: z.number(),
    range_a_max: z.number(),
    range_b_min: z.number(),
    range_b_max: z.number(),
  }),
});

export type ModelWeights = z.infer<typeof ModelWeightsSchema>;

/* ------------------------------------------------------------------ */
/*  Live API response schemas                                          */
/* ------------------------------------------------------------------ */

/** NWS /points → /forecast response (only fields we actually read). */
export const NwsForecastSchema = z.object({
  properties: z.object({
    periods: z.array(
      z.object({
        isDaytime: z.boolean(),
        temperature: z.number(),
        temperatureUnit: z.string(),
      }),
    ),
  }),
});

/** EIA-930 region-data response (only fields we use). */
export const EiaRegionDataSchema = z.object({
  response: z.object({
    data: z.array(
      z.object({
        period: z.string().optional(),
        value: z.number().nullable().optional(),
      }),
    ),
  }),
});

/** NREL Solar Resource v1 response (subset). */
export const NrelSolarResourceSchema = z.object({
  outputs: z.object({
    avg_dni: z.object({
      monthly: z.record(z.string(), z.number()),
    }),
  }),
});

/** Optional offline /live.json cache (very loose — many shapes accepted). */
export const LiveJsonSchema = z
  .object({
    peakTempF: z.number().optional(),
    peak_temp_f: z.number().optional(),
    currentDemandMW: z.number().nullable().optional(),
    current_demand_mw: z.number().nullable().optional(),
    solarGHI: z.number().nullable().optional(),
    solar_ghi: z.number().nullable().optional(),
    weather: z.object({ peak_temp_f: z.number().optional() }).partial().optional(),
    eia: z.object({ current_demand_mw: z.number().optional() }).partial().optional(),
    nrel: z.object({ solar_ghi: z.number().optional() }).partial().optional(),
  })
  .passthrough();

/** Helper — validate and return parsed value or null on failure. */
export function safeParse<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  const r = schema.safeParse(raw);
  return r.success ? r.data : null;
}
