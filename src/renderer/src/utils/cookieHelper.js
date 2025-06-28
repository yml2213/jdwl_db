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
  return await window.api.getCookies()
}

/**
 * 检查是否已经登录
 * @returns {Promise<boolean>} 是否已登录
 */
export const isLoggedIn = async () => {
  return await window.api.checkLoginStatus()
}

/**
 * 将cookies格式化为请求头格式
 * @returns {Promise<string|null>} 请求头cookie字符串，如果未登录则返回null
 */
export const getCookieHeaderString = async () => {
  const cookies = await getAllCookies()
  if (!cookies) return null

  // 将cookie数组转换为cookie字符串
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
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
    headers['Cookie'] = cookieString
  }

  return headers
}
