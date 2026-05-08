import { create } from "zustand";
import { persist } from "zustand/middleware";
import { saveUISetting } from "@/lib/dbApi";

type UiState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: "paizuo-assistant-ui",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);

let lastSidebarCollapsed = useUiStore.getState().sidebarCollapsed;
useUiStore.subscribe((s) => {
  if (s.sidebarCollapsed === lastSidebarCollapsed) return;
  lastSidebarCollapsed = s.sidebarCollapsed;
  void saveUISetting("sidebarCollapsed", JSON.stringify(s.sidebarCollapsed));
});
