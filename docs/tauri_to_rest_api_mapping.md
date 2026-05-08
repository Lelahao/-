# Tauri invoke → 本地 REST API 映射（历史对照）

> **归档说明**：桌面壳已切换为 **Electron**，原 **Tauri / Rust** 工程已移至 `archive/src-tauri/`。本文档仅保留早期 **invoke → HTTP** 对照，便于查阅；运行时请以当前 FastAPI 与 `src/api/*` 为准。

**服务前缀：** 除另行说明外，业务接口均为 `http://127.0.0.1:8765/api/...`（以 `npm run dev:backend` 为准）。

**绑定：** `uvicorn` 使用 `--host 127.0.0.1`，不对外网监听。

**数据库：** 每请求 `get_connection()`，写操作在路由内通过 `BEGIN IMMEDIATE` / `commit` / `rollback` 封装。

**错误体：** 多数错误为 JSON `{ "message": "..." }`；`* not found` 类 `ValueError` 返回 **404**，其余 `ValueError` 为 **400**；外键等约束失败为 **400**（`sqlite3.IntegrityError`）。

**迁移状态说明：**「后端已完成」表示 Python/SQLite 已实现；「前端已接入（HTTP）」表示 `src/lib/dbApi.ts` 或 `src/fullscreen/roundStorage.ts` 已通过 `src/api/*` 调用 REST，失败时回退内存 mock 或 `localStorage`；「前端未接入」表示尚无调用方或仍待接线。

**前端 API 基址：** `VITE_API_BASE_URL`（可选）；未设置时默认 `http://127.0.0.1:8765`（与 `npm run dev:backend` 一致）。若后端跑在 8000 端口，可在 `.env` 中设置 `VITE_API_BASE_URL=http://127.0.0.1:8000`。

---

## 1. 方案

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| `db_create_plan` | POST | `/api/plans` | JSON：`{ "name": string, "note"?: string \| null }`（支持 camelCase） | `{ "id": string, "updatedAt": number }` | 后端已完成；**前端已接入** `src/api/plans.ts` → `dbApi.createPlan` |
| `db_list_plans` | GET | `/api/plans` | — | `{ "plans": PlanRow[] }` | 后端已完成；**前端已接入** `dbApi.listPlans` |
| `db_update_plan` | PATCH | `/api/plans/{planId}` | JSON：`{ "name"?, "note"?, "status"? }` | `{ "id": string, "updatedAt": number }` | 后端已完成；**前端已接入** `dbApi.updatePlan` |
| `db_delete_plan` | DELETE | `/api/plans/{planId}` | — | `{ "ok": true }` | 后端已完成；**前端已接入** `dbApi.deletePlan` |
| `db_get_plan_detail` | GET | `/api/plans/{planId}` | — | `{ "plan", "people", "tables", "seats" }`（camelCase） | 后端已完成；**前端已接入** `dbApi.getPlanDetail` |

---

## 2. 人员

Rust **无**独立 `db_save_people`；人员列表包含在 `db_get_plan_detail`。

| 能力 | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------|------|-----------|------|------|----------|
| 读取方案下人员（同 detail.people） | GET | `/api/plans/{planId}/people` | — | `{ "people": PersonRow[] }` | 后端已完成；**前端已接入** `dbApi.listPeopleForPlan`（独立列表；`getPlanDetail` 亦含人员） |
| 批量 upsert 人员 | PUT | `/api/plans/{planId}/people` | `{ "people": object[] }` | `{ "planUpdatedAt": number }` | 后端已完成；**前端已接入** `dbApi.upsertPlanPeople` |

---

## 3. 桌

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| （读来自 detail） | GET | `/api/plans/{planId}/tables` | — | `{ "tables": TableRow[] }` | 后端已完成；前端可经 **`dbApi.getPlanDetail`**；亦提供 `src/api/tables.ts#listTables` |
| `db_save_tables` | PUT | `/api/plans/{planId}/tables` | `{ "tables": [...] }` | `{ "planUpdatedAt": number }` | 后端已完成；**前端已接入** `dbApi.saveTables` |

---

## 4. 座位

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| （读来自 detail） | GET | `/api/plans/{planId}/seats` | — | `{ "seats": SeatRow[] }` | 后端已完成；前端可经 **`dbApi.getPlanDetail`**；亦提供 `src/api/seats.ts#listSeats` |
| `db_save_seats` | PUT | `/api/plans/{planId}/seats` | `{ "seats": [...] }` | `{ "planUpdatedAt": number }` | 后端已完成；**前端已接入** `dbApi.saveSeats` |
| `db_move_seat_person` | POST | `/api/plans/{planId}/seats/move-person` | `{ "personId", "targetTableId", "targetSeatNo" }` | `{ "planUpdatedAt": number }` | 后端已完成；**前端已接入** `dbApi.moveSeatPerson` |
| `db_swap_seat_persons` | POST | `/api/plans/{planId}/seats/swap` | `{ "a": { "tableId", "seatNo" }, "b": { ... } }` | `{ "planUpdatedAt": number }` | 后端已完成；**前端已接入** `dbApi.swapSeatPersons` |

---

## 5. 全屏圆桌布局（拖拽坐标等）

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| `load_round_layout` | GET | `/api/round-layout` | — | `{ "people", "tables" }` | 后端已完成；**前端已接入** `src/api/layouts.ts` → `roundStorage.loadLayoutSnapshot` |
| `save_round_layout` | PUT | `/api/round-layout` | JSON body | `{ "ok": true }` | 后端已完成；**前端已接入** `roundStorage.saveLayoutSnapshot` |

持久化使用单库 `paizuo.db` 中的 `round_layout_*` 表（见迁移脚本）。

---

## 6. UI 设置（含侧栏折叠）

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| `db_save_ui_setting` | POST | `/api/settings` | `{ "key": string, "value": string }` | `{ "key": string, "updatedAt": number }` | 后端已完成；**前端已接入** `dbApi.saveUISetting`（如侧栏折叠） |
| `db_get_ui_setting` | GET | `/api/settings/{key}` | — | `{ "key", "value", "updatedAt" }` 或 `null` | 后端已完成；**前端已接入** `dbApi.getUISetting` |
| — | GET | `/api/settings` | — | `{ "items": UISettingRow[] }` | 后端扩展；前端未接专用封装（可直接用 `apiFetchJson`） |

**侧栏折叠验收：**

- **读取：** `GET /api/settings/sidebarCollapsed` → 与 Tauri 相同 key；值为字符串（应用中为 `JSON.stringify` 的布尔，如 `"true"` / `"false"`）。
- **保存：** `POST /api/settings`，body `{ "key": "sidebarCollapsed", "value": "true" }` 或 `"false"`（与当前前端 `JSON.stringify(boolean)` 一致）。

---

## 7. 导出记录

Rust **无**对应 invoke；表 `export_records` 已在核心库中定义。

| 能力 | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------|------|-----------|------|------|----------|
| 写入导出记录 | POST | `/api/exports` | `{ "format": string, "planId"?: string \| null, "meta"?: object }` | `{ "id": string, "createdAt": number }` | 后端已完成；前端未接入 |
| 列表 | GET | `/api/exports?planId=&limit=` | query 可选 | `{ "items": [...] }` | 同上 |

---

## 8. 活动日志

Rust **无**读日志 command；写入由各 `db_*` 操作内 `log_activity` 完成（Python 侧对等）。

| 能力 | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------|------|-----------|------|------|----------|
| 列表 | GET | `/api/activity-logs?planId=&limit=` | query 可选 | `{ "items": [{ "id", "planId", "action", "payloadJson", "createdAt" }] }` | 后端已完成；前端未接入 |

---

## 9. 健康检查

| 说明 | 方法 | REST 路径 | 响应 | 迁移状态 |
|------|------|-----------|------|----------|
| 存活检测 | GET | `/api/health` | `{ "status": "ok" }` | 后端已完成；前端未单独封装 `api/health.ts`，需要时可 `apiFetchJson("/api/health")` |

---

## 10. 未完成风险与下一阶段（摘录）

- **`src/` 内 Tauri `invoke`：** 已全部移除；数据路径以本地 HTTP 为准（失败回退 mock / `localStorage`）。见下文「剩余 invoke 清单」。
- **数据迁移**：历史 `paizuo_core.db` / `paizuo_round.db` 合并入 `paizuo.db` 的脚本仍未实现。
- **鉴权**：当前仅本机绑定，无 token。

---

## 11. `src` 内剩余 `invoke` 清单（阶段核对）

当前在 `src/` 下搜索 `@tauri-apps/api/core` 的 `invoke`：**无匹配**。原 `db_create_plan` 等与 `save_round_layout` 均已改为 `fetch`。
