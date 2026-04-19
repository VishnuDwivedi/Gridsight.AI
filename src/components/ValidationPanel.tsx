import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, Zap, FileJson } from "lucide-react";
import type { GridForecast } from "@/lib/forecast-engine";

type Verdict = "PASS" | "RANGE_A_VIOLATION" | "RANGE_B_VIOLATION";

type FeederValidation = {
  feeder_id: string;
  feeder_name: string;
  utilization_pct: number;
  worst_bus: number;
  worst_voltage_pu: number;
  verdict: Verdict;
  notes: string;
};

type ValidationFile = {
  generated_at: string;
  scenario?: { peakTempF: number; evGrowth: number; nuclearMW: number };
  ansi_standard: string;
  limits: { range_a: { min_pu: number; max_pu: number }; range_b: { min_pu: number; max_pu: number } };
  feeders: FeederValidation[];
};

type Props = { forecast: GridForecast };

/** Synthesize a verdict from current forecast when no opendss_validation.json is present.
 *  Approximates voltage drop as 1.0 - 0.0011 * utilizationPct (calibrated from IEEE-123 runs). */
function synthesizeFromForecast(forecast: GridForecast): ValidationFile {
  const top5 = [...forecast.feeders]
    .sort((a, b) => b.utilizationPct - a.utilizationPct)
    .slice(0, 5);

  return {
    generated_at: new Date().toISOString(),
    scenario: forecast.inputs,
    ansi_standard: "C84.1-2020 (synthetic estimate — run scripts/validate_opendss.py for ground truth)",
    limits: { range_a: { min_pu: 0.95, max_pu: 1.05 }, range_b: { min_pu: 0.917, max_pu: 1.058 } },
    feeders: top5.map((f) => {
      const v = Math.max(0.85, 1.0 - 0.0011 * f.utilizationPct);
      let verdict: Verdict = "PASS";
      if (v < 0.917) verdict = "RANGE_B_VIOLATION";
      else if (v < 0.95) verdict = "RANGE_A_VIOLATION";
      return {
        feeder_id: f.id,
        feeder_name: f.name,
        utilization_pct: Math.round(f.utilizationPct),
        worst_bus: f.topStressBuses[0] ?? 0,
        worst_voltage_pu: Number(v.toFixed(3)),
        verdict,
        notes:
          verdict === "RANGE_B_VIOLATION"
            ? "Voltage collapse risk — reconductor + DR required."
            : verdict === "RANGE_A_VIOLATION"
            ? "Below ANSI Range A — deploy battery or DR."
            : "Within ANSI Range A.",
      };
    }),
  };
}

const verdictMeta: Record<Verdict, { label: string; tone: string; icon: JSX.Element }> = {
  PASS: {
    label: "PASS",
    tone: "hsl(var(--nuclear))",
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
  },
  RANGE_A_VIOLATION: {
    label: "Range A",
    tone: "hsl(var(--stress-med, 38 92% 55%))",
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
  RANGE_B_VIOLATION: {
    label: "Range B",
    tone: "hsl(var(--stress-high))",
    icon: <ShieldX className="w-3.5 h-3.5" />,
  },
};

export const ValidationPanel = ({ forecast }: Props) => {
  const [data, setData] = useState<ValidationFile | null>(null);
  const [source, setSource] = useState<"file" | "synthetic">("synthetic");

  useEffect(() => {
    let cancelled = false;
    fetch("/opendss_validation.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: ValidationFile) => {
        if (!cancelled) {
          setData(j);
          setSource("file");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(synthesizeFromForecast(forecast));
          setSource("synthetic");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [forecast]);

  // Always re-synthesize when forecast changes if we're in synthetic mode
  useEffect(() => {
    if (source === "synthetic") setData(synthesizeFromForecast(forecast));
  }, [forecast, source]);

  if (!data) return null;

  const failing = data.feeders.filter((f) => f.verdict !== "PASS").length;

  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
            <h3 className="text-display font-semibold">OpenDSS physics validation</h3>
          </div>
          <p className="text-xs text-muted-foreground text-mono">
            ANSI {data.ansi_standard.split(" ")[0]} · Range A 0.95–1.05 pu · Range B 0.917–1.058 pu
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded-md"
            style={{
              background: source === "file" ? "hsl(var(--nuclear) / 0.12)" : "hsl(var(--muted))",
              color: source === "file" ? "hsl(var(--nuclear))" : "hsl(var(--muted-foreground))",
              border: `1px solid ${source === "file" ? "hsl(var(--nuclear) / 0.3)" : "hsl(var(--border))"}`,
            }}
          >
            <FileJson className="w-3 h-3 inline mr-1" />
            {source === "file" ? "Live OpenDSS" : "Synthetic estimate"}
          </span>
          <span
            className="text-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded-md"
            style={{
              background: failing > 0 ? "hsl(var(--stress-high) / 0.12)" : "hsl(var(--nuclear) / 0.12)",
              color: failing > 0 ? "hsl(var(--stress-high))" : "hsl(var(--nuclear))",
              border: `1px solid ${failing > 0 ? "hsl(var(--stress-high) / 0.3)" : "hsl(var(--nuclear) / 0.3)"}`,
            }}
          >
            {failing} / {data.feeders.length} failing
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
              <th className="text-left py-2 pr-3 font-medium">Feeder</th>
              <th className="text-right py-2 px-3 font-medium">Util</th>
              <th className="text-right py-2 px-3 font-medium">Worst bus</th>
              <th className="text-right py-2 px-3 font-medium">V (pu)</th>
              <th className="text-left py-2 px-3 font-medium">ANSI verdict</th>
              <th className="text-left py-2 pl-3 font-medium hidden md:table-cell">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.feeders.map((f) => {
              const meta = verdictMeta[f.verdict];
              return (
                <tr key={f.feeder_id} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium">{f.feeder_name}</div>
                    <div className="text-mono text-[10px] text-muted-foreground">{f.feeder_id}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right text-mono">
                    <span style={{ color: f.utilization_pct >= 100 ? "hsl(var(--stress-high))" : undefined }}>
                      {f.utilization_pct}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-mono text-muted-foreground">
                    #{f.worst_bus}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span
                      className="text-mono text-xs font-semibold inline-flex items-center gap-1 px-2 py-0.5 rounded"
                      style={{
                        background: `${meta.tone} / 0.12`,
                        backgroundColor: f.worst_voltage_pu < 0.917
                          ? "hsl(var(--stress-high) / 0.12)"
                          : f.worst_voltage_pu < 0.95
                          ? "hsl(38 92% 55% / 0.12)"
                          : "hsl(var(--nuclear) / 0.12)",
                        color: meta.tone,
                      }}
                    >
                      <Zap className="w-3 h-3" />
                      {f.worst_voltage_pu.toFixed(3)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className="text-mono text-[11px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-md"
                      style={{
                        background: `${meta.tone.replace(")", " / 0.12)")}`,
                        color: meta.tone,
                        border: `1px solid ${meta.tone.replace(")", " / 0.3)")}`,
                      }}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-xs text-muted-foreground hidden md:table-cell max-w-[260px]">
                    {f.notes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 text-[11px] text-muted-foreground text-mono leading-relaxed">
        {source === "file" ? (
          <>Loaded from <code className="text-foreground">/opendss_validation.json</code> · generated {new Date(data.generated_at).toLocaleString()}</>
        ) : (
          <>No <code className="text-foreground">/opendss_validation.json</code> found — showing calibrated estimate. Run <code className="text-foreground">python scripts/validate_opendss.py</code> in the Python repo and copy the output to <code className="text-foreground">public/opendss_validation.json</code>.</>
        )}
      </div>
    </div>
  );
};
