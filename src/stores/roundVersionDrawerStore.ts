import { create } from "zustand";

type State = {
  listOpen: boolean;
  openList: () => void;
  closeList: () => void;
};

/** 圆桌总览「版本记录」抽屉：由 TopToolbar 打开，RoundOverviewPage 渲染。 */
export const useRoundVersionDrawerStore = create<State>((set) => ({
  listOpen: false,
  openList: () => set({ listOpen: true }),
  closeList: () => set({ listOpen: false }),
}));
