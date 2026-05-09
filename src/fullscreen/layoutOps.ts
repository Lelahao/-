import type { PersonRecord } from "@/fullscreen/types";

export function movePersonToSeat(
  people: PersonRecord[],
  activePersonId: string,
  targetTableId: string,
  targetSeatNo: number,
): PersonRecord[] {
  const active = people.find((p) => p.id === activePersonId);
  if (!active) return people;

  if (
    active.assignedTableId === targetTableId &&
    active.assignedSeatNo === targetSeatNo
  ) {
    return people;
  }

  const targetOccupant = people.find(
    (p) => p.assignedTableId === targetTableId && p.assignedSeatNo === targetSeatNo,
  );

  if (!targetOccupant) {
    return people.map((p) => {
      if (p.id !== activePersonId) return p;
      return { ...p, assignedTableId: targetTableId, assignedSeatNo: targetSeatNo };
    });
  }

  if (!active.assignedTableId || !active.assignedSeatNo) {
    return people.map((p) => {
      if (p.id === activePersonId) {
        return { ...p, assignedTableId: targetTableId, assignedSeatNo: targetSeatNo };
      }
      if (p.id === targetOccupant.id) {
        return { ...p, assignedTableId: null, assignedSeatNo: null };
      }
      return p;
    });
  }

  return people.map((p) => {
    if (p.id === activePersonId) {
      return { ...p, assignedTableId: targetTableId, assignedSeatNo: targetSeatNo };
    }
    if (p.id === targetOccupant.id) {
      return {
        ...p,
        assignedTableId: active.assignedTableId,
        assignedSeatNo: active.assignedSeatNo,
      };
    }
    return p;
  });
}

/** 将已入座人员移回未安排池（仅清除其桌号、座位号） */
export function unassignPerson(people: PersonRecord[], personId: string): PersonRecord[] {
  return people.map((p) =>
    p.id === personId ? { ...p, assignedTableId: null, assignedSeatNo: null } : p,
  );
}
