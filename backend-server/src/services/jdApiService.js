import axios from 'axios'
import FormData from 'form-data'
import qs from 'qs'

// 创建一个专门用于京东API请求的axios实例
const jdApiAxios = axios.create({
  baseURL: 'https://o.jdl.com',
  timeout: 120000, // 120秒超时
  headers: {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    'X-Requested-With': 'XMLHttpRequest'
  }
})

/**
 * 从会话数据中提取必要的认证信息
 * @param {string} sessionId - 会话ID
 * @returns {object} 包含 cookieString 和 csrfToken
 */
function getAuthInfo(session) {
  if (!session || !session.cookies) {
    throw new Error('无效的会话数据或缺少cookies')
  }

  const { cookies } = session
  if (!cookies || cookies.length === 0) {
    throw new Error('会话中没有Cookies')
  }

  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const csrfToken = cookies.find((c) => c.name === 'csrfToken')?.value
  if (!csrfToken) {
    throw new Error('在加载的Cookies中未找到csrfToken')
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
    // 特殊处理字符串响应，例如"频繁操作"
    if (typeof response.data === 'string' && response.data.includes('频繁操作')) {
      throw new Error('API_RATE_LIMIT')
    }
    return response.data
  } catch (error) {
    console.error('京东API请求失败:', error.message)
    // 重新抛出错误，以便上层可以捕获
    throw error
  }
}

/**
 * 上传店铺商品文件到京东
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

  const MAX_RETRIES = 3
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[jdApiService] 尝试上传店铺商品文件... (第 ${attempt} 次)`)
      const responseText = await requestJdApi({
        method: 'POST',
        url,
        data: formData,
        headers
      })
      console.log('[jdApiService] 文件上传成功，响应:', responseText)
      return responseText
    } catch (error) {
      console.error(`[jdApiService] 上传失败 (尝试 ${attempt}):`, error.message)
      if (error.message === 'API_RATE_LIMIT' && attempt < MAX_RETRIES) {
        console.log('[jdApiService] 触发频率限制，将在65秒后重试...')
        await new Promise((resolve) => setTimeout(resolve, 65000))
      } else {
        throw new Error(`文件上传在达到最大重试次数后失败: ${error.message}`)
      }
    }
  }
}

/**
 * 上传 启用库存商品分配  的文件  --- 启用库存商品分配
 * @param {Buffer} fileBuffer - 包含Excel数据的文件Buffer
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function uploadInventoryAllocationFile(fileBuffer, sessionData) {
  const { cookieString } = getAuthInfo(sessionData)

  const url = '/goodsStockConfig/importGoodsStockConfig.do'
  const formData = new FormData()
  formData.append('goodsStockConfigExcelFile', fileBuffer, 'goodsStockConfigTemplate.xlsx')
  // formData.append('token', csrfToken)
  // formData.append('query.maxCount', 50000)

  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: 'https://o.jdl.com/goodsStockConfig/showImport.do'
  }

  return requestJdApi({
    method: 'POST',
    url: url,
    data: formData,
    headers: headers
  })
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

  return requestJdApi({
    method: 'POST',
    url,
    data: formData,
    headers
  })
}

/**
 * 从京东分页查询CSG编号
 * @param {string[]} skuBatch - 一批SKU编号
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<string[]>} - CSG编号列表
 */
async function fetchCSGPage(skuBatch, sessionData, start, length) {
  const { cookieString, sessionData: authData } = getAuthInfo(sessionData)
  const { vendor, department, store } = authData

  const params = {
    sEcho: 3, // 这个值似乎是固定的，或者可以递增
    iColumns: 13,
    sColumns: '',
    iDisplayStart: start,
    iDisplayLength: length,
    _: Date.now(),
    venderId: vendor.venderId,
    deptId: department.deptId,
    shopId: store.shopId,
    goodsNo: skuBatch.join(',') // 京东API接受逗号分隔的SKU列表
  }

  const url = '/shopGoods/queryPopSgForJp.do'
  console.log(
    `[jdApiService] 查询CSG，SKUs: ${skuBatch.length}, Start: ${start}, Length: ${length}`
  )
  const response = await requestJdApi({
    method: 'GET',
    url,
    params,
    headers: { Cookie: cookieString, Referer: 'https://o.jdl.com/shopGoods/queryPopSgForJp.do' }
  })

  if (response && response.aaData) {
    // 返回完整对象，而不仅仅是shopGoodsNo
    return response.aaData
  }
  return []
}

/**
 * 根据SKU列表获取完整的商品详情列表 (处理分页)
 * @param {string[]} skus - 全部SKU列表
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<{success: boolean, products: object[], message?: string}>}
 */
export async function fetchProductDetails(skus, sessionData) {
  const BATCH_SIZE = 50 // 根据旧代码经验，每次查询50个SKU
  const allProducts = []

  // 在循环外注入store和department信息，避免重复操作
  const enrichedSessionData = {
    ...sessionData,
    vendor: sessionData.vendor,
    department: sessionData.department,
    store: sessionData.store
  }

  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const skuBatch = skus.slice(i, i + BATCH_SIZE)
    try {
      console.log(`[jdApiService] 正在查询商品详情，批次 ${Math.floor(i / BATCH_SIZE) + 1}`)
      const productBatch = await fetchProductDetailsPage(
        skuBatch,
        enrichedSessionData,
        0,
        BATCH_SIZE
      )
      allProducts.push(...productBatch)
    } catch (error) {
      console.error(`[jdApiService] 处理批次查询时出错: ${error.message}`)
      // 选择性地决定是否因为一个批次的失败而终止整个流程
      // 这里我们选择继续，以尽可能多地获取数据
    }
  }

  if (allProducts.length > 0) {
    console.log(`[jdApiService] 总共获取了 ${allProducts.length} 个商品的详情。`)
    return { success: true, products: allProducts }
  } else {
    return { success: false, message: '未能从任何批次中获取到商品详情。' }
  }
}

/**
 * 根据SKU列表获取CSG列表 (处理分页)
 * @param {string[]} skus - 全部SKU列表
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<{success: boolean, csgList: string[], message?: string}>}
 */
export async function fetchCSGList(skus, sessionData) {
  const BATCH_SIZE = 50 // 根据旧代码经验，每次查询50个SKU
  const allCsgs = []

  // 在循环外注入store和department信息，避免重复操作
  const enrichedSessionData = {
    ...sessionData,
    vendor: sessionData.vendor,
    department: sessionData.department,
    store: sessionData.store
  }

  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const skuBatch = skus.slice(i, i + BATCH_SIZE)
    try {
      console.log(`[jdApiService] 正在处理批次 ${Math.floor(i / BATCH_SIZE) + 1}`)
      // 京东这个接口自身也支持分页返回，但我们按SKU批次调用，每次都从头获取
      const csgBatch = await fetchCSGPage(skuBatch, enrichedSessionData, 0, 200) // 假设单批SKU的结果不会超过200条
      allCsgs.push(...csgBatch)
    } catch (error) {
      console.error(`[jdApiService] 处理批次查询时出错: ${error.message}`)
      // 选择性地决定是否因为一个批次的失败而终止整个流程
      // 这里我们选择继续，以尽可能多地获取数据
    }
  }

  if (allCsgs.length > 0) {
    console.log(`[jdApiService] 总共获取了 ${allCsgs.length} 个CSG。`)
    return { success: true, csgList: allCsgs.map((p) => p.shopGoodsNo).filter(Boolean) }
  } else {
    return { success: false, message: '未能从任何批次中获取到CSG编号。' }
  }
}

/**
 * 分页查询商品状态并返回停用的商品列表
 * @param {string[]} skuBatch - 一批SKU
 * @param {object} sessionData - 包含认证和店铺信息的完整会话对象
 * @param {number} start - 分页起始位置
 * @param {number} length - 分页大小
 * @returns {Promise<{aaData: object[], iTotalRecords: number}>}
 */
async function fetchProductStatusPage(skuBatch, sessionData, start, length) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  const { departmentInfo, store } = sessionData

  const url = `/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`

  // 构建aoData对象，更加清晰和可维护
  const aoDataArray = [
    { name: 'sEcho', value: 22 },
    { name: 'iColumns', value: 14 },
    { name: 'sColumns', value: ',,,,,,,,,,,,,' },
    { name: 'iDisplayStart', value: 0 },
    { name: 'iDisplayLength', value: 100 },
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
    shopId: store?.shopNo?.replace(/^CSP00/, '') || '', // 从CSP0020000352400格式中提取店铺ID
    sellerId: departmentInfo?.sellerId || '',
    deptId: departmentInfo?.id || '',
    sellerNo: departmentInfo?.sellerNo || '',
    deptNo: departmentInfo?.deptNo || '',
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
    status: '2', // 2代表"停用"状态
    originSend: '',
    aoData: JSON.stringify(aoDataArray)
  }

  const data = qs.stringify(data_obj)

  console.log(
    `[jdApiService] 查询停用商品, SKUs: ${skuBatch.length}, Start: ${start}, Length: ${length}`
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
 * @param {string[]} skus - 要查询的SKU列表
 * @param {object} sessionData - 包含认证和店铺信息的完整会话对象
 * @returns {Promise<Array<object>>} - 返回停用商品对象的列表，每个对象包含shopGoodsNo等信息
 */
export async function getDisabledProducts(skus, sessionData) {
  getAuthInfo(sessionData)
  const allDisabledProducts = []
  const PAGE_SIZE = 100 // 与前端保持一致

  // 京东接口限制单次查询的SKU数量，所以也需要分批
  const SKU_BATCH_SIZE = 50
  for (let i = 0; i < skus.length; i += SKU_BATCH_SIZE) {
    const skuBatch = skus.slice(i, i + SKU_BATCH_SIZE)
    let hasMore = true
    let start = 0
    let totalRecords = null // 用于跟踪总记录数
    console.log(`[jdApiService] 正在处理SKU批次: ${i / SKU_BATCH_SIZE + 1}`)

    while (hasMore) {
      const response = await fetchProductStatusPage(skuBatch, sessionData, start, PAGE_SIZE)

      if (response && response.aaData) {
        if (totalRecords === null) {
          totalRecords = response.iTotalRecords || 0
        }

        allDisabledProducts.push(...response.aaData)

        const receivedCount = start + response.aaData.length
        if (receivedCount >= totalRecords || response.aaData.length === 0) {
          hasMore = false
        } else {
          start = receivedCount
        }
      } else {
        hasMore = false
      }
    }
  }
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
 * @returns {Promise<object[]>} - 包含商品对象的数组
 */
async function fetchProductDetailsPage(skuBatch, sessionData, start, length) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  const { departmentInfo } = sessionData


  const url = `/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`

  // 构建 aoData 对象
  const aoDataArray = [
    { name: 'sEcho', value: 3 },
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

  // 构建 POST 请求的数据
  const data_obj = {
    csrfToken: csrfToken,
    ids: '',
    shopId: '',
    sellerId: departmentInfo?.sellerId || '',
    deptId: '',
    sellerNo: departmentInfo?.sellerNo || '',
    deptNo: '',
    shopNo: '',
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
    status: '1', // 代表"启用"状态
    originSend: '',
    aoData: JSON.stringify(aoDataArray)
  }
  const data = qs.stringify(data_obj)

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    Origin: 'https://o.jdl.com',
    Referer: 'https://o.jdl.com/goToMainIframe.do',
    Cookie: cookieString
  }

  const response = await requestJdApi({
    method: 'POST',
    url,
    data,
    headers
  })


  if (response && response.aaData) {
    return response.aaData
  }
  return []
}

/**
 * 通过API直接创建采购单
 * @param {Array<Object>} products - 包含完整商品信息的对象列表
 * @param {Object} context - 包含仓库、供应商、库存数量等信息的上下文
 * @param {Object} sessionData - 会话数据
 * @returns {Promise<Object>}
 */
export async function createPurchaseOrder(products, context, sessionData) {
  const { warehouse, vendor, department, options } = context
  const { cookieString } = getAuthInfo(sessionData)

  const goodsArray = products.map((p) => ({
    poNo: undefined,
    goodsNo: p.goodsNo, // CMG
    goodsName: p.shopGoodsName,
    applyInstoreQty: options.inventoryAmount || 1000,
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
    headers
  })

  console.log('[jdApiService] 商品简称文件上传成功，响应:', responseData)

  // 后端返回的是HTML，需要自行解析判断
  // 这里我们简化处理，认为只要请求不抛异常就是成功，具体结果需要从 message 中看
  if (responseData && typeof responseData === 'object' && responseData.resultCode === '1') {
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
  } else if (typeof responseData === 'string' && responseData.includes('导入结果')) {
    // 处理HTML响应
    return {
      success: true, // 假设只要看到导入结果页面就是成功提交
      message: '文件已上传，请在页面查看具体导入结果。'
    }
  }
  else {
    return {
      success: false,
      message: responseData ? responseData.resultMsg || '导入商品简称失败' : '导入失败，无响应数据',
      data: responseData
    }
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
export async function clearStockForWholeStore(shopId, deptId, sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  const params = {
    csrfToken,
    shopId,
    deptId
  }
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
