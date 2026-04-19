import { useEffect, useState } from "react";
import { Radio, Loader2, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { fetchLiveData, getDetectedKeys, type LiveData } from "@/lib/live-data";

type Props = {
  onApply: (data: LiveData) => void;
};

export const LiveDataButton = ({ onApply }: Props) => {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [last, setLast] = useState<LiveData | null>(null);
  const [keys, setKeys] = useState(getDetectedKeys());

  useEffect(() => {
    setKeys(getDetectedKeys());
  }, []);

  const run = async () => {
    setState("loading");
    try {
      const d = await fetchLiveData();
      setLast(d);
      onApply(d);
      setState(d.source === "fallback" ? "err" : "ok");
    } catch {
      setState("err");
    }
  };

  const tone =
    state === "ok"
      ? "hsl(var(--nuclear))"
      : state === "err"
      ? "hsl(var(--stress-high))"
      : "hsl(var(--primary))";

  const Icon =
    state === "loading"
      ? Loader2
      : state === "ok"
      ? CheckCircle2
      : state === "err"
      ? AlertCircle
      : Radio;

  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Live data feed
          </div>
          <div className="text-sm font-medium">NWS · EIA-930 · NREL</div>
        </div>
        <button
          onClick={run}
          disabled={state === "loading"}
          className="text-mono text-xs px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 disabled:opacity-60"
          style={{
            background: `${tone.replace(")", " / 0.1)")}`,
            borderColor: `${tone.replace(")", " / 0.3)")}`,
            color: tone,
          }}
        >
          <Icon className={`w-3.5 h-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
          {state === "loading" ? "Fetching…" : state === "ok" ? "Refresh" : "Pull live"}
        </button>
      </div>

      {/* Key status row */}
      <div className="flex items-center gap-2 text-mono text-[10px]">
        <KeyRound className="w-3 h-3 text-muted-foreground" />
        <span
          className="px-1.5 py-0.5 rounded border"
          style={{
            borderColor: keys.eia ? "hsl(var(--nuclear) / 0.4)" : "hsl(var(--border))",
            color: keys.eia ? "hsl(var(--nuclear))" : "hsl(var(--muted-foreground))",
            background: keys.eia ? "hsl(var(--nuclear) / 0.08)" : "transparent",
          }}
        >
          EIA {keys.eia ? "✓" : "—"}
        </span>
        <span
          className="px-1.5 py-0.5 rounded border"
          style={{
            borderColor: keys.nrel ? "hsl(var(--nuclear) / 0.4)" : "hsl(var(--border))",
            color: keys.nrel ? "hsl(var(--nuclear))" : "hsl(var(--muted-foreground))",
            background: keys.nrel ? "hsl(var(--nuclear) / 0.08)" : "transparent",
          }}
        >
          NREL {keys.nrel ? "✓" : "—"}
        </span>
        <span className="text-muted-foreground">NWS ✓ (no key)</span>
      </div>

      {last && (
        <div className="text-mono text-[11px] text-muted-foreground leading-relaxed">
          <div className="text-foreground">{last.note}</div>
          <div className="opacity-70">
            source: <span className="text-foreground">{last.source}</span> ·{" "}
            {new Date(last.fetchedAt).toLocaleTimeString()}
          </div>
        </div>
      )}

      {!last && (
        <div className="text-mono text-[11px] text-muted-foreground leading-relaxed">
          Pulls Phoenix high (NWS), AZPS demand (EIA), and solar GHI (NREL).
          {!keys.eia || !keys.nrel ? (
            <>
              {" "}Add keys via <code className="text-foreground">.env</code>{" "}
              (<code className="text-foreground">VITE_EIA_API_KEY</code>,{" "}
              <code className="text-foreground">VITE_NREL_API_KEY</code>) — or paste
              at runtime: <code className="text-foreground">localStorage.EIA_API_KEY = "..."</code>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};
