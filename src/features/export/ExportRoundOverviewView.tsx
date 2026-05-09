import { RoundOverviewBoard, overviewExportGridClass } from "@/components/round/RoundOverviewBoard";
import { RoundTableVisual } from "@/components/round/RoundTableVisual";
import type { ExportScene } from "./exportScene";

export function ExportRoundOverviewView(props: { scene: ExportScene }) {
  const { scene } = props;
  const exportedAtLabel =
    scene.versionExport?.savedAtLine ??
    `导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`;

  const exportFooter = (
    <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-sm font-semibold text-slate-900">未安排人员</div>
      {scene.unassignedPeople.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">未安排人员：无</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {scene.unassignedPeople.map((p) => (
            <li
              key={p.id}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-800"
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <RoundOverviewBoard
      mode="export"
      planName={scene.planName}
      stats={{
        tableCount: scene.stats.tableCount,
        peopleTotal: scene.stats.peopleCount,
        assigned: scene.stats.assignedCount,
        unassigned: scene.stats.unassignedCount,
      }}
      tableCount={scene.tables.length}
      exportMeta={{
        versionLine: scene.versionExport?.versionLine,
        exportedAtLabel,
      }}
      exportFooter={exportFooter}
      exportGridClassName={overviewExportGridClass(scene.tables.length)}
    >
      {scene.tables.map((t) => (
        <div
          key={t.tableId}
          className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_1px_2px_rgb(15_23_42_/_0.06)]"
        >
          <div className="text-center text-sm font-semibold text-slate-900">
            {t.tableNo}号桌 · {t.hallName}
          </div>
          <div className="mt-0.5 text-center text-xs text-slate-500">{t.capacity}人桌</div>
          <div className="mt-2 flex justify-center">
            <RoundTableVisual
              mode="export"
              tableNo={t.tableNo}
              tableKind={t.tableKind}
              capacity={t.capacity}
              seatOccupied={t.seats.map((s) => !s.isEmpty)}
              seatNames={t.seats.map((s) => s.personName)}
            />
          </div>
        </div>
      ))}
    </RoundOverviewBoard>
  );
}
