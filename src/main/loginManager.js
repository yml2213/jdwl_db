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
async function loadCookiesFromFile() {
  try {
    const data = await fs.readFile(cookiesFilePath, 'utf8')
    const cookies = JSON.parse(data)
    return cookies
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('读取Cookies文件失败:', error)
    }
    return null
  }
}

// 从Electron会话中获取所有有效的Cookie
async function getAllStoredCookies() {
  try {
    const allCookies = await session.defaultSession.cookies.get({})
    // 过滤掉已过期的Cookie
    const validCookies = allCookies.filter(isCookieValid)
    return validCookies
  } catch (error) {
    console.error('从Electron会话中获取Cookies失败:', error)
    return []
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
    const savedCookies = await loadCookiesFromFile()
    mainWindow.webContents.send('login-successful', savedCookies)
  }
}

// 检查登录窗口的当前状态
async function checkLoginStatus(mainWindow) {
  if (!loginWindow || loginWindow.isDestroyed()) return
  const loginSession = loginWindow.webContents.session
  const cookies = await loginSession.cookies.get({})
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
      contextIsolation: true,
      webSecurity: false,
      session: session.fromPartition('persist:login')
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
  console.log('======== 开始清除 Cookies 和会话数据 ========')

  try {
    // 1. 关闭登录窗口（如果存在）
    if (loginWindow && !loginWindow.isDestroyed()) {
      console.log('关闭登录窗口')
      loginWindow.close()
      loginWindow = null
    }

    // 2. 删除 Cookies 文件
    try {
      await fs.unlink(cookiesFilePath)
      console.log('Cookies文件已删除')
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('清除Cookies文件失败:', error)
      else console.log('Cookies文件不存在，无需删除')
    }

    // 3. 清除所有会话数据
    console.log('清除所有会话数据...')

    // 3.1 清除默认会话的所有 Cookie
    console.log('清除默认会话的所有 Cookie...')
    const defaultCookies = await session.defaultSession.cookies.get({})
    for (const cookie of defaultCookies) {
      const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`
      await session.defaultSession.cookies.remove(url, cookie.name)
    }

    // 3.2 清除登录分区的所有 Cookie
    console.log('清除登录分区的所有 Cookie...')
    const loginSession = session.fromPartition('persist:login')
    const loginCookies = await loginSession.cookies.get({})
    for (const cookie of loginCookies) {
      const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`
      await loginSession.cookies.remove(url, cookie.name)
    }

    // 3.3 清除所有存储数据
    const clearPromises = [
      // 清除默认会话数据
      session.defaultSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'cachestorage'],
        quotas: ['temporary', 'persistent', 'syncable']
      }),
      // 清除登录分区会话数据
      loginSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'cachestorage'],
        quotas: ['temporary', 'persistent', 'syncable']
      })
    ]

    await Promise.all(clearPromises)
    console.log('所有会话数据已清除')

    // 3.4 清除 HTTP 缓存
    console.log('清除 HTTP 缓存...')
    await session.defaultSession.clearHostResolverCache()
    await session.defaultSession.clearAuthCache()
    await loginSession.clearHostResolverCache()
    await loginSession.clearAuthCache()

    // 4. 通知前端登出成功
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('发送登出成功信号到前端')
      mainWindow.webContents.send('logout-successful')
    }

    // 不再重启应用程序
    console.log('清除完成，不重启应用程序')

  } catch (error) {
    console.error('清除 Cookies 过程中发生错误:', error)
  }

  console.log('======== 清除 Cookies 和会话数据完成 ========')
}

// 检查是否已登录
async function isLoggedIn() {
  const cookies = await loadCookiesFromFile()
  return hasRequiredCookies(cookies)
}

// 设置登录处理器
function setupLoginHandlers(mainWindow) {
  ipcMain.on('open-login-window', () => createLoginWindow(mainWindow))
  ipcMain.handle('check-login-status', () => isLoggedIn())
  ipcMain.on('clear-cookies', () => clearCookies(mainWindow))

  ipcMain.handle('get-cookies', async () => {
    console.log('[IPC] Renderer requested cookies')
    const fileCookies = (await loadCookiesFromFile()) || []
    const sessionCookies = (await getAllStoredCookies()) || []

    // 合并两个cookie来源，并去重
    const allCookiesMap = new Map()
    for (const cookie of fileCookies) {
      allCookiesMap.set(cookie.name, cookie)
    }
    for (const cookie of sessionCookies) {
      allCookiesMap.set(cookie.name, cookie)
    }
    const combinedCookies = Array.from(allCookiesMap.values())

    console.log(`[IPC] Returning ${combinedCookies.length} combined cookies to renderer.`)
    return combinedCookies
  })
}

export {
  createLoginWindow,
  clearCookies,
  isLoggedIn,
  loadCookiesFromFile as loadCookies,
  setupLoginHandlers
}
