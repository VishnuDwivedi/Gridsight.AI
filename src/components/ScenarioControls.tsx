import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Thermometer, Car, Atom } from "lucide-react";
import type { ScenarioInputs } from "@/lib/forecast-engine";

type Props = {
  value: ScenarioInputs;
  onChange: (v: ScenarioInputs) => void;
};

export const ScenarioControls = ({ value, onChange }: Props) => {
  const set = (k: keyof ScenarioInputs, v: number) => onChange({ ...value, [k]: v });

  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-5 space-y-6">
      <div>
        <h3 className="text-display text-lg font-semibold mb-1">Scenario Controls</h3>
        <p className="text-mono text-xs text-muted-foreground">Adjust stressors and watch the network respond</p>
      </div>

      {/* Heat */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Thermometer className="w-4 h-4" style={{ color: "hsl(var(--accent))" }} />
            <span>Peak temperature</span>
          </Label>
          <span className="text-mono text-sm font-semibold" style={{ color: value.peakTempF >= 115 ? "hsl(var(--stress-critical))" : value.peakTempF >= 108 ? "hsl(var(--stress-high))" : "hsl(var(--foreground))" }}>
            {value.peakTempF}°F
          </span>
        </div>
        <Slider value={[value.peakTempF]} min={95} max={122} step={1}
          onValueChange={(v) => set("peakTempF", v[0])} />
        <div className="text-mono text-[10px] text-muted-foreground flex justify-between">
          <span>Mild · 95°F</span><span>APS heat-wave threshold ~115°F</span>
        </div>
      </div>

      {/* EV growth */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Car className="w-4 h-4" style={{ color: "hsl(var(--accent))" }} />
            <span>EV adoption multiplier</span>
          </Label>
          <span className="text-mono text-sm font-semibold">{value.evGrowth.toFixed(1)}×</span>
        </div>
        <Slider value={[value.evGrowth * 10]} min={10} max={40} step={1}
          onValueChange={(v) => set("evGrowth", v[0] / 10)} />
        <div className="text-mono text-[10px] text-muted-foreground flex justify-between">
          <span>Today · 1.0×</span><span>2030 aggressive · 4.0×</span>
        </div>
      </div>

      {/* Nuclear */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Atom className="w-4 h-4 animate-pulse-glow" style={{ color: "hsl(var(--nuclear))" }} />
            <span className="text-glow-nuclear" style={{ color: "hsl(var(--nuclear))" }}>Nuclear baseload</span>
          </Label>
          <span className="text-mono text-sm font-semibold" style={{ color: "hsl(var(--nuclear))" }}>
            {value.nuclearMW} MW
          </span>
        </div>
        <Slider value={[value.nuclearMW]} min={0} max={4500} step={100}
          onValueChange={(v) => set("nuclearMW", v[0])} />
        <div className="text-mono text-[10px] text-muted-foreground flex justify-between">
          <span>Off · 0 MW</span><span>Palo Verde + SMR · 4,500 MW</span>
        </div>
      </div>
    </div>
  );
};
