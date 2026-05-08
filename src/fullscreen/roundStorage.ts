import { invoke } from "@tauri-apps/api/core";
import type { LayoutSnapshot } from "@/fullscreen/types";

const LS_KEY = "paizuo-round-layout-fallback";

export async function saveLayoutSnapshot(snapshot: LayoutSnapshot): Promise<void> {
  const payload = JSON.stringify(snapshot);
  try {
    await invoke("save_round_layout", { payload });
  } catch {
    localStorage.setItem(LS_KEY, payload);
  }
}

export async function loadLayoutSnapshot(): Promise<LayoutSnapshot | null> {
  try {
    const raw = await invoke<string>("load_round_layout");
    const parsed = JSON.parse(raw) as LayoutSnapshot;
    if (parsed?.people?.length) return parsed;
  } catch {
    // Web 开发模式或尚未初始化数据库
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
