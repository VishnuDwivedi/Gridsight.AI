/**
 * Vite dev middleware — exposes a mock /api/predict endpoint that wraps the
 * same forecast engine the browser uses. This makes the system architecture
 * legible (HTTP boundary visible) without spinning up a separate server
 * process or breaking `npm run dev`.
 *
 * Frontend can opt-in via `VITE_USE_API=1` (handled in src/lib/api-client.ts).
 *
 * In production builds this middleware is not loaded.
 */

import type { Plugin, ViteDevServer } from "vite";

type ScenarioInputs = {
  peakTempF: number;
  evGrowth: number;
  nuclearMW: number;
};

function isScenario(x: unknown): x is ScenarioInputs {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.peakTempF === "number" &&
    typeof o.evGrowth === "number" &&
    typeof o.nuclearMW === "number"
  );
}

export function predictApiPlugin(): Plugin {
  return {
    name: "gridsight-predict-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/predict", async (req, res, next) => {
        if (req.method !== "POST" && req.method !== "GET") return next();
        try {
          let payload: unknown = {};
          if (req.method === "POST") {
            const chunks: Buffer[] = [];
            for await (const c of req as AsyncIterable<Buffer>) chunks.push(c);
            const body = Buffer.concat(chunks).toString("utf8") || "{}";
            payload = JSON.parse(body);
          } else {
            const url = new URL(req.url ?? "/api/predict", "http://localhost");
            payload = {
              peakTempF: Number(url.searchParams.get("peakTempF") ?? 105),
              evGrowth: Number(url.searchParams.get("evGrowth") ?? 1.0),
              nuclearMW: Number(url.searchParams.get("nuclearMW") ?? 0),
            };
          }
          if (!isScenario(payload)) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "Invalid scenario inputs", expected: { peakTempF: "number", evGrowth: "number", nuclearMW: "number" } }));
            return;
          }

          // Dynamic import keeps Vite's HMR happy and avoids bundling the
          // engine into the dev-server boot path.
          const mod = await server.ssrLoadModule("/src/lib/model/forecast.ts");
          const { runForecast } = mod as { runForecast: (s: ScenarioInputs) => unknown };
          const forecast = runForecast(payload) as {
            peakLoadMW: number;
            peakHour: number;
            totalLoadMW: number[];
            feeders: Array<{ id: string; name: string; utilizationPct: number; stressLevel: string; peakKw: number; peakHour: number }>;
          };

          // Drop the Map (not serializable) and return a clean JSON shape
          const compact = {
            inputs: payload,
            peakLoadMW: forecast.peakLoadMW,
            peakHour: forecast.peakHour,
            totalLoadMW: forecast.totalLoadMW,
            feeders: forecast.feeders.map((f) => ({
              id: f.id,
              name: f.name,
              utilizationPct: f.utilizationPct,
              stressLevel: f.stressLevel,
              peakKw: f.peakKw,
              peakHour: f.peakHour,
            })),
            served_by: "vite-dev-middleware (surrogate)",
            note: "In production this would forward to the Python /predict service running the trained TFT + GAT.",
          };

          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(compact));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}
