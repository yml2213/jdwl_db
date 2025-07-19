import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import axios from 'axios'

let purchaseWindow = null // 全局变量，用于持有支付窗口的引用

const closePurchaseWindow = () => {
  if (purchaseWindow && !purchaseWindow.isDestroyed()) {
    purchaseWindow.close()
  }
  purchaseWindow = null
}

const AUTH_FILE_PATH = join(app.getPath('userData'), 'auth-keys.json')

// 创建支付窗口的通用函数
function createPaymentWindow(url, parentWindow, icon) {
  const paymentWindow = new BrowserWindow({
    parent: parentWindow,
    modal: false, // 不设为模态，允许用户在主窗口操作
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    resizable: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 禁用web安全以允许支付宝页面加载
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
      partition: 'persist:payment', // 使用独立的session分区
      insecure: true, // 仅用于开发调试，忽略证书错误
      ignoreCertificateErrors: true // 仅用于开发调试
    }
  })

  // 处理新窗口打开请求（支付宝可能会打开新窗口）
  paymentWindow.webContents.setWindowOpenHandler((details) => {
    // 如果是支付宝相关域名，在当前窗口打开
    if (details.url.includes('alipay.com') || details.url.includes('alipayobjects.com')) {
      paymentWindow.loadURL(details.url)
      return { action: 'deny' }
    }
    // 其他链接在外部浏览器打开
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 监听页面加载完成
  paymentWindow.webContents.on('did-finish-load', () => {
    console.log('支付页面加载完成:', paymentWindow.webContents.getURL())
  })

  // 监听页面加载失败
  paymentWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('支付页面加载失败:', errorCode, errorDescription, validatedURL)
  })

  paymentWindow.loadURL(url)

  paymentWindow.on('ready-to-show', () => {
    paymentWindow.show()
  })

  return paymentWindow
}

// 加载所有卡密
async function loadAllAuthKeys() {
  try {
    const data = await fs.readFile(AUTH_FILE_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {} // 文件不存在，返回空对象
    }
    console.error('加载卡密文件失败:', error)
    return {}
  }
}

// 保存所有卡密
async function saveAllAuthKeys(keys) {
  try {
    await fs.writeFile(AUTH_FILE_PATH, JSON.stringify(keys, null, 2))
  } catch (error) {
    console.error('保存卡密文件失败:', error)
  }
}

// 验证卡密有效性
async function validateAuthKey(key, mainWindow) {
  if (!key) return false
  try {
    const response = await axios.get(`http://localhost:3000/subscription/status?uniqueKey=${key}`)
    const isValid = response.data.success && response.data.data.currentStatus.isValid
    if (!isValid) {
      mainWindow.webContents.send('subscription-invalid')
    }
    return isValid
  } catch (error) {
    console.error(`验证卡密失败 for key ${key}:`, error.message)
    mainWindow.webContents.send('subscription-invalid')
    return false
  }
}

// 检查授权状态（核心逻辑）
async function handleSubscriptionCheck(uniqueKey, mainWindow, icon) {
  const allKeys = await loadAllAuthKeys()
  const storedKey = allKeys[uniqueKey]

  const isValid = await validateAuthKey(storedKey, mainWindow)
  if (isValid) {
    // 如果已经有效，通知前端，不需要打开窗口
    mainWindow.webContents.send('subscription-already-valid')
    return
  }

  const purchaseUrl = `http://localhost:3000/CreateOrder?uniqueKey=${uniqueKey}&Timestamp=${Date.now()}`
  // 如果已经有窗口，先关闭
  if (purchaseWindow && !purchaseWindow.isDestroyed()) {
    purchaseWindow.close()
  }
  purchaseWindow = createPaymentWindow(purchaseUrl, mainWindow, icon)

  purchaseWindow.on('closed', () => {
    purchaseWindow = null
    console.log('支付窗口已关闭。')
    mainWindow.webContents.send('purchase-window-closed')
  })
}


let subscriptionInterval = null

// 设置并启动订阅检查器
function setupSubscriptionChecker(mainWindow, uniqueKey) {
  if (subscriptionInterval) {
    clearInterval(subscriptionInterval)
  }

  const check = async () => {
    console.log('定时检查订阅状态...')
    const allKeys = await loadAllAuthKeys()
    const storedKey = allKeys[uniqueKey]
    if (storedKey) {
      await validateAuthKey(storedKey, mainWindow)
    }
  }

  // 立即执行一次
  check()

  // 然后每一小时执行一次
  subscriptionInterval = setInterval(check, 3600000) // 1 hour
}



// --- IPC Handlers ---

function setupAuthHandlers(mainWindow, icon) {
  ipcMain.on('start-subscription-checker', (event, { uniqueKey }) => {
    console.log(`Starting subscription checker for ${uniqueKey}`)
    setupSubscriptionChecker(mainWindow, uniqueKey)
  })

  ipcMain.on('check-auth-status', async (event, { uniqueKey }) => {
    const window = BrowserWindow.fromWebContents(event.sender) || mainWindow
    await handleSubscriptionCheck(uniqueKey, window, icon)
  })

  ipcMain.on('subscription-successful', () => {
    console.log('收到订阅成功信号，正在关闭支付窗口...')
    closePurchaseWindow()
  })

  ipcMain.on('close-purchase-window', () => {
    console.log('收到关闭支付窗口的请求...')
    closePurchaseWindow()
  })
}

export {
  setupAuthHandlers,
  validateAuthKey,
  loadAllAuthKeys,
  setupSubscriptionChecker
}
