import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Atom, Github, Activity, Zap } from "lucide-react";
import { runForecast, DEFAULT_SCENARIO, type ScenarioInputs } from "@/lib/forecast-engine";
import { ScenarioControls } from "@/components/ScenarioControls";
import { FeederMap } from "@/components/FeederMap";
import { LoadForecastChart } from "@/components/LoadForecastChart";
import { DecisionTable } from "@/components/DecisionTable";
import { NuclearImpactPanel } from "@/components/NuclearImpactPanel";
import { KpiBar } from "@/components/KpiBar";
import { ValidationPanel } from "@/components/ValidationPanel";
import { LiveDataButton } from "@/components/LiveDataButton";
import type { LiveData } from "@/lib/live-data";

const Index = () => {
  const [scenario, setScenario] = useState<ScenarioInputs>(DEFAULT_SCENARIO);
  const [hour, setHour] = useState(19); // evening peak

  const baseline = useMemo(() => runForecast(DEFAULT_SCENARIO), []);
  const current = useMemo(() => runForecast(scenario), [scenario]);

  const presets: { label: string; s: ScenarioInputs; tone: string }[] = [
    { label: "Today", s: { peakTempF: 105, evGrowth: 1.0, nuclearMW: 0 }, tone: "muted" },
    { label: "Heat wave", s: { peakTempF: 118, evGrowth: 1.2, nuclearMW: 0 }, tone: "accent" },
    { label: "2030 EV peak", s: { peakTempF: 110, evGrowth: 3.0, nuclearMW: 0 }, tone: "accent" },
    { label: "Heat + EV + Nuclear", s: { peakTempF: 118, evGrowth: 3.0, nuclearMW: 3000 }, tone: "nuclear" },
  ];

  return (
    <div className="min-h-screen text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-20">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center glow-primary"
              style={{ background: "var(--gradient-primary)" }}>
              <Activity className="w-5 h-5" style={{ color: "hsl(var(--primary-foreground))" }} />
            </div>
            <div>
              <div className="text-display font-bold text-lg leading-tight">GridSight<span style={{ color: "hsl(var(--primary))" }}>.AI</span></div>
              <div className="text-mono text-[10px] text-muted-foreground uppercase tracking-widest">APS Spatio-Temporal Forecast Layer</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#nuclear" className="hidden md:flex items-center gap-1.5 text-mono text-xs text-muted-foreground hover:text-nuclear transition-colors">
              <Atom className="w-3.5 h-3.5" /> Nuclear angle
            </a>
            <Button variant="outline" size="sm" className="text-mono text-xs">
              <Github className="w-3.5 h-3.5 mr-1.5" /> Repo
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container pt-12 pb-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5 text-mono text-[11px]"
            style={{ background: "hsl(var(--primary) / 0.1)", border: "1px solid hsl(var(--primary) / 0.3)", color: "hsl(var(--primary))" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: "hsl(var(--primary))" }} />
            ASU ENERGY HACKATHON · APS CHALLENGE
          </div>
          <h1 className="text-display text-4xl md:text-5xl font-bold leading-tight mb-4">
            Forecast feeder stress before it<br />
            <span className="text-glow-primary" style={{ color: "hsl(var(--primary))" }}>strands a customer in 118° heat.</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            A spatio-temporal AI proof-of-concept on the IEEE 123-bus feeder. Combine extreme heat,
            EV evening peak growth, and <span style={{ color: "hsl(var(--nuclear))" }} className="font-medium">nuclear baseload</span> from
            Palo Verde and SMRs — then see exactly which feeders to harden first.
          </p>
        </div>
      </section>

      {/* Presets */}
      <section className="container pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground mr-2">Try a scenario:</span>
          {presets.map((p) => (
            <button key={p.label}
              onClick={() => setScenario(p.s)}
              className="text-mono text-xs px-3 py-1.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary hover:border-primary/50 transition-all">
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* KPI bar */}
      <section className="container pb-6">
        <KpiBar forecast={current} baseline={baseline} />
      </section>

      {/* Main grid */}
      <section className="container pb-8 grid lg:grid-cols-[320px_1fr] gap-5">
        <div className="space-y-5">
          <ScenarioControls value={scenario} onChange={setScenario} />
          <LiveDataButton
            onApply={(d: LiveData) => setScenario((s) => ({ ...s, peakTempF: d.peakTempF }))}
          />
          <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-mono text-xs uppercase tracking-widest text-muted-foreground">Inspect hour</div>
              <div className="text-mono text-sm font-semibold">{String(hour).padStart(2, "0")}:00</div>
            </div>
            <Slider value={[hour]} min={0} max={23} step={1} onValueChange={(v) => setHour(v[0])} />
          </div>
        </div>
        <div className="space-y-5">
          <FeederMap forecast={current} hour={hour} />
          <LoadForecastChart baseline={baseline} current={current} hour={hour} />
        </div>
      </section>

      {/* Decision layer */}
      <section className="container pb-10">
        <DecisionTable forecast={current} />
      </section>

      {/* OpenDSS physics validation */}
      <section className="container pb-10">
        <ValidationPanel forecast={current} />
      </section>

      {/* Nuclear */}
      <section id="nuclear" className="container pb-16">
        <NuclearImpactPanel baseline={baseline} current={current} />
      </section>

      {/* Architecture / repo */}
      <section className="container pb-16 grid md:grid-cols-3 gap-4">
        {[
          { icon: <Activity className="w-5 h-5" />, title: "Temporal model", body: "LSTM / Temporal Fusion Transformer per feeder, 24-hour horizon, trained on Pecan Street + NSRDB irradiance + NOAA weather." },
          { icon: <Zap className="w-5 h-5" />, title: "Spatial GNN", body: "Graph attention over the 123-bus topology so neighboring feeder stress propagates into the forecast." },
          { icon: <Atom className="w-5 h-5" />, title: "Decision layer", body: "OpenDSS power-flow validates AI forecasts against thermal limits; recommendations ranked by unserved-energy risk." },
        ].map((c) => (
          <div key={c.title} className="rounded-lg border border-border bg-card/60 backdrop-blur p-5">
            <div className="w-10 h-10 rounded-md flex items-center justify-center mb-3"
              style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
              {c.icon}
            </div>
            <h4 className="text-display font-semibold mb-1.5">{c.title}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-6">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-2 text-mono text-[11px] text-muted-foreground">
          <div>GridSight.AI · proof-of-concept · IEEE 123-bus · synthetic load + scenario engine</div>
          <div>Built for the ASU Energy Hackathon · APS challenge</div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
