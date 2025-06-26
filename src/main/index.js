import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  createLoginWindow,
  loadCookies,
  clearCookies,
  isLoggedIn,
  setupLoginHandlers
} from './loginManager'
import { sendRequest, setupRequestHandlers } from './requestHandler'
import { saveFile, setupFileHandlers } from './fileHandler'

// 主窗口引用
let mainWindow = null

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
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
}

// 自定义开发者工具快捷键处理程序
function setupDevToolsShortcuts(window) {
  window.webContents.on('before-input-event', (event, input) => {
    // 检测F12按键
    if (input.key === 'F12' && !input.alt && !input.control && !input.meta && !input.shift) {
      // 阻止默认的F12行为
      event.preventDefault()

      // 如果开发者工具已打开，则关闭
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools()
      } else {
        // 在右侧打开开发者工具
        window.webContents.openDevTools({ mode: 'right' })
      }
    }
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 监听窗口创建事件，设置自定义快捷键
  app.on('browser-window-created', (_, window) => {
    // 注册自定义开发者工具快捷键
    setupDevToolsShortcuts(window)

    // 保留其他原有的快捷键监听
    if (is.dev) {
      optimizer.watchWindowShortcuts(window, {
        // 禁用默认的F12行为，我们已经自定义了它
        // 但保留其他快捷键
        zoom: true,
        escToCloseWindow: true
      })
    }
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 打开登录窗口
  ipcMain.on('open-login-window', () => {
    createLoginWindow(mainWindow, icon)
  })

  // 检查登录状态
  ipcMain.handle('check-login-status', async () => {
    return await isLoggedIn()
  })

  // 获取Cookies
  ipcMain.handle('get-cookies', async () => {
    return await loadCookies()
  })

  // 清除Cookies
  ipcMain.on('clear-cookies', async () => {
    await clearCookies(mainWindow)
  })

  // 设置IPC处理程序
  setupIPCHandlers()

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

// 设置IPC处理程序
function setupIPCHandlers() {
  // 处理HTTP请求
  ipcMain.handle('sendRequest', async (event, url, options) => {
    try {
      return await sendRequest(url, options)
    } catch (error) {
      console.error('IPC请求处理错误:', error)
      throw error
    }
  })

  // 处理文件保存
  ipcMain.handle('saveFile', async (event, params) => {
    try {
      return await saveFile(params)
    } catch (error) {
      console.error('保存文件错误:', error)
      throw error
    }
  })

  // 设置登录相关处理程序
  setupLoginHandlers()
  // 设置文件相关处理程序
  setupFileHandlers()
  // 设置请求相关处理程序
  setupRequestHandlers()
}
