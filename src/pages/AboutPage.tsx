export function AboutPage() {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_2px_rgb(15_23_42_/_0.06),0_8px_24px_rgb(15_23_42_/_0.04)]">
      <h2 className="text-lg font-semibold text-slate-900">关于</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        排座助手 · 本地桌面应用骨架（Tauri + React + Vite + Tailwind + React Router + Zustand）。
      </p>
      <p className="mt-2 text-xs text-slate-400">版本 0.1.0（开发中）</p>
    </section>
  );
}
