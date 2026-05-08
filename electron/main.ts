import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { startBackend, stopBackend, getBackendOrigin } from "./backendProcess";
import { getBackendPort } from "./paths";
import { logLine } from "./logger";

const VITE_DEV_URL = "http://127.0.0.1:1420";

ipcMain.handle("paizuo:getEnv", () => ({
  apiOrigin: getBackendOrigin(),
  backendPort: getBackendPort(),
}));

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  await startBackend();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isUnpackaged = !app.isPackaged;
  if (isUnpackaged) {
    await mainWindow.loadURL(VITE_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    await mainWindow.loadFile(indexHtml);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

void app
  .whenReady()
  .then(() =>
    createWindow().catch((e: Error) => {
      logLine("main", `createWindow failed: ${e.message}`);
      stopBackend();
      app.quit();
    }),
  );

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopBackend();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch((e: Error) => logLine("main", `activate createWindow: ${e.message}`));
  }
});
