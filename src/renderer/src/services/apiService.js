import { getRequestHeaders, getAllCookies } from '../utils/cookieHelper'
import qs from 'qs'

// API基础URL
const BASE_URL = 'https://o.jdl.com'

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
async function fetchApi(url, options = {}) {
  try {
    // 获取包含Cookie的请求头
    const headers = await getRequestHeaders()

    // 合并选项
    const requestOptions = {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    }

    console.log('发送请求:', url, requestOptions)

    // 使用主进程进行请求以解决跨域问题
    return await window.api.sendRequest(url, requestOptions)
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
    iDisplayStart: '0',
    iDisplayLength: '50', // 获取更多店铺
    remark: '',
    shopName: '',
    jdDeliverStatus: '',
    originSend: '',
    aoData: '0,50'
  })

  try {
    console.log('发送店铺列表请求')
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

    console.log('店铺列表响应:', response ? '获取成功' : '未获取数据')

    // 处理响应数据，提取店铺列表
    if (response && response.aaData) {
      console.log('获取到店铺数量:', response.aaData.length)

      // 转换为更简单的数据结构
      return response.aaData.map((shop) => ({
        id: shop.id,
        shopNo: shop.shopNo,
        shopName: shop.shopName,
        spShopNo: shop.spShopNo,
        status: shop.statusName,
        bizTypeName: shop.bizTypeName,
        typeName: shop.typeName,
        spSourceName: shop.spSourceName
      }))
    } else {
      console.error('响应数据格式不正确:', response)
      return []
    }
  } catch (error) {
    console.error('获取店铺列表失败:', error)
    return []
  }
}

/**
 * 获取供应商列表
 * @returns {Promise<Array>} 供应商列表数组
 */
export async function getVendorList() {
  const url = `${BASE_URL}/supplier/querySupplierList.do?rand=${Math.random()}`
  const csrfToken = await getCsrfToken()

  console.log('获取供应商列表开始, csrfToken:', csrfToken ? '已获取' : '未获取')

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

    console.log('供应商列表响应:', response ? '获取成功' : '未获取数据')

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
    throw error
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
  const csrfToken = await getCsrfToken()

  console.log('获取事业部列表, csrfToken:', csrfToken ? '已获取' : '未获取')

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

    console.log('事业部列表响应:', response ? '获取成功' : '未获取数据')

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
    throw error
  }
}

/**
 * 测试API服务连接性
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function testApiConnection() {
  try {
    // 尝试获取供应商列表
    const vendors = await getVendorList()
    return vendors && vendors.length > 0
  } catch (error) {
    console.error('API连接测试失败:', error)
    return false
  }
}
