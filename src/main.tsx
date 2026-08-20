import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "../app/globals.css";
import "../app/employee-extra.css";
import "../app/timeline.css";
import "../app/admin/admin.css";
import "../app/admin/status.css";
import "./supabase.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
