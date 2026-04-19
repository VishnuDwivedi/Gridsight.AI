import { useMemo } from "react";
import { BUSES, EDGES } from "@/lib/grid-topology";
import type { GridForecast } from "@/lib/forecast-engine";

type Props = {
  forecast: GridForecast;
  hour: number;
  selectedFeeder?: string | null;
  onSelectBus?: (busId: number) => void;
};

const stressColor = (util: number) => {
  if (util > 100) return "hsl(var(--stress-critical))";
  if (util > 85) return "hsl(var(--stress-high))";
  if (util > 60) return "hsl(var(--stress-med))";
  return "hsl(var(--stress-low))";
};

export const FeederMap = ({ forecast, hour, selectedFeeder, onSelectBus }: Props) => {
  const feederByBus = useMemo(() => {
    const m = new Map<number, string>();
    forecast.feeders.forEach((f) => {
      // need bus IDs from FEEDERS topology — refetch via forecast not enough, use map
    });
    return m;
  }, [forecast]);

  // Compute per-bus utilization at this hour for coloring
  const busLoad = useMemo(() => {
    const m = new Map<number, number>();
    forecast.busForecasts.forEach((bf, id) => {
      const b = BUSES.find((x) => x.id === id);
      const cap = (b?.baseLoad ?? 1) * 1.6;
      m.set(id, (bf.hourly[hour] / cap) * 100);
    });
    return m;
  }, [forecast, hour]);

  // Map each bus to its parent feeder id for highlighting
  const busToFeeder = useMemo(() => {
    const m = new Map<number, string>();
    // Walk feeders from topology metadata stored in forecast
    forecast.feeders.forEach((f) => {
      // We have peakHour etc. but not busIds — need to import from topology.
    });
    return m;
  }, [forecast]);

  return (
    <div className="relative rounded-lg border border-border bg-card/40 backdrop-blur overflow-hidden">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <div className="text-mono text-xs uppercase tracking-widest text-muted-foreground">
          IEEE 123-Bus Feeder · Hour {String(hour).padStart(2, "0")}:00
        </div>
      </div>
      <div className="absolute top-3 right-4 z-10 flex items-center gap-3 text-mono text-[10px]">
        {[
          { label: "OK", c: "hsl(var(--stress-low))" },
          { label: "WATCH", c: "hsl(var(--stress-med))" },
          { label: "STRESS", c: "hsl(var(--stress-high))" },
          { label: "OVER", c: "hsl(var(--stress-critical))" },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.c, boxShadow: `0 0 8px ${l.c}` }} />
            <span className="text-muted-foreground">{l.label}</span>
          </span>
        ))}
      </div>

      <svg viewBox="0 0 1000 640" className="w-full h-[420px] bg-grid">
        {/* edges */}
        {EDGES.map((e, i) => {
          const a = BUSES.find((b) => b.id === e.from);
          const b = BUSES.find((bx) => bx.id === e.to);
          if (!a || !b) return null;
          const util = Math.max(busLoad.get(e.to) ?? 0, busLoad.get(e.from) ?? 0);
          const color = stressColor(util);
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={color}
              strokeWidth={util > 85 ? 2 : 1.2}
              strokeOpacity={0.55}
            />
          );
        })}
        {/* buses */}
        {BUSES.map((b) => {
          const util = busLoad.get(b.id) ?? 0;
          const color = stressColor(util);
          const isSubstation = b.id === 1;
          const r = isSubstation ? 10 : Math.min(6, 2 + b.baseLoad / 30);
          return (
            <g key={b.id} onClick={() => onSelectBus?.(b.id)} style={{ cursor: "pointer" }}>
              {util > 85 && (
                <circle cx={b.x} cy={b.y} r={r + 4} fill="none" stroke={color} strokeOpacity={0.4} className="animate-pulse-glow" />
              )}
              <circle cx={b.x} cy={b.y} r={r} fill={isSubstation ? "hsl(var(--primary))" : color}
                stroke={isSubstation ? "hsl(var(--primary-glow))" : "hsl(var(--background))"}
                strokeWidth={isSubstation ? 2 : 0.8}
              />
              {isSubstation && (
                <text x={b.x} y={b.y - 16} textAnchor="middle" fontSize="10" fill="hsl(var(--primary))" className="text-mono">
                  SUBSTATION
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
