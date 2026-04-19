import { Atom, Zap, TrendingDown, Leaf } from "lucide-react";
import type { GridForecast } from "@/lib/forecast-engine";

type Props = {
  baseline: GridForecast;
  current: GridForecast;
};

export const NuclearImpactPanel = ({ baseline, current }: Props) => {
  const peakReduction = baseline.peakLoadMW - current.peakLoadMW;
  const pctReduction = baseline.peakLoadMW > 0 ? (peakReduction / baseline.peakLoadMW) * 100 : 0;

  // Stress feeder count delta
  const baseStressed = baseline.feeders.filter((f) => f.stressLevel === "high" || f.stressLevel === "critical").length;
  const curStressed = current.feeders.filter((f) => f.stressLevel === "high" || f.stressLevel === "critical").length;
  const stressedAvoided = Math.max(0, baseStressed - curStressed);

  // CO2: assume offset displaces natural-gas peaker @ 0.45 t CO2 / MWh
  // Nuclear runs ~24h providing s.nuclearMW continuously
  const dailyMWh = current.inputs.nuclearMW * 24;
  const co2AvoidedTons = dailyMWh * 0.45;

  const active = current.inputs.nuclearMW > 0;

  return (
    <div className={`rounded-lg border p-5 transition-all ${active ? "border-nuclear/40 glow-nuclear" : "border-border"} bg-card/60 backdrop-blur`}>
      <div className="flex items-start gap-4 mb-5">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${active ? "animate-pulse-glow" : ""}`}
          style={{ background: "hsl(var(--nuclear) / 0.15)", border: "1px solid hsl(var(--nuclear) / 0.4)" }}>
          <Atom className="w-6 h-6" style={{ color: "hsl(var(--nuclear))" }} />
        </div>
        <div className="flex-1">
          <h3 className="text-display text-lg font-semibold" style={{ color: active ? "hsl(var(--nuclear))" : undefined }}>
            Nuclear Baseload Impact
          </h3>
          <p className="text-mono text-xs text-muted-foreground">
            {active
              ? `${current.inputs.nuclearMW} MW firm capacity displacing fossil peakers`
              : "Slide the nuclear control to see grid hardening effects"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric icon={<TrendingDown className="w-4 h-4" />} label="Peak demand cut"
          value={`${peakReduction.toFixed(1)} MW`}
          sub={`${pctReduction.toFixed(1)}% lower peak`} active={active} />
        <Metric icon={<Zap className="w-4 h-4" />} label="Stressed feeders avoided"
          value={`${stressedAvoided}`}
          sub={`${baseStressed} → ${curStressed} feeders`} active={active} />
        <Metric icon={<Leaf className="w-4 h-4" />} label="CO₂ avoided / day"
          value={`${co2AvoidedTons.toFixed(0)} t`}
          sub={`${dailyMWh.toFixed(0)} MWh clean`} active={active} />
      </div>

      <div className="mt-5 pt-5 border-t border-border text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Why nuclear matters here:</strong> Palo Verde already supplies APS with ~3.9 GW of carbon-free firm power.
        Unlike solar, nuclear operates at &gt;90% capacity factor — exactly when EV evening peaks and post-sunset AC load strain feeders.
        Pairing baseload reactors with flexible <strong className="text-foreground">small modular reactors (SMRs)</strong> behind constrained
        substations can defer transmission upgrades and harden the grid against the heat-EV stress combinations the model above predicts.
      </div>
    </div>
  );
};

const Metric = ({ icon, label, value, sub, active }: { icon: React.ReactNode; label: string; value: string; sub: string; active: boolean }) => (
  <div className="rounded-md border border-border bg-background/40 p-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground text-mono mb-1">
      {icon}{label}
    </div>
    <div className="text-display text-2xl font-bold" style={{ color: active ? "hsl(var(--nuclear))" : "hsl(var(--muted-foreground))" }}>
      {value}
    </div>
    <div className="text-[10px] text-muted-foreground text-mono">{sub}</div>
  </div>
);
