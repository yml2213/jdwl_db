import XLSX from 'xlsx'
import { uploadInventoryAllocationFile } from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'
import { saveExcelFile } from '../utils/fileUtils.js'

const BATCH_SIZE = 2000
const BATCH_DELAY = 5 * 60 * 1000 // 5 minutes
const TEMP_DIR_NAME = '启用库存商品分配'

/**
 * 启用商品库存分配的任务
 * @param {object} context - 来自前端的数据
 * @param {string[]} context.skus - SKU列表
 * @param {object} sessionData - 会话数据
 */
async function execute(context, updateFn, sessionData) {
  console.log('enableInventoryAllocation.task.js -- context:', context)
  const { skus, store, department } = context
  const taskName = '[Task: enableInventoryAllocation]'

  updateFn('任务开始：启用库存商品分配...')
  console.log(`${taskName} "启用库存商品分配" 开始...`, {
    store: store.shopName,
    department: department.deptNo,
    skuCount: skus?.length || 0,
  })

  if (!sessionData || !sessionData.cookies) {
    throw new Error('缺少会话信息')
  }

  if (!store || !store.shopNo) {
    throw new Error('缺少有效的店铺信息')
  }
  if (!department || !department.deptNo) {
    throw new Error('缺少有效的事业部信息')
  }

  const itemsToProcess = skus
  if (!itemsToProcess || itemsToProcess.length === 0) {
    updateFn('sku为空，无需操作。')
    return { success: false, message: 'sku为空，无需操作。' }
  }
  const totalItems = itemsToProcess.length
  updateFn(`共计 ${totalItems} 个商品需要处理。`)
  console.log(`${taskName} 将为 ${totalItems} 个商品启用库存分配。`)

  const batchFn = async (batchItems) => {
    const batchLogPrefix = `${taskName} [批次]`
    try {
      updateFn(`新批次：开始处理 ${batchItems.length} 个商品...`)
      console.log(`${batchLogPrefix} 正在为 ${batchItems.length} 个商品创建Excel文件...`)
      const fileBuffer = createExcelFile(batchItems, department, store)

      // 保存文件到本地
      const filePath = await saveExcelFile(fileBuffer, {
        dirName: TEMP_DIR_NAME,
        store: store,
        extension: 'xlsx'
      })

      if (filePath) {
        console.log(`${batchLogPrefix} Excel文件已保存到: ${filePath}`)
      }

      updateFn('Excel文件已生成，正在上传...')
      console.log(`${batchLogPrefix} 正在上传文件...`)
      const response = await uploadInventoryAllocationFile(fileBuffer, sessionData)

      console.log(`${batchLogPrefix} 上传文件响应:`, response)
      // {"resultData":"report/goodsStockConfig/goodsStockConfigImportLog-威名2-1751467720014.csv","resultCode":"1"}


      if (response && typeof response === 'object' && response.resultCode === '1') {
        const message = `导入成功，报告文件: ${response.resultData}`
        updateFn('批次导入成功，请在京东后台任务中心查看报告。')
        return { success: true, message }
      }
      if (typeof response === 'string' && response.includes('导入成功')) {
        const match = response.match(/总共通告(\d+)条，成功(\d+)条，失败(\d+)条/)
        const message = match
          ? `处理成功: 总计 ${match[1]}, 成功 ${match[2]}, 失败 ${match[3]}`
          : '文件上传成功。'
        updateFn(`批次处理成功: ${message}`)
        return { success: true, message }
      }

      // 检查JSON和字符串格式的频率限制错误
      if (
        (response &&
          typeof response === 'object' &&
          response.resultMessage &&
          response.resultMessage.includes('频繁操作')) ||
        (typeof response === 'string' && response.includes('只能导入一次'))
      ) {
        const errorMessage = response.resultMessage || response
        updateFn('操作过于频繁，批次将自动重试。')
        console.error(`${batchLogPrefix} ${errorMessage}`)
        return { success: false, message: errorMessage, retryable: true }
      }

      const message = `文件上传失败或响应异常: ${JSON.stringify(response)}`
      updateFn('批次上传失败或响应异常。')
      console.error(`${batchLogPrefix} ${message}`)
      return { success: false, message }
    } catch (error) {
      const errorMessage = `批次处理异常: ${error.message}`
      updateFn(`批次处理异常: ${errorMessage}`)
      console.error(`${batchLogPrefix} 异常:`, error)
      return { success: false, message: errorMessage }
    }
  }

  const result = await executeInBatches({
    items: itemsToProcess,
    batchSize: BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log: (message, type = 'info') => {
      console.log(`[batchProcessor] [${type.toUpperCase()}] ${message}`)
    },
    isRunning: { value: true }
  })

  if (!result.success) {
    updateFn(`任务失败: ${result.message}`)
    throw new Error(`启用库存商品分配失败: ${result.message}`)
  }

  updateFn('任务成功完成。')
  console.log(`${taskName} 任务完成。`)
  return { success: true, message: result.message }
}


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
    'CMG开头的商品编码，主商品编码与商家商品标识至少填写一个',
    '商家自定义的商品编码，主商品编码与商家商品标识至少填写一个',
    'CSP开头的店铺编码',
    '纯数值，1-独占，2-共享，3-固定值',
    '库存方式为独占或共享时，此处填写大于等于0的正整数，所有独占（或共享）比例之和不能大于100库存方为固定值时，填写正整数，不能大于当前商品的库存总数',
    '可空，只有在库存管理方式为3-固定值时，读取仓库编码，若为空则按全部仓库执行'
  ]
  const rows = skuList.map((sku) => [department.deptNo, '', sku, store.shopNo, 1, 100, ''])
  const excelData = [headers, introRow, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'GoodsStockConfig')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}


export default {
  name: 'enableInventoryAllocation',
  description: '启用库存商品分配',
  execute: execute
}
