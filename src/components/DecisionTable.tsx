import { useState } from "react";
import { AlertTriangle, CheckCircle2, Activity, Zap, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GridForecast } from "@/lib/forecast-engine";
import { computeRisk, recommendAction } from "@/lib/decision/recommend";

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
  const [filter, setFilter] = useState<"all" | "transformer" | "battery" | "ev_managed" | "monitor">("all");

  const ranked = [...forecast.feeders]
    .map((f) => ({ feeder: f, risk: computeRisk(f), action: recommendAction(f) }))
    .sort((a, b) => b.risk.score - a.risk.score);

  const visible = ranked.filter((r) => filter === "all" || r.action.category === filter);
  const needAttention = ranked.filter((r) => r.feeder.stressLevel === "critical" || r.feeder.stressLevel === "high").length;

  const filters: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "transformer", label: "Transformer" },
    { key: "battery", label: "Battery" },
    { key: "ev_managed", label: "EV managed" },
    { key: "monitor", label: "Monitor" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg border border-border bg-card/60 backdrop-blur overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-display text-lg font-semibold">Decision Layer · Feeder Hardening Plan</h3>
            <p className="text-mono text-xs text-muted-foreground">
              Ranked by composite risk score · {needAttention} need attention
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="text-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded border transition-colors"
                style={{
                  borderColor: filter === f.key ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))",
                  background: filter === f.key ? "hsl(var(--primary) / 0.1)" : "transparent",
                  color: filter === f.key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border">
          {visible.map(({ feeder: f, risk, action }) => (
            <div
              key={f.id}
              className="px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-secondary/30 transition-colors"
              style={{ background: stressBg[f.stressLevel] }}
            >
              <div className="col-span-3 flex items-center gap-2">
                <StressIcon level={f.stressLevel} />
                <div>
                  <div className="text-mono text-sm font-semibold">{f.id}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.zone} · {f.busCount} buses</div>
                </div>
              </div>

              <div className="col-span-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help inline-flex items-center gap-1">
                      <span className="text-mono text-sm font-bold" style={{ color: stressColor[f.stressLevel] }}>
                        {risk.score.toFixed(0)}
                      </span>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-mono text-[10px] leading-relaxed">
                    <div className="font-semibold mb-1">Risk score breakdown</div>
                    <div>0.55 × util ({risk.utilization.toFixed(0)})</div>
                    <div>+ 0.25 × peakWindow ({risk.peakWindow})</div>
                    <div>+ 0.20 × scale ({risk.scale.toFixed(0)})</div>
                    <div className="mt-1 pt-1 border-t border-border">= {risk.score.toFixed(1)}</div>
                  </TooltipContent>
                </Tooltip>
                <div className="text-[10px] text-muted-foreground text-mono">risk · {f.utilizationPct.toFixed(0)}% util</div>
              </div>

              <div className="col-span-2">
                <div className="text-mono text-sm">{f.peakKw.toFixed(0)} kW</div>
                <div className="text-[10px] text-muted-foreground text-mono">peak @ {String(f.peakHour).padStart(2, "0")}:00</div>
              </div>

              <div className="col-span-5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      <div className="text-sm font-medium inline-flex items-center gap-1.5">
                        {action.label}
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <div className="text-[11px] text-muted-foreground">{action.rationale}</div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[320px] text-mono text-[10px] leading-relaxed">
                    <div className="font-semibold mb-1 uppercase tracking-wider">Why this action</div>
                    <div className="mb-2">{action.rationale}</div>
                    <div className="font-semibold mb-1 uppercase tracking-wider">Risk formula</div>
                    <div>{action.formula}</div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="px-5 py-8 text-center text-mono text-xs text-muted-foreground">
              No feeders match the <span className="text-foreground">{filter}</span> filter.
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
