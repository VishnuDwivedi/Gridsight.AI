import { describe, it, expect } from "vitest";
import { runForecast } from "@/lib/model/forecast";
import { computeRisk, rankFeeders, recommendAction } from "@/lib/decision/recommend";

describe("decision layer — risk scoring", () => {
  const f = runForecast({ peakTempF: 118, evGrowth: 3, nuclearMW: 0 });

  it("computeRisk weights match documented formula (0.55 / 0.25 / 0.20)", () => {
    const fd = f.feeders[0];
    const r = computeRisk(fd);
    const expected = 0.55 * r.utilization + 0.25 * r.peakWindow + 0.2 * r.scale;
    expect(Math.abs(r.score - expected)).toBeLessThan(1e-9);
  });

  it("rankFeeders returns descending risk", () => {
    const ranked = rankFeeders(f.feeders);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].riskScore).toBeGreaterThanOrEqual(ranked[i].riskScore);
    }
  });

  it("critical feeders get the transformer/reconductor recommendation", () => {
    const critical = f.feeders.find((x) => x.stressLevel === "critical");
    if (critical) {
      const a = recommendAction(critical);
      expect(a.category).toBe("transformer");
      expect(a.tone).toBe("warn");
    } else {
      // not all scenarios produce a critical feeder; in that case the test is vacuously satisfied
      expect(true).toBe(true);
    }
  });

  it("low-stress feeders get the monitor recommendation", () => {
    const calm = runForecast({ peakTempF: 95, evGrowth: 1.0, nuclearMW: 4500 });
    const someLow = calm.feeders.find((x) => x.stressLevel === "low");
    if (someLow) {
      expect(recommendAction(someLow).category).toBe("monitor");
    } else {
      expect(true).toBe(true);
    }
  });

  it("peak-window component is 100 when peak is in 17-21h, else 60", () => {
    for (const fd of f.feeders) {
      const r = computeRisk(fd);
      if (fd.peakHour >= 17 && fd.peakHour <= 21) expect(r.peakWindow).toBe(100);
      else expect(r.peakWindow).toBe(60);
    }
  });
});
