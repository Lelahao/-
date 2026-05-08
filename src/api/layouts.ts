import type { LayoutSnapshot } from "@/fullscreen/types";
import { apiFetchJson } from "./client";

export async function loadRoundLayout(): Promise<LayoutSnapshot> {
  return apiFetchJson<LayoutSnapshot>("/api/round-layout");
}

export async function saveRoundLayout(snapshot: LayoutSnapshot): Promise<void> {
  await apiFetchJson<{ ok: boolean }>("/api/round-layout", {
    method: "PUT",
    body: JSON.stringify(snapshot),
  });
}
