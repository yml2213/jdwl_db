import XLSX from 'xlsx'
import FormData from 'form-data'
import { uploadInventoryAllocationFile } from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'

const BATCH_SIZE = 2000
const BATCH_DELAY = 5 * 60 * 1000 // 5 minutes

function createExcelFile(skuList, department, store) {
  // ... [The exact same Excel creation logic as before] ...
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
    'CMG开头的商品编码...',
    '...',
    '...',
    '...',
    '...',
    '...'
  ]
  const rows = skuList.map((sku) => [department.deptNo, '', sku, store.shopNo, 1, 100, ''])
  const excelData = [headers, introRow, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'GoodsStockConfig')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

/**
 * 启用商品库存分配的任务
 * 该任务作为一个简单的编排器，调用apiService来完成主要工作
 * @param {object} payload - 来自前端的数据
 * @param {string[]} payload.skus - SKU列表
 * @param {string[]} [payload.csgList] - 可选的CSG编号列表
 * @param {object} sessionData - 会话数据
 */
async function execute(payload, sessionData) {
  // 临时log和isRunning, 兼容executeInBatches
  const log = (message, type = 'info') => {
    console.log(`[enableInventoryAllocation] [${type.toUpperCase()}] ${message}`)
  }
  const isRunning = { value: true }

  const { skus, csgList } = payload
  log('Starting inventory allocation task...', 'info')

  if (!sessionData) {
    throw new Error('Session data is missing.')
  }

  const { cookies, department, store } = sessionData
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const csrfToken = cookies.find((c) => c.name === 'csrfToken')?.value

  if (!store || !department || !csrfToken) {
    throw new Error('Session is missing store, department, or token info.')
  }

  const itemsToProcess = csgList || skus
  if (!itemsToProcess || itemsToProcess.length === 0) {
    throw new Error('No items to process.')
  }

  const batchFn = async (batchItems) => {
    try {
      log(`Creating Excel file for ${batchItems.length} items...`, 'info')
      const fileBuffer = createExcelFile(batchItems, department, store)

      log('Uploading file for batch...', 'info')
      const response = await uploadInventoryAllocationFile(fileBuffer, sessionData)

      // Case 1: JSON response for success
      if (response && typeof response === 'object' && response.resultCode === '1') {
        const message = `导入成功，报告文件: ${response.resultData}`
        log(message, 'info')
        return { success: true, message: message }
      }

      // Case 2: String response for success (older format)
      if (typeof response === 'string' && response.includes('导入成功')) {
        const match = response.match(/导入成功，总共通告(\d+)条，成功(\d+)条，失败(\d+)条/)
        const message = match
          ? `处理成功: 总计 ${match[1]}, 成功 ${match[2]}, 失败 ${match[3]}`
          : '文件上传成功。'
        log(message, 'info')
        return { success: true, message: message }
      }

      // If neither success case matched, it's a failure.
      const message = `文件上传失败或响应异常: ${JSON.stringify(response)}`
      log(message, 'error')
      return { success: false, message }
    } catch (error) {
      const errorMessage = `批次处理异常: ${error.message}`
      log(errorMessage, 'error')
      return { success: false, message: errorMessage }
    }
  }

  const result = await executeInBatches({
    items: itemsToProcess,
    batchSize: BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log,
    isRunning
  })

  if (!result.success) {
    throw new Error(result.message)
  }

  log('Inventory allocation task completed.', 'success')
  return { success: true, message: result.message }
}

export default {
  name: 'enableInventoryAllocation',
  description: '启用库存商品分配',
  execute: execute
}
