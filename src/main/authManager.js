import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import axios from 'axios'

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
      partition: 'persist:payment' // 使用独立的session分区
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
async function validateAuthKey(key) {
  if (!key) return false
  try {
    const response = await axios.get(`http://localhost:3000/subscription/status?uniqueKey=${key}`)
    return response.data.success && response.data.data.currentStatus.isValid
  } catch (error) {
    console.error(`验证卡密失败 for key ${key}:`, error.message)
    // 根据实际需要，你可以决定在API请求失败时返回true还是false
    // 如果网络问题应允许通过，则返回true；否则返回false
    return false
  }
}

// 检查授权状态（核心逻辑）
async function checkAuthWithKey(uniqueKey, mainWindow, icon) {
  const allKeys = await loadAllAuthKeys()
  const storedKey = allKeys[uniqueKey]

  const isValid = await validateAuthKey(storedKey)
  if (isValid) {
    return { success: true }
  }

  // 如果没有有效的卡密，则直接打开购买页面
  const purchaseUrl = `http://localhost:3000/CreateOrder?uniqueKey=${uniqueKey}&Timestamp=${Date.now()}`
  let purchaseWindow = createPaymentWindow(purchaseUrl, mainWindow, icon)

  purchaseWindow.on('ready-to-show', () => {
    purchaseWindow.show()
  })

  return new Promise((resolve) => {
    purchaseWindow.on('closed', async () => {
      purchaseWindow = null

      // 窗口关闭后，重新检查
      const updatedKeys = await loadAllAuthKeys()
      const newKey = updatedKeys[uniqueKey]
      const isNewKeyValid = await validateAuthKey(newKey)

      // 如果新密钥仍然无效，直接返回失败，不再打开手动输入窗口
      if (!isNewKeyValid) {
        console.log('购买页面关闭后，订阅状态仍然无效')
        resolve({ success: false })
      } else {
        resolve({ success: true })
      }
    })
  })
}

// 手动输入卡密窗口已移除

// --- IPC Handlers ---

// 前端在获取到供应商和部门后，调用此handler
ipcMain.handle('check-auth-status', async (event, { uniqueKey }) => {
  const mainWindow = BrowserWindow.fromWebContents(event.sender)
  // 此处icon可能需要从一个固定的地方获取，或者在启动时缓存
  const iconPath = join(__dirname, '../../resources/icon.png')
  return await checkAuthWithKey(uniqueKey, mainWindow, iconPath)
})

// 手动输入卡密的IPC处理器已移除

