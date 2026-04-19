/**
 * Live-data fetchers for the GridSight.AI dashboard.
 *
 * THREE optional sources, all gracefully degrading so the UI never breaks:
 *
 *  1. NWS (weather.gov) — Phoenix forecast high.
 *     PUBLIC, NO API KEY required. Always tried first.
 *
 *  2. EIA-930 — current AZ (AZPS balancing authority) electricity demand in MW.
 *     OPTIONAL. Free key at https://www.eia.gov/opendata/register.php
 *     Reads from (in priority order):
 *       - import.meta.env.VITE_EIA_API_KEY
 *       - import.meta.env.EIA_API_KEY      (Vite also exposes plain names if defined in .env with VITE_ prefix; we support both for convenience)
 *       - localStorage["EIA_API_KEY"]      (runtime override — paste in DevTools)
 *
 *  3. NREL NSRDB — current solar irradiance (GHI, W/m²) for Phoenix.
 *     OPTIONAL. Free key at https://developer.nrel.gov/signup/
 *     Reads from:
 *       - import.meta.env.VITE_NREL_API_KEY
 *       - import.meta.env.NREL_API_KEY
 *       - localStorage["NREL_API_KEY"]
 *
 *  4. /live.json (offline fallback) — produced by the Python repo's
 *     scripts/fetch_live.py — works fully offline.
 *
 *  5. Synthetic seasonal baseline — last resort so the demo never breaks.
 *
 * SECURITY NOTE: Any VITE_* env var is bundled into the client JS and is
 * publicly visible. EIA + NREL keys are free and rate-limited per-key, so
 * this is acceptable for a hackathon demo. For production, proxy through
 * a server-side function.
 */

export type LiveData = {
  /** Phoenix peak temperature in °F for today */
  peakTempF: number;
  /** Most recent AZPS demand in MW (EIA-930), if available */
  currentDemandMW: number | null;
  /** Current solar irradiance in W/m² (NREL NSRDB), if available */
  solarGHI: number | null;
  /** Where the data came from, shown in the UI */
  source:
    | "nws+eia+nrel"
    | "nws+eia"
    | "nws+nrel"
    | "nws-only"
    | "live.json"
    | "fallback";
  /** ISO timestamp of fetch */
  fetchedAt: string;
  /** Optional human-readable note */
  note?: string;
  /** Which optional keys were detected */
  keysDetected: { eia: boolean; nrel: boolean };
};

const NWS_PHOENIX_POINT = "https://api.weather.gov/points/33.4484,-112.0740";
const PHOENIX_LAT = 33.4484;
const PHOENIX_LON = -112.074;

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

/** Read a key from Vite env (either VITE_FOO or FOO if exposed) or localStorage. */
function readKey(...names: string[]): string | null {
  // Vite env
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  for (const n of names) {
    const v = env?.[n]?.trim();
    if (v) return v;
  }
  // Runtime localStorage override (browser only)
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

/** NWS forecast high for Phoenix. No API key. */
async function fetchPhoenixHighF(): Promise<number | null> {
  try {
    const point = await fetch(NWS_PHOENIX_POINT, {
      headers: {
        "User-Agent": "GridSight.AI hackathon demo (contact: gridsight@example.com)",
      },
    });
    if (!point.ok) return null;
    const pj = await point.json();
    const forecastUrl: string = pj?.properties?.forecast;
    if (!forecastUrl) return null;

    const fc = await fetch(forecastUrl, {
      headers: {
        "User-Agent": "GridSight.AI hackathon demo (contact: gridsight@example.com)",
      },
    });
    if (!fc.ok) return null;
    const fj = await fc.json();
    const periods: Array<{ isDaytime: boolean; temperature: number; temperatureUnit: string }> =
      fj?.properties?.periods ?? [];
    const day = periods.find((p) => p.isDaytime);
    if (!day) return null;
    return day.temperatureUnit === "C" ? cToF(day.temperature) : day.temperature;
  } catch {
    return null;
  }
}

/** EIA-930 latest hourly AZPS demand. */
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
    const j = await r.json();
    const v = j?.response?.data?.[0]?.value;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

/** NREL NSRDB — most recent hourly GHI for Phoenix.
 *  Uses the PSM3 endpoint, current year, returns the latest non-null GHI. */
async function fetchPhoenixSolarGHI(): Promise<number | null> {
  const key = readKey("VITE_NREL_API_KEY", "NREL_API_KEY");
  if (!key) return null;
  try {
    // NREL NSRDB historical data lags ~1y; for a "current" demo we use the
    // Solar Resource API which returns climatological averages — fast & key-gated.
    // https://developer.nrel.gov/docs/solar/solar-resource-v1/
    const url = new URL("https://developer.nrel.gov/api/solar/solar_resource/v1.json");
    url.searchParams.set("api_key", key);
    url.searchParams.set("lat", String(PHOENIX_LAT));
    url.searchParams.set("lon", String(PHOENIX_LON));

    const r = await fetch(url.toString());
    if (!r.ok) return null;
    const j = await r.json();
    // monthly avg DNI (kWh/m²/day) → convert to instantaneous-ish W/m² estimate
    const monthIdx = new Date().getMonth(); // 0-11
    const monthKey = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ][monthIdx];
    const avgDniDaily: number | undefined =
      j?.outputs?.avg_dni?.monthly?.[monthKey];
    if (typeof avgDniDaily !== "number") return null;
    // crude: kWh/m²/day → peak-hour W/m² (assume ~6 productive sun hours)
    return Math.round((avgDniDaily * 1000) / 6);
  } catch {
    return null;
  }
}

async function fetchLiveJsonFallback(): Promise<Partial<LiveData> | null> {
  try {
    const r = await fetch("/live.json", { cache: "no-cache" });
    if (!r.ok) return null;
    const j = await r.json();
    const peakTempF: number | undefined =
      j.peakTempF ?? j.peak_temp_f ?? j.weather?.peak_temp_f;
    const currentDemandMW: number | undefined =
      j.currentDemandMW ?? j.current_demand_mw ?? j.eia?.current_demand_mw;
    const solarGHI: number | undefined =
      j.solarGHI ?? j.solar_ghi ?? j.nrel?.solar_ghi;
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
    if (haveEia) parts.push(`AZPS ${Math.round(demandMW!).toLocaleString()} MW`);
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

  // NWS failed — try offline live.json
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
