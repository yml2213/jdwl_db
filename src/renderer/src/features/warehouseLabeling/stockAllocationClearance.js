import { getSelectedDepartment, getSelectedShop } from '../../utils/storageHelper'
import * as XLSX from 'xlsx'
import { getAllCookies } from '../../utils/cookieHelper'

// 内部API调用和数据处理函数保持不变，但会经过简化
// 注意：这些内部函数现在接收 a `helpers` 对象用于日志记录，并且在出错时会直接抛出异常

async function _callResetGoodsStockRatioAPI(shopInfo) {
  const selectedDepartment = getSelectedDepartment()
  if (!selectedDepartment) {
    throw new Error('未选择事业部')
  }

  const allCookies = await getAllCookies(selectedDepartment.value)
  if (!allCookies) {
    throw new Error('获取Cookies失败')
  }

  // 修复：将 shopInfo 转换为纯对象，避免IPC克隆错误
  const plainShopInfo = { ...shopInfo }

  console.log('调用 reset-goods-stock-ratio, shopInfo:', plainShopInfo, 'dept:', selectedDepartment)

  const response = await window.electron.ipcRenderer.invoke('reset-goods-stock-ratio', {
    cookies: allCookies,
    shopInfo: plainShopInfo,
    departmentInfo: selectedDepartment
  })

  if (!response.success) {
    throw new Error(response.message || '整店清零API调用失败')
  }
  return response
}

/**
 * 为库存清零创建Excel数据Buffer
 * @param {string[]} skuList SKU列表
 * @param {object} department 事业部信息
 * @returns {Buffer} Excel文件的Buffer
 */
function _createClearanceExcelFileAsBuffer(skuList, department) {
  const shop = getSelectedShop()
  if (!shop) throw new Error('无法获取店铺信息')

  const headers = [
    '事业部编码',
    '主商品编码',
    '商家商品标识',
    '店铺编码',
    '库存管理方式',
    '库存比例/数值',
    '仓库编号'
  ]
  const introRow = [
    'CBU开头的事业部编码',
    'CMG开头的商品编码，主商品编码与商家商品标识至少填写一个',
    '商家自定义的商品编码，主商品编码与商家商品标识至少填写一个',
    'CSP开头的店铺编码',
    '纯数值\n1-独占\n2-共享\n3-固定值',
    '库存方式为独占或共享时，此处填写大于等于0的正整数，所有独占（或共享）比例之和不能大于100\n库存方式为固定值时，填写仓库方式',
    '可空，只有在库存管理方式为3-固定值时，该仓库编码，若为空则按全部仓执行'
  ]
  const rows = skuList.map((sku) => [
    department.deptNo, // 事业部编码
    '', // 主商品编码
    sku, // 商家商品标识
    shop.shopNo, // 店铺编码
    1, // 库存管理方式
    0, // 库存比例/数值
    '' // 仓库编号
  ])

  const excelData = [headers, introRow, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'GoodsStockConfig')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

/**
 * 处理整店清零的核心逻辑
 * @param {object} shopInfo - 店铺信息
 * @param {object} helpers - 辅助函数对象 { log }
 * @returns {Array} 结果数组
 */
async function _processWholeStoreClearance(shopInfo, { log }) {
  if (!shopInfo || !shopInfo.shopNo) {
    throw new Error('未提供有效的店铺信息，无法执行整店清零')
  }

  log('开始调用整店清零API...')
  const clearanceResult = await _callResetGoodsStockRatioAPI(shopInfo)
  log(`整店清零完成: ${clearanceResult.message}`, 'success')

  return [clearanceResult.message]
}

/**
 * 处理一个批次的SKU的核心逻辑
 * @param {Array} skuList - SKU列表
 * @param {object} shopInfo - 店铺信息
 * @param {object} helpers - 辅助函数对象 { log }
 * @returns {Array} 结果数组
 */
async function _processBatch(skuList, shopInfo, { log }) {
  log(`开始为 ${skuList.length} 个SKU生成库存分配清零文件...`)
  const department = getSelectedDepartment()
  if (!department) {
    throw new Error('未选择事业部，无法执行清零操作')
  }

  const fileBuffer = _createClearanceExcelFileAsBuffer(skuList, department)
  log(`文件创建成功, 大小: ${fileBuffer.length} bytes`)

  const cookies = await getAllCookies()
  const tokenCookie = cookies.find((c) => c.name === 'csrfToken')
  const csrfToken = tokenCookie ? tokenCookie.value : ''

  const ipcPayload = { fileBuffer: Array.from(new Uint8Array(fileBuffer)), cookies, csrfToken }
  log('通过IPC请求主进程上传库存分配清零文件...')
  const resultIPC = await window.electron.ipcRenderer.invoke('upload-goods-stock-config', ipcPayload)

  if (!resultIPC || !resultIPC.success) {
    throw new Error(resultIPC.message || 'SKU清零API调用失败')
  }

  log(`批处理完成: ${resultIPC.message}`, 'success')

  return resultIPC.results || [resultIPC.message]
}

/**
 * "库存分配清零" 功能的核心执行函数
 * @param {object} context - { skuList, shopInfo, options }
 * @param {object} helpers - { log, updateProgress }
 * @returns {Promise<Array>} - 返回一个包含所有结果信息的数组
 */
async function stockAllocationClearanceExecute(context, helpers) {
  const { skuList, shopInfo } = context
  const { log, updateProgress } = helpers

  if (!skuList || skuList.length === 0) {
    throw new Error('SKU列表为空，无法执行操作')
  }

  // 检查是否是整店操作
  const isWholeStore = skuList.length === 1 && skuList[0] === 'WHOLE_STORE'

  if (isWholeStore) {
    return await _processWholeStoreClearance(shopInfo, helpers)
  }

  // 如果SKU数量大于2000，分批处理
  const BATCH_SIZE = 2000
  if (skuList.length > BATCH_SIZE) {
    log(`SKU数量(${skuList.length})超过${BATCH_SIZE}，将分批处理...`, 'warning')

    const batches = []
    for (let i = 0; i < skuList.length; i += BATCH_SIZE) {
      batches.push(skuList.slice(i, i + BATCH_SIZE))
    }

    log(`已将SKU列表分成 ${batches.length} 个批次。`)
    updateProgress(0, batches.length)

    const allResults = []
    for (let i = 0; i < batches.length; i++) {
      const batchSkuList = batches[i]
      log(`--- 开始处理批次 ${i + 1}/${batches.length} (${batchSkuList.length}个SKU) ---`)

      const batchResult = await _processBatch(batchSkuList, shopInfo, helpers)
      allResults.push(...batchResult)
      updateProgress(i + 1, batches.length)

      log(`--- 批次 ${i + 1}/${batches.length} 处理完毕 ---`)
    }
    return allResults
  }

  // SKU数量不多，直接处理
  return await _processBatch(skuList, shopInfo, helpers)
}

// 导出的新版 "功能定义" 对象
export default {
  name: 'stockAllocationClearance',
  label: '库存分配清零',
  execute: stockAllocationClearanceExecute
} 