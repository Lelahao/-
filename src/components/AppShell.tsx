import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TopToolbar } from "@/components/TopToolbar";

export function AppShell() {
  return (
    <div className="flex h-svh min-h-0 bg-slate-50 text-slate-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopToolbar />
        <main className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
