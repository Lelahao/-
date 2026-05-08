# Tauri invoke → 本地 REST API 映射

**服务前缀：** 除另行说明外，业务接口均为 `http://127.0.0.1:8765/api/...`（以 `npm run dev:backend` 为准）。

**绑定：** `uvicorn` 使用 `--host 127.0.0.1`，不对外网监听。

**数据库：** 每请求 `get_connection()`，写操作在路由内通过 `BEGIN IMMEDIATE` / `commit` / `rollback` 封装。

**错误体：** 多数错误为 JSON `{ "message": "..." }`；`* not found` 类 `ValueError` 返回 **404**，其余 `ValueError` 为 **400**；外键等约束失败为 **400**（`sqlite3.IntegrityError`）。

**迁移状态说明：**「后端已完成」表示 Python/SQLite 已实现且可供验收；「前端未接入」表示 `src/` 仍使用 Tauri `invoke`，尚未改为 HTTP。

---

## 1. 方案

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| `db_create_plan` | POST | `/api/plans` | JSON：`{ "name": string, "note"?: string \| null }`（支持 camelCase） | `{ "id": string, "updatedAt": number }` | 后端已完成；前端未接入 |
| `db_list_plans` | GET | `/api/plans` | — | `{ "plans": PlanRow[] }` | 同上 |
| `db_update_plan` | PATCH | `/api/plans/{planId}` | JSON：`{ "name"?, "note"?, "status"? }` | `{ "id": string, "updatedAt": number }` | 同上 |
| `db_delete_plan` | DELETE | `/api/plans/{planId}` | — | `{ "ok": true }` | 同上 |
| `db_get_plan_detail` | GET | `/api/plans/{planId}` | — | `{ "plan", "people", "tables", "seats" }`（字段名为 camelCase，与 Rust JSON 一致） | 同上 |

---

## 2. 人员

Rust **无**独立 `db_save_people`；人员列表包含在 `db_get_plan_detail`。

| 能力 | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------|------|-----------|------|------|----------|
| 读取方案下人员（同 detail.people） | GET | `/api/plans/{planId}/people` | — | `{ "people": PersonRow[] }` | 后端已完成（REST 扩展，等价于 detail 子集）；前端未接入 |
| 批量 upsert 人员 | PUT | `/api/plans/{planId}/people` | `{ "people": object[] }`（元素支持 `id`/`displayName`/`assignedTableId`/`assignedSeatNo`/`metaJson` 等 camelCase） | `{ "planUpdatedAt": number }` | 后端已完成（REST 扩展，写入 `people` 并打 `savePeople` 日志）；前端未接入 |

---

## 3. 桌

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| （读来自 detail） | GET | `/api/plans/{planId}/tables` | — | `{ "tables": TableRow[] }` | 后端已完成；前端未接入 |
| `db_save_tables` | PUT | `/api/plans/{planId}/tables` | `{ "tables": [{ "id"?, "tableNo", "hallName"?, "capacity", "kind"? }] }` | `{ "planUpdatedAt": number }` | 后端已完成；前端未接入 |

---

## 4. 座位

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| （读来自 detail） | GET | `/api/plans/{planId}/seats` | — | `{ "seats": SeatRow[] }` | 后端已完成；前端未接入 |
| `db_save_seats` | PUT | `/api/plans/{planId}/seats` | `{ "seats": [{ "id"?, "tableId", "seatNo", "personId"?, "locked"? }] }` | `{ "planUpdatedAt": number }` | 后端已完成；前端未接入 |
| `db_move_seat_person` | POST | `/api/plans/{planId}/seats/move-person` | `{ "personId", "targetTableId", "targetSeatNo" }` | `{ "planUpdatedAt": number }` | 后端已完成；前端未接入 |
| `db_swap_seat_persons` | POST | `/api/plans/{planId}/seats/swap` | `{ "a": { "tableId", "seatNo" }, "b": { ... } }` | `{ "planUpdatedAt": number }` | 后端已完成；前端未接入 |

---

## 5. 全屏圆桌布局（拖拽坐标等）

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| `load_round_layout` | GET | `/api/round-layout` | — | `{ "people": [...], "tables": [...] }`（camelCase，与前端 `LayoutDto` 一致） | 后端已完成；前端未接入 |
| `save_round_layout` | PUT | `/api/round-layout` | 同上结构的 JSON body | `{ "ok": true }` | 后端已完成；前端未接入 |

持久化使用单库 `paizuo.db` 中的 `round_layout_*` 表（见迁移脚本）。

---

## 6. UI 设置（含侧栏折叠）

| 原 Tauri command | 方法 | REST 路径 | 请求 | 响应 | 迁移状态 |
|------------------|------|-----------|------|------|----------|
| `db_save_ui_setting` | POST | `/api/settings` | `{ "key": string, "value": string }` | `{ "key": string, "updatedAt": number }` | 后端已完成；前端未接入 |
| `db_get_ui_setting` | GET | `/api/settings/{key}` | — | `{ "key", "value", "updatedAt" }` 或 `null`（无记录时） | 后端已完成；前端未接入 |
| — | GET | `/api/settings` | — | `{ "items": UISettingRow[] }` | 后端扩展；前端未接入 |

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
| 存活检测 | GET | `/api/health` | `{ "status": "ok" }` | 后端已完成（路径已纳入 `/api`） |

---

## 10. 未完成风险与下一阶段（摘录）

- **前端**仍调用 Tauri，REST 需下一阶段将 `src/lib/dbApi.ts` 等改为 HTTP 基址。
- **数据迁移**：历史 `paizuo_core.db` / `paizuo_round.db` 合并入 `paizuo.db` 的脚本未在本阶段实现。
- **鉴权**：当前仅本机绑定，无 token；若未来改为局域网访问需另加约束。
