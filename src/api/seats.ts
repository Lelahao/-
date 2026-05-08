import { apiFetchJson } from "./client";
import type { SeatRow } from "@/lib/dbTypes";

export async function listSeats(planId: string): Promise<{ seats: SeatRow[] }> {
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/seats`);
}

export async function saveSeats(input: {
  planId: string;
  seats: Array<{
    id?: string;
    tableId: string;
    seatNo: number;
    personId?: string | null;
    locked?: boolean;
  }>;
}): Promise<{ planUpdatedAt: number }> {
  const { planId, seats } = input;
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/seats`, {
    method: "PUT",
    body: JSON.stringify({ seats }),
  });
}

export async function moveSeatPerson(input: {
  planId: string;
  personId: string;
  targetTableId: string;
  targetSeatNo: number;
}): Promise<{ planUpdatedAt: number }> {
  const { planId, ...body } = input;
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/seats/move-person`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function swapSeatPersons(input: {
  planId: string;
  a: { tableId: string; seatNo: number };
  b: { tableId: string; seatNo: number };
}): Promise<{ planUpdatedAt: number }> {
  const { planId, ...body } = input;
  return apiFetchJson(`/api/plans/${encodeURIComponent(planId)}/seats/swap`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
