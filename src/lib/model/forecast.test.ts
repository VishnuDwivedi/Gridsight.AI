import { describe, it, expect } from "vitest";
import { runForecast, DEFAULT_SCENARIO } from "@/lib/model/forecast";

describe("forecast engine — surrogate", () => {
  it("returns a 24-hour profile for every feeder", () => {
    const f = runForecast(DEFAULT_SCENARIO);
    expect(f.totalLoadMW).toHaveLength(24);
    expect(f.feeders.length).toBeGreaterThan(0);
    for (const fd of f.feeders) {
      expect(fd.hourly).toHaveLength(24);
      expect(fd.components).toHaveLength(24);
    }
  });

  it("decomposes load into base + heat + ev − nuclear (sums to total within rounding)", () => {
    const f = runForecast({ peakTempF: 115, evGrowth: 2.0, nuclearMW: 0 });
    const fd = f.feeders[0];
    for (let h = 0; h < 24; h++) {
      const c = fd.components[h];
      const reconstructed = c.base + c.heat + c.ev - c.nuclearOffset;
      expect(Math.abs(reconstructed - c.total)).toBeLessThan(1e-6);
    }
  });

  it("higher peak temperature increases peak load (monotonic in heat)", () => {
    const cool = runForecast({ peakTempF: 100, evGrowth: 1, nuclearMW: 0 });
    const hot = runForecast({ peakTempF: 118, evGrowth: 1, nuclearMW: 0 });
    expect(hot.peakLoadMW).toBeGreaterThan(cool.peakLoadMW);
  });

  it("higher EV growth increases evening peak component", () => {
    const today = runForecast({ peakTempF: 105, evGrowth: 1.0, nuclearMW: 0 });
    const ev2030 = runForecast({ peakTempF: 105, evGrowth: 3.0, nuclearMW: 0 });
    const evAt19_today = today.feeders[0].components[19].ev;
    const evAt19_2030 = ev2030.feeders[0].components[19].ev;
    expect(evAt19_2030).toBeGreaterThan(evAt19_today);
  });

  it("nuclear baseload reduces peak demand", () => {
    const noNuke = runForecast({ peakTempF: 115, evGrowth: 2, nuclearMW: 0 });
    const withNuke = runForecast({ peakTempF: 115, evGrowth: 2, nuclearMW: 3000 });
    expect(withNuke.peakLoadMW).toBeLessThan(noNuke.peakLoadMW);
  });

  it("temperature saturation: above saturation_temp_F load no longer grows", () => {
    const f120 = runForecast({ peakTempF: 120, evGrowth: 1, nuclearMW: 0 });
    const f130 = runForecast({ peakTempF: 130, evGrowth: 1, nuclearMW: 0 });
    // surrogate caps temp at saturation_temp_F (118), so 130 == 120
    expect(Math.abs(f130.peakLoadMW - f120.peakLoadMW)).toBeLessThan(0.01);
  });
});
