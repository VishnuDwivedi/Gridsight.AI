import { recommendAction, type GridForecast } from "@/lib/forecast-engine";
import { AlertTriangle, CheckCircle2, Activity, Zap } from "lucide-react";

type Props = { forecast: GridForecast };

const stressBg = {
  low: "hsl(var(--stress-low) / 0.12)",
  med: "hsl(var(--stress-med) / 0.15)",
  high: "hsl(var(--stress-high) / 0.18)",
  critical: "hsl(var(--stress-critical) / 0.22)",
} as const;

const stressColor = {
  low: "hsl(var(--stress-low))",
  med: "hsl(var(--stress-med))",
  high: "hsl(var(--stress-high))",
  critical: "hsl(var(--stress-critical))",
} as const;

const StressIcon = ({ level }: { level: "low" | "med" | "high" | "critical" }) => {
  if (level === "low") return <CheckCircle2 className="w-4 h-4" style={{ color: stressColor.low }} />;
  if (level === "med") return <Activity className="w-4 h-4" style={{ color: stressColor.med }} />;
  if (level === "high") return <Zap className="w-4 h-4" style={{ color: stressColor.high }} />;
  return <AlertTriangle className="w-4 h-4 animate-pulse" style={{ color: stressColor.critical }} />;
};

export const DecisionTable = ({ forecast }: Props) => {
  const ranked = [...forecast.feeders].sort((a, b) => b.utilizationPct - a.utilizationPct);

  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-display text-lg font-semibold">Decision Layer · Feeder Prioritization</h3>
          <p className="text-mono text-xs text-muted-foreground">
            Ranked by stress · {ranked.filter(f => f.stressLevel === "critical" || f.stressLevel === "high").length} need attention
          </p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {ranked.map((f) => {
          const action = recommendAction(f);
          return (
            <div key={f.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-secondary/30 transition-colors"
              style={{ background: stressBg[f.stressLevel] }}>
              <div className="col-span-3 flex items-center gap-2">
                <StressIcon level={f.stressLevel} />
                <div>
                  <div className="text-mono text-sm font-semibold">{f.id}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.zone} · {f.busCount} buses</div>
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-mono text-sm" style={{ color: stressColor[f.stressLevel] }}>
                  {f.utilizationPct.toFixed(0)}%
                </div>
                <div className="text-[10px] text-muted-foreground text-mono">utilization</div>
              </div>
              <div className="col-span-2">
                <div className="text-mono text-sm">{f.peakKw.toFixed(0)} kW</div>
                <div className="text-[10px] text-muted-foreground text-mono">peak @ {String(f.peakHour).padStart(2, "0")}:00</div>
              </div>
              <div className="col-span-5">
                <div className="text-sm font-medium">{action.label}</div>
                <div className="text-[11px] text-muted-foreground">{action.rationale}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
