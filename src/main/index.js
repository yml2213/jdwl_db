import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupLoginHandlers, createLoginWindow, isLoggedIn, loadCookies } from './loginManager'
// import { checkAuth, createAuthWindow } from './authManager'

import { setupRequestHandlers } from './requestHandler'
import { setupFileHandlers } from './fileHandler'
import './authManager' // 导入以注册IPC事件
import fs from 'fs'

function createWindow() {
  console.log('创建主窗口...')
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
    // 在开发模式下自动打开开发者工具
    if (is.dev) {
      console.log('Open dev tool...')
      mainWindow.webContents.openDevTools()
    }
    // 允许在生产环境通过F12打开开发者工具
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        mainWindow.webContents.toggleDevTools()
      }
    })
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
  async function setupIPCHandlers() {
    console.log('初始化应用...')

    // 1. 首先设置请求处理器，确保API请求能正常工作
    console.log('设置请求处理器...')
    setupRequestHandlers()

    // 2. 设置文件处理器
    console.log('设置文件处理器...')
    setupFileHandlers()

    // 3. 设置登录处理器
    console.log('设置登录处理器...')
    setupLoginHandlers(mainWindow)

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

    console.log('应用初始化完成。')
  }

  // 启动应用
  const startApp = async () => {
    // 1. 先设置IPC处理器
    await setupIPCHandlers()

    // 2. 检查登录状态
    const loginStatus = await isLoggedIn()
    console.log(`登录状态检查完成: ${loginStatus ? '已登录' : '未登录'}`)

    // 3. 如果未登录，显示登录窗口
    if (!loginStatus) {
      console.log('用户未登录，打开登录窗口...')
      createLoginWindow(mainWindow, icon)
    } else {
      // 4. 已登录，预加载cookies到内存
      const cookies = await loadCookies()
      console.log(`已从存储加载 ${cookies?.length || 0} 个cookies`)
    }
  }

  // 启动应用
  startApp()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 配置CSP - 优化支付宝访问
  const { session } = require('electron')
  
  // 为默认session配置CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://*.alipay.com https://*.alipayobjects.com https://*.alicdn.com https://*.jdl.com https://*.jd.com http://localhost:* ws://localhost:* http://47.93.132.204:* ws://47.93.132.204:*; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.alipay.com https://*.alipayobjects.com https://*.alicdn.com https://*.jdl.com https://*.jd.com; " +
          "style-src 'self' 'unsafe-inline' https://*.alipay.com https://*.alipayobjects.com https://*.alicdn.com; " +
          "img-src 'self' data: blob: https://*.alipay.com https://*.alipayobjects.com https://*.alicdn.com https://*.jdl.com https://*.jd.com; " +
          "connect-src 'self' https://*.alipay.com https://*.alipayobjects.com https://*.alicdn.com https://*.jdl.com https://*.jd.com http://localhost:* ws://localhost:* http://47.93.132.204:* ws://47.93.132.204:*; " +
          "frame-src 'self' https://*.alipay.com https://*.alipayobjects.com; " +
          "worker-src 'self' blob: data:; " +
          "font-src 'self' data: https://*.alipay.com https://*.alipayobjects.com https://*.alicdn.com;"
        ]
      }
    })
  })

  // 为支付session配置更宽松的CSP
  const paymentSession = session.fromPartition('persist:payment')
  paymentSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
          "script-src * 'unsafe-inline' 'unsafe-eval'; " +
          "style-src * 'unsafe-inline'; " +
          "img-src * data: blob:; " +
          "connect-src *; " +
          "frame-src *; " +
          "worker-src * blob: data:; " +
          "font-src * data:;"
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
