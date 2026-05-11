import { createHashRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { AboutPage } from "@/pages/AboutPage";
import { PlansPage } from "@/pages/PlansPage";
import { RoundCheckDetailPage } from "@/pages/RoundCheckDetailPage";
import { RoundFullscreenPage } from "@/pages/RoundFullscreenPage";
import { RoundOverviewPage } from "@/pages/RoundOverviewPage";
import { RoundTablePage } from "@/pages/RoundTablePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SquarePage } from "@/pages/SquarePage";

export const router = createHashRouter([
  {
    path: "/round/fullscreen",
    element: <RoundFullscreenPage />,
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/plans" replace /> },
      { path: "plans", element: <PlansPage /> },
      { path: "round/overview", element: <RoundOverviewPage /> },
      { path: "round/check", element: <RoundCheckDetailPage /> },
      { path: "round/table/:tableId", element: <RoundTablePage /> },
      { path: "square", element: <SquarePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "about", element: <AboutPage /> },
    ],
  },
]);
