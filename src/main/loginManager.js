import { BrowserWindow, session, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'

// 存储路径
const userDataPath = app.getPath('userData')
const cookiesFilePath = path.join(userDataPath, 'jd_cookies.json')

// 登录窗口引用
let loginWindow = null

// 必要的Cookie项目列表
const requiredCookies = ['pin', 'thor', 'csrfToken', 'flash']

// 主域名 - 我们只保存这个域名下的Cookie
const mainDomain = '.jd.com'

// 过滤出必要的Cookie，并且只保留主域名下的
function filterRequiredCookies(cookies) {
  const mainDomainCookies = cookies.filter((cookie) => cookie.domain && cookie.domain.endsWith('.jd.com'))

  const foundCookieNames = new Set()
  const result = []

  // 优先从主域名cookie中查找
  for (const cookie of mainDomainCookies) {
    if (requiredCookies.includes(cookie.name) && !foundCookieNames.has(cookie.name)) {
      result.push(cookie)
      foundCookieNames.add(cookie.name)
    }
  }

  // 如果主域名中没找全，再从所有cookie中补充
  if (foundCookieNames.size < requiredCookies.length) {
    for (const cookie of cookies) {
      if (requiredCookies.includes(cookie.name) && !foundCookieNames.has(cookie.name)) {
        // 确保所有cookie都标记为 .jd.com 域，以便统一处理
        const modifiedCookie = { ...cookie, domain: mainDomain }
        result.push(modifiedCookie)
        foundCookieNames.add(cookie.name)
      }
    }
  }

  return result
}

// 检查Cookie是否有效
function isCookieValid(cookie) {
  if (!cookie) return false
  if (cookie.expirationDate) {
    const now = Math.floor(Date.now() / 1000)
    if (cookie.expirationDate < now) {
      console.log(`Cookie ${cookie.name} 已过期`)
      return false
    }
  }
  return true
}

// 检查是否包含所有必要的Cookie
function hasRequiredCookies(cookies) {
  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
    return false
  }
  const cookieNames = cookies.map((cookie) => cookie.name)
  const hasAllNames = requiredCookies.every((name) => cookieNames.includes(name))

  if (hasAllNames) {
    for (const name of requiredCookies) {
      const cookie = cookies.find((c) => c.name === name)
      if (!isCookieValid(cookie)) {
        console.log(`必要Cookie ${name} 无效或已过期`)
        return false
      }
    }
    return true
  }
  return false
}

// 保存Cookies到文件
async function saveCookies(cookies) {
  try {
    const requiredCookiesOnly = filterRequiredCookies(cookies)
    if (requiredCookiesOnly.length === 0) {
      console.warn('没有找到必要的Cookies，无法保存')
      return false
    }
    if (!hasRequiredCookies(requiredCookiesOnly)) {
      console.warn('缺少某些必要Cookie，可能会影响功能')
    }
    await fs.writeFile(cookiesFilePath, JSON.stringify(requiredCookiesOnly, null, 2))
    console.log('Cookies已成功保存')
    return true
  } catch (error) {
    console.error('保存Cookies失败:', error)
    return false
  }
}

// 从文件读取Cookies
async function loadCookies() {
  try {
    const data = await fs.readFile(cookiesFilePath, 'utf8')
    const cookies = JSON.parse(data)
    return cookies
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('读取Cookies失败:', error)
    }
    return null
  }
}

// 处理登录成功
async function handleLoginSuccess(cookies, mainWindow) {
  console.log('登录成功，可能包含所有必要Cookie，进行检查和保存...')
  const saved = await saveCookies(cookies)
  if (loginWindow) {
    loginWindow.close()
    loginWindow = null
  }
  if (mainWindow && saved) {
    // 关键改动：将保存好的cookies直接发送给前端
    const savedCookies = await loadCookies()
    mainWindow.webContents.send('login-successful', savedCookies)
  }
}

// 检查登录窗口的当前状态
async function checkLoginStatus(mainWindow) {
  if (!loginWindow || loginWindow.isDestroyed()) return
  const cookies = await session.defaultSession.cookies.get({})
  if (hasRequiredCookies(cookies)) {
    await handleLoginSuccess(cookies, mainWindow)
  }
}

// 创建登录窗口
function createLoginWindow(mainWindow, icon) {
  if (loginWindow) {
    loginWindow.focus()
    return
  }
  loginWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  loginWindow.loadURL('https://passport.jd.com/new/login.aspx?ReturnUrl=https%3A%2F%2Fo.jdl.com%2F')
  loginWindow.on('ready-to-show', () => loginWindow.show())

  const checkStatus = () => checkLoginStatus(mainWindow)
  loginWindow.webContents.on('did-finish-load', checkStatus)
  loginWindow.webContents.on('did-navigate', checkStatus)
  loginWindow.webContents.on('did-frame-finish-load', checkStatus)
  loginWindow.webContents.on('did-redirect-navigation', checkStatus)
  const intervalId = setInterval(checkStatus, 3000)

  loginWindow.on('closed', () => {
    loginWindow = null
    clearInterval(intervalId)
  })
}

// 清除Cookies
async function clearCookies(mainWindow) {
  try {
    await fs.unlink(cookiesFilePath)
    console.log('Cookies文件已删除')
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('清除Cookies文件失败:', error)
  }
  await session.defaultSession.clearStorageData()
  console.log('Session数据已清除')
  if (mainWindow) {
    mainWindow.webContents.send('cookies-cleared')
  }
}

// 检查是否已登录 (基于本地文件)
async function isLoggedIn() {
  try {
    const cookies = await loadCookies()
    const loginStatus = hasRequiredCookies(cookies)
    console.log('检查本地Cookie文件，登录状态:', loginStatus)
    return loginStatus
  } catch (error) {
    console.error('检查登录状态失败:', error)
    return false
  }
}

// 设置所有与登录相关的IPC事件处理程序
function setupLoginHandlers(mainWindow) {
  ipcMain.on('start-login', () => createLoginWindow(mainWindow))
  ipcMain.on('logout', () => clearCookies(mainWindow))
  ipcMain.handle('check-login-status', () => isLoggedIn())
  ipcMain.handle('get-cookies', () => loadCookies())
}

export {
  createLoginWindow,
  clearCookies,
  isLoggedIn,
  loadCookies,
  setupLoginHandlers
}
