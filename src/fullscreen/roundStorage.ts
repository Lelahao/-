import type { LayoutSnapshot } from "@/fullscreen/types";
import * as layoutsApi from "@/api/layouts";

const LS_KEY = "paizuo-round-layout-fallback";

export async function saveLayoutSnapshot(snapshot: LayoutSnapshot): Promise<void> {
  const payload = JSON.stringify(snapshot);
  try {
    await layoutsApi.saveRoundLayout(snapshot);
  } catch {
    localStorage.setItem(LS_KEY, payload);
  }
}

function normalizeSnapshot(raw: LayoutSnapshot | null | undefined): LayoutSnapshot | null {
  if (!raw || !Array.isArray(raw.tables)) return null;
  return {
    tables: raw.tables,
    people: Array.isArray(raw.people) ? raw.people : [],
  };
}

export async function loadLayoutSnapshot(): Promise<LayoutSnapshot | null> {
  try {
    const parsed = await layoutsApi.loadRoundLayout();
    const n = normalizeSnapshot(parsed);
    if (n?.tables.length) return n;
  } catch {
    // 后端未启动或尚未初始化
  }

  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LayoutSnapshot;
    const n = normalizeSnapshot(parsed);
    return n?.tables.length ? n : null;
  } catch {
    return null;
  }
}
