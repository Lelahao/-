import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { getUISetting } from "@/lib/dbApi";
import { router } from "./router";
import { useUiStore } from "./stores/uiStore";

useUiStore.persist.onFinishHydration(() => {
  void getUISetting("sidebarCollapsed").then((row) => {
    if (row?.value == null) return;
    try {
      const v = JSON.parse(row.value) as boolean;
      useUiStore.getState().setSidebarCollapsed(v);
    } catch {
      /* ignore */
    }
  });
});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
