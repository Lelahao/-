import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RoundCheckPanel } from "@/components/RoundCheckPanel";
import type { RoundPersonRole, RoundPlanSnapshot } from "@/lib/roundSeatEngine";
import { autoArrangeRoundSeats, runRoundSeatChecks } from "@/lib/roundSeatEngine";

const cardShell =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]";

const btnOutline =
  "inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

function parseTableNo(id: string | undefined) {
  if (!id) return 4;
  const m = id.match(/(\d+)/);
  return m ? Number(m[1]) : 4;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

const INITIAL_SEAT_NAMES: Record<number, string> = {
  1: "周梓萱",
  2: "吴宇航",
  3: "郑思琪",
  4: "冯浩宇",
  5: "陈语桐",
  6: "褚嘉怡",
  7: "卫景澄",
  8: "蒋婧雯",
  9: "沈若琳",
  10: "韩子睿",
};

const INITIAL_UNASSIGNED = ["赵一鸣", "钱舒涵", "孙嘉树"];

type RosterEntry = { name: string; role?: RoundPersonRole | null };

function buildInitialRosterState() {
  const roster: Record<string, RosterEntry> = {};
  const seatToPersonId: Record<number, string | null> = {};
  let seq = 1;
  for (let i = 1; i <= 13; i++) {
    const nm = INITIAL_SEAT_NAMES[i];
    if (nm) {
      const id = `p${seq++}`;
      roster[id] = { name: nm };
      seatToPersonId[i] = id;
    } else {
      seatToPersonId[i] = null;
    }
  }
  const unassigned: { id: string; name: string }[] = [];
  for (const nm of INITIAL_UNASSIGNED) {
    const id = `p${seq++}`;
    roster[id] = { name: nm };
    unassigned.push({ id, name: nm });
  }
  roster["p1"].role = "zhubin";
  roster["p2"].role = "zhupe";
  return { roster, seatToPersonId, unassigned };
}

export function RoundTablePage() {
  const { tableId } = useParams();
  const tableNo = parseTableNo(tableId);
  const tableTitle = "客户桌";
  const tableUid = `tbl-${tableNo}`;

  const init = useMemo(() => buildInitialRosterState(), []);

  const [capacity, setCapacity] = useState(13);
  const [seatToPersonId, setSeatToPersonId] = useState<Record<number, string | null>>(() => ({
    ...init.seatToPersonId,
  }));
  const [roster, setRoster] = useState<Record<string, RosterEntry>>(() => ({ ...init.roster }));
  const [unassigned, setUnassigned] = useState(() => init.unassigned);
  const [capDraft, setCapDraft] = useState("13");
  const [locked, setLocked] = useState<Record<number, boolean>>({ 3: true, 7: true });
  const [fixed, setFixed] = useState<Record<number, boolean>>({ 1: true });
  const [entrance, setEntrance] = useState("北侧");
  const [isMainTable, setIsMainTable] = useState(true);

  const arrangedPeople = useMemo(() => {
    const rows: { seat: number; personId: string; name: string }[] = [];
    for (let s = 1; s <= capacity; s++) {
      const pid = seatToPersonId[s];
      if (pid && roster[pid]) rows.push({ seat: s, personId: pid, name: roster[pid].name });
    }
    return rows.sort((a, b) => a.seat - b.seat);
  }, [seatToPersonId, roster, capacity]);

  const occupiedCount = arrangedPeople.length;

  const localSnapshot = useMemo((): RoundPlanSnapshot => {
    const people = (Object.entries(roster) as [string, RosterEntry][]).map(([id, entry]) => {
      const base = {
        id,
        name: entry.name,
        role: entry.role ?? null,
        fixedTableId: null as string | null,
        fixedSeatNo: null as number | null,
      };
      return base;
    });
    for (let sn = 1; sn <= capacity; sn++) {
      if (!fixed[sn]) continue;
      const pid = seatToPersonId[sn];
      if (!pid) continue;
      const p = people.find((x) => x.id === pid);
      if (p) {
        p.fixedTableId = tableUid;
        p.fixedSeatNo = sn;
      }
    }
    const seats = [];
    for (let sn = 1; sn <= capacity; sn++) {
      seats.push({
        tableId: tableUid,
        seatNo: sn,
        personId: seatToPersonId[sn] ?? null,
        locked: Boolean(locked[sn]),
        fixed: Boolean(fixed[sn]),
      });
    }
    return {
      planId: `local-${tableUid}`,
      tables: [
        {
          id: tableUid,
          no: tableNo,
          hallName: tableTitle,
          capacity,
          isMainTable,
          entrance,
        },
      ],
      seats,
      people,
    };
  }, [roster, seatToPersonId, locked, fixed, capacity, entrance, isMainTable, tableNo, tableTitle, tableUid]);

  const checkResult = useMemo(() => runRoundSeatChecks(localSnapshot), [localSnapshot]);

  const trySetCapacity = (nextRaw: number) => {
    const next = clampInt(nextRaw, 1, 999);
    if (next === capacity) {
      setCapDraft(String(next));
      return;
    }

    if (next < capacity) {
      const blocked: number[] = [];
      for (let s = next + 1; s <= capacity; s++) {
        const id = seatToPersonId[s];
        if (id && roster[id]?.name?.trim()) blocked.push(s);
      }
      if (blocked.length) {
        window.alert(
          `无法缩小可坐人数：座位 ${blocked.join("、")} 仍有人，请先调整或移除后再缩小。`,
        );
        setCapDraft(String(capacity));
        return;
      }

      setSeatToPersonId((prev) => {
        const n: Record<number, string | null> = { ...prev };
        for (let s = next + 1; s <= capacity; s++) delete n[s];
        return n;
      });
      setLocked((prev) => {
        const n: Record<number, boolean> = { ...prev };
        for (const k of Object.keys(n)) {
          const s = Number(k);
          if (s > next) delete n[s];
        }
        return n;
      });
      setFixed((prev) => {
        const n: Record<number, boolean> = { ...prev };
        for (const k of Object.keys(n)) {
          const s = Number(k);
          if (s > next) delete n[s];
        }
        return n;
      });
    } else {
      setSeatToPersonId((prev) => {
        const n: Record<number, string | null> = { ...prev };
        for (let s = capacity + 1; s <= next; s++) {
          if (!(s in n)) n[s] = null;
        }
        return n;
      });
    }

    setCapacity(next);
    setCapDraft(String(next));
  };

  const toggleLock = (seat: number) => {
    setLocked((prev) => ({ ...prev, [seat]: !prev[seat] }));
  };

  const toggleFixed = (seat: number) => {
    setFixed((prev) => ({ ...prev, [seat]: !prev[seat] }));
  };

  const setRole = (personId: string, role: RoundPersonRole | "") => {
    setRoster((prev) => ({
      ...prev,
      [personId]: { ...prev[personId], role: role === "" ? null : role },
    }));
  };

  const applyAuto = () => {
    const nextSeats = autoArrangeRoundSeats(localSnapshot);
    const map: Record<number, string | null> = {};
    for (let s = 1; s <= capacity; s++) map[s] = null;
    for (const row of nextSeats) {
      if (row.tableId !== tableUid || row.seatNo < 1 || row.seatNo > capacity) continue;
      map[row.seatNo] = row.personId;
    }
    setSeatToPersonId(map);
    const seated = new Set(Object.values(map).filter((x): x is string => Boolean(x)));
    const nextUn = Object.keys(roster)
      .filter((id) => !seated.has(id))
      .map((id) => ({ id, name: roster[id].name }));
    setUnassigned(nextUn);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start">
      <section className={`${cardShell} w-full shrink-0 p-4 xl:w-[280px]`}>
        <div className="text-sm font-semibold text-slate-900">本桌人员</div>

        <div className="mt-4">
          <div className="text-xs font-medium text-slate-500">已安排（{occupiedCount}人）</div>
          <div className="mt-2 space-y-2">
            {arrangedPeople.length ? (
              arrangedPeople.map((p) => (
                <div
                  key={p.seat}
                  className="space-y-1 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{p.seat} 号</span>
                    <span className="truncate font-medium">{p.name}</span>
                  </div>
                  <select
                    className="h-8 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs text-slate-800"
                    value={roster[p.personId]?.role ?? ""}
                    onChange={(e) => setRole(p.personId, e.target.value as RoundPersonRole | "")}
                    aria-label={`${p.name} 角色`}
                  >
                    <option value="">普通</option>
                    <option value="zhupe">主陪</option>
                    <option value="zhubin">主宾</option>
                  </select>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">暂无已安排人员</div>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs font-medium text-slate-500">未安排（{unassigned.length}人）</div>
          <div className="mt-2 space-y-2">
            {unassigned.map((u) => (
              <div key={u.id} className="space-y-1 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-900">
                <div>{u.name}</div>
                <select
                  className="h-8 w-full rounded-lg border border-slate-200/90 bg-slate-50 px-2 text-xs text-slate-800"
                  value={roster[u.id]?.role ?? ""}
                  onChange={(e) => setRole(u.id, e.target.value as RoundPersonRole | "")}
                  aria-label={`${u.name} 角色`}
                >
                  <option value="">普通</option>
                  <option value="zhupe">主陪</option>
                  <option value="zhubin">主宾</option>
              </select>
              </div>
            ))}
          </div>
        </div>

        <button type="button" className={`${btnOutline} mt-4 w-full`}>
          从人员库添加
        </button>
      </section>

      <section className={`${cardShell} min-w-0 flex-1 p-6`}>
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900">
            第 {tableNo} 桌 · {tableTitle}
          </div>
          <div className="mt-1 text-sm text-slate-600">可坐人数：{capacity} 人</div>
          <div className="mt-1 text-sm font-semibold text-orange-600">
            {occupiedCount}/{capacity}
          </div>
        </div>

        <div className="relative mx-auto mt-6 h-[420px] w-[420px] max-w-full">
          <div className="absolute left-1/2 top-1/2 w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
            <div className="font-semibold text-slate-900">圆桌示意</div>
            <div className="mt-1">门口示意：{entrance}</div>
          </div>

          {Array.from({ length: capacity }, (_, i) => {
            const seatNo = i + 1;
            const pid = seatToPersonId[seatNo] ?? null;
            const name = pid ? roster[pid]?.name : null;
            const isLocked = Boolean(locked[seatNo]);
            const radius = 185;
            const angle = (2 * Math.PI * i) / capacity - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            return (
              <div
                key={seatNo}
                className="absolute left-1/2 top-1/2 w-[150px]"
                style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
              >
                <div
                  className={[
                    "rounded-2xl border px-2 py-2 text-center shadow-sm",
                    isLocked ? "border-orange-300 bg-orange-50" : "border-slate-200/90 bg-white",
                  ].join(" ")}
                >
                  <div className="text-[11px] font-semibold text-slate-500">{seatNo} 号</div>
                  {name ? (
                    <div className="mt-1 truncate text-sm font-semibold text-slate-900">{name}</div>
                  ) : (
                    <div className="mt-1 text-xs font-medium text-emerald-700">可安排</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <aside className="w-full shrink-0 space-y-4 xl:w-[320px]">
        <div className={`${cardShell} p-5`}>
          <div className="text-sm font-semibold text-slate-900">桌子设置</div>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600">桌型</span>
              <span className="font-medium text-slate-900">圆桌</span>
            </div>

            <div>
              <div className="text-xs text-slate-500">可坐人数</div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => trySetCapacity(capacity - 1)}
                  aria-label="减少可坐人数"
                >
                  −
                </button>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-center text-sm font-semibold text-slate-900 shadow-sm"
                  inputMode="numeric"
                  value={capDraft}
                  onChange={(e) => setCapDraft(e.target.value.replace(/[^\d]/g, ""))}
                  onBlur={() => {
                    const v = capDraft === "" ? 1 : Number(capDraft);
                    trySetCapacity(Number.isFinite(v) ? v : 1);
                  }}
                />
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => trySetCapacity(capacity + 1)}
                  aria-label="增加可坐人数"
                >
                  +
                </button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">支持任意正整数（上限 999）</div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600">当前人数</span>
              <span className="font-semibold text-slate-900">
                {occupiedCount} / {capacity}
              </span>
            </div>

            <div>
              <div className="text-xs text-slate-500">门口方向</div>
              <select
                className="mt-2 h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-sm text-slate-900 shadow-sm"
                value={entrance}
                onChange={(e) => setEntrance(e.target.value)}
              >
                {["北侧", "南侧", "东侧", "西侧"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600">是否主桌</span>
              <div className="inline-flex overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50 p-1">
                <button
                  type="button"
                  className={[
                    "rounded-lg px-3 py-1 text-sm font-semibold",
                    isMainTable ? "bg-white text-slate-600 shadow-sm" : "bg-orange-500 text-white",
                  ].join(" ")}
                  onClick={() => setIsMainTable(false)}
                >
                  否
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-lg px-3 py-1 text-sm font-semibold",
                    isMainTable ? "bg-orange-500 text-white" : "bg-white text-slate-600 shadow-sm",
                  ].join(" ")}
                  onClick={() => setIsMainTable(true)}
                >
                  是
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`${cardShell} p-5`}>
          <div className="text-sm font-semibold text-slate-900">锁定座位</div>
          <div className="mt-3 grid grid-cols-6 gap-2">
            {Array.from({ length: capacity }, (_, i) => {
              const seat = i + 1;
              const on = Boolean(locked[seat]);
              return (
                <button
                  key={seat}
                  type="button"
                  onClick={() => toggleLock(seat)}
                  className={[
                    "h-9 rounded-lg border text-xs font-semibold",
                    on
                      ? "border-orange-300 bg-orange-500 text-white"
                      : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                  aria-pressed={on}
                >
                  {seat}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">已锁定座位为橙色</div>
        </div>

        <div className={`${cardShell} p-5`}>
          <div className="text-sm font-semibold text-slate-900">固定座位</div>
          <p className="mt-1 text-[11px] text-slate-500">自动排座时优先保留（未锁定时仍可能重排其他座）。</p>
          <div className="mt-3 grid grid-cols-6 gap-2">
            {Array.from({ length: capacity }, (_, i) => {
              const seat = i + 1;
              const on = Boolean(fixed[seat]);
              return (
                <button
                  key={seat}
                  type="button"
                  onClick={() => toggleFixed(seat)}
                  className={[
                    "h-9 rounded-lg border text-xs font-semibold",
                    on
                      ? "border-sky-400 bg-sky-500 text-white"
                      : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                  aria-pressed={on}
                >
                  {seat}
                </button>
              );
            })}
          </div>
        </div>

        <RoundCheckPanel result={checkResult} detailLink="/round/check" compact />

        <div className={`${cardShell} p-5`}>
          <button
            type="button"
            onClick={applyAuto}
            className="w-full rounded-xl border border-orange-200 bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            本桌自动排座
          </button>
          <Link
            to="/round/check"
            className="mt-2 block text-center text-xs font-medium text-orange-700 hover:text-orange-800"
          >
            打开方案级检查详情页
          </Link>
        </div>

        <div className={`${cardShell} p-5`}>
          <div className="text-sm font-semibold text-slate-900">导出</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {["Excel", "Word", "PPT", "PNG图片"].map((label) => (
              <button key={label} type="button" className={btnOutline}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
