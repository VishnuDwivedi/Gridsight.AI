import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { loadWeights } from "./lib/model/weights";

// Kick off async weight load + Zod validation; UI uses fallback in the meantime
// and re-renders are cheap, so we don't block the first paint.
loadWeights().catch(() => {/* fallback weights remain in use */});

createRoot(document.getElementById("root")!).render(<App />);
