# AGENTS.md · 排座助手项目级铁律

> 本文档面向所有协作 AI（Cursor / Claude / Codex 等）与人类工程师。每一次提示词无需再重复以下约束，违反任何一条视为方案不合格。  
> 关联资料：`README.md`、`docs/排座助手_桌面版交付说明.md`、`docs/排座助手_桌面版验收清单.md`。

## 1. 技术边界

- 不引入 Tauri。原 `archive/src-tauri/` 仅作历史参考，不得回迁。
- 不重构以下技术栈：Electron（桌面壳）、Vite + React 19（前端）、FastAPI + uvicorn（后端）、SQLite（持久化）。
- 不为本次需求新增无必要的 REST 端点。优先复用现有接口：
  - 方案 CRUD：`/api/plans`、`/api/plans/{id}`
  - 桌次保存（全量）：`PUT /api/plans/{id}/tables`（已有 keep / insert / delete 三态）
  - 人员 CRUD / 导入：`/api/plans/{id}/people`、`/api/plans/{id}/people/{personId}`、`/api/plans/{id}/people/import`
  - 座位移动 / 交换 / 退回：`/api/plans/{id}/seats/...`、`.../people/{personId}/unassign`
  - 版本：`POST /api/plans/{id}/versions`、`GET /api/plans/{id}/versions/...`

## 2. 数据库边界

- 不改 `plans` 表去新增 `table_count` / `guest_count` 等统计字段。桌数 / 人数始终通过 `tables.length` / `people.length` 在读时计算。
- 不重复建设版本能力。保存版本一律走现有 `createPlanVersion` / 版本管理流程，不另起 API、不另建 snapshot 表。
- `people.region` / `position` / `role` 在 schema 中**已经允许 NULL**（`server/migrations/schema.sql`），不要再为"放开必填"去改库结构。

## 3. 人员字段约束（贯穿前后端）

- **姓名**必填；**区域 / 岗位 / 角色**全部为选填。
- "角色"恒为用户**自定义文本输入**：
  - 不得使用下拉 / select / radio。
  - 不得预置选项。
  - 不得设默认值。
  - 后端不做 enum / Literal 校验。
  - Excel 模板"角色"列不得有 dataValidation / 默认值 / 预填示例。

## 4. 开发原则

- **先想再写**：动手前先 grep / 读相关文件，确认当前状态；不要基于过期假设改代码。
- **最小修复**：每一行变更都能追溯到用户的明确需求；不顺手"改进"无关代码、不顺手重排格式。
- **外科手术**：不做大范围重构，不修改与本次任务无关的文件；如果发现死代码或潜在问题，**先提示再决定**，不擅自删除。
- **可验证收尾**：每次修改后必须运行必要的构建 / 类型检查：
  - 前端：`npm run build`（含 `tsc -b`）必须通过。
  - 后端：改了 `server/**/*.py` 需保证 `python -m uvicorn server.main:app ...` 能起。
- **完成报告**：交付时必须列出
  1. 实际改了哪些文件（路径 + 简述）
  2. 为什么改（直接对应用户哪条需求）
  3. 如何本地验证（最少 1 条人肉可复现的操作步骤）

## 5. 构建产物与脏数据

- 不要提交 `dist/`、`dist-electron/`、`dist-backend/`、`release*/`、`node_modules/`、`__pycache__/`、`*.pyc` 到 git。
- 不要提交本地 SQLite 数据（`server/data/paizuo.db` 等）。
- 不要提交测试用 Excel、调试日志（如 `debug-*.log`）。

## 6. 调试惯例

- 任何运行时日志埋点（含 `console.log`、HTTP fetch 上报）在确认根因 / 修复验证通过后**必须删除**，不得遗留到提交里。
- 不用 `setTimeout` / `sleep` 当作修复手段——必须用真正的事件 / 生命周期 / reactive 依赖。
