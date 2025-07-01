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
 * 上传 启用库存商品分配  的文件  --- 启用库存商品分配    库存清零也是这个接口
 * @param {Buffer} fileBuffer - 包含Excel数据的文件Buffer
 * @param {object} sessionData - 完整的会话对象
 * @returns {Promise<object>} - 操作结果
 */
export async function uploadInventoryAllocationFile(fileBuffer, sessionData) {
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
    console.log(`[jdApiService] 尝试上传库存分配文件... (第 ${attempt} 次)`)
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
        console.log(
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

  console.log('fetchShopGoodsPage---1  data_obj===>', data_obj)

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
 * @param {string[]} skus - 要查询的SKU列表
 * @param {object} sessionData - 包含认证和店铺信息的完整会话对象
 * @returns {Promise<Array<object>>} - 返回停用商品对象的列表，每个对象包含shopGoodsNo等信息
 */
export async function getDisabledProducts(skus, sessionData) {
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

    while (hasMore) {
      try {

        const url = `/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`
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
          status: 1, // 使用传入的状态
          originSend: '',
          aoData: JSON.stringify(aoDataArray)
        }

        console.log('fetchShopGoodsPage---1  data_obj===>', data_obj)

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

        console.log('getCsgBySkus---1  response===>', response)

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

/**
 * 获取指定店铺中所有已开启京配搜索的商品
 * 该函数通过分页处理获取所有商品
 * @param {object} sessionData - 完整的会话对象,包含店铺和部门信息
 * @returns {Promise<string[]>} 返回已开启商品的CSG编号(shopGoodsNo)列表
 */
export async function getJpEnabledCsgsForStore(sessionData) {
  const { cookieString, csrfToken } = getAuthInfo(sessionData)
  const { store, department, departmentInfo } = sessionData

  const allCsgs = []
  let page = 0
  const pageSize = 100 // Set a larger page size
  let hasMore = true
  let sEcho = 1

  while (hasMore) {
    const iDisplayStart = page * pageSize
    const aoData = [
      { name: 'sEcho', value: 3 },
      { name: 'iColumns', value: 14 },
      { name: 'sColumns', value: ',,,,,,,,,,,,,' },
      { name: 'iDisplayStart', value: iDisplayStart },
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
    const form = new URLSearchParams()
    form.append('csrfToken', csrfToken)
    form.append('ids', '')
    form.append('shopId', department.id)
    form.append('sellerId', departmentInfo.sellerId)
    form.append('deptId', departmentInfo.id)
    form.append('sellerNo', departmentInfo.sellerNo)
    form.append('deptNo', departmentInfo.deptNo)
    form.append('shopNo', store.shopNo)
    form.append('jdDeliver', '1') // 1 for JP search enabled
    form.append('status', '1')
    form.append('aoData', JSON.stringify(aoData))
    //  https://o.jdl.com/shopGoods/queryShopGoodsList.do?rand=0.19411635434208996
    try {
      const data = await requestJdApi({
        method: 'POST',
        url: `https://o.jdl.com/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Cookie: cookieString,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: 'https://o.jdl.com/goToMainIframe.do',
          Origin: 'https://o.jdl.com'
        },
        data: form.toString(),
        responseType: 'json'
      })

      // console.log(data)


      if (data && data.aaData && data.aaData.length > 0) {
        const csgs = data.aaData.map((item) => item.shopGoodsNo)
        allCsgs.push(...csgs)
        // Check if there are more items to fetch
        hasMore = data.iTotalRecords > allCsgs.length
        page++
      } else {
        hasMore = false
      }
    } catch (error) {
      console.error('Error fetching JP enabled CSGs:', error)
      // Stop pagination on error
      hasMore = false
    }
  }

  return allCsgs
}
