import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";
import type { GridForecast } from "@/lib/forecast-engine";

type Props = {
  baseline: GridForecast;
  current: GridForecast;
  hour: number;
};

export const LoadForecastChart = ({ baseline, current, hour }: Props) => {
  const data = baseline.totalLoadMW.map((mw, h) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    h,
    baseline: Number(mw.toFixed(1)),
    current: Number(current.totalLoadMW[h].toFixed(1)),
    nuclear: current.inputs.nuclearMW > 0
      ? Number((baseline.totalLoadMW[h] - current.totalLoadMW[h]).toFixed(1))
      : 0,
  }));

  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-display text-lg font-semibold">24-hour Load Forecast</h3>
          <p className="text-mono text-xs text-muted-foreground">
            Aggregated across all 123 buses · Peak {current.peakLoadMW.toFixed(1)} MW @ {String(current.peakHour).padStart(2, "0")}:00
          </p>
        </div>
        <div className="flex gap-3 text-mono text-[10px]">
          <Legend color="hsl(var(--muted-foreground))" label="BASELINE" />
          <Legend color="hsl(var(--primary))" label="SCENARIO" />
          {current.inputs.nuclearMW > 0 && <Legend color="hsl(var(--nuclear))" label="NUCLEAR OFFSET" />}
        </div>
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPrimary" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradNuclear" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--nuclear))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--nuclear))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} fontFamily="JetBrains Mono" interval={2} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} fontFamily="JetBrains Mono" unit=" MW" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontFamily: "JetBrains Mono",
                fontSize: 11,
              }}
            />
            <ReferenceLine x={`${String(hour).padStart(2, "0")}:00`} stroke="hsl(var(--primary-glow))" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="baseline" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            <Area type="monotone" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradPrimary)" />
            {current.inputs.nuclearMW > 0 && (
              <Area type="monotone" dataKey="nuclear" stroke="hsl(var(--nuclear))" strokeWidth={1.5} fill="url(#gradNuclear)" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5 text-muted-foreground">
    <span className="w-3 h-0.5" style={{ background: color }} />
    {label}
  </span>
);
