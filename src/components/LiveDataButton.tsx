import { useState } from "react";
import { Radio, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { fetchLiveData, type LiveData } from "@/lib/live-data";

type Props = {
  onApply: (data: LiveData) => void;
};

export const LiveDataButton = ({ onApply }: Props) => {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [last, setLast] = useState<LiveData | null>(null);

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
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Live data feed
          </div>
          <div className="text-sm font-medium">NWS · EIA-930</div>
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
      {last && (
        <div className="text-mono text-[11px] text-muted-foreground leading-relaxed">
          <div>{last.note}</div>
          <div className="opacity-70">
            source: <span className="text-foreground">{last.source}</span> ·{" "}
            {new Date(last.fetchedAt).toLocaleTimeString()}
          </div>
        </div>
      )}
      {!last && (
        <div className="text-mono text-[11px] text-muted-foreground leading-relaxed">
          Pulls today's Phoenix high (NWS, no key) + current AZPS demand (EIA, needs{" "}
          <code className="text-foreground">VITE_EIA_API_KEY</code>).
        </div>
      )}
    </div>
  );
};
