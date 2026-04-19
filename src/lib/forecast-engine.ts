/**
 * Back-compat shim — the engine has been split into focused modules:
 *
 *   src/lib/features/build.ts     — scenario inputs → per-bus features
 *   src/lib/model/weights.ts      — surrogate coefficients + Zod-validated load
 *   src/lib/model/forecast.ts     — surrogate forward pass with explainability
 *   src/lib/decision/recommend.ts — risk score + ranked hardening actions
 *
 * All existing imports of `@/lib/forecast-engine` continue to work via the
 * re-exports below, so the UI keeps rendering during the refactor.
 */

export {
  runForecast,
  DEFAULT_SCENARIO,
  type ScenarioInputs,
  type GridForecast,
  type FeederForecast,
  type BusForecast,
  type HourlyComponents,
} from "./model/forecast";

export { recommendAction } from "./decision/recommend";
