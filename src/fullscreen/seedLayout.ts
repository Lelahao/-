import type { LayoutSnapshot, PersonRecord, TableDefinition } from "@/fullscreen/types";

const TABLE_ROWS: Array<{
  id: string;
  no: number;
  hallName: string;
  capacity: number;
  current: number;
}> = [
  { id: "t1", no: 1, hallName: "锦绣厅一桌", capacity: 6, current: 6 },
  { id: "t2", no: 2, hallName: "锦绣厅二桌", capacity: 9, current: 9 },
  { id: "t3", no: 3, hallName: "锦绣厅三桌", capacity: 10, current: 10 },
  { id: "t4", no: 4, hallName: "锦绣厅四桌", capacity: 13, current: 12 },
  { id: "t5", no: 5, hallName: "锦绣厅五桌", capacity: 10, current: 8 },
  { id: "t6", no: 6, hallName: "锦绣厅六桌", capacity: 9, current: 7 },
  { id: "t7", no: 7, hallName: "锦绣厅七桌", capacity: 10, current: 9 },
  { id: "t8", no: 8, hallName: "锦绣厅八桌", capacity: 10, current: 7 },
];

const RESERVED_UNASSIGNED: Array<{ id: string; name: string }> = [
  { id: "p1", name: "李明轩" },
  { id: "p2", name: "张雅琪" },
  { id: "p3", name: "王思远" },
  { id: "p4", name: "陈雨桐" },
  { id: "p5", name: "刘子墨" },
];

function fillerName(i: number) {
  const surnames = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜".split("");
  const given = "文博思源雅慧俊杰若曦子墨雨桐明轩梓涵".split("");
  const a = surnames[i % surnames.length];
  const b = given[Math.floor(i / surnames.length) % given.length];
  const c = given[(i + 3) % given.length];
  return `${a}${b}${c}`;
}

export function buildSeedLayout(): LayoutSnapshot {
  const tables: TableDefinition[] = TABLE_ROWS.map((t) => ({
    id: t.id,
    no: t.no,
    hallName: t.hallName,
    capacity: t.capacity,
  }));

  const people: PersonRecord[] = [];
  let idx = 0;

  for (const row of TABLE_ROWS) {
    for (let seat = 1; seat <= row.current; seat++) {
      idx += 1;
      people.push({
        id: `a-${row.id}-${seat}`,
        name: fillerName(idx),
        assignedTableId: row.id,
        assignedSeatNo: seat,
      });
    }
  }

  for (const u of RESERVED_UNASSIGNED) {
    people.push({
      id: u.id,
      name: u.name,
      assignedTableId: null,
      assignedSeatNo: null,
    });
  }

  return { people, tables };
}
