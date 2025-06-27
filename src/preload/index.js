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

  // 保存文件到本地
  saveFile: (params) => {
    return ipcRenderer.invoke('saveFile', params)
  },

  // 保存Excel文件并获取路径
  saveExcelAndGetPath: (params) => {
    return ipcRenderer.invoke('save-excel-and-get-path', params)
  },

  // 直接保存文件到下载文件夹
  saveFileToDownloads: (data, fileName) => {
    return ipcRenderer.invoke('saveFileToDownloads', data, fileName)
  },

  // 通过主进程上传状态更新文件
  uploadStatusUpdateFile: (options) => ipcRenderer.invoke('upload-status-update-file', options),

  // 获取商店商品列表
  getShopGoodsList: (options) => ipcRenderer.invoke('get-shop-goods-list', options),

  // 导入物流属性
  importLogisticsProperties: (options) =>
    ipcRenderer.invoke('import-logistics-properties', options),

  // 添加库存
  addInventory: (context) => ipcRenderer.invoke('add-inventory', context)
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
