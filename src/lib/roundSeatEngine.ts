/**
 * 圆桌排座：检查与自动排座（纯函数，不依赖桌面壳与 DB）。
 */

export type RoundEntranceZh = "北侧" | "南侧" | "东侧" | "西侧";

export type RoundPersonRole = "zhupe" | "zhubin";

export type RoundPersonInput = {
  id: string;
  name: string;
  /** 主陪 / 主宾；缺省为普通宾客 */
  role?: RoundPersonRole | null;
  fixedTableId?: string | null;
  fixedSeatNo?: number | null;
};

export type RoundSeatInput = {
  tableId: string;
  seatNo: number;
  personId: string | null;
  locked: boolean;
  /** 固定本座人员（自动排座时优先保留该座人次序） */
  fixed?: boolean;
};

export type RoundTableInput = {
  id: string;
  no: number;
  capacity: number;
  hallName?: string;
  isMainTable?: boolean;
  /** 门口方向，用于主宾席位推算 */
  entrance?: RoundEntranceZh | string | null;
};

export type RoundPlanSnapshot = {
  planId: string;
  tables: RoundTableInput[];
  seats: RoundSeatInput[];
  people: RoundPersonInput[];
};

export type RoundCheckSeverity = "pass" | "info" | "warn" | "error";

export type RoundCheckItem = {
  id: string;
  scope: "plan" | "table";
  tableId?: string;
  title: string;
  message: string;
  severity: RoundCheckSeverity;
};

export type TableCheckStatus = {
  tableId: string;
  tableNo: number;
  hallName?: string;
  capacity: number;
  occupied: number;
  emptySeats: number;
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** 是否有「大人数桌」提醒 */
  largeTableNote?: string;
};

export type PlanCheckStatus = {
  ok: boolean;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  summary: string;
  unassignedCount: number;
  totalEmptySeats: number;
};

export type RoundCheckResult = {
  checkItems: RoundCheckItem[];
  tableStatuses: TableCheckStatus[];
  planStatus: PlanCheckStatus;
};

const LARGE_TABLE_MIN = 12;

function entranceToDoorAngleRad(entrance: string | null | undefined): number {
  switch (entrance) {
    case "北侧":
      return -Math.PI / 2;
    case "南侧":
      return Math.PI / 2;
    case "东侧":
      return 0;
    case "西侧":
      return Math.PI;
    default:
      return Math.PI / 2;
  }
}

/** 座位号 1..n，从正上方（-π/2）起顺时针；与单桌页布局一致 */
function seatAngleRad(seatNo: number, capacity: number): number {
  return (2 * Math.PI * (seatNo - 1)) / capacity - Math.PI / 2;
}

/**
 * 主宾应在：门口方位角的反向（席面居中、距门最远一侧）。
 */
export function guestOfHonorSeatNo(capacity: number, entrance: string | null | undefined): number {
  const n = Math.max(1, Math.trunc(capacity));
  const target = entranceToDoorAngleRad(entrance) + Math.PI;
  let best = 1;
  let bestD = Infinity;
  for (let s = 1; s <= n; s++) {
    const a = seatAngleRad(s, n);
    let d = Math.abs(a - target);
    while (d > Math.PI) d = 2 * Math.PI - d;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function nextSeatClockwise(seatNo: number, capacity: number): number {
  if (seatNo >= capacity) return 1;
  return seatNo + 1;
}

function sortTables(tables: RoundTableInput[]): RoundTableInput[] {
  return [...tables].sort((a, b) => a.no - b.no);
}

function tableById(snapshot: RoundPlanSnapshot, id: string): RoundTableInput | undefined {
  return snapshot.tables.find((t) => t.id === id);
}

export function runRoundSeatChecks(snapshot: RoundPlanSnapshot): RoundCheckResult {
  const tables = sortTables(snapshot.tables);
  const peopleById = new Map(snapshot.people.map((p) => [p.id, p]));

  const seatsByTable = new Map<string, RoundSeatInput[]>();
  for (const t of tables) {
    seatsByTable.set(
      t.id,
      snapshot.seats.filter((s) => s.tableId === t.id),
    );
  }

  const checkItems: RoundCheckItem[] = [];
  const tableStatuses: TableCheckStatus[] = [];

  let planErrors = 0;
  let planWarns = 0;
  let planInfos = 0;

  const push = (item: RoundCheckItem) => {
    checkItems.push(item);
    if (item.severity === "error") planErrors++;
    else if (item.severity === "warn") planWarns++;
    else if (item.severity === "info") planInfos++;
  };

  const seatsFlat = snapshot.seats;
  const assignedIds = seatsFlat.filter((s) => s.personId).map((s) => s.personId as string);
  const idCount = new Map<string, number>();
  for (const id of assignedIds) idCount.set(id, (idCount.get(id) ?? 0) + 1);
  const dupIds = [...idCount.entries()].filter(([, c]) => c > 1).map(([id]) => id);

  const seatedSet = new Set(assignedIds);
  const unassignedPeople = snapshot.people.filter((p) => !seatedSet.has(p.id));

  // per-table checks
  for (const t of tables) {
    const tseats = seatsByTable.get(t.id) ?? [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const occ = tseats.filter((s) => s.seatNo >= 1 && s.seatNo <= t.capacity && s.personId).length;
    const bySeat = new Map<number, RoundSeatInput>();
    for (const s of tseats) {
      if (!bySeat.has(s.seatNo)) bySeat.set(s.seatNo, s);
    }

    let emptyCount = 0;
    for (let sn = 1; sn <= t.capacity; sn++) {
      const row = bySeat.get(sn);
      if (!row || !row.personId) emptyCount++;
    }

    // 1 当前人数超过 capacity
    if (occ > t.capacity) {
      errors.push(`已入座 ${occ} 人，超过可坐人数 ${t.capacity}`);
      push({
        id: "capacity_overflow",
        scope: "table",
        tableId: t.id,
        title: "超员",
        message: `「${t.hallName ?? `${t.no}号桌`}」入座 ${occ} 人，超过 ${t.capacity}。`,
        severity: "error",
      });
    }

    // 2 固定座位超出 capacity
    for (const p of snapshot.people) {
      if (p.fixedTableId !== t.id) continue;
      if (p.fixedSeatNo != null && (p.fixedSeatNo < 1 || p.fixedSeatNo > t.capacity)) {
        errors.push(`人员「${p.name}」固定座位 ${p.fixedSeatNo} 超出本桌容量`);
        push({
          id: `fixed_seat_overflow_${p.id}`,
          scope: "table",
          tableId: t.id,
          title: "固定座位越界",
          message: `「${p.name}」固定为 ${p.fixedSeatNo} 号座，超过本桌 ${t.capacity} 人。`,
          severity: "error",
        });
      }
    }
    for (const s of tseats) {
      if (s.fixed && (s.seatNo < 1 || s.seatNo > t.capacity)) {
        errors.push(`固定标记的 ${s.seatNo} 号座超出容量`);
        push({
          id: `fixed_flag_overflow_${t.id}_${s.seatNo}`,
          scope: "table",
          tableId: t.id,
          title: "固定座越界",
          message: `存在超出容量的固定座位 ${s.seatNo}。`,
          severity: "error",
        });
      }
    }

    // 3 锁定座位超出 capacity
    for (const s of tseats) {
      if (s.locked && (s.seatNo < 1 || s.seatNo > t.capacity)) {
        errors.push(`锁定座位 ${s.seatNo} 超出本桌容量`);
        push({
          id: `locked_seat_overflow_${t.id}_${s.seatNo}`,
          scope: "table",
          tableId: t.id,
          title: "锁定座越界",
          message: `锁定标记的 ${s.seatNo} 号座超出容量 ${t.capacity}。`,
          severity: "error",
        });
      }
    }

    // 10 大人数桌
    let largeTableNote: string | undefined;
    if (t.capacity >= LARGE_TABLE_MIN) {
      largeTableNote = `${t.capacity} 人桌，场地与上菜动线请额外留意`;
      warnings.push(largeTableNote);
      push({
        id: `large_table_${t.id}`,
        scope: "table",
        tableId: t.id,
        title: "大人数桌",
        message: `「${t.hallName ?? `${t.no}号桌`}」为 ${t.capacity} 人桌，建议现场核对摆台。`,
        severity: "warn",
      });
    }

    // 9 空座（本桌已坐满则无）
    if (emptyCount > 0) {
      push({
        id: `empty_seats_${t.id}`,
        scope: "table",
        tableId: t.id,
        title: "空座提醒",
        message: `「${t.hallName ?? `${t.no}号桌`}」仍有 ${emptyCount} 个空座。`,
        severity: "info",
      });
    }

    tableStatuses.push({
      tableId: t.id,
      tableNo: t.no,
      hallName: t.hallName,
      capacity: t.capacity,
      occupied: occ,
      emptySeats: emptyCount,
      ok: errors.length === 0,
      errors,
      warnings,
      largeTableNote,
    });
  }

  // 4 重复入座
  if (dupIds.length > 0) {
    const names = dupIds.map((id) => peopleById.get(id)?.name ?? id).join("、");
    push({
      id: "duplicate_assignment",
      scope: "plan",
      title: "重复入座",
      message: `以下人员在多个座位出现：${names}`,
      severity: "error",
    });
  }

  // 5 未安排
  if (unassignedPeople.length > 0) {
    push({
      id: "unassigned_people",
      scope: "plan",
      title: "未安排人员",
      message: `仍有 ${unassignedPeople.length} 人未入座：${unassignedPeople.map((p) => p.name).join("、")}`,
      severity: "warn",
    });
  }

  const zhupei = snapshot.people.filter((p) => p.role === "zhupe");
  const zhubin = snapshot.people.filter((p) => p.role === "zhubin");

  // 6 主陪
  const zhupeiSeated = zhupei.filter((p) => seatedSet.has(p.id));
  if (zhupei.length === 0) {
    push({
      id: "zhupei_missing",
      scope: "plan",
      title: "主陪",
      message: "方案中未标记主陪人员。",
      severity: "warn",
    });
  } else if (zhupeiSeated.length === 0) {
    push({
      id: "zhupei_not_seated",
      scope: "plan",
      title: "主陪未入座",
      message: "已标记主陪但未安排在任意座位。",
      severity: "warn",
    });
  }

  // 7–8 主宾：须在主桌（isMainTable 或桌号最小）且坐在规则位
  const mainTable =
    tables.find((x) => x.isMainTable) ?? (tables.length ? tables.reduce((a, b) => (a.no <= b.no ? a : b)) : undefined);

  const zhubinSeated = zhubin.filter((p) => seatedSet.has(p.id));
  if (zhubin.length === 0) {
    push({
      id: "zhubin_missing",
      scope: "plan",
      title: "主宾",
      message: "方案中未标记主宾人员。",
      severity: "warn",
    });
  } else if (zhubinSeated.length === 0) {
    push({
      id: "zhubin_not_seated",
      scope: "plan",
      title: "主宾未入座",
      message: "已标记主宾但未安排在任意座位。",
      severity: "warn",
    });
  } else if (mainTable) {
    const expectedGuest = guestOfHonorSeatNo(mainTable.capacity, mainTable.entrance);
    for (const p of zhubinSeated) {
      const seatRow = snapshot.seats.find((s) => s.personId === p.id && s.tableId === mainTable.id);
      if (!seatRow) {
        push({
          id: `zhubin_wrong_table_${p.id}`,
          scope: "plan",
          title: "主宾不在主桌",
          message: `「${p.name}」未安排在主桌「${mainTable.hallName ?? `${mainTable.no}号桌`}」。`,
          severity: "warn",
        });
      } else if (seatRow.seatNo !== expectedGuest) {
        push({
          id: `zhubin_wrong_seat_${p.id}`,
          scope: "plan",
          title: "主宾位置",
          message: `「${p.name}」当前在 ${seatRow.seatNo} 号座；按门口「${mainTable.entrance ?? "南侧"}」推算主宾宜在 ${expectedGuest} 号座。`,
          severity: "warn",
        });
      }
    }
  }

  const totalEmptySeats = tableStatuses.reduce((a, t) => a + t.emptySeats, 0);
  const planOk = planErrors === 0;
  let summary: string;
  if (planErrors > 0) summary = `存在 ${planErrors} 项错误，请修正后再导出`;
  else if (planWarns > 0) summary = `检查通过（含 ${planWarns} 条提醒）`;
  else summary = "检查通过 · 可继续排座";

  return {
    checkItems,
    tableStatuses,
    planStatus: {
      ok: planOk,
      errorCount: planErrors,
      warnCount: planWarns,
      infoCount: planInfos,
      summary,
      unassignedCount: unassignedPeople.length,
      totalEmptySeats,
    },
  };
}

function seatKey(tableId: string, seatNo: number) {
  return `${tableId}:${seatNo}`;
}

/**
 * 自动排座：固定座 → 锁定座保留 → 主宾/主陪优先 → 其余按桌号、座位号递增填充。
 * 未锁定座位会清空后重排；锁定座人员保持不变。
 */
export function autoArrangeRoundSeats(snapshot: RoundPlanSnapshot): RoundSeatInput[] {
  const tables = sortTables(snapshot.tables);
  const rows = new Map<string, RoundSeatInput>();

  for (const t of tables) {
    for (let sn = 1; sn <= t.capacity; sn++) {
      const k = seatKey(t.id, sn);
      const existing = snapshot.seats.find((s) => s.tableId === t.id && s.seatNo === sn);
      rows.set(k, existing ? { ...existing } : { tableId: t.id, seatNo: sn, personId: null, locked: false, fixed: false });
    }
  }

  const assigned = new Set<string>();
  const seatLevelFixed: { personId: string; tableId: string; seatNo: number }[] = [];
  for (const row of rows.values()) {
    if (row.locked && row.personId) assigned.add(row.personId);
    if (row.fixed && !row.locked && row.personId) {
      seatLevelFixed.push({ personId: row.personId, tableId: row.tableId, seatNo: row.seatNo });
    }
  }

  for (const row of rows.values()) {
    if (!row.locked) row.personId = null;
  }

  const tryPlace = (personId: string, tableId: string, seatNo: number): boolean => {
    if (assigned.has(personId)) return false;
    const row = rows.get(seatKey(tableId, seatNo));
    if (!row) return false;
    if (row.locked) return row.personId === personId;
    if (row.personId) return false;
    row.personId = personId;
    assigned.add(personId);
    return true;
  };

  for (const p of snapshot.people) {
    if (!p.fixedTableId || p.fixedSeatNo == null) continue;
    const tbl = tableById(snapshot, p.fixedTableId);
    if (!tbl) continue;
    if (p.fixedSeatNo < 1 || p.fixedSeatNo > tbl.capacity) continue;
    tryPlace(p.id, p.fixedTableId, p.fixedSeatNo);
  }

  for (const x of seatLevelFixed) {
    tryPlace(x.personId, x.tableId, x.seatNo);
  }

  const mainTable =
    tables.find((x) => x.isMainTable) ?? (tables.length ? tables.reduce((a, b) => (a.no <= b.no ? a : b)) : undefined);

  if (mainTable) {
    const guestNo = guestOfHonorSeatNo(mainTable.capacity, mainTable.entrance);
    const bin = snapshot.people.find((p) => p.role === "zhubin");
    const pei = snapshot.people.find((p) => p.role === "zhupe");
    if (bin) tryPlace(bin.id, mainTable.id, guestNo);
    if (pei) {
      let placed = tryPlace(pei.id, mainTable.id, nextSeatClockwise(guestNo, mainTable.capacity));
      if (!placed) {
        for (let off = 0; off < mainTable.capacity && !placed; off++) {
          const sn = ((guestNo - 1 + off) % mainTable.capacity) + 1;
          placed = tryPlace(pei.id, mainTable.id, sn);
        }
      }
    }
  }

  const rest = snapshot.people
    .filter((p) => !assigned.has(p.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const p of rest) {
    let placed = false;
    for (const tbl of tables) {
      if (placed) break;
      for (let sn = 1; sn <= tbl.capacity; sn++) {
        const row = rows.get(seatKey(tbl.id, sn))!;
        if (row.locked || row.personId) continue;
        row.personId = p.id;
        assigned.add(p.id);
        placed = true;
        break;
      }
    }
  }

  return [...rows.values()].sort((a, b) => {
    const ta = tables.find((x) => x.id === a.tableId);
    const tb = tables.find((x) => x.id === b.tableId);
    const na = ta?.no ?? 0;
    const nb = tb?.no ?? 0;
    if (na !== nb) return na - nb;
    return a.seatNo - b.seatNo;
  });
}