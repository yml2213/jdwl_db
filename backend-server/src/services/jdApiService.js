import axios from 'axios'
import FormData from 'form-data'
import qs from 'qs'

// 创建一个专门用于报表API请求的axios实例
const reportApiAxios = axios.create({
  baseURL: 'https://reportp.jclps.com',
  timeout: 120000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/x-www-form-urlencoded',
    'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
    origin: 'https://reportp.jclps.com',
    priority: 'u=1, i',
    referer: 'https://reportp.jclps.com/reportIndex?rand=' + Math.random(),
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
  }
})

// 创建一个专门用于京东API请求的axios实例
const jdApiAxios = axios.create({
  baseURL: 'https://o.jdl.com',
  timeout: 120000, // 120秒超时
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    'X-Requested-With': 'XMLHttpRequest'
  }
})

/**
 * 从会话数据中提取必要的认证信息
 * @param {object} session - 完整的会话对象
 * @returns {object} 包含 cookieString 和 csrfToken
 */
function getAuthInfo(session) {
  // 京东相关的完整上下文信息（包括cookies）都保存在 session.jdCookies 中
  if (!session || !session.jdCookies) {
    throw new Error('会话数据无效或缺少京东Cookies (session.jdCookies)')
  }

  const { jdCookies: cookies } = session // 从会话中获取 jdCookies 并重命名为 cookies
  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
    throw new Error('在会话上下文中没有找到有效的Cookies数组')
  }

  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const csrfToken = cookies.find((c) => c.name === 'csrfToken')?.value
  if (!csrfToken) {
    // 某些API可能不需要csrfToken，这里只做警告
    console.warn('在会话的Cookies中未找到csrfToken')
  }

  return { cookieString, csrfToken, sessionData: session }
}

/**
 * 封装的京东API请求函数
 * @param {object} config - Axios请求配置
 * @returns
 */
export async function requestJdApi(config) {
  try {
    const response = await jdApiAxios(config)
    // 检查京东返回的特定错误格式
    if (response.data && response.data.code && response.data.code !== 200) {
      throw new Error(response.data.msg || '京东API返回错误')
    }
    // 特殊处理字符串响应，例如"频繁操作"，直接返回响应体，让调用者处理
    if (typeof response.data === 'string' && response.data.includes('频繁操作')) {
      return { result: false, msg: response.data }
    }
    return response.data
  } catch (error) {
    console.error('京东API请求失败:', error.message)
    // 重新抛出错误，以便上层可以捕获
    throw error
  }
}

/**
 * 封装的报表API请求函数
 * @param {object} config - Axios请求配置
 * @returns {Promise<object>}
 */
export async function requestReportApi(config) {
  try {
    const response = await reportApiAxios(config)
    if (response.data && response.data.resultCode !== 1) {
      const errorMessage =
        (response.data.resultData && response.data.resultData[0]) || response.data.resultMessage
      throw new Error(errorMessage || '报表API返回未知错误')
    }
    return response.data
  } catch (error) {
    console.error('报表API请求失败:', error.message)
    throw error
  }
}

/**
 * 上传店铺商品文件到京东   --- 导入店铺商品
 * @param {Buffer} fileBuffer - 包含Excel数据的文件Buffer
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function uploadStoreProducts(fileBuffer, sessionData) {
  const { cookieString, csrfToken, sessionData: authData } = getAuthInfo(sessionData)
  const { store, department } = authData

  const url = `/shopGoods/importPopSG.do?spShopNo=${store.spShopNo}&_r=${Math.random()}`
  const formData = new FormData()
  formData.append('csrfToken', csrfToken)
  formData.append('shopGoodsPopGoodsListFile', fileBuffer, 'PopGoodsImportTemplate.xls')

  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: `https://o.jdl.com/shopGoods/showImportPopSG.do?spShopNo=${store.spShopNo}&deptId=${department.deptId}`
  }

  console.log(`[jdApiService] 尝试上传店铺商品文件...`)
  const response = await requestJdApi({
    method: 'POST',
    url,
    data: formData,
    headers
  })
  // 检查是否是JSON字符串
  if (typeof response === 'string') {
    try {
      const parsed = JSON.parse(response)
      console.log('[jdApiService] 文件上传完成，响应:', parsed)
      return parsed
    } catch (e) {
      // 不是JSON字符串，可能是"频繁操作"等纯文本
      console.log('[jdApiService] 文件上传完成，纯文本响应:', response)
      if (response.includes('频繁操作')) {
        return { result: false, msg: response }
      }
      return { result: true, msg: response } // 或者根据需要构造成其他格式
    }
  }

  console.log('[jdApiService] 文件上传完成，响应:', response)
  return response
}

/**
 * 上传 启用库存商品分配  的文件  --- 启用库存商品分配    库存清零也是这个接口
 * @param {Buffer} fileBuffer - 包含Excel数据的文件Buffer
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function uploadInventoryAllocationFile(fileBuffer, sessionData, updateFn = () => { }) {
  const { cookieString } = getAuthInfo(sessionData)

  const url = '/goodsStockConfig/importGoodsStockConfig.do'
  const formData = new FormData()
  formData.append('goodsStockConfigExcelFile', fileBuffer, 'goodsStockConfigTemplate.xlsx')

  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: 'https://o.jdl.com/goodsStockConfig/showImport.do'
  }

  const MAX_RETRIES = 3
  const RETRY_DELAY = 5 * 60 * 1000 + 5000 // 5 minutes and 5 seconds

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    updateFn(`[jdApiService] 尝试上传库存分配文件... (第 ${attempt} 次)`)
    // requestJdApi 已经包含了 try-catch，会抛出网络或HTTP层面的错误
    const result = await requestJdApi({
      method: 'POST',
      url: url,
      data: formData,
      headers: headers
    })

    // 检查业务层面的频率限制错误
    if (result && result.resultMessage && result.resultMessage.includes('频繁操作')) {
      if (attempt < MAX_RETRIES) {
        updateFn(
          `[jdApiService] 触发频率限制，将在约5分钟后重试... (响应: ${result.resultMessage})`
        )
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
        continue // 继续下一次尝试
      } else {
        // 最后一次尝试仍然失败，则抛出错误
        throw new Error(`达到最大重试次数后仍然失败: ${result.resultMessage}`)
      }
    }
    // 如果没有频率限制错误，则直接返回结果
    return result
  }
}

/**
 * 上传用于京配打标生效的文件  启用京配打标生效  京配打标失效  取消京配打标也是这个接口
 * @param {Buffer} fileBuffer - 包含Excel数据的文件Buffer
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function uploadJpSearchFile(fileBuffer, sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)

  const url = `/shopGoods/importUpdateShopGoodsJpSearch.do?_r=${Math.random()}`
  const formData = new FormData()
  formData.append(
    'updateShopGoodsJpSearchListFile',
    fileBuffer,
    'updateShopGoodsJpSearchImportTemplate.xls'
  )
  formData.append('csrfToken', csrfToken)

  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: `https://o.jdl.com/goToMainIframe.do`
  }
  const MAX_RETRIES = 3
  const RETRY_DELAY = 5 * 60 * 1000 + 5000 // 5 minutes and 5 seconds

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[jdApiService] 尝试上传京配打标文件... (第 ${attempt} 次)`)
    const result = await requestJdApi({
      method: 'POST',
      url,
      data: formData,
      headers
    })

    console.log('上传京配打标文件 请求结果 result 111===>', result)

    // 检查业务层面的频率限制错误
    if (result && result.resultMessage && result.resultMessage.includes('频繁操作')) {
      if (attempt < MAX_RETRIES) {
        console.log(
          `[jdApiService] 触发频率限制，将在约5分钟后重试... (响应: ${result.resultMessage})`
        )
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
        continue // 继续下一次尝试
      } else {
        throw new Error(`达到最大重试次数后仍然失败: ${result.resultMessage}`)
      }
    }
    return result
  }
}

/**
 * 统一的店铺商品分页查询函数
 * @param {string[]} skuBatch - 一批SKU
 * @param {string} status - 商品状态: '1' for enabled, '2' for disabled, '' for all.
 * @param {object} sessionData - 包含认证和店铺信息的完整会话对象
 * @param {number} start - 分页起始位置
 * @param {number} length - 分页大小`
 * @returns {Promise<{aaData: object[], iTotalRecords: number}>}
 */
async function fetchShopGoodsPage(skuBatch, status, sessionData, start, length) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  // 注意：此处从 context 中获取 department 和 store，确保与调用者（如 getProductDetails）一致
  const { department, store } = sessionData

  const url = `/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`

  const aoDataArray = [
    { name: 'sEcho', value: 22 },
    { name: 'iColumns', value: 14 },
    { name: 'sColumns', value: ',,,,,,,,,,,,,' },
    { name: 'iDisplayStart', value: start },
    { name: 'iDisplayLength', value: length },
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

  const data_obj = {
    csrfToken: csrfToken,
    ids: '',
    shopId: store?.shopNo?.replace(/^CSP00/, '') || '',
    sellerId: department?.sellerId || '',
    deptId: department?.id || '',
    sellerNo: department?.sellerNo || '',
    deptNo: department?.deptNo || '',
    shopNo: store?.shopNo || '',
    spSource: '',
    shopGoodsName: '',
    isCombination: '',
    barcode: '',
    jdDeliver: '',
    createTimeRange: '',
    sellerGoodsSigns: skuBatch.join(','),
    spGoodsNos: '',
    goodsNos: '',
    isvGoodsNos: '',
    status: status, // 使用传入的状态
    originSend: '',
    aoData: JSON.stringify(aoDataArray)
  }


  const data = qs.stringify(data_obj)

  console.log(
    `[jdApiService] 查询商品, Status: '${status}', SKUs: ${skuBatch.length}, Start: ${start}, Length: ${length}`
  )

  return await requestJdApi({
    method: 'POST',
    url,
    data,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Origin: 'https://o.jdl.com',
      Referer: 'https://o.jdl.com/goToMainIframe.do',
      Cookie: cookieString
    }
  })
}

/**
 * 查询指定SKU列表中所有已停用的商品
 * 7.2 优化  新方案查询  getProductData.task.js 查询
 * @param {string[]} skus - 要查询的SKU列表
 * @param {object} sessionData - 包含认证和店铺信息的完整会话对象
 * @returns {Promise<Array<object>>} - 返回停用商品对象的列表，每个对象包含shopGoodsNo等信息
 */
export async function getDisabledProducts(skus, sessionData) {
  getAuthInfo(sessionData)
  const { departmentInfo, operationId } = sessionData

  if (!skus || !Array.isArray(skus) || skus.length === 0) {
    throw new Error('请求负载中必须包含一个非空的SKU数组。--1')
  }
  if (!departmentInfo || !departmentInfo.sellerId) {
    throw new Error('会话上下文中缺少有效的事业部信息 (departmentInfo)-1。')
  }
  if (!operationId) {
    throw new Error('会话上下文中缺少有效的查询方案ID--1 (operationId)。')
  }

  // "deptNo": "CBU22010232593780",
  const deptId = departmentInfo.deptNo.split('CBU')[1]

  const allProductData = await queryProductDataBySkus(skus, deptId, operationId, sessionData)

  console.log(`任务完成，共获取到 ${allProductData.length} 条商品数据。`)

  // 过滤出状态为"禁用"的商品
  const disabledProducts = allProductData.filter(product => product.status === '禁用')

  console.log(`[jdApiService] 总共获取了 ${disabledProducts.length} 个已停用的商品。`)
  return disabledProducts
}

/**
 * 查询指定SKU列表中所有已停用的商品
 * 7.2 优化  新方案查询  getProductData.task.js 查询
 * @param {string[]} skus - 要查询的SKU列表
 * @param {object} sessionData - 包含认证和店铺信息的完整会话对象
 * @returns {Promise<Array<object>>} - 返回停用商品对象的列表，每个对象包含shopGoodsNo等信息
 */
export async function getDisabledProducts_bak(skus, sessionData) {
  getAuthInfo(sessionData)
  const allDisabledProducts = []
  const PAGE_SIZE = 100
  const SKU_BATCH_SIZE = 1000

  const fetchForBatch = async (skuBatch) => {
    let hasMore = true
    let start = 0
    let totalRecords = null
    const disabledProductsInBatch = []

    while (hasMore) {
      try {
        const response = await fetchShopGoodsPage(skuBatch, '2', sessionData, start, PAGE_SIZE)
        if (response && response.aaData) {
          if (totalRecords === null) {
            totalRecords = response.iTotalRecords || 0
          }
          disabledProductsInBatch.push(...response.aaData)
          const receivedCount = start + response.aaData.length
          if (receivedCount >= totalRecords || response.aaData.length === 0) {
            hasMore = false
          } else {
            start = receivedCount
          }
        } else {
          hasMore = false
        }
      } catch (error) {
        console.error(`[jdApiService] 获取已停用商品页面时出错: ${error.message}`)
        hasMore = false
      }
    }
    return disabledProductsInBatch
  }

  // 改为串行处理批次
  for (let i = 0; i < skus.length; i += SKU_BATCH_SIZE) {
    const skuBatch = skus.slice(i, i + SKU_BATCH_SIZE)
    console.log(`[jdApiService] 正在处理已停用商品查询批次, ${i / SKU_BATCH_SIZE + 1}`)
    const batchResult = await fetchForBatch(skuBatch)
    allDisabledProducts.push(...batchResult)
  }

  console.log(`[jdApiService] 总共获取了 ${allDisabledProducts.length} 个已停用的商品。`)
  return allDisabledProducts
}

/**
 * 上传状态更新文件  启用店铺商品
 * @param {Buffer} fileBuffer - 包含Excel数据的文件Buffer
 * @param {object} sessionData - 包含认证信息的完整会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function uploadStatusUpdateFile(fileBuffer, sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)

  const url = `/shopGoods/importUpdateShopGoodsStatus.do?_r=${Math.random()}`
  const formData = new FormData()
  formData.append('csrfToken', csrfToken)
  formData.append(
    'updateShopGoodsStatusListFile',
    fileBuffer,
    'updateShopGoodsStatusImportTemplate.xls'
  )

  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: 'https://o.jdl.com/goToMainIframe.do',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
  }

  console.log('[jdApiService] 尝试上传商品状态更新文件 (importUpdateShopGoodsStatus.do)...')
  const responseText = await requestJdApi({
    method: 'POST',
    url,
    data: formData,
    headers
  })
  console.log('[jdApiService] 文件上传成功，响应:', responseText)
  return { success: true, message: `导入完成: ${responseText}` }
}

/**
 * 上传物流属性文件
 * @param {Buffer} fileBuffer - 包含Excel数据的文件Buffer
 * @param {object} sessionData - 包含认证和店铺信息的完整会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function uploadLogisticsAttributesFile(fileBuffer, sessionData) {
  const { cookieString } = getAuthInfo(sessionData)

  const url = `/goods/doImportGoodsLogistics.do?_r=${Math.random()}`
  const formData = new FormData()
  formData.append('importAttributeFile', fileBuffer, 'logistics-attributes.xls')

  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: 'https://o.jdl.com/goToMainIframe.do',
    Origin: 'https://o.jdl.com',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
  }

  console.log('[jdApiService] 尝试上传物流属性文件...')
  const responseData = await requestJdApi({
    method: 'POST',
    url,
    data: formData,
    headers
  })
  console.log('[jdApiService] 物流属性文件上传成功，响应:', responseData)
  return responseData
}

/**
 * 上传用于添加库存的文件  https://o.jdl.com/poMain/batchImportPo.do
 * @param {Buffer} fileBuffer - 包含Excel数据的文件Buffer
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function uploadAddInventoryFile(fileBuffer, sessionData) {
  const { cookieString } = getAuthInfo(sessionData)

  const url = `/poMain/batchImportPo.do`
  const formData = new FormData()
  formData.append('batchImportPoFiles', fileBuffer, '采购单导入模板.xls')

  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: `https://o.jdl.com/goToMainIframe.do`
  }

  return requestJdApi({
    method: 'POST',
    url,
    data: formData,
    headers
  })
}

/**
 * 根据SKU列表获取完整的商品详情列表 (处理分页)
 * @param {string[]} skus - 全部SKU列表
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<{success: boolean, products: object[], message?: string}>}
 */
export async function getCsgBySkus(skus, sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  // 注意：此处从 context 中获取 department 和 store，确保与调用者（如 getProductDetails）一致
  const { department, store } = sessionData

  const SKU_BATCH_SIZE = 500
  const PAGE_SIZE = 100
  const allProducts = []

  const fetchForBatch = async (skuBatch) => {
    let hasMore = true
    let start = 0
    let totalRecords = null
    const productsInBatch = []

    const info = {}
    info.shopId = store?.shopNo?.replace(/^CSP00/, '')
    info.sellerId = department?.sellerId || ''
    info.deptId = department?.id || ''
    info.sellerNo = department?.sellerNo || ''
    info.deptNo = department?.deptNo || ''
    info.shopNo = store?.shopNo || ''


    // console.log('getCsgBySkus---1  info===>', info)

    while (hasMore) {
      try {

        // https://o.jdl.com/shopGoods/queryShopGoodsList.do?rand=0.3821882614100426
        const url = `https://o.jdl.com/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`
        const aoDataArray = [
          { name: 'sEcho', value: 3 },
          { name: 'iColumns', value: 14 },
          { name: 'sColumns', value: ',,,,,,,,,,,,,' },
          { name: 'iDisplayStart', value: start },
          { name: 'iDisplayLength', value: PAGE_SIZE },
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

        const data_obj = {
          csrfToken: csrfToken,
          ids: '',
          shopId: info.shopId,
          sellerId: info.sellerId,
          deptId: info.deptId,
          sellerNo: info.sellerNo,
          deptNo: info.deptNo,
          shopNo: info.shopNo,
          spSource: '',
          shopGoodsName: '',
          isCombination: '',
          barcode: '',
          jdDeliver: '',
          createTimeRange: '',
          sellerGoodsSigns: skuBatch.join(','),
          spGoodsNos: '',
          goodsNos: '',
          isvGoodsNos: '',
          status: 1,
          originSend: '',
          aoData: JSON.stringify(aoDataArray)
        }


        const data = qs.stringify(data_obj)

        console.log(
          `[jdApiService] 查询商品, Status: '1', SKUs: ${skuBatch.length}, Start: ${start}, Length: ${PAGE_SIZE}`
        )

        const response = await requestJdApi({
          method: 'POST',
          url,
          data,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'application/json, text/javascript, */*; q=0.01',
            Origin: 'https://o.jdl.com',
            Referer: 'https://o.jdl.com/goToMainIframe.do',
            Cookie: cookieString
          }
        })

        // console.log('getCsgBySkus---1  response===>', response)

        if (response && response.aaData) {
          if (totalRecords === null) {
            totalRecords = response.iTotalRecords || 0
          }
          productsInBatch.push(...response.aaData)

          const receivedCount = start + response.aaData.length
          if (receivedCount >= totalRecords || response.aaData.length === 0) {
            hasMore = false
          } else {
            start = receivedCount
          }
        } else {
          hasMore = false
        }
      } catch (error) {
        console.error(`[jdApiService] 获取商品详情页面时出错: ${error.message}`)
        hasMore = false // Stop this batch on error
      }
    }
    return productsInBatch
  }

  // 改为串行处理，避免并发问题
  for (let i = 0; i < skus.length; i += SKU_BATCH_SIZE) {
    const skuBatch = skus.slice(i, i + SKU_BATCH_SIZE)
    console.log(`[jdApiService] 正在处理商品详情查询批次 ${i / SKU_BATCH_SIZE + 1}`)
    const batchResult = await fetchForBatch(skuBatch)
    allProducts.push(...batchResult)
  }

  console.log(`[jdApiService] 总共获取了 ${allProducts.length} 个启用的商品详情。`)
  return { success: true, products: allProducts }
}

/**
 * 根据SKU列表获取完整的商品详情列表 (处理分页)
 * @param {string[]} skus - 全部SKU列表
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<{success: boolean, products: object[], message?: string}>}
 */
export async function fetchProductDetails(skus, sessionData) {
  const SKU_BATCH_SIZE = 500
  const PAGE_SIZE = 100
  const allProducts = []

  const fetchForBatch = async (skuBatch) => {
    let hasMore = true
    let start = 0
    let totalRecords = null
    const productsInBatch = []

    while (hasMore) {
      try {
        const response = await fetchShopGoodsPage(skuBatch, '1', sessionData, start, PAGE_SIZE)

        console.log('fetchProductDetails---1  response===>', response)

        if (response && response.aaData) {
          if (totalRecords === null) {
            totalRecords = response.iTotalRecords || 0
          }
          productsInBatch.push(...response.aaData)

          const receivedCount = start + response.aaData.length
          if (receivedCount >= totalRecords || response.aaData.length === 0) {
            hasMore = false
          } else {
            start = receivedCount
          }
        } else {
          hasMore = false
        }
      } catch (error) {
        console.error(`[jdApiService] 获取商品详情页面时出错: ${error.message}`)
        hasMore = false // Stop this batch on error
      }
    }
    return productsInBatch
  }

  // 改为串行处理，避免并发问题
  for (let i = 0; i < skus.length; i += SKU_BATCH_SIZE) {
    const skuBatch = skus.slice(i, i + SKU_BATCH_SIZE)
    console.log(`[jdApiService] 正在处理商品详情查询批次 ${i / SKU_BATCH_SIZE + 1}`)
    const batchResult = await fetchForBatch(skuBatch)
    allProducts.push(...batchResult)
  }

  console.log(`[jdApiService] 总共获取了 ${allProducts.length} 个启用的商品详情。`)
  return { success: true, products: allProducts }
}

/**
 * 通过API直接创建采购单
 * @param {Array<Object>} products - 包含完整商品信息的对象列表
 * @param {Object} context - 包含仓库、供应商、库存数量等信息的上下文
 * @param {Object} sessionData - 会话数据
 * @returns {Promise<Object>}
 */
export async function createPurchaseOrder(products, context, sessionData) {
  const { warehouse, vendor, department } = context
  const { cookieString } = getAuthInfo(sessionData)

  // console.log('createPurchaseOrder---1  context===>', context)
  // console.log('createPurchaseOrder---2  products===>', products)

  const applyInstoreQty = context.inventoryAmount || 1000

  const goodsArray = products.map((p) => ({
    poNo: undefined,
    goodsNo: p.goodsNo, // CMG
    goodsName: p.shopGoodsName,
    applyInstoreQty: applyInstoreQty,
    customRecord: '',
    sellerRecord: '',
    goodsPrice: '0',
    barCodeType: 2,
    sellerGoodsSign: p.sellerGoodsSign, // SKU
    sidCheckout: 0,
    outPackNo: '',
    goodsUom: ''
  }))


  const formData = new FormData()
  formData.append('id', '')
  formData.append('poNo', '')
  formData.append('goods', JSON.stringify(goodsArray))
  formData.append('deptId', department.id)
  formData.append('deptName', department.name)
  formData.append('supplierId', vendor.id.replace('CMS', ''))  //  id: 'CMS4418047117122',
  formData.append('warehouseId', warehouse.id)
  formData.append('billOfLading', '')
  formData.append('qualityCheckFlag', '')
  formData.append('sidChange', '0')
  formData.append('poType', '1')
  formData.append('pickUpFlag', '0')
  formData.append('outPoNo', '')
  formData.append('crossDockingFlag', '0')
  formData.append('crossDockingSoNos', '')
  formData.append('isPorterTeam', '0')
  formData.append('orderType', 'CGRK')
  formData.append('poReturnMode', '1')
  formData.append('importFiles', '')


  const url = `/poMain/downPoMain.do`
  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: 'https://o.jdl.com/goToMainIframe.do',
    Origin: 'https://o.jdl.com'
  }

  return requestJdApi({
    method: 'POST',
    url,
    data: formData,
    headers
  })
}

/**
 * 上传商品简称数据到服务器
 * @param {Buffer} fileBuffer - Excel文件的Buffer
 * @param {string} fileName - 文件名
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<Object>} 上传结果
 */
export async function uploadProductNames(fileBuffer, fileName, sessionData) {
  const { cookieString } = getAuthInfo(sessionData)

  const formData = new FormData()
  formData.append('importFile', fileBuffer, {
    filename: fileName,
    contentType: 'application/vnd.ms-excel'
  })

  const url = `/goods/doUpdateCustomImportGoods.do?_r=${Math.random()}`
  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: 'https://o.jdl.com/goToMainIframe.do',
    Origin: 'https://o.jdl.com',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
  }

  console.log('[jdApiService] 尝试上传商品简称文件...')
  const responseData = await requestJdApi({
    method: 'POST',
    url,
    data: formData,
    headers,
    timeout: 240000 // 4分钟超时
  })

  console.log('[jdApiService] 商品简称文件上传成功，响应:', responseData)

  // 1. 检查是否正在处理中 (最高优先级)
  if (
    responseData &&
    responseData.resultMsg &&
    responseData.resultMsg.includes('无需重复执行,请耐心等待')
  ) {
    return {
      success: false,
      status: 'pending',
      message: '一个导入任务正在处理中，请5分钟后再试。',
      data: responseData
    }
  }

  // 2. 检查明确的成功响应
  if (responseData && responseData.resultCode === '1') {
    const totalCount = parseInt(responseData.totalNum) || 0
    const successCount = parseInt(responseData.successNum) || 0
    const failCount = parseInt(responseData.failNum) || 0
    return {
      success: successCount > 0 || totalCount === 0,
      message:
        responseData.resultMsg ||
        `导入完成: 共${totalCount}条, 成功${successCount}条, 失败${failCount}条`,
      data: responseData
    }
  }

  // 3. 处理HTML响应（作为一种可能的成功形式）
  if (typeof responseData === 'string' && responseData.includes('导入结果')) {
    return {
      success: true, // 假设只要看到导入结果页面就是成功提交
      message: '文件已上传，请在页面查看具体导入结果。'
    }
  }

  // 4. 其他所有情况都视为失败
  return {
    success: false,
    message: responseData ? responseData.resultMsg || '导入商品简称失败' : '导入失败，无响应数据',
    data: responseData
  }
}

/**
 * Step 1: Query CLS number by order number.
 */
export async function queryClsNoByOrderNo(orderNo, year, sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  const { departmentInfo } = sessionData

  const aoData = [
    { "name": "sEcho", "value": 4 },
    { "name": "iColumns", "value": 19 },
    { "name": "sColumns", "value": ",,,,,,,,,,,,,,,,,," },
    { "name": "iDisplayStart", "value": 0 },
    { "name": "iDisplayLength", "value": 10 },
    { "name": "mDataProp_0", "value": 0 },
    { "name": "bSortable_0", "value": false },
    { "name": "mDataProp_1", "value": 1 },
    { "name": "bSortable_1", "value": false },
    { "name": "mDataProp_2", "value": "soNo" },
    { "name": "bSortable_2", "value": true },
    { "name": "mDataProp_3", "value": "spSoNo" },
    { "name": "bSortable_3", "value": true },
    { "name": "mDataProp_4", "value": "parentId" },
    { "name": "bSortable_4", "value": true },
    { "name": "mDataProp_5", "value": "soType" },
    { "name": "bSortable_5", "value": true },
    { "name": "mDataProp_6", "value": "soStatus" },
    { "name": "bSortable_6", "value": true },
    { "name": "mDataProp_7", "value": "consignee" },
    { "name": "bSortable_7", "value": true },
    { "name": "mDataProp_8", "value": "consigneeAddr" },
    { "name": "bSortable_8", "value": true },
    { "name": "mDataProp_9", "value": "shopName" },
    { "name": "bSortable_9", "value": true },
    { "name": "mDataProp_10", "value": "shipperName" },
    { "name": "bSortable_10", "value": true },
    { "name": "mDataProp_11", "value": "wayBill" },
    { "name": "bSortable_11", "value": true },
    { "name": "mDataProp_12", "value": "spCreateTime" },
    { "name": "bSortable_12", "value": true },
    { "name": "mDataProp_13", "value": "createTime" },
    { "name": "bSortable_13", "value": true },
    { "name": "mDataProp_14", "value": "stationName" },
    { "name": "bSortable_14", "value": true },
    { "name": "mDataProp_15", "value": "chronergyStr" },
    { "name": "bSortable_15", "value": true },
    { "name": "mDataProp_16", "value": "expectDeliveryDate" },
    { "name": "bSortable_16", "value": true },
    { "name": "mDataProp_17", "value": "orderAmount" },
    { "name": "bSortable_17", "value": true },
    { "name": "mDataProp_18", "value": "soMark" },
    { "name": "bSortable_18", "value": true },
    { "name": "iSortCol_0", "value": 11 },
    { "name": "sSortDir_0", "value": "desc" },
    { "name": "iSortingCols", "value": 1 }
  ]

  const data = {
    csrfToken,
    sellerId: departmentInfo.sellerId,
    spSoNo: orderNo,
    soYear: year,
    aoData: JSON.stringify(aoData)
  }

  const response = await requestJdApi({
    method: 'POST',
    url: `/so/querySoMainList.do?rand=${Math.random()}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: cookieString,
      Referer: 'https://o.jdl.com/goToMainIframe.do'
    },
    data: qs.stringify(data)
  })

  if (response && response.aaData && response.aaData.length > 0) {
    return response.aaData[0].soNo
  }
  return null
}

/**
 * Step 2: Query order details by CLS number.
 * https://o.jdl.com/rtw/getOrder.do?rand=0.25937037832834453
 */
export async function queryOrderDetailsByClsNo(clsNo, sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  const data = {
    csrfToken,
    orderId: clsNo
  }
  return await requestJdApi({
    method: 'POST',
    url: `/rtw/getOrder.do?rand=${Math.random()}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: cookieString,
      Referer: 'https://o.jdl.com/goToMainIframe.do'
    },
    data: qs.stringify(data)
  })
}

/**
 * Step 3: Submit the return order.
 */
export async function submitReturnOrder(payload, sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  return await requestJdApi({
    method: 'POST',
    url: '/rtw/addRtwOrder.do',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Cookie: cookieString,
      Referer: 'https://o.jdl.com/goToMainIframe.do',
      'X-CSRF-TOKEN': csrfToken
    },
    data: payload
  })
}



/**
 * 通过直接调用API清空整个店铺的库存分配   库存分配清零 --整店库存清零
 * @param {string} shopId - 店铺ID
 * @param {string} deptId - 部门ID
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function clearStockForWholeStore(shopId, deptId, sessionData, updateFn = () => { }) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  const params = {
    csrfToken,
    shopId,
    deptId
  }
  updateFn('准备执行整店库存清零操作...')
  console.log('清空整个店铺的库存分配 ===>', params)
  return await requestJdApi({
    method: 'GET',
    url: '/goodsStockConfig/resetGoodsStockRatio.do',
    params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: cookieString,
      Referer: 'https://o.jdl.com/goToMainIframe.do'
    }
  })
}


/**
 * 启用商品主数据 https://o.jdl.com/goods/batchOnGoods.do
 * @param {string[]} cmgs_enableStoreProducts - 商品CMG数组  --- 去掉 CMG 开头 4422471628225 4422471628225
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function enableStoreProducts(cmgs_enableStoreProducts, sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  const params = {
    csrfToken,
    ids: JSON.stringify(cmgs_enableStoreProducts)
  }
  console.log('启用商品主数据 ===>', params)
  return await requestJdApi({
    method: 'POST',
    url: '/goods/batchOnGoods.do',
    data: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: cookieString,
      Referer: 'https://o.jdl.com/goToMainIframe.do'
    }
  })
}

/**
 * 获取指定店铺中所有已开启京配搜索的商品
 * 7.5 使用新的 reportp API，不再分页查询
 * @param {object} sessionData - 完整的会话对象,包含店铺和部门信息
 * @returns {Promise<string[]>} 返回已开启商品的CSG编号(shopGoodsNo)列表
 */
export async function getJpEnabledCsgsForStore(context, sessionData) {
  const { cookieString } = getAuthInfo(sessionData)
  const { store, department } = context
  const { operationId } = sessionData


  // console.log('getJpEnabledCsgsForStore -- context:', context)
  // console.log('getJpEnabledCsgsForStore -- sessionData:', sessionData)

  // 验证必要的数据
  if (!store || !department || !department.id || !store.shopName) {
    const errorMsg = '获取京配开启商品列表失败：缺少店铺或事业部信息。'
    console.error(`[getJpEnabledCsgsForStore] ${errorMsg}`, {
      store,
      department
    })
    throw new Error(errorMsg)
  }
  if (!operationId) {
    throw new Error('会话上下文中缺少有效的查询方案ID (operationId)。')
  }

  const dataRequest = {
    source: 2,
    menuId: 'gs',
    querySchemaID: operationId, // 查询京配开启商品的特定 Schema ID
    condition: {
      shopName: store.shopName,
      jdDeliver: '1', // '1' 代表京配搜索已开启
      deptId: String(department.id) // 事业部ID
    }
  }

  const aaData = [
    { name: 'iDisplayStart', value: 0 },
    { name: 'iDisplayLength', value: 100000 } // 设置一个足够大的值以获取所有结果
  ]

  const form = new URLSearchParams()
  form.append('dataRequest', JSON.stringify(dataRequest))
  form.append('aaData', JSON.stringify(aaData))

  try {
    const data = await requestReportApi({
      method: 'POST',
      url: '/report/scheme/queryByPage.do',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: cookieString,
        Referer: 'https://reportp.jclps.com/reportIndex',
        Origin: 'https://reportp.jclps.com'
      },
      data: form.toString(),
      responseType: 'json'
    })

    if (data && data.resultCode === 1 && data.resultData && data.resultData.aaData) {
      if (data.resultData.aaData.length > 0) {
        return data.resultData.aaData.map((item) => item.shopGoodsNo)
      }
      return [] // 没有找到商品
    } else {
      const errorMessage = data?.resultMessage || '查询京配开启商品列表时，API返回错误。'
      console.error('[getJpEnabledCsgsForStore] Failed to fetch JP enabled CSGs:', data)
      throw new Error(errorMessage)
    }
  } catch (error) {
    console.error('[getJpEnabledCsgsForStore] Error fetching JP enabled CSGs:', error)
    // 将原始错误再次抛出，以便上层调用者可以捕获
    throw error
  }
}

/**
 * 启动会话操作，创建一个新的报表方案并返回其ID
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果，包含 operationId
 */
export async function startSessionOperation(sessionData) {
  console.log('[jdApiService] 正在启动会话操作，创建报表方案...')
  const { cookieString } = getAuthInfo(sessionData)
  const schemeName = `jdwl-temp-scheme-${Date.now()}`

  // 1. 新建查询方案
  const addSchemeData = {
    source: 2,
    menuId: 'gs',
    schemeName: schemeName,
    templateCode: 1025,
    isShare: 0,
    templateName: '销售订单查询',
    templateContent: JSON.stringify({
      reportSchemeColumnList: [
        { dataField: 'shopGoodsNo', seq: 0 },
        { dataField: 'shopGoodsName', seq: 1 },
        { dataField: 'status', seq: 2 },
        { dataField: 'jdDeliver', seq: 3 },
        { dataField: 'goodsNo', seq: 4 },
        { dataField: 'sellerGoodsSign', seq: 5 }
      ],
      reportSchemeConditionList: [
        { dataField: 'shopGoodsNo', seq: 0 },
        { dataField: 'shopGoodsName', seq: 1 },
        { dataField: 'status', seq: 5 },
        { dataField: 'shopName', seq: 6 },
        { dataField: 'jdDeliver', seq: 7 },
        { dataField: 'sellerGoodsSign', seq: 13 },
        { dataField: 'deptId', seq: 16 }
      ]
    }),
    templateVContent: JSON.stringify({
      valueMap: {
        goodsNo: null,
        goodsName: null,
        sellerGoodsSign: null,
        enableFlag: null,
        source: null,
        deptId: null,
        sellerId: null,
        maintainStatus: null,
        CreateTime: null,
        isvSku: null,
        spSku: null,
        mnemonic: null,
        safePeriod: null,
        humidity: null,
        quality: null,
        isSerialNumber: null,
        isLogisticsCollect: null,
        oripack: null,
        adventGoodsDelivery: null,
        expireGoodsDelivery: null,
        airMark: null,
        crowdSourcingFlag: null
      }
    })
  }

  await requestReportApi({
    method: 'POST',
    url: '/report/scheme/addScheme.do',
    data: qs.stringify(addSchemeData),
    headers: { Cookie: cookieString }
  })

  // 2. 获取新建的方案ID
  const getSchemesData = { source: 2, menuId: 'gs' }
  const schemesResult = await requestReportApi({
    method: 'POST',
    url: '/report/scheme/schemes.do',
    data: qs.stringify(getSchemesData),
    headers: { Cookie: cookieString }
  })

  if (!schemesResult.resultData || !Array.isArray(schemesResult.resultData)) {
    throw new Error('获取方案列表失败或响应格式不正确。')
  }

  const newScheme = schemesResult.resultData.find((scheme) => scheme.schemeName === schemeName)

  if (!newScheme || !newScheme.id) {
    throw new Error(`无法在列表中找到刚创建的方案: ${schemeName}`)
  }

  const operationId = newScheme.id
  console.log(`[jdApiService] 报表方案已创建，ID: ${operationId}`)

  // 3. 删除id
  await endSessionOperation(operationId, sessionData)
  return { success: true, operationId }
}

/**
 * 结束会话操作，删除之前创建的报表方案
 * @param {string} operationId - 要结束的操作ID (即 schemeId)
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function endSessionOperation(operationId, sessionData) {
  console.log(`[jdApiService] 正在结束会话操作，删除报表方案 ID: ${operationId}...`)
  const { cookieString } = getAuthInfo(sessionData)

  const deleteData = { schemeId: operationId }

  await requestReportApi({
    method: 'POST',
    url: '/report/scheme/schemeDelete.do',
    data: qs.stringify(deleteData),
    headers: { Cookie: cookieString }
  })

  console.log(`[jdApiService] 报表方案 ${operationId} 已成功删除。`)
  return { success: true, message: `方案 ${operationId} 已删除` }
}

/**
 * 根据SKU列表查询商品详细数据  通过报表API查询 -- 方案查询
 * @param {string[]} skus - 商品的SKU数组 (sellerGoodsSign)
 * @param {string} deptId - 事业部ID
 * @param {string} schemeId - 查询方案ID (即 operationId)
 * @param {object} sessionData - 包含认证信息的会话对象
 * @returns {Promise<Array>} - 包含商品数据的数组
 */
export async function queryProductDataBySkus(skus, deptId, schemeId, sessionData) {
  console.log(`[jdApiService] 正在查询 ${skus.length} 个SKU的商品数据...`)
  const { cookieString } = getAuthInfo(sessionData)

  const dataRequest = {
    source: 2,
    menuId: 'gs',
    querySchemaID: schemeId,
    condition: {
      sellerGoodsSign: skus.join(','), // 将SKU数组合并为逗号分隔的字符串
      deptId: deptId
    }
  }

  // console.log('queryProductDataBySkus -- dataRequest ===>', dataRequest)

  const aaData = [{ name: 'iDisplayStart', value: 0 }, { name: 'iDisplayLength', value: 100000 }]

  const response = await requestReportApi({
    method: 'POST',
    url: '/report/scheme/queryByPage.do',
    data: qs.stringify({
      dataRequest: JSON.stringify(dataRequest),
      aaData: JSON.stringify(aaData)
    }),
    headers: { Cookie: cookieString }
  })

  if (response.resultData && response.resultData.aaData) {
    console.log(
      `[jdApiService] 成功获取SKU数据，共 ${response.resultData.aaData.length} 条记录。`
    )
    return response.resultData.aaData
  }

  console.log(`[jdApiService] 未能获取到商品数据。`)
  return []
}

/**
 * 获取供应商列表
 * @param {object} session - 完整的会话对象
 * @returns {Promise<Array>} - 供应商列表
 */
export async function getVendorList(session) {
  const { cookieString, csrfToken } = getAuthInfo(session)

  const url = `/supplier/querySupplierList.do?rand=${Math.random()}`

  // 根据您提供的成功的cURL命令，构建正确的请求体
  const data = qs.stringify({
    csrfToken: csrfToken,
    sellerId: '',
    deptId: '',
    status: '',
    supplierNo: '',
    supplierName: '',
    aoData: JSON.stringify([
      { name: 'sEcho', value: 2 },
      { name: 'iColumns', value: 6 },
      { name: 'sColumns', value: ',,,,,' },
      { name: 'iDisplayStart', value: 0 },
      { name: 'iDisplayLength', value: 100 }, // 获取更多供应商
      { name: 'mDataProp_0', value: 0 },
      { name: 'bSortable_0', value: false },
      { name: 'mDataProp_1', value: 1 },
      { name: 'bSortable_1', value: false },
      { name: 'mDataProp_2', value: 'supplierNo' },
      { name: 'bSortable_2', value: true },
      { name: 'mDataProp_3', value: 'supplierName' },
      { name: 'bSortable_3', value: true },
      { name: 'mDataProp_4', value: 'deptName' },
      { name: 'bSortable_4', value: true },
      { name: 'mDataProp_5', value: 'statusStr' },
      { name: 'bSortable_5', value: true },
      { name: 'iSortCol_0', value: 2 },
      { name: 'sSortDir_0', value: 'desc' },
      { name: 'iSortingCols', value: 1 }
    ])
  })

  const response = await requestJdApi({
    method: 'POST',
    url,
    data,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: cookieString,
      Referer: 'https://o.jdl.com/goToMainIframe.do',
      Origin: 'https://o.jdl.com'
    }
  })

  // 根据您提供的成功JSON，正确解析响应
  if (response && response.aaData && Array.isArray(response.aaData)) {
    console.log(`成功获取到 ${response.aaData.length} 个供应商。`)
    return response.aaData.map((item) => ({
      id: item.supplierNo, // 使用 supplierNo 作为唯一ID
      name: item.supplierName,
      supplierNo: item.supplierNo
    }))
  } else if (response && typeof response === 'string' && response.trim().startsWith('<')) {
    console.error('获取供应商列表失败：收到了HTML响应，可能登录已过期。')
    throw new Error('NotLogin')
  } else {
    console.warn('获取供应商列表返回数据格式不正确:', response)
    return []
  }
}

/**
 * 获取事业部列表
 * @param {object} session - 完整的会话对象
 * @returns {Promise<Array>} - 事业部列表
 */
export async function getDepartmentList(vendorName, session) {
  const { cookieString, csrfToken } = getAuthInfo(session)

  const url = `/dept/queryDeptList.do?rand=${Math.random()}`

  // 根据您提供的cURL命令，构建正确的请求体
  const data = qs.stringify({
    csrfToken: csrfToken,
    id: '',
    sellerId: '',
    status: '',
    aoData: JSON.stringify([
      { name: 'sEcho', value: 4 },
      { name: 'iColumns', value: 7 },
      { name: 'sColumns', value: ',,,,,,' },
      { name: 'iDisplayStart', value: 0 },
      { name: 'iDisplayLength', value: 100 }, // 获取更多
      { name: 'mDataProp_0', value: 0 },
      { name: 'bSortable_0', value: false },
      { name: 'mDataProp_1', value: 1 },
      { name: 'bSortable_1', value: false },
      { name: 'mDataProp_2', value: 'deptNo' },
      { name: 'bSortable_2', value: true },
      { name: 'mDataProp_3', value: 'deptName' },
      { name: 'bSortable_3', value: true },
      { name: 'mDataProp_4', value: 'sellerNo' },
      { name: 'bSortable_4', value: true },
      { name: 'mDataProp_5', value: 'sellerName' },
      { name: 'bSortable_5', value: true },
      { name: 'mDataProp_6', value: 'statusStr' },
      { name: 'bSortable_6', value: true },
      { name: 'iSortCol_0', value: 2 },
      { name: 'sSortDir_0', value: 'desc' },
      { name: 'iSortingCols', value: 1 }
    ])
  })

  const response = await requestJdApi({
    method: 'POST',
    url,
    data,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: cookieString,
      Referer: 'https://o.jdl.com/goToMainIframe.do', // 使用更通用的Referer
      Origin: 'https://o.jdl.com'
    }
  })
  if (response && response.aaData && Array.isArray(response.aaData)) {
    console.log(`成功获取到 ${response.aaData.length} 个事业部。`)
    return response.aaData.map((item) => ({
      id: item.deptId,
      name: item.deptName,
      deptNo: item.deptNo,
      sellerId: item.sellerId,
      sellerNo: item.sellerNo,
      sellerName: item.sellerName // 增加sellerName，方便前端筛选
    }))
  } else if (response && typeof response === 'string' && response.trim().startsWith('<')) {
    console.error('获取事业部列表失败：收到了HTML响应，可能登录已过期。')
    throw new Error('NotLogin')
  } else {
    console.warn('获取事业部列表返回数据格式不正确:', response)
    return []
  }
}

/**
 * 获取店铺列表 (后端实现)
 * @param {string} deptId - 事业部ID
 * @param {object} session - 完整的会话对象
 * @returns {Promise<Array>} 店铺列表数组
 */
export async function getShopList(deptId, session) {
  const { cookieString, csrfToken } = getAuthInfo(session);
  if (!deptId) {
    throw new Error('获取店铺列表需要提供事业部ID (deptId)');
  }

  const allShops = [];
  let currentStart = 0;
  const pageSize = 100;
  let hasMoreData = true;

  console.log(`[jdApiService] 开始获取店铺列表, 事业部ID: ${deptId}`);

  while (hasMoreData) {
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
      // 注意: 此接口的 aoData 格式比较特殊
      aoData: `${currentStart},${pageSize}`
    });

    try {
      const response = await requestJdApi({
        method: 'POST',
        url: `/shop/queryShopList.do?rand=${Math.random()}`,
        data,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Cookie: cookieString,
          Origin: 'https://o.jdl.com',
          Referer: 'https://o.jdl.com/goToMainIframe.do'
        }
      });

      if (response && response.aaData && Array.isArray(response.aaData)) {
        const pageShops = response.aaData.map(shop => ({
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
        }));

        allShops.push(...pageShops);

        const totalRecords = response.iTotalRecords || 0;
        currentStart += pageShops.length;

        if (currentStart >= totalRecords || pageShops.length === 0) {
          hasMoreData = false;
        }
      } else {
        console.warn('[jdApiService] 获取店铺列表响应格式不正确:', response);
        hasMoreData = false;
      }
    } catch (error) {
      console.error(`[jdApiService] 获取店铺列表分页时出错:`, error);
      throw error; // 重新抛出错误
    }
  }

  console.log(`[jdApiService] 店铺列表获取完成，共获取 ${allShops.length} 个店铺`);
  return allShops;
}

/**
 * 获取仓库列表 (后端实现, 带分页优化)
 * @param {string} sellerId - 供应商ID
 * @param {string} deptId - 事业部ID
 * @param {object} session - 完整的会话对象
 * @returns {Promise<Array>} 仓库列表数组
 */
export async function getWarehouseList(sellerId, deptId, session) {
  const { cookieString, csrfToken } = getAuthInfo(session);
  if (!sellerId || !deptId) {
    throw new Error('获取仓库列表需要提供供应商ID和事业部ID');
  }

  const allWarehouses = [];
  let currentStart = 0;
  const pageSize = 100;
  let hasMoreData = true;

  console.log(`[jdApiService] 开始获取仓库列表, 供应商ID: ${sellerId}, 事业部ID: ${deptId}`);

  // 原始的aoData模板
  const aoDataTemplate = [
    { "name": "sEcho", "value": 1 },
    { "name": "iColumns", "value": 5 },
    { "name": "sColumns", "value": ",,,,," },
    { "name": "iDisplayStart", "value": 0 },
    { "name": "iDisplayLength", "value": 10 },
    { "name": "mDataProp_0", "value": 0 },
    { "name": "bSortable_0", "value": false },
    { "name": "mDataProp_1", "value": "warehouseNo" },
    { "name": "bSortable_1", "value": true },
    { "name": "mDataProp_2", "value": "warehouseName" },
    { "name": "bSortable_2", "value": true },
    { "name": "mDataProp_3", "value": "warehouseAddress" },
    { "name": "bSortable_3", "value": true },
    { "name": "mDataProp_4", "value": "statusStr" },
    { "name": "bSortable_4", "value": true },
    { "name": "iSortCol_0", "value": 1 },
    { "name": "sSortDir_0", "value": "desc" },
    { "name": "iSortingCols", "value": 1 }
  ];

  while (hasMoreData) {
    // 动态修改aoData的分页参数
    const aoData = [...aoDataTemplate];
    aoData.find(item => item.name === 'iDisplayStart').value = currentStart;
    aoData.find(item => item.name === 'iDisplayLength').value = pageSize;

    const data = qs.stringify({
      csrfToken: csrfToken,
      sellerId: sellerId,
      deptId: deptId,
      status: '1', // 启用状态
      aoData: JSON.stringify(aoData)
    });

    try {
      const response = await requestJdApi({
        method: 'POST',
        url: `/warehouseOpen/queryWarehouseOpenList.do?rand=${Math.random()}`,
        data,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Cookie: cookieString,
          Origin: 'https://o.jdl.com',
          Referer: 'https://o.jdl.com/goToMainIframe.do'
        }
      });

      if (response && response.aaData && Array.isArray(response.aaData)) {
        const pageWarehouses = response.aaData.map(w => ({
          id: w.warehouseId,
          warehouseId: w.warehouseId,
          warehouseNo: w.warehouseNo,
          warehouseName: w.warehouseName,
          warehouseType: w.warehouseType,
          warehouseTypeStr: w.warehouseTypeStr,
          deptName: w.deptName,
          effectTime: w.effectTime,
          updateTime: w.updateTime
        }));

        allWarehouses.push(...pageWarehouses);

        const totalRecords = response.iTotalRecords || 0;
        currentStart += pageWarehouses.length;

        if (currentStart >= totalRecords || pageWarehouses.length === 0) {
          hasMoreData = false;
        }
      } else {
        console.warn('[jdApiService] 获取仓库列表响应格式不正确:', response);
        hasMoreData = false;
      }
    } catch (error) {
      console.error(`[jdApiService] 获取仓库列表分页时出错:`, error);
      throw error; // 重新抛出错误
    }
  }
  console.log(`[jdApiService] 仓库列表获取完成，共获取 ${allWarehouses.length} 个仓库`);
  return allWarehouses;
}
