/**
 * 圆桌席位方位模板（前端展示用，不与后端持久化耦合）。
 * seatNo 从 1 开始，与业务座位号一致。
 */

const KEY_ROLES: Record<number, string> = {
  1: "主陪",
  2: "主宾",
  4: "副陪",
};

/** 与 seatNo 对径的座位号（1..capacity）；偶数为严格对面，奇数为约 180° 步长。 */
export function oppositeSeatNo(seatNo: number, capacity: number): number {
  const n = Math.max(1, Math.trunc(capacity));
  if (n < 2) return seatNo;
  const off = Math.floor(n / 2);
  return ((seatNo - 1 + off) % n) + 1;
}

export const SEAT_ROLE_TEMPLATES = {
  6: KEY_ROLES,
  8: KEY_ROLES,
  10: KEY_ROLES,
  12: KEY_ROLES,
} as const;

export type SeatTemplateCapacity = keyof typeof SEAT_ROLE_TEMPLATES;

/** capacity 对应 6 / 8 / 10 / 12 中与实际人数距离最短的一侧；并列时取较小容量。 */
export function resolveTemplateCapacity(capacity: number): SeatTemplateCapacity {
  const candidates: SeatTemplateCapacity[] = [6, 8, 10, 12];
  let best = candidates[0];
  let bestD = Math.abs(capacity - best);
  for (const c of candidates) {
    const d = Math.abs(capacity - c);
    if (d < bestD) {
      best = c;
      bestD = d;
    } else if (d === bestD && c < best) {
      best = c;
    }
  }
  return best;
}

/** 关键方位：1 号为主陪，其对面为副陪；其余沿用模板中的主宾（不再把模板里的「副陪」用于非对席位）。 */
export function getSeatRoleLabel(capacity: number, seatNo: number): string | null {
  const n = Math.max(1, Math.trunc(capacity));
  if (seatNo < 1 || seatNo > n) return null;
  if (seatNo === 1) return "主陪";
  if (seatNo === oppositeSeatNo(1, n)) return "副陪";

  const tplCap = resolveTemplateCapacity(capacity);
  const map = SEAT_ROLE_TEMPLATES[tplCap];
  const label = map[seatNo as keyof typeof map] ?? null;
  if (!label) return null;
  if (label === "主陪" || label === "副陪") return null;
  return label;
}

export type TableKindSource = {
  tableRole?: string | null;
  role?: string | null;
  hallName?: string | null;
  name?: string | null;
  label?: string | null;
  note?: string | null;
  isMainTable?: boolean | null;
};

/**
 * 中心圆桌「桌别」文案。未命中任何字段且无法从 isMainTable 推断时返回 null，仅显示桌号。
 * 当前 RoundTableInput / TableDefinition 多数仅有 hallName、isMainTable，故常以厅名或 主桌/宾客桌 显示。
 */
export function resolveTableCategoryLabel(table: TableKindSource): string | null {
  const pick = (s?: string | null) => {
    const t = s?.trim();
    return t ? t : null;
  };
  const a = pick(table.tableRole);
  if (a) return a;
  const b = pick(table.role);
  if (b) return b;
  if (table.isMainTable === true) return "主桌";
  if (table.isMainTable === false) return "宾客桌";
  const c = pick(table.hallName);
  if (c) return c;
  const d = pick(table.name);
  if (d) return d;
  const e = pick(table.label);
  if (e) return e;
  const f = pick(table.note);
  if (f) return f;
  return null;
}
