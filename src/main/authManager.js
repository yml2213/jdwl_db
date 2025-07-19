import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import axios from 'axios'
import { randomBytes } from 'crypto'

const AUTH_FILE_PATH = join(app.getPath('userData'), 'auth-key.json')
let authWindow = null

// 获取或生成设备唯一ID
async function getDeviceUniqueId() {
  try {
    const data = await fs.readFile(AUTH_FILE_PATH, 'utf-8')
    const config = JSON.parse(data)
    if (config.deviceId) {
      return config.deviceId
    }
  } catch (error) {
    // 忽略文件不存在的错误
    if (error.code !== 'ENOENT') {
      console.error('读取配置文件时出错:', error)
    }
  }

  // 如果没有找到设备ID，则生成一个新的并保存
  const newDeviceId = randomBytes(16).toString('hex')
  try {
    const config = { deviceId: newDeviceId }
    await fs.writeFile(AUTH_FILE_PATH, JSON.stringify(config, null, 2))
    return newDeviceId
  } catch (error) {
    console.error('保存新的设备ID失败:', error)
    return null // 无法生成或保存时返回null
  }
}

// 保存卡密到本地
async function saveAuthKey(key) {
  try {
    const deviceId = await getDeviceUniqueId()
    const config = { key, deviceId }
    await fs.writeFile(AUTH_FILE_PATH, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    console.error('保存卡密失败:', error)
    return false
  }
}

// 从本地读取卡密
async function loadAuthKey() {
  try {
    const data = await fs.readFile(AUTH_FILE_PATH, 'utf-8')
    const { key } = JSON.parse(data)
    return key
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('未找到卡密文件。')
    } else {
      console.error('读取卡密失败:', error)
    }
    return null
  }
}

// 验证卡密有效性
async function validateAuthKey(key) {
  if (!key) return false
  try {
    const response = await axios.get(`http://localhost:3000/subscription/status?uniqueKey=${key}`)
    return response.data.success && response.data.data.currentStatus.isValid
  } catch (error) {
    console.error('验证卡密失败:', error)
    return false
  }
}

// 检查授权状态
export async function checkAuth(mainWindow, icon) {
  const key = await loadAuthKey()
  const isValid = await validateAuthKey(key)
  if (!isValid) {
    await createAuthWindow(mainWindow, icon) // 等待窗口关闭
    const newKey = await loadAuthKey() // 重新加载key
    return await validateAuthKey(newKey)
  }
  return true
}

// 创建授权窗口
export function createAuthWindow(mainWindow, icon) {
  return new Promise(async (resolve) => {
    const deviceId = await getDeviceUniqueId()
    if (!deviceId) {
      // 如果无法获取设备ID，直接拒绝授权
      console.error('无法获取设备ID，授权失败。')
      resolve(false)
      return
    }

    authWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 400,
      height: 250,
      show: false,
      autoHideMenuBar: true,
      frame: false, // 无边框窗口
      resizable: false,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // 加载一个本地的HTML文件作为输入界面
    authWindow.loadFile(join(__dirname, '../renderer/auth.html'))

    authWindow.on('ready-to-show', () => {
      authWindow.show()
      // 将设备ID发送给渲染进程
      authWindow.webContents.send('set-device-id', deviceId)
    })

    authWindow.on('closed', () => {
      authWindow = null
      resolve() // 当窗口关闭时，Promise完成
    })
  })
}

// IPC事件处理
ipcMain.handle('validate-and-save-key', async (event, key) => {
  const isValid = await validateAuthKey(key)
  if (isValid) {
    await saveAuthKey(key)
    if (authWindow) {
      authWindow.close()
    }
    return { success: true }
  } else {
    return { success: false, message: '无效的卡密' }
  }
})

ipcMain.handle('get-device-id', async () => {
  return await getDeviceUniqueId()
})

ipcMain.on('open-purchase-page', async () => {
  const deviceId = await getDeviceUniqueId()
  const purchaseUrl = `http://localhost:3000/CreateOrder?uniqueKey=${deviceId}&Timestamp=${Date.now()}`
  const purchaseWindow = new BrowserWindow({ width: 800, height: 600 })
  purchaseWindow.loadURL(purchaseUrl)
})
