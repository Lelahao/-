# 排座助手（paizuo-assistant）

本地桌面排座工具：**Electron** 桌面壳 + **React / Vite** 前端 + **Python FastAPI + SQLite** 后端。

## 技术栈

| 层级 | 技术 |
|------|------|
| UI | React 19、Vite 7、Tailwind CSS 4、React Router、Zustand |
| 桌面 | Electron 34、electron-builder（Windows NSIS / dir） |
| 后端 | Python 3.12+、FastAPI、Uvicorn、SQLite（`paizuo.db`） |
| 后端分发 | PyInstaller → `dist-backend/paizuo-backend.exe` |

原 **Tauri / Rust** 实现已归档至 **`archive/src-tauri/`**，不再参与默认构建。

## 开发环境要求

- Node.js 与 npm  
- Python 3.12+（建议与打包环境一致）  
- Windows 开发机（当前脚本与路径以 Win 为主）

## 本地开发

1. 安装依赖：`npm install`
2. 安装后端依赖：`pip install -r server/requirements.txt`
3. 可选：安装打包用依赖 `pip install -r server/requirements-build.txt`
4. **终端 A**：`npm run dev:backend` — 启动 API（默认 `http://127.0.0.1:8765`）
5. **终端 B**：`npm run dev` — 启动 Vite（`http://127.0.0.1:1420`，`/api` 会代理到后端）

前端亦可使用默认 `VITE_API_BASE_URL` 直连后端（见 `src/api/client.ts`）。

### Electron 联调（推荐整体验证）

```bash
npm run electron:dev
```

将并行启动 Vite 与 Electron；主进程会启动本机 **Python uvicorn**（开发态），详见 `electron/backendProcess.ts`。

## 构建与发布

| 命令 | 说明 |
|------|------|
| `npm run build:frontend` | TypeScript + Vite 生产构建 → `dist/` |
| `npm run build:backend` | PyInstaller → `dist-backend/paizuo-backend.exe` |
| `npm run electron:compile` | TypeScript 编译 Electron 主进程 → `dist-electron/` |
| `npm run build:desktop` | 前端 + 后端 exe + Electron 编译 → **`release/win-unpacked`**（绿色目录） |
| `npm run dist:win` | 同上并生成 **NSIS 安装包**（`release/排座助手-Setup-*.exe`） |

**图标**：将 **`build/icons/icon.ico`** 置于仓库后再打正式包（见 `build/icons/README.md`）。

更多交付与数据路径说明见：**`docs/排座助手_桌面版交付说明.md`**。

## 文档

- **`docs/排座助手_桌面版交付说明.md`** — 安装、数据目录、构建、常见问题  
- **`docs/tauri_to_rest_api_mapping.md`** — 历史 Tauri invoke 与 REST 对照（归档参考）

## 许可证

见各依赖组件声明；本项目未在仓库内统一声明开源许可证时以团队约定为准。
