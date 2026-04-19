/**
 * Decision layer.
 *
 * Converts a feeder's stress profile into:
 *   1. A composite RISK SCORE (0-100) with a documented formula.
 *   2. A ranked list of explicit hardening actions, each with a
 *      tooltip-friendly explanation a planner can show to a stakeholder.
 *
 * Risk = 0.55 * utilization + 0.25 * peak-window weight + 0.20 * scale
 *
 *   utilization     = min(100, peak_kw / capacity_kw * 100)
 *   peak-window     = 100 if peak hour ∈ [17, 21] else 60   (evening AC+EV)
 *   scale           = min(100, bus_count / 30 * 100)        (more customers
 *                                                           ⇒ bigger blast radius)
 *
 * The weights are documented in MODEL_CARD.md and are the same constants the
 * Python `gridsight-repo/scripts/rank_feeders.py` script uses.
 */

import type { FeederForecast } from "../model/forecast";

export type ActionTone = "primary" | "nuclear" | "warn" | "ok";

export type FeederAction = {
  /** Short label rendered in the table */
  label: string;
  /** One-sentence explanation — used as tooltip and rationale text */
  rationale: string;
  /** Color tone for the badge */
  tone: ActionTone;
  /** Long-form formula breakdown (rendered in tooltip) */
  formula: string;
  /** Stable tag for filtering / styling — explicit action category */
  category: "transformer" | "battery" | "demand_response" | "ev_managed" | "monitor";
};

export type FeederRiskRecommendation = {
  feederId: string;
  riskScore: number;          // 0-100
  utilizationComponent: number;
  peakWindowComponent: number;
  scaleComponent: number;
  primaryAction: FeederAction;
};

const PEAK_WINDOW_START = 17;
const PEAK_WINDOW_END = 21;

export function computeRisk(f: FeederForecast): {
  score: number;
  utilization: number;
  peakWindow: number;
  scale: number;
} {
  const utilization = Math.min(100, f.utilizationPct);
  const peakWindow =
    f.peakHour >= PEAK_WINDOW_START && f.peakHour <= PEAK_WINDOW_END ? 100 : 60;
  const scale = Math.min(100, (f.busCount / 30) * 100);
  const score = 0.55 * utilization + 0.25 * peakWindow + 0.2 * scale;
  return { score, utilization, peakWindow, scale };
}

export function recommendAction(f: FeederForecast): FeederAction {
  const formula =
    "risk = 0.55·util% + 0.25·peakWindow + 0.20·scale  (peakWindow=100 if peak ∈ 17–21h, scale=busCount/30)";

  if (f.stressLevel === "critical") {
    return {
      label: "Reconductor + DR enrollment",
      rationale: `Feeder ${f.utilizationPct.toFixed(0)}% loaded at ${String(f.peakHour).padStart(2, "0")}:00. Upgrade trunk conductor and enroll customers in demand-response.`,
      tone: "warn",
      formula,
      category: "transformer",
    };
  }
  if (f.stressLevel === "high") {
    return {
      label: "Deploy battery + TOU pricing",
      rationale: `Peak ${f.peakKw.toFixed(0)} kW at ${String(f.peakHour).padStart(2, "0")}:00. A 1–2 MWh battery + time-of-use rates can shave ~15% of the evening peak.`,
      tone: "primary",
      formula,
      category: "battery",
    };
  }
  if (f.stressLevel === "med") {
    return {
      label: "EV managed charging",
      rationale: `Approaching ${f.utilizationPct.toFixed(0)}% utilization. Enroll new EV customers in managed charging and monitor monthly.`,
      tone: "nuclear",
      formula,
      category: "ev_managed",
    };
  }
  return {
    label: "Monitor — headroom available",
    rationale: `Comfortable at ${f.utilizationPct.toFixed(0)}% peak utilization. Re-evaluate next planning cycle.`,
    tone: "ok",
    formula,
    category: "monitor",
  };
}

/** Rank all feeders by composite risk and attach the recommended action. */
export function rankFeeders(feeders: FeederForecast[]): FeederRiskRecommendation[] {
  return feeders
    .map((f) => {
      const r = computeRisk(f);
      return {
        feederId: f.id,
        riskScore: r.score,
        utilizationComponent: r.utilization,
        peakWindowComponent: r.peakWindow,
        scaleComponent: r.scale,
        primaryAction: recommendAction(f),
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}
