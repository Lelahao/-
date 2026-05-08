import { contextBridge, ipcRenderer } from "electron";

/** 仅暴露环境信息；业务一律走 HTTP，不暴露 CRUD。 */
contextBridge.exposeInMainWorld("paizuoDesktop", {
  getEnv: () =>
    ipcRenderer.invoke("paizuo:getEnv") as Promise<{
      apiOrigin: string;
      backendPort: number;
    }>,
});
