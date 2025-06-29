import XLSX from 'xlsx'
import FormData from 'form-data'
import { requestJdApi } from '../services/jdApiService.js'
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
 * Task to enable inventory allocation for a list of products.
 * This task acts as a simple orchestrator, calling the apiService to do the heavy lifting.
 * @param {object} payload - The data from the frontend.
 * @param {string[]} payload.skus - The list of SKUs.
 * @param {string[]} [payload.csgList] - Optional list of CSG numbers.
 * @param {object} helpers - Task helpers provided by the task runner.
 * @param {Function} helpers.log - Logging function.
 * @param {object} helpers.isRunning - Task running state.
 */
async function execute(payload, { log, isRunning }) {
  const { skus, csgList, session } = payload
  log('Starting inventory allocation task...', 'info')

  if (!session) {
    throw new Error('Session data is missing in the payload.')
  }

  const { cookies, department, store } = session
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

      const url = 'https://o.jdl.com/goodsStockConfig/importGoodsStockConfig.do'
      const formData = new FormData()
      formData.append('file', fileBuffer, 'GoodsStockConfig.xlsx')
      formData.append('token', csrfToken)
      formData.append('query.maxCount', 50000)

      const headers = {
        ...formData.getHeaders(),
        Cookie: cookieString,
        Referer: `https://o.jdl.com/goodsStockConfig/showImport.do`
      }

      log('Uploading file for batch...', 'info')
      const responseText = await requestJdApi({
        method: 'POST',
        url: url,
        data: formData,
        headers: headers
      })

      if (responseText && responseText.includes('导入成功')) {
        const match = responseText.match(/导入成功，总共通告(\d+)条，成功(\d+)条，失败(\d+)条/)
        const message = match
          ? `处理成功: 总计 ${match[1]}, 成功 ${match[2]}, 失败 ${match[3]}`
          : '文件上传成功。'
        log(message, 'info')
        return { success: true, message: message }
      } else {
        const message = '文件上传失败或响应异常。'
        log(message, 'error')
        return { success: false, message }
      }
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
