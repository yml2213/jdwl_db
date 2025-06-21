import { getRequestHeaders, getAllCookies } from '../utils/cookieHelper'
import qs from 'qs'
import * as XLSX from 'xlsx'
import { getSelectedVendor, getSelectedDepartment } from '../utils/storageHelper'

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
      console.log(`发送店铺列表请求: 页码=${currentStart/pageSize + 1}`)
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
      console.error(`获取店铺列表页码${currentStart/pageSize + 1}失败:`, error)
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
  const csrfToken = await getCsrfToken()

  console.log('获取仓库列表, csrfToken:', csrfToken ? '已获取' : '未获取')

  // 构建请求数据
  const data = qs.stringify({
    csrfToken: csrfToken,
    sellerId: sellerId,
    deptId: deptId,
    warehouseNo: '',
    warehouseName: '',
    warehouseType: '',
    isSalesReturn: '',
    effectTimeStart: '',
    effectTimeEnd: '',
    aoData:
      '[{"name":"sEcho","value":5},{"name":"iColumns","value":10},{"name":"sColumns","value":",,,,,,,,,"},{"name":"iDisplayStart","value":0},{"name":"iDisplayLength","value":10},{"name":"mDataProp_0","value":0},{"name":"bSortable_0","value":false},{"name":"mDataProp_1","value":"deptName"},{"name":"bSortable_1","value":true},{"name":"mDataProp_2","value":"warehouseNo"},{"name":"bSortable_2","value":true},{"name":"mDataProp_3","value":"warehouseName"},{"name":"bSortable_3","value":true},{"name":"mDataProp_4","value":"warehouseTypeStr"},{"name":"bSortable_4","value":true},{"name":"mDataProp_5","value":"isSalesReturn"},{"name":"bSortable_5","value":true},{"name":"mDataProp_6","value":"effectTime"},{"name":"bSortable_6","value":true},{"name":"mDataProp_7","value":"effectOperateUser"},{"name":"bSortable_7","value":true},{"name":"mDataProp_8","value":"updateTime"},{"name":"bSortable_8","value":true},{"name":"mDataProp_9","value":"updateUser"},{"name":"bSortable_9","value":true},{"name":"iSortCol_0","value":6},{"name":"sSortDir_0","value":"desc"},{"name":"iSortingCols","value":1}]'
  })

  try {
    console.log('发送仓库列表请求')
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
 * 上传商品Excel文件并导入商品
 * @param {File} file - Excel文件对象
 * @param {Object} storeInfo - 店铺信息
 * @returns {Promise<Object>} 导入结果
 */
export async function importProductsFromExcel(file, storeInfo) {
  console.log('开始导入商品Excel文件:', file.name)
  const url = `${BASE_URL}/shopGoods/importPopSG.do?spShopNo=${storeInfo.spShopNo || storeInfo.shopNo}&_r=${Math.random()}`
  const csrfToken = await getCsrfToken()

  const formData = new FormData()
  formData.append('csrfToken', csrfToken)
  formData.append('shopGoodsPopGoodsListFile', file)

  try {
    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        // 不要手动设置Content-Type，让浏览器自动添加包含boundary的multipart/form-data
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
        'cache-control': 'no-cache',
        origin: BASE_URL,
        pragma: 'no-cache',
        referer: `${BASE_URL}/goToMainIframe.do`,
        'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData
    })

    console.log('Excel导入响应:', response)
    return {
      success: response && response.result,
      message: response ? response.msg || '导入成功' : '导入失败',
      data: response
    }
  } catch (error) {
    console.error('导入商品Excel失败:', error)
    return {
      success: false,
      message: `导入失败: ${error.message || '未知错误'}`,
      error
    }
  }
}

/**
 * 获取导入商品模板文件
 * @returns {Promise<Blob>} 模板文件Blob对象
 */
export async function getProductImportTemplate() {
  console.log('开始获取商品导入模板')
  const url = `${BASE_URL}/product/downloadProductTemplate.do`
  const csrfToken = await getCsrfToken()

  try {
    const response = await fetchApi(url, {
      method: 'GET',
      headers: {
        Origin: BASE_URL,
        Referer: `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      responseType: 'blob', // 指定响应类型为blob
      params: { csrfToken } // 添加csrfToken作为URL参数
    })

    console.log('获取模板文件成功')
    return response
  } catch (error) {
    console.error('获取导入模板失败:', error)
    throw error
  }
}

/**
 * 批量处理SKU列表，包括导入到店铺等操作
 * @param {Array<string>} skuList - SKU列表
 * @param {Object} storeInfo - 店铺信息
 * @returns {Promise<Object>} 处理结果
 */
export async function batchProcessSKUs(skuList, storeInfo) {
  if (!skuList || !skuList.length) {
    return { success: false, message: '未提供SKU列表' }
  }

  console.log(`============== batchProcessSKUs 函数被调用 ==============`)
  console.log(`开始批量处理${skuList.length}个SKU`, skuList)
  // 使用与原始请求完全相同的URL格式
  const spShopNo = storeInfo.spShopNo || storeInfo.shopNo || '18661988' // 默认值用于测试
  const url = `${BASE_URL}/shopGoods/importPopSG.do?spShopNo=${spShopNo}&_r=${Math.random()}`

  console.log('导入接口URL:', url)
  console.log('店铺信息:', storeInfo)

  // 打印调用栈，帮助排查调用来源
  console.log('调用栈:', new Error().stack)

  const csrfToken = await getCsrfToken()
  console.log('csrfToken', csrfToken)

  // 获取所有Cookie
  const cookies = await getAllCookies()
  console.log('已获取Cookie数量:', cookies.length)

  try {
    // 获取当前选择的供应商
    const selectedVendor = getSelectedVendor()
    const cmgCode =
      selectedVendor && selectedVendor.supplierNo
        ? `CMS${selectedVendor.supplierNo}`
        : 'CMS4418047112894'
    console.log('获取供应商编码:', cmgCode)

    // 字段名
    const header = [
      'POP店铺商品编号（SKU编码）',
      '商家商品标识',
      '商品条码',
      '是否代销（0-否，1-是）',
      '供应商CMG编码'
    ]

    // 实际表格内容
    const data = skuList.map((sku) => [sku, sku, sku, '0', cmgCode])

    // 合成数据（首行为 header）
    const sheetData = [header, ...data]

    // 生成 worksheet
    const ws = XLSX.utils.aoa_to_sheet(sheetData)

    // 创建 workbook 并追加 worksheet，确保sheet名为"POP商品导入"
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'POP商品导入')

    // 设置一些常用的单元格样式
    if (!wb.Workbook) wb.Workbook = {}
    if (!wb.Workbook.Sheets) wb.Workbook.Sheets = {}
    if (!wb.Workbook.Sheets['POP商品导入']) wb.Workbook.Sheets['POP商品导入'] = {}

    // 指定xls格式生成Excel二进制数据
    const excelBinaryData = XLSX.write(wb, {
      bookType: 'xls',
      type: 'binary',
      compression: true,
      bookSST: false
    })

    // 将二进制字符串转换为ArrayBuffer
    const buf = new ArrayBuffer(excelBinaryData.length)
    const view = new Uint8Array(buf)
    for (let i = 0; i < excelBinaryData.length; i++) {
      view[i] = excelBinaryData.charCodeAt(i) & 0xff
    }

    // 创建文件对象
    const file = new File([buf], 'PopGoodsImportTemplate.xls', {
      type: 'application/vnd.ms-excel'
    })

    console.log('已创建Excel文件:', file.name, file.size, 'bytes')

    // 使用FormData提交
    const formData = new FormData()
    formData.append('csrfToken', csrfToken)

    // 明确指定文件名，确保服务器端能正确接收
    formData.append('shopGoodsPopGoodsListFile', file, 'PopGoodsImportTemplate.xls')

    // 检查FormData内容
    console.log('FormData已创建，包含以下字段:')
    for (const pair of formData.entries()) {
      console.log(
        pair[0],
        ':',
        pair[1] instanceof File ? `文件对象 (${pair[1].name}, ${pair[1].size} bytes)` : pair[1]
      )
    }

    // 序列化FormData，以便传递给主进程
    const serializedFormData = await serializeFormData(formData)

    // 尝试发送请求
    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        // 不要手动设置Content-Type，让浏览器自动添加包含boundary的multipart/form-data
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
        'cache-control': 'no-cache',
        origin: BASE_URL,
        pragma: 'no-cache',
        referer: `${BASE_URL}/goToMainIframe.do`,
        'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: serializedFormData
    })

    console.log('批量处理响应:', response)
    return {
      success: response && response.result,
      message: response ? response.msg || '处理成功' : '处理失败',
      data: response
    }
  } catch (error) {
    console.error('批量处理SKU失败:', error)
    return {
      success: false,
      message: `处理失败: ${error.message || '未知错误'}`,
      error
    }
  }
}

/**
 * 序列化FormData对象，使其可以通过IPC传递
 * @param {FormData} formData - FormData对象
 * @returns {Promise<Object>} 序列化后的FormData对象
 */
async function serializeFormData(formData) {
  const entries = []

  // 遍历FormData中的每个字段
  for (const pair of formData.entries()) {
    const [key, value] = pair

    // 如果是文件，需要特殊处理
    if (value instanceof File || value instanceof Blob) {
      // 转换文件为ArrayBuffer
      const buffer = await value.arrayBuffer()

      // 创建序列化文件对象
      entries.push([
        key,
        {
          _isFile: true,
          name: value.name,
          type: value.type,
          size: value.size,
          lastModified: value instanceof File ? value.lastModified : null,
          data: Array.from(new Uint8Array(buffer)) // 将ArrayBuffer转换为数组
        }
      ])
    } else {
      // 普通字段直接添加
      entries.push([key, value])
    }
  }

  // 返回序列化的FormData对象
  return {
    _isFormData: true,
    entries,
    // 注意: 对于大量SKU处理，增加超时时间至120秒
    timeout: 120000
  }
}

/**
 * 查询商品状态 - 检查是否有停用商品
 * @param {Array<string>} skuList - 商品编号列表
 * @param {Object} shopInfo - 店铺信息
 * @param {Object} deptInfo - 事业部信息
 * @returns {Promise<Array>} 停用商品列表
 */
export async function queryProductStatus(skuList, shopInfo, deptInfo) {
  if (!skuList || skuList.length === 0) {
    return { success: false, message: '未提供SKU列表', disabledItems: [] }
  }

  console.log(`============== queryProductStatus 函数被调用 ==============`)
  console.log('skuList', skuList)
  console.log('shopInfo', shopInfo)
  console.log('deptInfo', deptInfo)

  // 打印调用栈，帮助排查调用来源
  console.log('调用栈:', new Error().stack)

  // 将SKU列表转换为英文逗号分隔的字符串
  const skuString = skuList.join(',')

  console.log(`开始查询${skuList.length}个SKU的状态`)
  const baseUrl = `${BASE_URL}/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`
  console.log('查询接口URL:', baseUrl)
  const csrfToken = await getCsrfToken()

  try {
    let allDisabledItems = [] // 存储所有页的停用商品
    let currentStart = 0
    const pageSize = 100 // 每页请求的数量，增大以减少请求次数
    let totalRecords = null
    let hasMoreData = true

    // 循环查询所有页的数据
    while (hasMoreData) {
      console.log(`查询停用商品分页数据：起始位置=${currentStart}, 每页数量=${pageSize}`)

      // 构建aoData参数，注意修改分页参数
      const aoDataObj = [
        { name: 'sEcho', value: 2 },
        { name: 'iColumns', value: 14 },
        { name: 'sColumns', value: ',,,,,,,,,,,,,' },
        { name: 'iDisplayStart', value: currentStart },
        { name: 'iDisplayLength', value: pageSize },
        { name: 'mDataProp_0', value: 0 },
        { name: 'bSortable_0', value: false },
        { name: 'mDataProp_1', value: 1 },
        { name: 'bSortable_1', value: false },
        { name: 'mDataProp_2', value: 'shopGoodsName' },
        { name: 'bSortable_2', value: false },
        { name: 'mDataProp_3', value: 'goodsNo' },
        { name: 'bSortable_3', value: false },
        { name: 'mDataProp_4', value: 'spGoodsNo' },
        { name: 'bSortable_4', value: false },
        { name: 'mDataProp_5', value: 'isvGoodsNo' },
        { name: 'bSortable_5', value: false },
        { name: 'mDataProp_6', value: 'shopGoodsNo' },
        { name: 'bSortable_6', value: false },
        { name: 'mDataProp_7', value: 'barcode' },
        { name: 'bSortable_7', value: false },
        { name: 'mDataProp_8', value: 'shopName' },
        { name: 'bSortable_8', value: false },
        { name: 'mDataProp_9', value: 'createTime' },
        { name: 'bSortable_9', value: false },
        { name: 'mDataProp_10', value: 10 },
        { name: 'bSortable_10', value: false },
        { name: 'mDataProp_11', value: 'isCombination' },
        { name: 'bSortable_11', value: false },
        { name: 'mDataProp_12', value: 'status' },
        { name: 'bSortable_12', value: false },
        { name: 'mDataProp_13', value: 13 },
        { name: 'bSortable_13', value: false },
        { name: 'iSortCol_0', value: 9 },
        { name: 'sSortDir_0', value: 'desc' },
        { name: 'iSortingCols', value: 1 }
      ]

      // 构建查询参数
      const data = qs.stringify({
        csrfToken: csrfToken,
        ids: '',
        shopId: '',
        sellerId: deptInfo?.sellerId || '',
        deptId: deptInfo?.id || '',
        sellerNo: deptInfo?.sellerNo || '',
        deptNo: deptInfo?.deptNo || '',
        shopNo: shopInfo?.shopNo || '',
        spSource: '',
        shopGoodsName: '',
        isCombination: '',
        barcode: '',
        jdDeliver: '',
        sellerGoodsSigns: skuString,
        spGoodsNos: '',
        goodsNos: '',
        isvGoodsNos: '',
        status: '2', // 查询停用状态的商品
        originSend: '',
        aoData: JSON.stringify(aoDataObj)
      })

      const response = await fetchApi(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Origin: BASE_URL,
          Referer: `${BASE_URL}/goToMainIframe.do`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: data
      })

      // 处理响应
      if (response && response.aaData) {
        // 首次获取总记录数
        if (totalRecords === null) {
          totalRecords = response.iTotalRecords || 0
          console.log(`查询到总共有${totalRecords}个停用商品`)
        }

        // 解析本页数据
        const pageDisabledItems = response.aaData.map((item) => ({
          id: item.id,
          shopGoodsNo: item.shopGoodsNo,
          sellerGoodsSign: item.sellerGoodsSign,
          isvGoodsNo: item.isvGoodsNo,
          spGoodsNo: item.spGoodsNo,
          shopGoodsName: item.shopGoodsName,
          status: item.status
        }))

        // 合并到总结果中
        allDisabledItems = [...allDisabledItems, ...pageDisabledItems]

        console.log(`当前已获取${allDisabledItems.length}/${totalRecords}个停用商品`)

        // 判断是否还有更多数据
        currentStart += response.aaData.length
        hasMoreData = currentStart < totalRecords

        // 如果没有更多数据或已获取所有记录，退出循环
        if (!hasMoreData || allDisabledItems.length >= totalRecords) {
          break
        }

        // 添加短暂延迟避免频繁请求
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      } else {
        // 如果响应异常，退出循环
        console.warn('查询商品状态响应异常:', response)
        hasMoreData = false
      }
    }

    console.log(`商品状态查询完成，共获取${allDisabledItems.length}个停用商品`)

    return {
      success: true,
      message: `查询到${allDisabledItems.length}个停用商品`,
      disabledItems: allDisabledItems,
      totalCount: totalRecords || allDisabledItems.length
    }
  } catch (error) {
    console.error('查询商品状态失败:', error)
    return {
      success: false,
      message: `查询商品状态失败: ${error.message || '未知错误'}`,
      disabledItems: []
    }
  }
}

/**
 * 启用店铺商品
 * @param {Array} disabledItems - 停用商品列表
 * @returns {Promise<Object>} 启用结果
 */
export async function enableShopProducts(disabledItems) {
  if (!disabledItems || disabledItems.length === 0) {
    return { success: false, message: '未提供需要启用的商品列表' }
  }

  console.log(`开始启用${disabledItems.length}个商品`)
  const url = `${BASE_URL}/shopGoods/batchOnShopGoods.do`
  const csrfToken = await getCsrfToken()

  try {
    // 提取所有商品ID，转换为JSON字符串格式
    const idsArray = disabledItems.map((item) => item.id)
    const idsJsonString = JSON.stringify(idsArray)

    // 构建请求数据
    const data = qs.stringify({
      csrfToken: csrfToken,
      ids: idsJsonString
    })

    console.log('启用商品请求参数:', data)

    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Origin: BASE_URL,
        Referer: `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: data
    })

    console.log('启用商品响应:', response)

    if (response && (response.result || response.resultCode === 1)) {
      return {
        success: true,
        message: response.resultMessage || `成功启用${disabledItems.length}个商品`,
        data: response
      }
    } else {
      return {
        success: false,
        message: response?.resultMessage || response?.msg || '启用商品失败，未返回成功状态',
        data: response
      }
    }
  } catch (error) {
    console.error('启用商品失败:', error)
    return {
      success: false,
      message: `启用商品失败: ${error.message || '未知错误'}`,
      error
    }
  }
}

/**
 * 根据SKU列表获取CSG编号列表
 * @param {Array<string>} skuList - SKU列表
 * @param {Object} deptInfo - 事业部信息
 * @returns {Promise<Array<string>>} CSG编号列表
 */
export async function getCSGList(skuList) {
  if (!skuList || skuList.length === 0) {
    return { success: false, message: '未提供SKU列表', csgList: [] }
  }

  // console.log(`============== getCSGList 函数被调用 ==============`)
  // console.log('skuList', skuList)

  // 打印调用栈，帮助排查调用来源
  // console.log('调用栈:', new Error().stack)

  // 将SKU列表转换为英文逗号分隔的字符串
  const skuString = skuList.join(',')

  console.log(`开始查询${skuList.length}个SKU对应的CSG编号`)
  const baseUrl = `${BASE_URL}/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`
  console.log('查询接口URL:', baseUrl)
  const csrfToken = await getCsrfToken()

  try {
    let allCSGItems = [] // 存储所有页的CSG商品
    let currentStart = 0
    const pageSize = 100 // 每页请求的数量，增大以减少请求次数
    let totalRecords = null
    let hasMoreData = true

    // 循环查询所有页的数据
    while (hasMoreData) {
      console.log(`查询CSG商品分页数据：起始位置=${currentStart}, 每页数量=${pageSize}`)

      // 构建aoData参数，注意修改分页参数
      const aoDataObj = [
        { name: 'sEcho', value: 2 },
        { name: 'iColumns', value: 14 },
        { name: 'sColumns', value: ',,,,,,,,,,,,,' },
        { name: 'iDisplayStart', value: currentStart },
        { name: 'iDisplayLength', value: pageSize },
        { name: 'mDataProp_0', value: 0 },
        { name: 'bSortable_0', value: false },
        { name: 'mDataProp_1', value: 1 },
        { name: 'bSortable_1', value: false },
        { name: 'mDataProp_2', value: 'shopGoodsName' },
        { name: 'bSortable_2', value: false },
        { name: 'mDataProp_3', value: 'goodsNo' },
        { name: 'bSortable_3', value: false },
        { name: 'mDataProp_4', value: 'spGoodsNo' },
        { name: 'bSortable_4', value: false },
        { name: 'mDataProp_5', value: 'isvGoodsNo' },
        { name: 'bSortable_5', value: false },
        { name: 'mDataProp_6', value: 'shopGoodsNo' },
        { name: 'bSortable_6', value: false },
        { name: 'mDataProp_7', value: 'barcode' },
        { name: 'bSortable_7', value: false },
        { name: 'mDataProp_8', value: 'shopName' },
        { name: 'bSortable_8', value: false },
        { name: 'mDataProp_9', value: 'createTime' },
        { name: 'bSortable_9', value: false },
        { name: 'mDataProp_10', value: 10 },
        { name: 'bSortable_10', value: false },
        { name: 'mDataProp_11', value: 'isCombination' },
        { name: 'bSortable_11', value: false },
        { name: 'mDataProp_12', value: 'status' },
        { name: 'bSortable_12', value: false },
        { name: 'mDataProp_13', value: 13 },
        { name: 'bSortable_13', value: false },
        { name: 'iSortCol_0', value: 9 },
        { name: 'sSortDir_0', value: 'desc' },
        { name: 'iSortingCols', value: 1 }
      ]

      // 从事业部信息中获取sellerId和sellerNo
      const deptInfo = getSelectedDepartment()
      if (!deptInfo) {
        throw new Error('未选择事业部，无法获取CSG编号')
      }

      // 构建查询参数
      const data = qs.stringify({
        csrfToken: csrfToken,
        ids: '',
        shopId: '',
        sellerId: deptInfo.sellerId || '', // 使用事业部信息中的sellerId
        deptId: deptInfo.id || '',
        sellerNo: deptInfo.sellerNo || '', // 使用事业部信息中的sellerNo
        deptNo: deptInfo.deptNo || '',
        shopNo: '',
        spSource: '',
        shopGoodsName: '',
        isCombination: '',
        barcode: '',
        jdDeliver: '',
        sellerGoodsSigns: skuString,
        spGoodsNos: '',
        goodsNos: '',
        isvGoodsNos: '',
        status: '1',
        originSend: '',
        aoData: JSON.stringify(aoDataObj)
      })

      const response = await fetchApi(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Origin: BASE_URL,
          Referer: `${BASE_URL}/goToMainIframe.do`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: data
      })

      // 处理响应
      if (response && response.aaData) {
        // 首次获取总记录数
        if (totalRecords === null) {
          totalRecords = response.iTotalRecords || 0
          console.log(`查询到总共有${totalRecords}个商品`)
        }

        // 解析本页数据，提取CSG编号
        const pageCSGItems = response.aaData
          .filter(item => item.spGoodsNo) // 只保留有CSG编号的商品
          .map(item => item.spGoodsNo)

        // 合并到总结果中
        allCSGItems = [...allCSGItems, ...pageCSGItems]

        console.log(`当前已获取${allCSGItems.length}/${totalRecords}个CSG编号`)

        // 判断是否还有更多数据
        currentStart += response.aaData.length
        hasMoreData = currentStart < totalRecords

        // 如果没有更多数据或已获取所有记录，退出循环
        if (!hasMoreData || allCSGItems.length >= totalRecords) {
          break
        }

        // 添加短暂延迟避免频繁请求
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      } else {
        // 如果响应异常，退出循环
        console.warn('查询CSG编号响应异常:', response)
        hasMoreData = false
      }
    }

    console.log(`CSG编号查询完成，共获取${allCSGItems.length}个CSG编号`)

    return {
      success: true,
      message: `查询到${allCSGItems.length}个CSG编号`,
      csgList: allCSGItems,
      totalCount: totalRecords || allCSGItems.length
    }
  } catch (error) {
    console.error('查询CSG编号失败:', error)
    return {
      success: false,
      message: `查询CSG编号失败: ${error.message || '未知错误'}`,
      csgList: []
    }
  }
}

/**
 * 根据SKU列表获取CMG编号列表
 * @param {Array<string>} skuList - SKU列表
 * @returns {Promise<Array>} 包含CMG和商品信息的数组
 */
export async function getCMGBySkuList(skuList, applyInstoreQty = 1000) {
  if (!skuList || skuList.length === 0) {
    return []
  }

  // 将SKU列表转换为英文逗号分隔的字符串
  const skuString = skuList.join(',')

  console.log(`开始查询${skuList.length}个SKU对应的CMG编号`)
  const baseUrl = `${BASE_URL}/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`
  console.log('查询接口URL:', baseUrl)
  const csrfToken = await getCsrfToken()

  try {
    let allCMGItems = [] // 存储所有页的CMG商品信息
    let currentStart = 0
    const pageSize = 100 // 每页请求的数量
    let totalRecords = null
    let hasMoreData = true

    // 循环查询所有页的数据
    while (hasMoreData) {
      console.log(`查询CMG商品分页数据：起始位置=${currentStart}, 每页数量=${pageSize}`)

      // 构建aoData参数
      const aoDataObj = [
        { name: 'sEcho', value: 2 },
        { name: 'iColumns', value: 14 },
        { name: 'sColumns', value: ',,,,,,,,,,,,,' },
        { name: 'iDisplayStart', value: currentStart },
        { name: 'iDisplayLength', value: pageSize },
        { name: 'mDataProp_0', value: 0 },
        { name: 'bSortable_0', value: false },
        { name: 'mDataProp_1', value: 1 },
        { name: 'bSortable_1', value: false },
        { name: 'mDataProp_2', value: 'shopGoodsName' },
        { name: 'bSortable_2', value: false },
        { name: 'mDataProp_3', value: 'goodsNo' },
        { name: 'bSortable_3', value: false },
        { name: 'mDataProp_4', value: 'spGoodsNo' },
        { name: 'bSortable_4', value: false },
        { name: 'mDataProp_5', value: 'isvGoodsNo' },
        { name: 'bSortable_5', value: false },
        { name: 'mDataProp_6', value: 'shopGoodsNo' },
        { name: 'bSortable_6', value: false },
        { name: 'mDataProp_7', value: 'barcode' },
        { name: 'bSortable_7', value: false },
        { name: 'mDataProp_8', value: 'shopName' },
        { name: 'bSortable_8', value: false },
        { name: 'mDataProp_9', value: 'createTime' },
        { name: 'bSortable_9', value: false },
        { name: 'mDataProp_10', value: 10 },
        { name: 'bSortable_10', value: false },
        { name: 'mDataProp_11', value: 'isCombination' },
        { name: 'bSortable_11', value: false },
        { name: 'mDataProp_12', value: 'status' },
        { name: 'bSortable_12', value: false },
        { name: 'mDataProp_13', value: 13 },
        { name: 'bSortable_13', value: false },
        { name: 'iSortCol_0', value: 9 },
        { name: 'sSortDir_0', value: 'desc' },
        { name: 'iSortingCols', value: 1 }
      ]

      // 从事业部信息中获取sellerId和sellerNo
      const deptInfo = getSelectedDepartment()
      if (!deptInfo) {
        throw new Error('未选择事业部，无法获取CMG编号')
      }

      // 构建查询参数
      const data = qs.stringify({
        csrfToken: csrfToken,
        ids: '',
        shopId: '',
        sellerId: deptInfo.sellerId || '',
        deptId: deptInfo.id || '',
        sellerNo: deptInfo.sellerNo || '',
        deptNo: deptInfo.deptNo || '',
        shopNo: '',
        spSource: '',
        shopGoodsName: '',
        isCombination: '',
        barcode: '',
        jdDeliver: '',
        sellerGoodsSigns: skuString,
        spGoodsNos: '',
        goodsNos: '',
        isvGoodsNos: '',
        status: '1', // 查询启用状态的商品
        originSend: '',
        aoData: JSON.stringify(aoDataObj)
      })

      const response = await fetchApi(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Origin: BASE_URL,
          Referer: `${BASE_URL}/goToMainIframe.do`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: data
      })

      // 处理响应
      if (response && response.aaData) {
        // 首次获取总记录数
        if (totalRecords === null) {
          totalRecords = response.iTotalRecords || 0
          console.log(`查询到总共有${totalRecords}个商品`)
        }

        // 解析本页数据，转换为所需格式
        const pageCMGItems = response.aaData
          .filter(item => item.goodsNo) // 只保留有CMG编号的商品
          .map(item => ({
            poNo: "undefined",
            goodsNo: item.goodsNo,    // CMG编号
            goodsName: item.shopGoodsName, // 商品名称
            applyInstoreQty: applyInstoreQty || 1000, // 默认库存数量，根据需要可以调整
            customRecord: "",
            sellerRecord: "",
            goodsPrice: "0",
            barCodeType: 2,
            sellerGoodsSign: item.isvGoodsNo, // SKU编号
            sidCheckout: 0,
            outPackNo: "",
            goodsUom: ""
          }))

        // 合并到总结果中
        allCMGItems = [...allCMGItems, ...pageCMGItems]

        console.log(`当前已获取${allCMGItems.length}/${totalRecords}个CMG编号`)

        // 判断是否还有更多数据
        currentStart += response.aaData.length
        hasMoreData = currentStart < totalRecords

        // 如果没有更多数据或已获取所有记录，退出循环
        if (!hasMoreData || allCMGItems.length >= totalRecords) {
          break
        }

        // 添加短暂延迟避免频繁请求
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      } else {
        // 如果响应异常，退出循环
        console.warn('查询CMG编号响应异常:', response)
        hasMoreData = false
      }
    }

    console.log(`CMG编号查询完成，共获取${allCMGItems.length}个CMG编号`)

    // 直接返回格式化后的数组，不再包装在对象中
    return allCMGItems
  } catch (error) {
    console.error('查询CMG编号失败:', error)
    return [] // 发生错误时返回空数组
  }
}

/**
 * 清空库存分配
 * @param {Array} skuList - SKU列表
 * @param {Object} shopInfo - 店铺信息
 * @returns {Promise<Object>} 处理结果
 */
export async function clearStockAllocation(skuList, shopInfo) {
  if (!skuList || skuList.length === 0) {
    return { success: false, message: '没有提供SKU列表' }
  }

  if (!shopInfo || !shopInfo.shopNo) {
    return { success: false, message: '没有提供店铺信息' }
  }

  // 检查是否是整店操作
  const isWholeStore = skuList.length === 1 && skuList[0] === 'WHOLE_STORE'

  console.log(`开始清空库存分配, 店铺: ${shopInfo.shopName}, ${isWholeStore ? '整店操作' : `SKU数量: ${skuList.length}`}`)
  const url = `${BASE_URL}/inventory/clearStockAllocation.do`
  const csrfToken = await getCsrfToken()

  try {
    // 构建请求数据
    const data = qs.stringify({
      csrfToken: csrfToken,
      shopNo: shopInfo.shopNo,
      // 如果是整店操作，不传skus参数
      ...(isWholeStore ? {} : { skus: skuList.join(',') }),
      // 整店操作时，设置allSku参数为1
      ...(isWholeStore ? { allSku: 1 } : {})
    })

    // 发送请求
    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: BASE_URL,
        Referer: `${BASE_URL}/inventory/inventoryManagement.do`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: data
    })

    if (response && response.success) {
      return {
        success: true,
        message: isWholeStore ? `成功清空店铺 ${shopInfo.shopName} 的所有SKU库存分配` : `成功清空${skuList.length}个SKU的库存分配`
      }
    } else {
      const errorMsg = response && response.message ? response.message : '未知错误'
      return {
        success: false,
        message: `清空库存分配失败: ${errorMsg}`
      }
    }
  } catch (error) {
    console.error('清空库存分配失败:', error)
    return {
      success: false,
      message: `清空库存分配时发生错误: ${error.message || '未知错误'}`
    }
  }
}

/**
 * 获取整店商品列表（CSG编号）
 * @param {Object} shopInfo - 店铺信息
 * @returns {Promise<Array>} 商品CSG列表
 */
export async function getShopGoodsList(shopInfo) {
  console.log('getShopGoodsList被调用，传入的shopInfo:', shopInfo);
  
  if (!shopInfo || !shopInfo.shopNo) {
    console.error('获取整店商品列表失败: 店铺信息不完整 - 缺少shopNo', shopInfo);
    return { success: false, message: '店铺信息不完整 - 缺少shopNo', csgList: [] };
  }
  
  // 获取事业部信息，如果shopInfo中没有提供
  let deptInfo = null;
  if (!shopInfo.deptId || !shopInfo.sellerId) {
    const { getSelectedDepartment } = require('../utils/storageHelper');
    deptInfo = getSelectedDepartment();
    console.log('从localStorage获取事业部信息:', deptInfo);
  }

  console.log('开始获取整店商品列表, 店铺:', shopInfo.shopName);
  const url = `${BASE_URL}/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`;
  const csrfToken = await getCsrfToken();

  try {
    // 初始化结果数组和分页参数
    let allCsgItems = [];
    let currentStart = 0;
    let totalRecords = null;
    let hasMoreData = true;
    const pageSize = 100; // 每页获取100条记录

    // 循环获取所有页的数据
    while (hasMoreData) {
      console.log(`获取整店商品列表, 当前起始位置: ${currentStart}, 每页数量: ${pageSize}`);

      // 准备请求参数，确保与curl命令中的参数一致
      const requestParams = {
        csrfToken: csrfToken,
        ids: '',
        shopId: shopInfo.id || '', // 使用id作为shopId
        sellerId: shopInfo.sellerId || (deptInfo ? deptInfo.sellerId : ''),
        deptId: shopInfo.deptId || (deptInfo ? deptInfo.id : ''),
        sellerNo: shopInfo.sellerNo || (deptInfo ? deptInfo.sellerNo : ''),
        deptNo: shopInfo.deptNo || (deptInfo ? deptInfo.deptNo : ''),
        shopNo: shopInfo.shopNo,
        spSource: '',
        shopGoodsName: '',
        isCombination: '',
        barcode: '',
        jdDeliver: '1', // 京配商品
        sellerGoodsSigns: '',
        spGoodsNos: '',
        goodsNos: '',
        isvGoodsNos: '',
        status: '1', // 启用状态
        originSend: '',
        aoData: JSON.stringify([
          { name: 'sEcho', value: 5 },
          { name: 'iColumns', value: 14 },
          { name: 'sColumns', value: ',,,,,,,,,,,,,' },
          { name: 'iDisplayStart', value: currentStart },
          { name: 'iDisplayLength', value: pageSize },
          { name: 'mDataProp_0', value: 0 },
          { name: 'bSortable_0', value: false },
          { name: 'mDataProp_1', value: 1 },
          { name: 'bSortable_1', value: false },
          { name: 'mDataProp_2', value: 'shopGoodsName' },
          { name: 'bSortable_2', value: false },
          { name: 'mDataProp_3', value: 'goodsNo' },
          { name: 'bSortable_3', value: false },
          { name: 'mDataProp_4', value: 'spGoodsNo' },
          { name: 'bSortable_4', value: false },
          { name: 'mDataProp_5', value: 'isvGoodsNo' },
          { name: 'bSortable_5', value: false },
          { name: 'mDataProp_6', value: 'shopGoodsNo' },
          { name: 'bSortable_6', value: false },
          { name: 'mDataProp_7', value: 'barcode' },
          { name: 'bSortable_7', value: false },
          { name: 'mDataProp_8', value: 'shopName' },
          { name: 'bSortable_8', value: false },
          { name: 'mDataProp_9', value: 'createTime' },
          { name: 'bSortable_9', value: false },
          { name: 'mDataProp_10', value: 10 },
          { name: 'bSortable_10', value: false },
          { name: 'mDataProp_11', value: 'isCombination' },
          { name: 'bSortable_11', value: false },
          { name: 'mDataProp_12', value: 'status' },
          { name: 'bSortable_12', value: false },
          { name: 'mDataProp_13', value: 13 },
          { name: 'bSortable_13', value: false },
          { name: 'iSortCol_0', value: 9 },
          { name: 'sSortDir_0', value: 'desc' },
          { name: 'iSortingCols', value: 1 }
        ])
      };
      
      console.log('发送请求参数:', requestParams);

      // 构建请求数据
      const data = qs.stringify(requestParams);

      // 发送请求
      const response = await fetchApi(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': BASE_URL,
          'Referer': `${BASE_URL}/goToMainIframe.do`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: data
      });

      console.log('获取整店商品列表响应:', response);

      // 处理响应
      if (response && response.aaData) {
        // 首次获取总记录数
        if (totalRecords === null) {
          totalRecords = response.iTotalRecords || 0;
          console.log(`查询到总共有${totalRecords}个商品`);
        }

        // 解析本页数据，提取CSG编号
        const pageCsgItems = response.aaData
          .filter(item => item.shopGoodsNo) // 只保留有CSG编号的商品
          .map(item => item.shopGoodsNo);

        // 合并到总结果中
        allCsgItems = [...allCsgItems, ...pageCsgItems];

        console.log(`当前已获取${allCsgItems.length}/${totalRecords}个CSG编号`);

        // 判断是否还有更多数据
        currentStart += response.aaData.length;
        hasMoreData = currentStart < totalRecords;

        // 如果没有更多数据或已获取所有记录，退出循环
        if (!hasMoreData || allCsgItems.length >= totalRecords) {
          break;
        }

        // 添加短暂延迟避免频繁请求
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } else {
        // 如果响应异常，退出循环
        console.warn('查询CSG编号响应异常:', response);
        hasMoreData = false;
      }
    }

    console.log(`整店商品CSG编号查询完成，共获取${allCsgItems.length}个CSG编号`);

    return {
      success: true,
      message: `成功获取${allCsgItems.length}个CSG编号`,
      csgList: allCsgItems
    };
  } catch (error) {
    console.error('获取整店商品列表失败:', error);
    return {
      success: false,
      message: `获取整店商品列表失败: ${error.message || '未知错误'}`,
      csgList: []
    };
  }
}

/**
 * 取消京配打标
 * @param {Array} skuList - SKU列表
 * @param {Object} shopInfo - 店铺信息
 * @returns {Promise<Object>} 处理结果
 */
export async function cancelJdDeliveryTag(skuList, shopInfo) {
  if (!skuList || skuList.length === 0) {
    return { success: false, message: '没有提供SKU列表' }
  }

  if (!shopInfo || !shopInfo.shopNo) {
    return { success: false, message: '没有提供店铺信息' }
  }

  // 检查是否是整店操作
  const isWholeStore = skuList.length === 1 && skuList[0] === 'WHOLE_STORE'

  console.log(`开始取消京配打标, 店铺: ${shopInfo.shopName}, ${isWholeStore ? '整店操作' : `SKU数量: ${skuList.length}`}`)
  const url = `${BASE_URL}/jdDelivery/cancelJdDeliveryTag.do`
  const csrfToken = await getCsrfToken()

  try {
    // 构建请求数据
    const data = qs.stringify({
      csrfToken: csrfToken,
      shopNo: shopInfo.shopNo,
      // 如果是整店操作，不传skus参数
      ...(isWholeStore ? {} : { skus: skuList.join(',') }),
      // 整店操作时，设置allSku参数为1
      ...(isWholeStore ? { allSku: 1 } : {})
    })

    // 发送请求
    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: BASE_URL,
        Referer: `${BASE_URL}/jdDelivery/jdDeliveryManagement.do`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: data
    })

    if (response && response.success) {
      return {
        success: true,
        message: isWholeStore ? `成功取消店铺 ${shopInfo.shopName} 的所有SKU京配打标` : `成功取消${skuList.length}个SKU的京配打标`
      }
    } else {
      const errorMsg = response && response.message ? response.message : '未知错误'
      return {
        success: false,
        message: `取消京配打标失败: ${errorMsg}`
      }
    }
  } catch (error) {
    console.error('取消京配打标失败:', error)
    return {
      success: false,
      message: `取消京配打标时发生错误: ${error.message || '未知错误'}`
    }
  }
}

/**
 * 根据店铺名称获取完整的店铺信息
 * @param {string} shopName - 店铺名称
 * @returns {Promise<Object>} 店铺信息
 */
export async function getShopInfoByName(shopName) {
  if (!shopName) {
    console.error('获取店铺信息失败: 未提供店铺名称')
    return { success: false, message: '未提供店铺名称', shopInfo: null }
  }

  console.log('开始根据店铺名称获取店铺信息:', shopName)
  const url = `${BASE_URL}/shop/queryShopList.do?rand=${Math.random()}`
  const csrfToken = await getCsrfToken()

  try {
    // 构建请求数据
    const data = qs.stringify({
      csrfToken: csrfToken,
      shopNo: '',
      deptId: '',
      type: '',
      spSource: '',
      bizType: '',
      isvShopNo: '',
      sourceChannel: '',
      status: '1', // 启用状态
      iDisplayStart: '0',
      iDisplayLength: '100', // 获取更多店铺
      remark: '',
      shopName: shopName, // 使用店铺名称查询
      jdDeliverStatus: '',
      originSend: '',
      aoData: JSON.stringify([
        { name: 'sEcho', value: 1 },
        { name: 'iColumns', value: 11 },
        { name: 'sColumns', value: ',,,,,,,,,,' },
        { name: 'iDisplayStart', value: 0 },
        { name: 'iDisplayLength', value: 100 },
        { name: 'mDataProp_0', value: 0 },
        { name: 'bSortable_0', value: false },
        { name: 'mDataProp_1', value: 1 },
        { name: 'bSortable_1', value: false },
        { name: 'mDataProp_2', value: 'shopNo' },
        { name: 'bSortable_2', value: true },
        { name: 'mDataProp_3', value: 'shopName' },
        { name: 'bSortable_3', value: true },
        { name: 'mDataProp_4', value: 'spShopNo' },
        { name: 'bSortable_4', value: true },
        { name: 'mDataProp_5', value: 'statusName' },
        { name: 'bSortable_5', value: true },
        { name: 'mDataProp_6', value: 'bizTypeName' },
        { name: 'bSortable_6', value: true },
        { name: 'mDataProp_7', value: 'typeName' },
        { name: 'bSortable_7', value: true },
        { name: 'mDataProp_8', value: 'spSourceName' },
        { name: 'bSortable_8', value: true },
        { name: 'mDataProp_9', value: 'deptName' },
        { name: 'bSortable_9', value: true },
        { name: 'mDataProp_10', value: 10 },
        { name: 'bSortable_10', value: false },
        { name: 'iSortCol_0', value: 2 },
        { name: 'sSortDir_0', value: 'desc' },
        { name: 'iSortingCols', value: 1 }
      ])
    })

    // 发送请求
    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: data
    })

    console.log('店铺查询响应:', response)

    // 处理响应
    if (response && response.aaData && response.aaData.length > 0) {
      // 找到匹配的店铺
      const matchedShop = response.aaData.find(shop => shop.shopName === shopName) || response.aaData[0]
      
      console.log('找到店铺信息:', matchedShop)
      
      return {
        success: true,
        message: '成功获取店铺信息',
        shopInfo: matchedShop
      }
    } else {
      console.error('未找到匹配的店铺:', shopName)
      return {
        success: false,
        message: `未找到店铺: ${shopName}`,
        shopInfo: null
      }
    }
  } catch (error) {
    console.error('获取店铺信息失败:', error)
    return {
      success: false,
      message: `获取店铺信息失败: ${error.message || '未知错误'}`,
      shopInfo: null
    }
  }
}

