import { getAllCookies } from '../utils/cookieHelper'

// 恢复动态设置API地址，并为本地开发提供默认值
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:2333'

/**
 * 安全序列化对象，移除无法克隆的元素
 * @param {Object} obj - 需要序列化的对象
 * @returns {Object} - 经过处理的可安全序列化的对象
 */
const safeSerialize = (obj) => {
  try {
    // 使用JSON序列化再反序列化来创建深拷贝，同时去除不可序列化的内容
    return JSON.parse(JSON.stringify(obj))
  } catch (error) {
    console.error('对象序列化失败，尝试进行清理:', error)

    // 如果是基本类型或null，直接返回
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    // 处理数组
    if (Array.isArray(obj)) {
      return obj.map(item => safeSerialize(item))
    }

    // 处理对象
    const cleanObj = {}
    for (const key in obj) {
      try {
        // 测试这个属性是否可以被JSON序列化
        JSON.stringify(obj[key])
        cleanObj[key] = safeSerialize(obj[key])
      } catch (e) {
        console.warn(`属性 ${key} 无法序列化，已跳过`)
        // 对于无法序列化的属性，可以用一个占位符替代
        cleanObj[key] = '[不可序列化的数据]'
      }
    }
    return cleanObj
  }
}

/**
 * 通过Electron主进程发送请求
 * @param {string} method - 请求方法
 * @param {string} endpoint - API端点
 * @param {Object} data - 请求数据
 * @param {Object} headers - 请求头
 * @returns {Promise<any>} - 响应数据
 */
const sendRequest = async (method, endpoint, data = null, headers = {}) => {
  try {
    console.log(`发送${method}请求到: ${API_BASE_URL}${endpoint}`)

    const options = {
      method: method,
      headers: headers
    }

    // 添加请求体
    if (data) {
      if (method.toLowerCase() === 'get') {
        // 对于GET请求，将数据转换为URL参数
        const params = new URLSearchParams(data).toString()
        endpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${params}`
      } else {
        // 对于其他请求，添加请求体，确保进行安全序列化
        const safeData = safeSerialize(data)
        options.body = safeData
      }
    }

    // 通过IPC发送请求到主进程
    const response = await window.api.sendRequest(`${API_BASE_URL}${endpoint}`, options)
    console.log(`响应: ${method} ${endpoint} - 成功`)
    return response
  } catch (error) {
    console.error(`请求失败 ${method} ${endpoint}:`, error)
    throw error
  }
}

// 添加拦截器记录请求和响应
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 100 // 最小请求间隔(毫秒)

/**
 * 节流请求发送，确保请求之间有最小间隔
 */
const throttledSendRequest = async (method, endpoint, data, headers) => {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    // 如果距离上次请求时间小于最小间隔，则等待
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }

  lastRequestTime = Date.now()
  return sendRequest(method, endpoint, data, headers)
}

// 存储后端返回的会话ID，用于手动维护会话状态
let backendSessionID = null

// 从主进程发送请求的辅助函数
async function sendRequestFromMain(url, options) {
  return await window.electron.ipcRenderer.invoke('sendRequest', url, options)
}

/**
 * 从cookie中获取csrfToken
 * @returns {Promise<string>} csrfToken
 */
async function getCsrfToken() {
  const cookies = (await getAllCookies()) || []
  const tokenCookie = cookies.find((cookie) => cookie.name === 'csrfToken')
  return tokenCookie ? tokenCookie.value : ''
}

// 基础的 fetch 封装，带重试机制
async function fetchApi(
  endpoint,
  options = {},
  retries = 3,
  delay = 2000,
  backoff = 2
) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`发送请求: ${url}`, options)
      const response = await window.api.sendRequest(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      })
      return response
    } catch (error) {
      console.warn(`API请求失败(尝试 ${i + 1}/${retries}):`, error)

      // 如果已经达到最大重试次数，抛出错误
      if (i >= retries - 1) {
        console.error(`达到最大重试次数(${retries})，请求失败:`, error)
        throw error
      }

      // 等待一段时间后重试，使用指数退避策略
      const waitTime = delay * Math.pow(backoff, i)
      console.log(`将在 ${waitTime / 1000} 秒后重试...`)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }
}

/**
 * 获取店铺列表 (已优化)
 * @param {string} deptId - 事业部ID
 * @returns {Promise<Array>} 店铺列表数组
 */
export async function getShopList(deptId) {
  if (!deptId) {
    console.error('获取店铺列表失败: 未提供事业部ID');
    return [];
  }
  // 注意：fetchApi 内部会自动拼接 API_BASE_URL
  return await fetchApi(`/api/shops?deptId=${deptId}`);
}

/**
 * 获取仓库列表 (已优化)
 * @param {string} sellerId - 供应商ID
 * @param {string} deptId - 事业部ID
 * @returns {Promise<Array>} 仓库列表数组
 */
export async function getWarehouseList(sellerId, deptId) {
  if (!sellerId || !deptId) {
    console.error('获取仓库列表失败: 未提供供应商ID或事业部ID');
    return [];
  }
  return await fetchApi(`/api/warehouses?sellerId=${sellerId}&deptId=${deptId}`);
}

/**
 * 从后端获取供应商列表
 * @returns {Promise<Array>} 供应商列表
 */
export async function getVendorList() {
  return await fetchApi('/api/vendors');
}

/**
 * 根据供应商名称从后端获取事业部列表
 * @param {string} vendorName - 供应商名称
 * @returns {Promise<Array>} 事业部列表
 */
export async function getDepartmentsByVendor(vendorName) {
  return await fetchApi('/api/departments', {
    method: 'POST',
    body: { vendorName }
  });
}

/**
 * @description 创建一个新的会话，将认证和上下文信息发送到后端
 * @param {Array} cookies 从京东登录后获取的 cookies 数组
 * @returns {Promise<Object>} 后端返回的会话对象
 */
export async function createSession(cookies) {
  return await fetchApi('/api/create-session', {
    method: 'POST',
    body: { cookies } // 只发送 cookies
  })
}

/**
 * @description 将用户选择的供应商和事业部信息更新到后端会话中
 * @param {object} selectionData 包含 supplierInfo 和 departmentInfo 的对象
 * @returns {Promise<Object>} 后端返回的更新后的会话对象
 */
export async function updateSelection(selectionData) {
  return await fetchApi('/api/update-selection', {
    method: 'POST',
    body: selectionData
  });
}

/**
 * 获取当前会话状态，验证用户是否已登录并获取会话上下文
 * @returns {Promise<any>}
 */
export const getSessionStatus = async () => {
  try {
    // 确保请求的是 /api/session-status
    const response = await throttledSendRequest('get', '/api/session-status')
    return response
  } catch (error) {
    console.error('getSessionStatus API错误:', error)
    return { loggedIn: false, context: null }
  }
}

/**
 * @description 调用后端 /api/init 接口
 */
export const initSession = async () => {
  try {
    console.log('调用 /api/init 初始化会话...')
    const response = await throttledSendRequest('POST', '/api/init', null, {
      'Content-Type': 'application/json'
    })

    console.log('/api/init 响应:', response)
    return response
  } catch (error) {
    console.error('初始化会话失败:', error)
    throw error
  }
}

/**
 * @description 获取文件内容的函数
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>}
 */
export async function getFileContent(filePath) {
  return await window.electron.ipcRenderer.invoke('get-file-content', filePath)
}

/**
 * @description 保存文件内容的函数
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @returns {Promise<void>}
 */
export async function saveFileContent(filePath, content) {
  return await window.electron.ipcRenderer.invoke('save-file-content', filePath, content)
}

/**
 * @description 打开文件选择对话框
 * @returns {Promise<string|null>} - 返回文件路径或null
 */
export async function openFileDialog() {
  return await window.electron.ipcRenderer.invoke('open-file-dialog')
}

// --- WebSocket 通信 ---
let webSocket = null
