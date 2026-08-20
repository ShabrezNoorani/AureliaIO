import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { getTheme, applyTheme } from "./lib/theme";
import "./index.css";

// Sets the --theme-* CSS variables before React's first paint. Previously applyTheme() was only
// ever invoked from the theme-toggle buttons, so a browser that had never touched the toggle (or
// had localStorage cleared) rendered purely off index.css's hardcoded dark fallback values —
// this is what makes light the actual default, not just the fallback-of-last-resort.
applyTheme(getTheme());

createRoot(document.getElementById("root")!).render(<App />);
