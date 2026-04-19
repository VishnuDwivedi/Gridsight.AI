/**
 * Live-data fetchers for the GridSight.AI dashboard.
 *
 * THREE optional sources, all gracefully degrading and Zod-validated:
 *   1. NWS (weather.gov)         — Phoenix forecast high. NO key.
 *   2. EIA-930                   — AZPS demand (MW). Optional key.
 *   3. NREL Solar Resource v1    — Phoenix avg DNI → est. GHI. Optional key.
 *   4. /live.json                — offline cache produced by the Python repo.
 *   5. Synthetic seasonal baseline — last resort.
 *
 * SECURITY NOTE: VITE_* vars are bundled into the client; EIA + NREL keys
 * are free and per-key rate-limited so this is fine for a hackathon. For
 * production traffic, proxy through a server-side function.
 */

import {
  EiaRegionDataSchema,
  LiveJsonSchema,
  NrelSolarResourceSchema,
  NwsForecastSchema,
  safeParse,
} from "./schemas";

export type LiveData = {
  peakTempF: number;
  currentDemandMW: number | null;
  solarGHI: number | null;
  source:
    | "nws+eia+nrel"
    | "nws+eia"
    | "nws+nrel"
    | "nws-only"
    | "live.json"
    | "fallback";
  fetchedAt: string;
  note?: string;
  keysDetected: { eia: boolean; nrel: boolean };
};

const NWS_PHOENIX_POINT = "https://api.weather.gov/points/33.4484,-112.0740";
const PHOENIX_LAT = 33.4484;
const PHOENIX_LON = -112.074;

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

function readKey(...names: string[]): string | null {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  for (const n of names) {
    const v = env?.[n]?.trim();
    if (v) return v;
  }
  if (typeof window !== "undefined") {
    for (const n of names) {
      const v = window.localStorage?.getItem(n)?.trim();
      if (v) return v;
    }
  }
  return null;
}

export function getDetectedKeys(): { eia: boolean; nrel: boolean } {
  return {
    eia: !!readKey("VITE_EIA_API_KEY", "EIA_API_KEY"),
    nrel: !!readKey("VITE_NREL_API_KEY", "NREL_API_KEY"),
  };
}

async function fetchPhoenixHighF(): Promise<number | null> {
  try {
    const point = await fetch(NWS_PHOENIX_POINT, {
      headers: { "User-Agent": "GridSight.AI hackathon demo (gridsight@example.com)" },
    });
    if (!point.ok) return null;
    const pj = await point.json();
    const forecastUrl: string | undefined = pj?.properties?.forecast;
    if (!forecastUrl) return null;

    const fc = await fetch(forecastUrl, {
      headers: { "User-Agent": "GridSight.AI hackathon demo (gridsight@example.com)" },
    });
    if (!fc.ok) return null;
    const validated = safeParse(NwsForecastSchema, await fc.json());
    if (!validated) return null;
    const day = validated.properties.periods.find((p) => p.isDaytime);
    if (!day) return null;
    return day.temperatureUnit === "C" ? cToF(day.temperature) : day.temperature;
  } catch {
    return null;
  }
}

async function fetchAzpsDemandMW(): Promise<number | null> {
  const key = readKey("VITE_EIA_API_KEY", "EIA_API_KEY");
  if (!key) return null;
  try {
    const url = new URL("https://api.eia.gov/v2/electricity/rto/region-data/data/");
    url.searchParams.set("api_key", key);
    url.searchParams.append("frequency", "hourly");
    url.searchParams.append("data[0]", "value");
    url.searchParams.append("facets[respondent][]", "AZPS");
    url.searchParams.append("facets[type][]", "D");
    url.searchParams.append("sort[0][column]", "period");
    url.searchParams.append("sort[0][direction]", "desc");
    url.searchParams.append("length", "1");
    const r = await fetch(url.toString());
    if (!r.ok) return null;
    const validated = safeParse(EiaRegionDataSchema, await r.json());
    const v = validated?.response.data[0]?.value;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

async function fetchPhoenixSolarGHI(): Promise<number | null> {
  const key = readKey("VITE_NREL_API_KEY", "NREL_API_KEY");
  if (!key) return null;
  try {
    const url = new URL("https://developer.nrel.gov/api/solar/solar_resource/v1.json");
    url.searchParams.set("api_key", key);
    url.searchParams.set("lat", String(PHOENIX_LAT));
    url.searchParams.set("lon", String(PHOENIX_LON));
    const r = await fetch(url.toString());
    if (!r.ok) return null;
    const validated = safeParse(NrelSolarResourceSchema, await r.json());
    if (!validated) return null;
    const monthIdx = new Date().getMonth();
    const monthKey = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ][monthIdx];
    const avgDniDaily = validated.outputs.avg_dni.monthly[monthKey];
    if (typeof avgDniDaily !== "number") return null;
    return Math.round((avgDniDaily * 1000) / 6);
  } catch {
    return null;
  }
}

async function fetchLiveJsonFallback(): Promise<Partial<LiveData> | null> {
  try {
    const r = await fetch("/live.json", { cache: "no-cache" });
    if (!r.ok) return null;
    const validated = safeParse(LiveJsonSchema, await r.json());
    if (!validated) return null;
    const peakTempF = validated.peakTempF ?? validated.peak_temp_f ?? validated.weather?.peak_temp_f;
    const currentDemandMW = validated.currentDemandMW ?? validated.current_demand_mw ?? validated.eia?.current_demand_mw ?? null;
    const solarGHI = validated.solarGHI ?? validated.solar_ghi ?? validated.nrel?.solar_ghi ?? null;
    if (peakTempF == null && currentDemandMW == null && solarGHI == null) return null;
    return {
      peakTempF: peakTempF ?? undefined,
      currentDemandMW: currentDemandMW ?? null,
      solarGHI: solarGHI ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchLiveData(): Promise<LiveData> {
  const fetchedAt = new Date().toISOString();
  const keysDetected = getDetectedKeys();

  const [tempF, demandMW, ghi] = await Promise.all([
    fetchPhoenixHighF(),
    fetchAzpsDemandMW(),
    fetchPhoenixSolarGHI(),
  ]);

  if (tempF != null) {
    const haveEia = demandMW != null;
    const haveNrel = ghi != null;
    let source: LiveData["source"] = "nws-only";
    if (haveEia && haveNrel) source = "nws+eia+nrel";
    else if (haveEia) source = "nws+eia";
    else if (haveNrel) source = "nws+nrel";

    const parts = [`Phoenix ${tempF}°F`];
    if (haveEia && demandMW != null) parts.push(`AZPS ${Math.round(demandMW).toLocaleString()} MW`);
    if (haveNrel) parts.push(`Solar ${ghi} W/m²`);

    return {
      peakTempF: tempF,
      currentDemandMW: demandMW,
      solarGHI: ghi,
      source,
      fetchedAt,
      keysDetected,
      note: parts.join(" · "),
    };
  }

  const file = await fetchLiveJsonFallback();
  if (file && file.peakTempF != null) {
    return {
      peakTempF: file.peakTempF,
      currentDemandMW: file.currentDemandMW ?? null,
      solarGHI: file.solarGHI ?? null,
      source: "live.json",
      fetchedAt,
      keysDetected,
      note: "Cached from scripts/fetch_live.py",
    };
  }

  return {
    peakTempF: 108,
    currentDemandMW: null,
    solarGHI: null,
    source: "fallback",
    fetchedAt,
    keysDetected,
    note: "All live sources unreachable — using seasonal baseline 108°F",
  };
}
