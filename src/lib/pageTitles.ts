export function titleForPath(pathname: string): string {
  if (pathname.startsWith("/plans")) return "方案管理";
  if (pathname.startsWith("/round/fullscreen")) return "圆桌排座 · 全屏总览";
  if (pathname.startsWith("/round/table/")) return "圆桌排座 · 单桌编辑";
  if (pathname.startsWith("/round/overview")) return "圆桌排座 · 总览";
  if (pathname.startsWith("/square")) return "方桌排座";
  if (pathname.startsWith("/settings")) return "设置";
  if (pathname.startsWith("/about")) return "关于";
  return "排座助手";
}
