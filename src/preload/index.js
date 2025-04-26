import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 打开登录窗口
  openLoginWindow: () => {
    ipcRenderer.send('open-login-window')
  },
  // 检查登录状态
  checkLoginStatus: () => {
    return ipcRenderer.invoke('check-login-status')
  },
  // 清除登录Cookie
  clearCookies: () => {
    ipcRenderer.send('clear-cookies')
  },
  // 获取存储的Cookie
  getCookies: () => {
    return ipcRenderer.invoke('get-cookies')
  },

  // 网络请求相关
  sendRequest: (url, options) => {
    return ipcRenderer.invoke('sendRequest', url, options)
  },

  // Excel文件处理
  createExcelFile: (options) => {
    return ipcRenderer.invoke('createExcelFile', options)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
