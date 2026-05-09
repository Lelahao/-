/** 可与后端 SQLite `plans` 关联、用于版本 API 的 planId（非演示/占位）。 */
export function isLinkableBackendPlanId(planId: string): boolean {
  if (!planId?.trim()) return false;
  if (planId === "demo-overview" || planId === "from-layout") return false;
  return true;
}
