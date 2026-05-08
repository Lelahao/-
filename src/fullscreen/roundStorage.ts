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

export async function loadLayoutSnapshot(): Promise<LayoutSnapshot | null> {
  try {
    const parsed = await layoutsApi.loadRoundLayout();
    if (parsed?.people?.length) return parsed;
  } catch {
    // 后端未启动或尚未初始化
  }

  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LayoutSnapshot;
    return parsed?.people?.length ? parsed : null;
  } catch {
    return null;
  }
}
