import * as peopleApi from "@/api/people";
import * as plansApi from "@/api/plans";
import * as seatsApi from "@/api/seats";
import * as settingsApi from "@/api/settings";
import * as tablesApi from "@/api/tables";

import type { PlanDetail, PlanRow, PersonRow, SeatRow, TableRow, UISettingRow } from "./dbTypes";

export type { PlanDetail, PlanRow, PersonRow, SeatRow, TableRow, UISettingRow } from "./dbTypes";

function nowMs() {
  return Date.now();
}

function uuid() {
  return crypto.randomUUID();
}

// --- In-memory fallback when本地 Python 服务未启动或请求失败 ---

type MockState = {
  plans: Map<string, PlanRow>;
  people: Map<string, PersonRow>;
  tables: Map<string, TableRow>;
  seats: Map<string, SeatRow>;
  ui: Map<string, UISettingRow>;
};

const mock: MockState = {
  plans: new Map(),
  people: new Map(),
  tables: new Map(),
  seats: new Map(),
  ui: new Map(),
};

async function tryHttp<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback();
  }
}

// --- Public API（优先 HTTP，失败回退内存 mock） ---

export async function createPlan(input: { name: string; note?: string | null }) {
  return tryHttp(() => plansApi.createPlan(input), () => {
    const t = nowMs();
    const id = uuid();
    mock.plans.set(id, {
      id,
      name: input.name,
      note: input.note ?? null,
      status: "draft",
      createdAt: t,
      updatedAt: t,
    });
    return { id, updatedAt: t };
  });
}

export async function listPlans(): Promise<PlanRow[]> {
  return tryHttp(() => plansApi.listPlans(), () =>
    Array.from(mock.plans.values()).sort((a, b) => b.updatedAt - a.updatedAt),
  );
}

export async function updatePlan(input: { id: string; name?: string; note?: string | null; status?: string }) {
  return tryHttp(() => plansApi.updatePlan(input), () => {
    const p = mock.plans.get(input.id);
    if (!p) throw new Error("plan not found");
    const t = nowMs();
    const next: PlanRow = {
      ...p,
      name: input.name ?? p.name,
      note: input.note !== undefined ? input.note : p.note,
      status: input.status ?? p.status,
      updatedAt: t,
    };
    mock.plans.set(input.id, next);
    return { id: input.id, updatedAt: t };
  });
}

export async function deletePlan(planId: string) {
  return tryHttp(() => plansApi.deletePlan(planId), () => {
    mock.plans.delete(planId);
    for (const [k, p] of mock.people) {
      if (p.planId === planId) mock.people.delete(k);
    }
    for (const [k, t] of mock.tables) {
      if (t.planId === planId) mock.tables.delete(k);
    }
    for (const [k, s] of mock.seats) {
      if (s.planId === planId) mock.seats.delete(k);
    }
    return { ok: true };
  });
}

export async function getPlanDetail(planId: string): Promise<PlanDetail | null> {
  return tryHttp(() => plansApi.getPlanDetail(planId), () => {
    const plan = mock.plans.get(planId);
    if (!plan) return null;
    return {
      plan,
      people: Array.from(mock.people.values()).filter((p) => p.planId === planId),
      tables: Array.from(mock.tables.values())
        .filter((t) => t.planId === planId)
        .sort((a, b) => a.tableNo - b.tableNo),
      seats: Array.from(mock.seats.values())
        .filter((s) => s.planId === planId)
        .sort((a, b) => (a.tableId + a.seatNo).localeCompare(b.tableId + b.seatNo)),
    };
  });
}

/** 读取方案人员（REST：`GET /api/plans/{id}/people`），失败回退内存 mock。 */
export async function listPeopleForPlan(planId: string): Promise<PersonRow[]> {
  return tryHttp(
    async () => (await peopleApi.listPeople(planId)).people,
    () => Array.from(mock.people.values()).filter((p) => p.planId === planId),
  );
}

/** 批量写入人员（REST：`PUT /api/plans/{id}/people`），失败回退内存 mock。 */
export async function upsertPlanPeople(
  planId: string,
  people: PersonRow[],
): Promise<{ planUpdatedAt: number }> {
  const rows = people.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    assignedTableId: p.assignedTableId,
    assignedSeatNo: p.assignedSeatNo,
    metaJson: p.metaJson,
  }));
  return tryHttp(() => peopleApi.putPeople(planId, rows), () => {
    const t = nowMs();
    for (const p of people) {
      const prev = mock.people.get(p.id);
      mock.people.set(p.id, {
        ...p,
        planId,
        updatedAt: t,
        createdAt: prev?.createdAt ?? t,
      });
    }
    const pl = mock.plans.get(planId);
    if (pl) mock.plans.set(planId, { ...pl, updatedAt: t });
    return { planUpdatedAt: t };
  });
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
}) {
  return tryHttp(() => tablesApi.saveTables(input), () => {
    const t = nowMs();
    const incomingIds = new Set<string>();
    for (const row of input.tables) {
      const id = row.id ?? uuid();
      incomingIds.add(id);
      const ex = mock.tables.get(id);
      const rec: TableRow = {
        id,
        planId: input.planId,
        tableNo: row.tableNo,
        hallName: row.hallName ?? null,
        capacity: row.capacity,
        kind: row.kind ?? "round",
        metaJson: row.metaJson ?? null,
        createdAt: ex?.createdAt ?? t,
        updatedAt: t,
      };
      mock.tables.set(id, rec);
    }
    for (const [tid, tbl] of mock.tables) {
      if (tbl.planId === input.planId && !incomingIds.has(tid)) {
        mock.tables.delete(tid);
        for (const [sk, seat] of mock.seats) {
          if (seat.tableId === tid) mock.seats.delete(sk);
        }
      }
    }
    const p = mock.plans.get(input.planId);
    if (p) mock.plans.set(input.planId, { ...p, updatedAt: t });
    return { planUpdatedAt: t };
  });
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
}) {
  return tryHttp(() => seatsApi.saveSeats(input), () => {
    const t = nowMs();
    for (const s of input.seats) {
      const ex = Array.from(mock.seats.values()).find(
        (x) => x.tableId === s.tableId && x.seatNo === s.seatNo && x.planId === input.planId,
      );
      const id = s.id ?? ex?.id ?? uuid();
      const rec: SeatRow = {
        id,
        planId: input.planId,
        tableId: s.tableId,
        seatNo: s.seatNo,
        personId: s.personId ?? null,
        locked: s.locked ?? false,
        metaJson: null,
        createdAt: ex?.createdAt ?? t,
        updatedAt: t,
      };
      if (ex) mock.seats.delete(ex.id);
      mock.seats.set(rec.id, rec);
      if (s.personId) {
        const per = mock.people.get(s.personId);
        if (per && per.planId === input.planId) {
          mock.people.set(s.personId, {
            ...per,
            assignedTableId: s.tableId,
            assignedSeatNo: s.seatNo,
            updatedAt: t,
          });
        }
      }
    }
    const p = mock.plans.get(input.planId);
    if (p) mock.plans.set(input.planId, { ...p, updatedAt: t });
    return { planUpdatedAt: t };
  });
}

export async function moveSeatPerson(input: {
  planId: string;
  personId: string;
  targetTableId: string;
  targetSeatNo: number;
}) {
  return tryHttp(() => seatsApi.moveSeatPerson(input), () => {
    const t = nowMs();
    const person = mock.people.get(input.personId);
    if (!person || person.planId !== input.planId) throw new Error("person not found");

    let srcSeat: SeatRow | undefined;
    for (const s of mock.seats.values()) {
      if (s.planId === input.planId && s.personId === input.personId) {
        srcSeat = s;
        break;
      }
    }

    let tgtSeat: SeatRow | undefined;
    for (const s of mock.seats.values()) {
      if (
        s.planId === input.planId &&
        s.tableId === input.targetTableId &&
        s.seatNo === input.targetSeatNo
      ) {
        tgtSeat = s;
        break;
      }
    }
    if (!tgtSeat) throw new Error("target seat not found");

    if (srcSeat && srcSeat.tableId === input.targetTableId && srcSeat.seatNo === input.targetSeatNo) {
      const p = mock.plans.get(input.planId)!;
      return { planUpdatedAt: p.updatedAt };
    }

    if (srcSeat) {
      mock.seats.set(srcSeat.id, { ...srcSeat, personId: null, updatedAt: t });
    }

    const other = tgtSeat.personId;
    if (other && other !== input.personId) {
      const op = mock.people.get(other);
      if (op) {
        mock.people.set(other, {
          ...op,
          assignedTableId: null,
          assignedSeatNo: null,
          updatedAt: t,
        });
      }
    }

    mock.seats.set(tgtSeat.id, { ...tgtSeat, personId: input.personId, updatedAt: t });
    mock.people.set(input.personId, {
      ...person,
      assignedTableId: input.targetTableId,
      assignedSeatNo: input.targetSeatNo,
      updatedAt: t,
    });

    const p = mock.plans.get(input.planId)!;
    mock.plans.set(input.planId, { ...p, updatedAt: t });
    return { planUpdatedAt: t };
  });
}

export async function swapSeatPersons(input: {
  planId: string;
  a: { tableId: string; seatNo: number };
  b: { tableId: string; seatNo: number };
}) {
  return tryHttp(() => seatsApi.swapSeatPersons(input), () => {
    const t = nowMs();
    const seatA = Array.from(mock.seats.values()).find(
      (s) =>
        s.planId === input.planId &&
        s.tableId === input.a.tableId &&
        s.seatNo === input.a.seatNo,
    );
    const seatB = Array.from(mock.seats.values()).find(
      (s) =>
        s.planId === input.planId &&
        s.tableId === input.b.tableId &&
        s.seatNo === input.b.seatNo,
    );
    if (!seatA || !seatB) throw new Error("seat not found");

    const pa = seatA.personId;
    const pb = seatB.personId;
    mock.seats.set(seatA.id, { ...seatA, personId: pb, updatedAt: t });
    mock.seats.set(seatB.id, { ...seatB, personId: pa, updatedAt: t });

    if (pa) {
      const p = mock.people.get(pa)!;
      mock.people.set(pa, {
        ...p,
        assignedTableId: input.b.tableId,
        assignedSeatNo: input.b.seatNo,
        updatedAt: t,
      });
    }
    if (pb) {
      const p = mock.people.get(pb)!;
      mock.people.set(pb, {
        ...p,
        assignedTableId: input.a.tableId,
        assignedSeatNo: input.a.seatNo,
        updatedAt: t,
      });
    }

    const pl = mock.plans.get(input.planId)!;
    mock.plans.set(input.planId, { ...pl, updatedAt: t });
    return { planUpdatedAt: t };
  });
}

export async function saveUISetting(key: string, value: string) {
  return tryHttp(() => settingsApi.saveSetting(key, value), () => {
    const t = nowMs();
    mock.ui.set(key, { key, value, updatedAt: t });
    return { key, updatedAt: t };
  });
}

export async function getUISetting(key: string): Promise<UISettingRow | null> {
  return tryHttp(() => settingsApi.getSetting(key), () => mock.ui.get(key) ?? null);
}
