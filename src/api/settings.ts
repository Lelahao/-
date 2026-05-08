import { apiFetchJson } from "./client";
import type { UISettingRow } from "@/lib/dbTypes";

export async function getSetting(key: string): Promise<UISettingRow | null> {
  return apiFetchJson<UISettingRow | null>(`/api/settings/${encodeURIComponent(key)}`);
}

export async function saveSetting(key: string, value: string): Promise<{ key: string; updatedAt: number }> {
  return apiFetchJson("/api/settings", {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });
}
