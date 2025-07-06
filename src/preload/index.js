import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 打开登录窗口
  openLoginWindow: () => {
    console.log('[Preload] 打开登录窗口')
    ipcRenderer.send('open-login-window')
  },
  // 检查登录状态
  checkLoginStatus: () => {
    console.log('[Preload] 检查登录状态')
    return ipcRenderer.invoke('check-login-status')
  },
  // 清除登录Cookie
  clearCookies: () => {
    console.log('[Preload] 清除Cookies')
    return new Promise((resolve) => {
      ipcRenderer.send('clear-cookies')
      // 等待一段时间，确保主进程有足够的时间处理
      setTimeout(() => {
        console.log('[Preload] Cookies清除操作已发送，等待主进程处理')
        resolve()
      }, 300)
    })
  },
  // 获取存储的Cookie
  getCookies: () => {
    console.log('[Preload] 获取Cookies')
    return ipcRenderer.invoke('get-cookies')
  },

  // 网络请求相关
  sendRequest: (url, options) => {
    console.log('[Preload] 发送请求:', url, options?.method || 'GET')
    return ipcRenderer.invoke('sendRequest', url, options)
      .then(response => {
        console.log('[Preload] 请求成功')
        return response
      })
      .catch(error => {
        console.error('[Preload] 请求失败:', error)
        throw error
      })
  },

  // 清除会话
  clearSession: () => {
    console.log('[Preload] 清除会话')
    ipcRenderer.send('clearSession')
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
  addInventory: (context) => ipcRenderer.invoke('add-inventory', context),

  // 显示打开对话框
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

  // 读取文件内容
  readFileContent: (filePath) => ipcRenderer.invoke('read-file-content', filePath)
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
