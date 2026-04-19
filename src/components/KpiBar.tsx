import { Zap, Activity, Network, Cpu } from "lucide-react";
import type { GridForecast } from "@/lib/forecast-engine";

type Props = {
  forecast: GridForecast;
  baseline: GridForecast;
};

export const KpiBar = ({ forecast, baseline }: Props) => {
  const baseHigh = baseline.feeders.filter((f) => f.stressLevel === "high" || f.stressLevel === "critical").length;
  const curHigh = forecast.feeders.filter((f) => f.stressLevel === "high" || f.stressLevel === "critical").length;
  const delta = forecast.peakLoadMW - baseline.peakLoadMW;

  const stats = [
    {
      icon: <Zap className="w-4 h-4" />,
      label: "Peak load",
      value: `${forecast.peakLoadMW.toFixed(1)} MW`,
      sub: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} MW vs baseline`,
      tone: delta > 5 ? "warn" : delta < -5 ? "good" : "neutral",
    },
    {
      icon: <Activity className="w-4 h-4" />,
      label: "Peak hour",
      value: `${String(forecast.peakHour).padStart(2, "0")}:00`,
      sub: "evening EV + AC overlap",
      tone: "neutral" as const,
    },
    {
      icon: <Network className="w-4 h-4" />,
      label: "Stressed feeders",
      value: `${curHigh} / ${forecast.feeders.length}`,
      sub: `baseline: ${baseHigh}`,
      tone: curHigh > baseHigh ? "warn" : curHigh < baseHigh ? "good" : "neutral",
    },
    {
      icon: <Cpu className="w-4 h-4" />,
      label: "Buses monitored",
      value: "123",
      sub: "IEEE PES test feeder",
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-border bg-card/60 backdrop-blur p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-mono text-muted-foreground mb-2">
            {s.icon}{s.label}
          </div>
          <div className="text-display text-2xl font-bold"
            style={{
              color: s.tone === "warn" ? "hsl(var(--stress-high))"
                : s.tone === "good" ? "hsl(var(--nuclear))"
                : undefined,
            }}>
            {s.value}
          </div>
          <div className="text-[11px] text-muted-foreground text-mono mt-0.5">{s.sub}</div>
        </div>
      ))}
    </div>
  );
};
