import { describe, it, expect } from "vitest";
import { heatMultiplier, evShape, nuclearOffsetFraction } from "@/lib/features/build";
import { FALLBACK_WEIGHTS } from "@/lib/model/weights";

const W = FALLBACK_WEIGHTS;

describe("features — scenario transformations", () => {
  it("heatMultiplier == 1 at baseline temp regardless of hour", () => {
    for (let h = 0; h < 24; h++) {
      expect(heatMultiplier(h, W.heat_response.baseline_temp_F, W)).toBeCloseTo(1, 6);
    }
  });

  it("heatMultiplier peaks at heat_response.peak_hour", () => {
    const at16 = heatMultiplier(16, 118, W);
    const at4 = heatMultiplier(4, 118, W);
    expect(at16).toBeGreaterThan(at4);
  });

  it("evShape returns off_peak_floor outside the evening window", () => {
    expect(evShape(3, W)).toBe(W.ev_response.off_peak_floor);
    expect(evShape(10, W)).toBe(W.ev_response.off_peak_floor);
  });

  it("evShape peaks inside the evening window", () => {
    const peak = evShape(W.ev_response.peak_hour, W);
    expect(peak).toBeGreaterThan(evShape(17, W));
    expect(peak).toBeGreaterThan(evShape(23, W));
  });

  it("nuclearOffsetFraction is 0 when nuclearMW is 0", () => {
    expect(nuclearOffsetFraction(12, 0, 5000, W)).toBe(0);
  });

  it("nuclearOffsetFraction caps at max_offset_fraction", () => {
    // huge nuclear, tiny grid → would be >>0.5 but should cap
    const v = nuclearOffsetFraction(20, 100000, 1000, W);
    expect(v).toBeLessThanOrEqual(W.nuclear_offset.max_offset_fraction);
  });
});
