/**
 * Live-data fetchers for the dashboard.
 *
 * Two sources, both with graceful fallbacks so the UI always works:
 *  1. NWS (weather.gov) — Phoenix forecast high. Public, NO API key required.
 *  2. EIA-930 — current AZ (AZPS balancing authority) electricity demand.
 *     Requires a free EIA API key. If missing, we fall back to a /live.json
 *     file (written by the Python repo's scripts/fetch_live.py) or to a
 *     synthetic baseline so the demo never breaks.
 *
 * EIA key handling:
 *   - In Lovable preview: set VITE_EIA_API_KEY in env, OR
 *   - Drop a public/live.json (produced by scripts/fetch_live.py) and we read it.
 */

export type LiveData = {
  /** Phoenix peak temperature in °F for today */
  peakTempF: number;
  /** Most recent AZPS demand in MW (EIA-930), if available */
  currentDemandMW: number | null;
  /** Where the data came from, shown in the UI */
  source: "nws+eia" | "live.json" | "nws-only" | "fallback";
  /** ISO timestamp of fetch */
  fetchedAt: string;
  /** Optional human-readable note (e.g. "Phoenix · NWS forecast high") */
  note?: string;
};

const NWS_PHOENIX_POINT = "https://api.weather.gov/points/33.4484,-112.0740";

/** Convert °C to °F, rounded to nearest int */
const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

/** Fetch today's forecast high for Phoenix from the National Weather Service.
 *  No API key required. Returns null on any failure. */
async function fetchPhoenixHighF(): Promise<number | null> {
  try {
    const point = await fetch(NWS_PHOENIX_POINT, {
      headers: { "User-Agent": "GridSight.AI hackathon demo (contact: gridsight@example.com)" },
    });
    if (!point.ok) return null;
    const pj = await point.json();
    const forecastUrl: string = pj?.properties?.forecast;
    if (!forecastUrl) return null;

    const fc = await fetch(forecastUrl, {
      headers: { "User-Agent": "GridSight.AI hackathon demo (contact: gridsight@example.com)" },
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

/** Fetch most recent AZPS demand from EIA-930. Requires VITE_EIA_API_KEY.
 *  Returns null on missing key or API failure. */
async function fetchAzpsDemandMW(): Promise<number | null> {
  const key = (import.meta.env.VITE_EIA_API_KEY as string | undefined)?.trim();
  if (!key) return null;
  try {
    const url = new URL("https://api.eia.gov/v2/electricity/rto/region-data/data/");
    url.searchParams.set("api_key", key);
    url.searchParams.append("frequency", "hourly");
    url.searchParams.append("data[0]", "value");
    url.searchParams.append("facets[respondent][]", "AZPS");
    url.searchParams.append("facets[type][]", "D"); // Demand
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

/** Try /live.json (produced by Python repo's fetch_live.py) — works fully offline. */
async function fetchLiveJsonFallback(): Promise<Partial<LiveData> | null> {
  try {
    const r = await fetch("/live.json", { cache: "no-cache" });
    if (!r.ok) return null;
    const j = await r.json();
    // Accept several shapes — flexible for the Python script's output
    const peakTempF: number | undefined =
      j.peakTempF ?? j.peak_temp_f ?? j.weather?.peak_temp_f;
    const currentDemandMW: number | undefined =
      j.currentDemandMW ?? j.current_demand_mw ?? j.eia?.current_demand_mw;
    if (peakTempF == null && currentDemandMW == null) return null;
    return {
      peakTempF: peakTempF ?? undefined,
      currentDemandMW: currentDemandMW ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchLiveData(): Promise<LiveData> {
  const fetchedAt = new Date().toISOString();

  // Try NWS + EIA in parallel
  const [tempF, demandMW] = await Promise.all([fetchPhoenixHighF(), fetchAzpsDemandMW()]);

  if (tempF != null && demandMW != null) {
    return {
      peakTempF: tempF,
      currentDemandMW: demandMW,
      source: "nws+eia",
      fetchedAt,
      note: `Phoenix ${tempF}°F · AZPS ${Math.round(demandMW).toLocaleString()} MW`,
    };
  }
  if (tempF != null) {
    return {
      peakTempF: tempF,
      currentDemandMW: null,
      source: "nws-only",
      fetchedAt,
      note: `Phoenix ${tempF}°F (NWS) · EIA key missing for live demand`,
    };
  }

  // Both APIs failed — try the offline live.json
  const file = await fetchLiveJsonFallback();
  if (file && file.peakTempF != null) {
    return {
      peakTempF: file.peakTempF,
      currentDemandMW: file.currentDemandMW ?? null,
      source: "live.json",
      fetchedAt,
      note: "Cached from scripts/fetch_live.py",
    };
  }

  // Last resort
  return {
    peakTempF: 108,
    currentDemandMW: null,
    source: "fallback",
    fetchedAt,
    note: "All live sources unreachable — using seasonal baseline 108°F",
  };
}
