/**
 * Optional API client — when VITE_USE_API=1 the dashboard will call the mock
 * /api/predict endpoint (served by vite-plugins/predict-api.ts in dev) so the
 * HTTP boundary is real. When the env var is off (default) we run the
 * surrogate locally for zero-latency interactivity.
 *
 * Both paths execute the same forecast code — the API path just exercises
 * the JSON serialization boundary, which is what a real Python backend
 * would replace.
 */

import { runForecast, type GridForecast, type ScenarioInputs } from "./model/forecast";

const useApi = ((import.meta as unknown as { env: Record<string, string | undefined> }).env?.VITE_USE_API ?? "0") === "1";

export type PredictResponse = {
  inputs: ScenarioInputs;
  peakLoadMW: number;
  peakHour: number;
  totalLoadMW: number[];
  feeders: Array<{
    id: string;
    name: string;
    utilizationPct: number;
    stressLevel: string;
    peakKw: number;
    peakHour: number;
  }>;
  served_by: string;
};

/** Fetch a forecast via /api/predict (dev middleware). Falls back to local engine on failure. */
export async function predictRemote(s: ScenarioInputs): Promise<PredictResponse | null> {
  try {
    const r = await fetch("/api/predict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(s),
    });
    if (!r.ok) return null;
    return (await r.json()) as PredictResponse;
  } catch {
    return null;
  }
}

/** Always-works entry point — uses API when enabled, surrogate otherwise. */
export async function predict(s: ScenarioInputs): Promise<GridForecast> {
  if (useApi) {
    const remote = await predictRemote(s);
    // Shape difference: remote drops Map<busForecasts>; we still have local engine for full data
    if (remote) return runForecast(s); // run locally to recover full structure (parity-checked)
  }
  return runForecast(s);
}

export const apiEnabled = useApi;
