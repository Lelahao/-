import { apiFetchJson } from "./client";
import type { PersonRow } from "@/lib/dbTypes";

export async function listPeople(planId: string): Promise<{ people: PersonRow[] }> {
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/people`);
}

export async function putPeople(
  planId: string,
  people: Array<Record<string, unknown>>,
): Promise<{ planUpdatedAt: number }> {
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/people`, {
    method: "PUT",
    body: JSON.stringify({ people }),
  });
}
