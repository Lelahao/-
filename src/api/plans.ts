import { apiFetchJson } from "./client";
import type {
  PersonRow,
  PlanDetail,
  PlanRow,
  PlanVersionCreateResult,
  PlanVersionListItem,
} from "@/lib/dbTypes";

export { listPeople, putPeople } from "./people";

export type CreatePersonInput = {
  name: string;
  region: string;
  position: string;
  role: string;
};

export type PeopleImportFailureRow = {
  row: number;
  name: string;
  region: string;
  position: string;
  role: string;
  reason: string;
};

export type PeopleImportResult = {
  planUpdatedAt: number;
  success: Array<{ id: string; name: string; region: string; position: string; role: string }>;
  failures: PeopleImportFailureRow[];
  successCount: number;
  failureCount: number;
};

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

export async function createPerson(
  planId: string,
  input: CreatePersonInput,
): Promise<{ person: PersonRow; planUpdatedAt: number }> {
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/people`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePerson(
  planId: string,
  personId: string,
  input: Partial<CreatePersonInput>,
): Promise<{ person: PersonRow; planUpdatedAt: number }> {
  return apiFetchJson(
    `/api/plans/${encodeURIComponent(planId)}/people/${encodeURIComponent(personId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function deletePerson(
  planId: string,
  personId: string,
): Promise<{ ok: boolean; planUpdatedAt: number }> {
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/people/${encodeURIComponent(personId)}`, {
    method: "DELETE",
  });
}

export async function unassignPerson(
  planId: string,
  personId: string,
): Promise<{ ok: boolean; planUpdatedAt: number }> {
  return apiFetchJson(
    `/api/plans/${encodeURIComponent(planId)}/people/${encodeURIComponent(personId)}/unassign`,
    { method: "POST" },
  );
}

export async function importPeople(planId: string, file: File): Promise<PeopleImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/people/import`, {
    method: "POST",
    body: fd,
  });
}
