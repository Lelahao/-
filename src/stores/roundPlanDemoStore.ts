import { create } from "zustand";
import { buildRoundOverviewDemoSnapshot } from "@/lib/roundOverviewDemo";
import type { RoundPlanSnapshot } from "@/lib/roundSeatEngine";

type Store = {
  plan: RoundPlanSnapshot;
  setPlan: (updater: RoundPlanSnapshot | ((prev: RoundPlanSnapshot) => RoundPlanSnapshot)) => void;
};

export const useRoundPlanDemoStore = create<Store>((set) => ({
  plan: buildRoundOverviewDemoSnapshot(),
  setPlan: (updater) =>
    set((s) => ({
      plan: typeof updater === "function" ? (updater as (p: RoundPlanSnapshot) => RoundPlanSnapshot)(s.plan) : updater,
    })),
}));
