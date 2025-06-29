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
    return response.aaData.map((item) => item.shopGoodsNo).filter(Boolean)
  }
  return []
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
    return { success: true, csgList: allCsgs }
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
