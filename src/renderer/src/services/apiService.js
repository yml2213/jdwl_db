import { getRequestHeaders, getAllCookies } from '../utils/cookieHelper'
import qs from 'qs'
import * as XLSX from 'xlsx'
import { getSelectedVendor } from '../utils/storageHelper'

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
 * 批量处理SKU，例如入库打标
 * @param {Array<string>} skuList - SKU列表
 * @param {Object} storeInfo - 店铺信息
 * @returns {Promise<Object>} 处理结果
 */
export async function batchProcessSKUs(skuList, storeInfo) {
  if (!skuList || !skuList.length) {
    return { success: false, message: '未提供SKU列表' }
  }

  console.log(`开始批量处理${skuList.length}个SKU`)
  // 使用与原始请求完全相同的URL格式
  const spShopNo = storeInfo.spShopNo || storeInfo.shopNo || '18661988' // 默认值用于测试
  const url = `${BASE_URL}/shopGoods/importPopSG.do?spShopNo=${spShopNo}&_r=${Math.random()}&=`

  console.log('url', url)
  console.log('storeInfo', storeInfo)
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
    entries
  }
}
