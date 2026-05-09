import { create } from "zustand";

type State = {
  query: string;
  setQuery: (query: string) => void;
};

/** 圆桌总览 / 全屏总览：顶栏人名搜索，用于座位高亮与滚动定位。 */
export const useRoundPersonSearchStore = create<State>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));

export function roundPersonSearchMatches(displayName: string | null | undefined, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return false;
  const n = displayName?.trim().toLowerCase() ?? "";
  return n.includes(q);
}
