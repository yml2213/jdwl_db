import { BrowserWindow, session } from 'electron'
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
  // 首先筛选主域名下的cookie
  const mainDomainCookies = cookies.filter((cookie) => cookie.domain === mainDomain)

  // 如果主域名下没有找到必要的cookie，则可能登录页面使用了其他域名
  // 这种情况下从所有cookie中查找必要的cookie
  if (!hasRequiredCookies(mainDomainCookies)) {
    // 为每种必要cookie类型找到一个（首选主域名）
    const result = []

    for (const requiredName of requiredCookies) {
      // 首先查找主域名下的
      const mainDomainCookie = mainDomainCookies.find((c) => c.name === requiredName)
      if (mainDomainCookie) {
        result.push(mainDomainCookie)
        continue
      }

      // 如果主域名下没找到，则从所有cookie中找一个
      const anyCookie = cookies.find((c) => c.name === requiredName)
      if (anyCookie) {
        // 修改为主域名以便统一管理
        const modifiedCookie = { ...anyCookie, domain: mainDomain }
        result.push(modifiedCookie)
      }
    }

    return result
  }

  // 如果主域名下已经有必要的cookie，则直接过滤
  return mainDomainCookies.filter((cookie) => requiredCookies.includes(cookie.name))
}

// 检查Cookie是否有效（例如检查是否过期）
function isCookieValid(cookie) {
  if (!cookie) return false

  // 检查是否有过期时间
  if (cookie.expirationDate) {
    const now = Math.floor(Date.now() / 1000)
    // 如果Cookie已过期，返回false
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

  // 获取所有cookie名称
  const cookieNames = cookies.map((cookie) => cookie.name)

  // 检查是否包含所有必要的cookie名称
  const hasAllNames = requiredCookies.every((name) => cookieNames.includes(name))

  // 如果名称检查通过，还需要检查每个cookie是否有效
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

// 保存Cookies到文件 (只保存必要的Cookie)
async function saveCookies(cookies) {
  try {
    // 过滤出必要的Cookie
    const requiredCookiesOnly = filterRequiredCookies(cookies)

    if (requiredCookiesOnly.length === 0) {
      console.warn('没有找到必要的Cookies，无法保存')
      return false
    }

    // 检查是否包含所有必要的Cookie
    if (!hasRequiredCookies(requiredCookiesOnly)) {
      console.warn('缺少某些必要Cookie，可能会影响功能')
      console.warn('已找到的Cookie:', requiredCookiesOnly.map((c) => c.name).join(', '))
      console.warn('需要的Cookie:', requiredCookies.join(', '))
    }

    console.log('保存文件路径', cookiesFilePath)
    console.log('保存Cookie数量:', requiredCookiesOnly.length)

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
    console.log('成功加载Cookie数量:', cookies.length)
    return cookies
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Cookie文件不存在，用户未登录')
    } else {
      console.error('读取Cookies失败:', error)
    }
    return null
  }
}

// 处理登录成功
async function handleLoginSuccess(cookies, mainWindow) {
  console.log('登录成功，包含所有必要Cookie')
  await saveCookies(cookies)

  // 关闭登录窗口
  if (loginWindow) {
    loginWindow.close()
    loginWindow = null
  }

  // 通知渲染进程登录成功
  if (mainWindow) {
    mainWindow.webContents.send('login-successful')
  }
}

// 检查登录状态
async function checkLoginStatus(mainWindow) {
  if (!loginWindow) return

  // 获取所有cookies
  const cookies = await session.defaultSession.cookies.get({})

  // 判断是否包含必要的Cookie
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

  // 清除所有cookies确保干净的登录状态
  session.defaultSession.clearStorageData()

  // 加载京东登录页
  loginWindow.loadURL('https://passport.jd.com/new/login.aspx?ReturnUrl=https%3A%2F%2Fo.jdl.com%2F')

  loginWindow.on('ready-to-show', () => {
    loginWindow.show()
  })

  // 监听页面加载完成事件
  loginWindow.webContents.on('did-finish-load', () => checkLoginStatus(mainWindow))

  // 监听URL变化
  loginWindow.webContents.on('did-navigate', () => checkLoginStatus(mainWindow))

  // 监听子页面跳转
  loginWindow.webContents.on('did-frame-finish-load', () => checkLoginStatus(mainWindow))

  // 监听页面重定向
  loginWindow.webContents.on('did-redirect-navigation', () => checkLoginStatus(mainWindow))

  // 每5秒检查一次登录状态（用于捕获异步加载的情况）
  const intervalId = setInterval(() => checkLoginStatus(mainWindow), 5000)

  loginWindow.on('closed', () => {
    loginWindow = null
    clearInterval(intervalId)
  })
}

// 清除Cookies
async function clearCookies(mainWindow) {
  try {
    await fs.unlink(cookiesFilePath)
    console.log('Cookies已清除')
    // 通知渲染进程
    if (mainWindow) {
      mainWindow.webContents.send('cookies-cleared')
    }
    return true
  } catch (error) {
    console.error('清除Cookies失败:', error)
    return false
  }
}

// 检查是否已登录
async function isLoggedIn() {
  try {
    const cookies = await loadCookies()
    if (!cookies) return false

    // 使用相同的必要Cookie检查逻辑
    const loginStatus = hasRequiredCookies(cookies)
    console.log('登录状态检查结果:', loginStatus ? '已登录' : '未登录')
    return loginStatus
  } catch (error) {
    console.error('检查登录状态失败:', error)
    return false
  }
}

export { createLoginWindow, loadCookies, clearCookies, isLoggedIn, saveCookies, requiredCookies }
