import { apiFetchJson } from "./client";
import type { TableRow } from "@/lib/dbTypes";

export async function listTables(planId: string): Promise<{ tables: TableRow[] }> {
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/tables`);
}

export async function saveTables(input: {
  planId: string;
  tables: Array<{
    id?: string;
    tableNo: number;
    hallName?: string | null;
    capacity: number;
    kind?: string;
    metaJson?: string | null;
  }>;
}): Promise<{ planUpdatedAt: number }> {
  const { planId, tables } = input;
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/tables`, {
    method: "PUT",
    body: JSON.stringify({ tables }),
  });
}
