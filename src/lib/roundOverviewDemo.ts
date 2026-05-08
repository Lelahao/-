import type {
  RoundPersonInput,
  RoundPlanSnapshot,
  RoundSeatInput,
  RoundTableInput,
} from "@/lib/roundSeatEngine";
import { guestOfHonorSeatNo } from "@/lib/roundSeatEngine";

const ENTRANCE: RoundTableInput["entrance"] = "北侧";

/** 与 RoundOverviewPage 初始桌数据一致，并补全每桌座位与人员 id，供检查/自动排座演示 */
const TABLE_ROWS: RoundTableInput[] = [
  { id: "t1", no: 1, hallName: "锦绣厅一桌", capacity: 6, entrance: ENTRANCE },
  { id: "t2", no: 2, hallName: "锦绣厅二桌", capacity: 9, entrance: ENTRANCE },
  { id: "t3", no: 3, hallName: "锦绣厅三桌", capacity: 10, entrance: ENTRANCE },
  { id: "t4", no: 4, hallName: "锦绣厅四桌", capacity: 13, entrance: ENTRANCE, isMainTable: true },
  { id: "t5", no: 5, hallName: "锦绣厅五桌", capacity: 10, entrance: ENTRANCE },
  { id: "t6", no: 6, hallName: "锦绣厅六桌", capacity: 9, entrance: ENTRANCE },
  { id: "t7", no: 7, hallName: "锦绣厅七桌", capacity: 10, entrance: ENTRANCE },
  { id: "t8", no: 8, hallName: "锦绣厅八桌", capacity: 10, entrance: ENTRANCE },
];

const CURRENT_COUNTS: Record<string, number> = {
  t1: 6,
  t2: 9,
  t3: 10,
  t4: 12,
  t5: 8,
  t6: 7,
  t7: 9,
  t8: 7,
};

const UNASSIGNED: RoundPersonInput[] = [
  { id: "u1", name: "李明轩" },
  { id: "u2", name: "张雅琪" },
  { id: "u3", name: "王思远" },
  { id: "u4", name: "陈雨桐" },
  { id: "u5", name: "刘子墨" },
];

export function buildRoundOverviewDemoSnapshot(): RoundPlanSnapshot {
  const tables = TABLE_ROWS;
  const seats: RoundSeatInput[] = [];
  const people: RoundPersonInput[] = [...UNASSIGNED];
  let seq = 1;

  for (const t of tables) {
    const cur = CURRENT_COUNTS[t.id] ?? 0;
    for (let sn = 1; sn <= t.capacity; sn++) {
      const occ = sn <= cur;
      const personId = occ ? `s${seq++}` : null;
      if (personId) {
        people.push({ id: personId, name: `宾客${personId.slice(1)}` });
      }
      const locked = t.id === "t4" && sn === 3;
      seats.push({
        tableId: t.id,
        seatNo: sn,
        personId,
        locked,
        fixed: t.id === "t4" && sn === 1,
      });
    }
  }

  const main = tables.find((x) => x.id === "t4")!;
  const guestSeat = guestOfHonorSeatNo(main.capacity, main.entrance);
  const companionSeat = guestSeat >= main.capacity ? 1 : guestSeat + 1;
  const zhubinId = seats.find((s) => s.tableId === "t4" && s.seatNo === guestSeat)?.personId;
  let zhupeiId = seats.find((s) => s.tableId === "t4" && s.seatNo === companionSeat)?.personId;
  if (zhupeiId === zhubinId) zhupeiId = undefined;
  for (const p of people) {
    if (p.id === zhubinId) {
      p.role = "zhubin";
      p.name = "主宾·演示";
    }
    if (zhupeiId && p.id === zhupeiId) {
      p.role = "zhupe";
      p.name = "主陪·演示";
    }
  }

  return {
    planId: "demo-overview",
    tables,
    seats,
    people,
  };
}
