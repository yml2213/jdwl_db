/**
 * Cookie 帮助工具
 * 用于在应用中使用存储的京东cookies
 */

// 必要的Cookie项目列表
export const requiredCookies = ['pin', 'thor', 'csrfToken', 'flash']

/**
 * 获取所有存储的cookies
 * @returns {Promise<Array>} 包含所有cookie的数组，如果未登录则返回null
 */
export const getAllCookies = async () => {
  try {
    const cookies = await window.api.getCookies()

    if (cookies && Array.isArray(cookies)) {
      console.log(`成功从存储获取到 ${cookies.length} 个cookies`)

      // 检查是否包含必要的cookie
      const missingCookies = requiredCookies.filter(
        name => !cookies.some(cookie => cookie.name === name)
      )

      if (missingCookies.length > 0) {
        console.warn(`警告: 缺少以下必要的cookies: ${missingCookies.join(', ')}`)
      } else {
        console.log('已获取所有必要的cookies')
      }

      return cookies
    } else {
      console.warn('未从存储获取到有效的cookies')
      return []
    }
  } catch (error) {
    console.error('获取cookies失败:', error)
    return []
  }
}

/**
 * 检查是否已经登录
 * @returns {Promise<boolean>} 是否已登录
 */
export const isLoggedIn = async () => {
  try {
    const status = await window.api.checkLoginStatus()
    console.log(`检查登录状态: ${status ? '已登录' : '未登录'}`)
    return status
  } catch (error) {
    console.error('检查登录状态失败:', error)
    return false
  }
}

/**
 * 将cookies格式化为请求头格式
 * @returns {Promise<string|null>} 请求头cookie字符串，如果未登录则返回null
 */
export const getCookieHeaderString = async () => {
  const cookies = await getAllCookies()
  if (!cookies || !cookies.length) {
    console.warn('无法生成Cookie头: 未找到有效的cookies')
    return null
  }

  // 将cookie数组转换为cookie字符串
  const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  console.log(`生成Cookie字符串，长度: ${cookieString.length}`)
  return cookieString
}

/**
 * 获取请求需要的headers，包含cookie
 * @returns {Promise<Object>} 请求头对象
 */
export const getRequestHeaders = async () => {
  const cookieString = await getCookieHeaderString()

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9'
  }

  if (cookieString) {
    console.log('将Cookie添加到请求头')
    headers['Cookie'] = cookieString
  } else {
    console.warn('请求头中未包含Cookie')
  }

  return headers
}

/**
 * 从存储的cookies中获取会话ID
 * @returns {Promise<string|null>} 会话ID，如果找不到则返回null
 */
export const getSessionId = async () => {
  console.log('[getSessionId] 1. Attempting to get cookies from main process.')
  const cookies = await getAllCookies()
  if (!cookies || !cookies.length) {
    console.log('[getSessionId] 2. No cookies found.')
    return null
  }
  const sessionCookie = cookies.find((c) => c.name === 'connect.sid')
  if (sessionCookie) {
    console.log(`[getSessionId] 2. Found connect.sid cookie with value: ${sessionCookie.value}`)
    return sessionCookie.value
  } else {
    console.log('[getSessionId] 2. Did not find a connect.sid cookie.')
    return null
  }
}
