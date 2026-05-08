import { apiFetchJson } from "./client";
import type { PlanDetail, PlanRow } from "@/lib/dbTypes";

export async function listPlans(): Promise<PlanRow[]> {
  const r = await apiFetchJson<{ plans: PlanRow[] }>("/api/plans");
  return r.plans;
}

export async function createPlan(input: {
  name: string;
  note?: string | null;
}): Promise<{ id: string; updatedAt: number }> {
  return apiFetchJson("/api/plans", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPlanDetail(planId: string): Promise<PlanDetail> {
  return apiFetchJson<PlanDetail>(`/api/plans/${encodeURIComponent(planId)}`);
}

export async function updatePlan(input: {
  id: string;
  name?: string;
  note?: string | null;
  status?: string;
}): Promise<{ id: string; updatedAt: number }> {
  const { id, ...body } = input;
  return apiFetchJson(`/api/plans/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deletePlan(planId: string): Promise<{ ok: boolean }> {
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}`, {
    method: "DELETE",
  });
}
