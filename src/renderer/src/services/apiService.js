import { getRequestHeaders, getAllCookies } from '../utils/cookieHelper'
import qs from 'qs'

// API基础URL
const BASE_URL = 'https://o.jdl.com'

const API_BASE_URL = 'http://47.93.132.204:2333' // 后端服务器地址

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
        // 对于其他请求，添加请求体
        options.body = data
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

/**
 * 发送网络请求的通用方法
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @returns {Promise<any>} 响应数据
 */
export const fetchApi = async (url, options = {}) => {
  const MAX_RETRIES = 3 // 最大重试次数
  const TIMEOUT = 120000 // 超时时间设为120秒

  try {
    // 获取包含Cookie的请求头
    const headers = await getRequestHeaders()

    // 合并选项
    const finalOptions = {
      ...options,
      timeout: TIMEOUT, // 设置更长的超时时间
      headers: {
        ...headers,
        ...options.headers
      }
    }

    console.log('发送请求:', url, options)

    let retries = 0
    while (retries < MAX_RETRIES) {
      try {
        const response = await window.api.sendRequest(url, finalOptions)
        return response
      } catch (error) {
        retries++
        console.warn(`API请求失败(尝试 ${retries}/${MAX_RETRIES}):`, error)

        // 如果已经达到最大重试次数，抛出错误
        if (retries >= MAX_RETRIES) {
          console.error(`达到最大重试次数(${MAX_RETRIES})，请求失败:`, error)
          throw error
        }

        // 等待一段时间后重试，使用指数退避策略
        const waitTime = 2000 * Math.pow(2, retries - 1) // 2秒, 4秒, 8秒...
        console.log(`将在 ${waitTime / 1000} 秒后重试...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }
  } catch (error) {
    console.error('API请求失败:', error)
    throw error
  }
}

/**
 * 获取店铺列表
 * @param {string} deptId - 事业部ID
 * @returns {Promise<Array>} 店铺列表数组
 */
export async function getShopList(deptId) {
  if (!deptId) {
    console.error('获取店铺列表失败: 未提供事业部ID')
    return []
  }

  console.log('开始获取店铺列表, 事业部ID:', deptId)
  const url = `${BASE_URL}/shop/queryShopList.do`
  const csrfToken = await getCsrfToken()

  console.log('获取店铺列表, csrfToken:', csrfToken ? '已获取' : '未获取')

  // 使用分页方式获取所有店铺
  let allShops = []
  let currentStart = 0
  const pageSize = 100 // 每页请求的数量，增大以减少请求次数
  let totalRecords = null
  let hasMoreData = true

  // 循环获取所有页的店铺数据
  while (hasMoreData) {
    console.log(`获取店铺列表分页数据: 起始位置=${currentStart}, 每页数量=${pageSize}`)

    // 构建aoData参数
    const aoDataStr = `${currentStart},${pageSize}`

    // 构建请求数据
    const data = qs.stringify({
      csrfToken: csrfToken,
      shopNo: '',
      deptId: deptId,
      type: '',
      spSource: '',
      bizType: '',
      isvShopNo: '',
      sourceChannel: '',
      status: '1', // 启用状态
      iDisplayStart: String(currentStart),
      iDisplayLength: String(pageSize),
      remark: '',
      shopName: '',
      jdDeliverStatus: '',
      originSend: '',
      aoData: aoDataStr
    })

    try {
      console.log(`发送店铺列表请求: 页码=${currentStart / pageSize + 1}`)
      const response = await fetchApi(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: BASE_URL,
          Referer: `${BASE_URL}/goToMainIframe.do`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: data
      })

      // 处理响应数据
      if (response && response.aaData) {
        // 首次获取时记录总记录数
        if (totalRecords === null) {
          totalRecords = response.iTotalRecords || 0
          console.log(`店铺总数量: ${totalRecords}`)
        }

        // 处理本页的店铺数据
        const pageShops = response.aaData.map((shop) => ({
          id: shop.id,
          shopNo: shop.shopNo,
          shopName: shop.shopName,
          spShopNo: shop.spShopNo,
          status: shop.statusName,
          bizTypeName: shop.bizTypeName,
          typeName: shop.typeName,
          spSourceName: shop.spSourceName,
          deptId: shop.deptId,
          deptName: shop.deptName,
          sellerId: shop.sellerId,
          sellerNo: shop.sellerNo,
          jdDeliver: shop.jdDeliver,
          jdDeliverStatus: shop.jdDeliverStatus
        }))

        // 合并到总结果中
        allShops = [...allShops, ...pageShops]

        console.log(`当前已获取店铺: ${allShops.length}/${totalRecords}`)

        // 判断是否还有更多数据
        currentStart += response.aaData.length
        hasMoreData = currentStart < totalRecords

        // 如果没有更多数据或已获取所有记录，退出循环
        if (!hasMoreData || allShops.length >= totalRecords) {
          break
        }

        // 添加短暂延迟避免频繁请求
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      } else {
        console.error('响应数据格式不正确:', response)
        hasMoreData = false
      }
    } catch (error) {
      console.error(`获取店铺列表页码${currentStart / pageSize + 1}失败:`, error)
      hasMoreData = false
    }
  }

  console.log(`店铺列表获取完成，共获取${allShops.length}个店铺`)
  return allShops
}

/**
 * 获取供应商列表
 * @returns {Promise<Array>} 供应商列表数组
 */
export async function getVendorList() {
  const url = `${BASE_URL}/supplier/querySupplierList.do?rand=${Math.random()}`

  // 先获取 cookies 并检查登录状态
  const cookies = await getAllCookies()
  if (!cookies || cookies.length === 0) {
    console.error('获取供应商列表失败: 未找到有效的 cookies，可能未登录')
    return []
  }

  const csrfToken = await getCsrfToken()
  if (!csrfToken) {
    console.error('获取供应商列表失败: 未找到 csrfToken，可能登录状态无效')
    return []
  }

  console.log('获取供应商列表开始, csrfToken:', csrfToken ? '已获取' : '未获取')
  console.log('当前 cookies 数量:', cookies.length)

  // 构建请求数据
  const data = qs.stringify({
    csrfToken: csrfToken,
    sellerId: '',
    deptId: '',
    status: '',
    supplierNo: '',
    supplierName: '',
    aoData:
      '[{"name":"sEcho","value":2},{"name":"iColumns","value":6},{"name":"sColumns","value":",,,,,"},{"name":"iDisplayStart","value":0},{"name":"iDisplayLength","value":10},{"name":"mDataProp_0","value":0},{"name":"bSortable_0","value":false},{"name":"mDataProp_1","value":1},{"name":"bSortable_1","value":false},{"name":"mDataProp_2","value":"supplierNo"},{"name":"bSortable_2","value":true},{"name":"mDataProp_3","value":"supplierName"},{"name":"bSortable_3","value":true},{"name":"mDataProp_4","value":"deptName"},{"name":"bSortable_4","value":true},{"name":"mDataProp_5","value":"statusStr"},{"name":"bSortable_5","value":true},{"name":"iSortCol_0","value":2},{"name":"sSortDir_0","value":"desc"},{"name":"iSortingCols","value":1}]'
  })

  try {
    console.log('发送供应商列表请求')

    // 获取完整的 Cookie 字符串
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
    console.log('使用完整的 Cookie 字符串，长度:', cookieString.length)

    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieString // 直接设置完整的 Cookie 字符串
      },
      body: data
    })

    console.log('供应商列表响应:', response ? '获取成功' : '未获取数据')

    // 检查错误响应
    if (response && response.error === 'NotLogin') {
      console.error('获取供应商列表失败: 未登录或会话已过期')
      return []
    }

    // 处理响应数据，提取供应商列表
    if (response && response.aaData) {
      console.log('获取到供应商数量:', response.aaData.length)
      // 转换为更简单的数据结构
      return response.aaData.map((vendor) => {
        // 打印原始数据结构，帮助调试
        console.log('供应商原始数据:', vendor)
        return {
          id: vendor.id,
          supplierName: vendor.supplierName, // 确保属性名称一致
          supplierNo: vendor.supplierNo, // 确保属性名称一致
          status: vendor.status || vendor.statusStr,
          address: vendor.address || '',
          city: vendor.city || ''
        }
      })
    } else {
      console.error('响应数据格式不正确:', response)
      return []
    }
  } catch (error) {
    console.error('获取供应商列表失败:', error)
    return [] // 返回空数组而不是抛出错误，以避免UI崩溃
  }
}

/**
 * 根据供应商获取事业部列表
 * @param {string} vendorName - 供应商名称
 * @returns {Promise<Array>} 事业部列表数组
 */
export async function getDepartmentsByVendor(vendorName) {
  console.log('开始获取事业部列表, 供应商名称:', vendorName)
  const url = `${BASE_URL}/dept/queryDeptList.do?rand=${Math.random()}`

  // 先获取 cookies 并检查登录状态
  const cookies = await getAllCookies()
  if (!cookies || cookies.length === 0) {
    console.error('获取事业部列表失败: 未找到有效的 cookies，可能未登录')
    return []
  }

  const csrfToken = await getCsrfToken()
  if (!csrfToken) {
    console.error('获取事业部列表失败: 未找到 csrfToken，可能登录状态无效')
    return []
  }

  console.log('获取事业部列表, csrfToken:', csrfToken ? '已获取' : '未获取')
  console.log('当前 cookies 数量:', cookies.length)

  // 构建请求数据
  const data = qs.stringify({
    csrfToken: csrfToken,
    id: '',
    sellerId: '',
    status: '2', // 启用状态
    aoData:
      '[{"name":"sEcho","value":3},{"name":"iColumns","value":7},{"name":"sColumns","value":",,,,,,"},{"name":"iDisplayStart","value":0},{"name":"iDisplayLength","value":10},{"name":"mDataProp_0","value":0},{"name":"bSortable_0","value":false},{"name":"mDataProp_1","value":1},{"name":"bSortable_1","value":false},{"name":"mDataProp_2","value":"deptNo"},{"name":"bSortable_2","value":true},{"name":"mDataProp_3","value":"deptName"},{"name":"bSortable_3","value":true},{"name":"mDataProp_4","value":"sellerNo"},{"name":"bSortable_4","value":true},{"name":"mDataProp_5","value":"sellerName"},{"name":"bSortable_5","value":true},{"name":"mDataProp_6","value":"statusStr"},{"name":"bSortable_6","value":true},{"name":"iSortCol_0","value":2},{"name":"sSortDir_0","value":"desc"},{"name":"iSortingCols","value":1}]'
  })

  try {
    console.log('发送事业部列表请求')

    // 获取完整的 Cookie 字符串
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
    console.log('使用完整的 Cookie 字符串，长度:', cookieString.length)

    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieString // 直接设置完整的 Cookie 字符串
      },
      body: data
    })

    console.log('事业部列表响应:', response ? '获取成功' : '未获取数据')

    // 检查错误响应
    if (response && response.error === 'NotLogin') {
      console.error('获取事业部列表失败: 未登录或会话已过期')
      return []
    }

    // 处理响应数据，提取事业部列表
    if (response && response.aaData) {
      console.log('获取到事业部总数量:', response.aaData.length)

      // 过滤名称包含供应商名称的事业部
      const filteredDepts = response.aaData.filter((dept) => {
        const deptMatch = dept.deptName && dept.deptName.includes(vendorName)
        const sellerMatch = dept.sellerName && dept.sellerName.includes(vendorName)
        return deptMatch || sellerMatch
      })

      console.log('过滤后的事业部数量:', filteredDepts.length)

      if (filteredDepts.length === 0 && response.aaData.length > 0) {
        console.log('过滤条件太严格，无法找到匹配的事业部，返回所有事业部')
        // 如果过滤后没有事业部但API返回了事业部，则返回所有事业部
        return response.aaData.map((dept) => ({
          id: dept.id,
          name: dept.deptName,
          deptNo: dept.deptNo,
          sellerId: dept.sellerId,
          sellerName: dept.sellerName,
          sellerNo: dept.sellerNo,
          status: dept.statusStr,
          createTime: dept.createTimeStr
        }))
      }

      // 转换为更简单的数据结构
      return filteredDepts.map((dept) => ({
        id: dept.id,
        name: dept.deptName,
        deptNo: dept.deptNo,
        sellerId: dept.sellerId,
        sellerName: dept.sellerName,
        sellerNo: dept.sellerNo,
        status: dept.statusStr,
        createTime: dept.createTimeStr
      }))
    } else {
      console.error('响应数据格式不正确:', response)
      return []
    }
  } catch (error) {
    console.error('获取事业部列表失败:', error)
    return [] // 返回空数组而不是抛出错误，以避免UI崩溃
  }
}

/**
 * 获取仓库列表
 * @param {string} sellerId - 供应商ID
 * @param {string} deptId - 事业部ID
 * @returns {Promise<Array>} 仓库列表数组
 */
export async function getWarehouseList(sellerId, deptId) {
  if (!sellerId || !deptId) {
    console.error('获取仓库列表失败: 未提供供应商ID或事业部ID')
    return []
  }

  console.log('开始获取仓库列表, 供应商ID:', sellerId, '事业部ID:', deptId)
  const url = `${BASE_URL}/warehouseOpen/queryWarehouseOpenList.do?rand=${Math.random()}`

  // 先获取 cookies 并检查登录状态
  const cookies = await getAllCookies()
  if (!cookies || cookies.length === 0) {
    console.error('获取仓库列表失败: 未找到有效的 cookies，可能未登录')
    return []
  }

  const csrfToken = await getCsrfToken()
  if (!csrfToken) {
    console.error('获取仓库列表失败: 未找到 csrfToken，可能登录状态无效')
    return []
  }

  console.log('获取仓库列表, csrfToken:', csrfToken ? '已获取' : '未获取')
  console.log('当前 cookies 数量:', cookies.length)

  // 构建请求数据
  const data = qs.stringify({
    csrfToken: csrfToken,
    sellerId: sellerId,
    deptId: deptId,
    status: '1', // 启用状态
    aoData:
      '[{"name":"sEcho","value":1},{"name":"iColumns","value":5},{"name":"sColumns","value":",,,,,"},{"name":"iDisplayStart","value":0},{"name":"iDisplayLength","value":10},{"name":"mDataProp_0","value":0},{"name":"bSortable_0","value":false},{"name":"mDataProp_1","value":"warehouseNo"},{"name":"bSortable_1","value":true},{"name":"mDataProp_2","value":"warehouseName"},{"name":"bSortable_2","value":true},{"name":"mDataProp_3","value":"warehouseAddress"},{"name":"bSortable_3","value":true},{"name":"mDataProp_4","value":"statusStr"},{"name":"bSortable_4","value":true},{"name":"iSortCol_0","value":1},{"name":"sSortDir_0","value":"desc"},{"name":"iSortingCols","value":1}]'
  })

  try {
    console.log('发送仓库列表请求')

    // 获取完整的 Cookie 字符串
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
    console.log('使用完整的 Cookie 字符串，长度:', cookieString.length)

    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieString // 直接设置完整的 Cookie 字符串
      },
      body: data
    })

    console.log('仓库列表响应:', response ? '获取成功' : '未获取数据')

    // 处理响应数据，提取仓库列表
    if (response && response.aaData) {
      console.log('获取到仓库数量:', response.aaData.length)

      // 转换为更简单的数据结构
      return response.aaData.map((warehouse) => ({
        id: warehouse.warehouseId,
        warehouseId: warehouse.warehouseId,
        warehouseNo: warehouse.warehouseNo,
        warehouseName: warehouse.warehouseName,
        warehouseType: warehouse.warehouseType,
        warehouseTypeStr: warehouse.warehouseTypeStr,
        deptName: warehouse.deptName,
        effectTime: warehouse.effectTime,
        updateTime: warehouse.updateTime
      }))
    } else {
      console.error('响应数据格式不正确:', response)
      return []
    }
  } catch (error) {
    console.error('获取仓库列表失败:', error)
    return []
  }
}

/**
 * @description 创建一个新的会话，将认证和上下文信息发送到后端
 * @param {object} sessionData 包含 cookies, supplierInfo, departmentInfo 的对象
 * @returns {Promise<object>} 后端返回的响应数据，包含 sessionId
 */
export const createSession = async (sessionData) => {
  console.log('调用createSession API，数据:', {
    uniqueKey: sessionData.uniqueKey ? `${sessionData.uniqueKey.substring(0, 10)}...` : '无',
    hasCookies: sessionData.cookies && sessionData.cookies.length > 0,
    supplierName: sessionData.supplierInfo?.name || '未提供',
    departmentName: sessionData.departmentInfo?.name || '未提供'
  })

  try {
    // 通过主进程发送请求
    const response = await throttledSendRequest('POST', '/api/session', sessionData, {
      'Content-Type': 'application/json'
    })

    console.log('createSession API响应数据:', response)
    return response
  } catch (error) {
    console.error('createSession API错误:', error)
    throw error
  }
}

/**
 * @description 调用后端的通用任务执行接口
 * @param {string} taskName 要执行的任务名称
 * @param {object} payload 任务需要的具体数据
 * @returns {Promise<string>} - 返回一个唯一的 taskId
 */
export const executeTask = async (taskName, payload) => {
  console.log(`[apiService] 请求执行任务: ${taskName}`)
  const response = await throttledSendRequest('POST', '/task', { taskName, payload }, {
    'Content-Type': 'application/json'
  })

  if (response && response.taskId) {
    return response.taskId
  }
  throw new Error('未能从后端获取任务ID')
}

/**
 * 检查后端会话状态
 * @returns {Promise<object>}
 */
export const getSessionStatus = async () => {
  console.log('调用getSessionStatus API检查会话状态')

  try {
    const response = await throttledSendRequest('GET', '/api/session/status', null, {
      'Content-Type': 'application/json'
    })

    console.log('getSessionStatus API响应数据:', {
      success: response.success,
      loggedIn: response.loggedIn,
      hasContext: !!response.context,
      sessionID: response.sessionID
    })

    return response
  } catch (error) {
    console.error('getSessionStatus API错误:', error)
    throw error
  }
}

/**
 * 执行一个后端工作流
 * @param {string} flowName - 要执行的工作流名称
 * @param {object} payload - 工作流所需的负载
 * @returns {Promise<string>} - 返回一个唯一的 taskId
 */
export const executeFlow = async (flowName, payload) => {
  console.log(`[apiService] 请求执行工作流: ${flowName}`)
  const response = await throttledSendRequest('POST', '/api/execute-flow', { flowName, payload }, {
    'Content-Type': 'application/json'
  })

  if (response && response.taskId) {
    return response.taskId
  }
  throw new Error('未能从后端获取工作流ID')
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
