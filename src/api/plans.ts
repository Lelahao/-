import { apiFetchJson } from "./client";
import type {
  PlanDetail,
  PlanRow,
  PlanVersionCreateResult,
  PlanVersionListItem,
} from "@/lib/dbTypes";

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

export async function createPlanVersion(
  planId: string,
  input: { versionName: string; note?: string | null; createdBy?: string | null },
): Promise<PlanVersionCreateResult> {
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/versions`, {
    method: "POST",
    body: JSON.stringify({
      versionName: input.versionName,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    }),
  });
}

export async function listPlanVersions(planId: string): Promise<PlanVersionListItem[]> {
  const r = await apiFetchJson<{ versions: PlanVersionListItem[] }>(
    `/api/plans/${encodeURIComponent(planId)}/versions`,
  );
  return r.versions;
}

export async function getPlanVersion(
  planId: string,
  versionId: string,
): Promise<{ version: PlanVersionCreateResult; snapshot: unknown }> {
  return apiFetchJson(
    `/api/plans/${encodeURIComponent(planId)}/versions/${encodeURIComponent(versionId)}`,
  );
}
