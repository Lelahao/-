import { NavLink } from "react-router-dom";
import { useUiStore } from "@/stores/uiStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
    isActive
      ? "bg-orange-50 font-medium text-orange-700 ring-1 ring-orange-200/70"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const widthClass = collapsed ? "w-[72px]" : "w-64";

  return (
    <aside
      className={[
        "z-20 flex h-svh shrink-0 flex-col border-r border-slate-200/90 bg-white shadow-[1px_0_0_rgb(15_23_42_/_0.04)]",
        widthClass,
        "transition-[width] duration-200 ease-out",
      ].join(" ")}
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-200/80 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-xs font-semibold text-white shadow-sm">
            排
          </div>
          {!collapsed && <span className="truncate text-sm font-semibold tracking-tight">排座助手</span>}
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
          title={collapsed ? "展开侧栏" : "折叠侧栏"}
          aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
        >
          <span className="text-base leading-none">{collapsed ? "»" : "«"}</span>
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-auto p-3">
        <NavLink to="/round/overview" end={false} className={navLinkClass} title="圆桌排座">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs">
            圆
          </span>
          {!collapsed && <span className="truncate">圆桌排座</span>}
        </NavLink>

        <NavLink
          to="/square"
          className={navLinkClass}
          title={collapsed ? "方桌排座（预留占位）" : "方桌排座"}
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs">
            方
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">方桌排座</span>
              <span className="ml-auto shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                预留占位
              </span>
            </span>
          )}
        </NavLink>

        <NavLink to="/plans" className={navLinkClass} title="方案管理">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs">
            案
          </span>
          {!collapsed && <span className="truncate">方案管理</span>}
        </NavLink>

        <NavLink to="/round/check" className={navLinkClass} title="圆桌检查">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs">
            查
          </span>
          {!collapsed && <span className="truncate">圆桌检查</span>}
        </NavLink>

        <div className="my-3 h-px bg-slate-100" />

        <NavLink to="/settings" className={navLinkClass} title="设置">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs">
            设
          </span>
          {!collapsed && <span className="truncate">设置</span>}
        </NavLink>

        <NavLink to="/about" className={navLinkClass} title="关于">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs">
            i
          </span>
          {!collapsed && <span className="truncate">关于</span>}
        </NavLink>
      </nav>
    </aside>
  );
}
