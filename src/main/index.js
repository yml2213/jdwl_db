import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupLoginHandlers, createLoginWindow, isLoggedIn } from './loginManager'
import { setupRequestHandlers } from './requestHandler'
import { setupFileHandlers } from './fileHandler'
import fs from 'fs'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 确保日志目录存在
  const logDir = join(app.getPath('userData'), 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  // 统一设置所有IPC事件处理器
  function setupIPCHandlers() {
    setupLoginHandlers(mainWindow)
    setupFileHandlers()
    setupRequestHandlers()

    // 右键菜单
    ipcMain.on('show-context-menu', (event) => {
      const template = [
        {
          label: '检查元素',
          click: () => {
            BrowserWindow.fromWebContents(event.sender).webContents.inspectElement(0, 0)
          }
        }
      ]
      const menu = Menu.buildFromTemplate(template)
      menu.popup(BrowserWindow.fromWebContents(event.sender))
    })

    ipcMain.handle('get-session-context', (event) => {
      // console.log('主进程: get-session-context in main')
      return getSessionContext()
    })

    // 示例：处理来自渲染进程的setTitle请求
    ipcMain.on('set-title', (event, title) => {
      const webContents = event.sender
      const win = BrowserWindow.fromWebContents(webContents)
      win.setTitle(title)
    })

    ipcMain.handle('show-open-dialog', async (event, options) => {
      const { filePaths } = await dialog.showOpenDialog(options)
      if (filePaths && filePaths.length > 0) {
        return filePaths[0]
      }
      return null
    })

    ipcMain.on('session-created', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('session-status-changed')
      }
    })
  }

  // 调用IPC设置
  setupIPCHandlers()

  // 检查登录状态，如果未登录则打开登录窗口
  isLoggedIn().then((status) => {
    if (!status) {
      createLoginWindow(mainWindow, icon)
    }
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 配置CSP
  const { session } = require('electron')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.jdl.com https://*.jd.com; connect-src 'self' http://localhost:3000 http://47.93.132.204:2333 https://*.jdl.com https://*.jd.com; worker-src blob: data:;"
        ]
      }
    })
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
