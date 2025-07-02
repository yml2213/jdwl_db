/**
 * 后端任务：导入物流属性
 */
import XLSX from 'xlsx'
import { uploadLogisticsAttributesFile } from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'
import { saveExcelFile } from '../utils/fileUtils.js'

// 配置常量
const BATCH_SIZE = 2000
const BATCH_DELAY = 5 * 60 * 1000 // 京东限制5分钟一次
const TEMP_DIR_NAME = '导入物流属性'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, warehouse, logisticsOptions
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, updateFn, sessionData) {
  const { skus, department, store } = context
  console.log('importLogisticsAttributes.task.js -- context:', context)
  console.log('importLogisticsAttributes.task.js -- sessionData:', sessionData)

  // 1. 参数校验
  const itemsToProcess = skus
  if (!itemsToProcess || itemsToProcess.length === 0) {
    return { success: false, message: 'sku为空，无需操作。' }
  }
  if (!department || !department.deptNo) {
    throw new Error('缺少有效的事业部信息。')
  }
  if (!store) {
    throw new Error('缺少有效的店铺信息。')
  }
  if (!sessionData || !sessionData.cookies) {
    throw new Error('缺少会话信息')
  }
  const logisticsOptions = {
    length: context.length,
    width: context.width,
    height: context.height,
    grossWeight: context.grossWeight
  }

  console.log(
    `[Task: importLogisticsAttributes] "导入物流属性" 开始，事业部 [${department.name} - ${department.deptNo}]...`
  )
  console.log(
    `[Task: importLogisticsAttributes] 将为 ${itemsToProcess.length} 个商品导入物流属性。`
  )
  console.log('[Task: importLogisticsAttributes] 使用的物流参数:', logisticsOptions)

  const batchFn = async (batchItems) => {
    try {
      const fileBuffer = createLogisticsExcelBuffer(batchItems, department, logisticsOptions)

      // 将生成的Excel文件保存到本地
      const filePath = await saveExcelFile(fileBuffer, {
        dirName: TEMP_DIR_NAME,
        fileName: department?.name?.replace(/[\\/:"*?<>|]/g, '_') || 'unknown-dept',
        extension: 'xls'
      })

      if (filePath) {
        console.log(`[Task: importLogisticsAttributes] Excel文件已保存到: ${filePath}`)
      }

      const dataForApi = { ...sessionData, store }
      const result = await uploadLogisticsAttributesFile(fileBuffer, dataForApi)


      if (result.success) {
        return { success: true, message: result.data || '物流属性导入成功' }
      } else if (result.data && result.data.includes('5分钟内只能导入一次')) {
        // 让 batch processor 知道这是一个可重试的错误
        return { success: false, message: result.data }
      } else {
        // 对于其他错误，认为是决定性的失败
        const errorMessage = result.data || '导入物流属性时发生未知错误'
        console.error(`[Task: importLogisticsAttributes] 导入失败: ${errorMessage}`)
        // 抛出错误以在 batch processor 中被捕获为失败
        throw new Error(errorMessage)
      }
    } catch (error) {
      console.error('[Task: importLogisticsAttributes] 批处理失败:', error)
      return { success: false, message: `批处理失败: ${error.message}` }
    }
  }

  const batchResults = await executeInBatches({
    items: itemsToProcess,
    batchSize: BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log: (message, level = 'info') =>
      console.log(`[batchProcessor] [${level.toUpperCase()}]: ${message}`),
    isRunning: { value: true }
  })

  if (!batchResults.success) {
    throw new Error(`导入物流属性任务处理完成，但有失败的批次: ${batchResults.message}`)
  }

  return { success: true, message: `所有批次成功完成。 ${batchResults.message}` }
}

/**
 * 创建物流属性Excel文件的Buffer
 * @param {string[]} skuList - 商品SKU或CSG列表
 * @param {object} department - 事业部信息对象
 * @param {object} logisticsOptions - 物流参数
 * @returns {Buffer}
 */
function createLogisticsExcelBuffer(skuList, department, logisticsOptions) {
  const {
    length = '120.00',
    width = '60.00',
    height = '6.00',
    grossWeight = '0.1'
  } = logisticsOptions || {}

  const headers = [
    '事业部商品编码',
    '事业部编码',
    '商家商品编号',
    '长(mm)',
    '宽(mm)',
    '高(mm)',
    '净重(kg)',
    '毛重(kg)'
  ]
  const dataRows = skuList.map((sku) => [
    '', // 事业部商品编码 (为空)
    department.deptNo, // 事业部编码
    sku, // 商家商品编号
    length, // 长(mm)
    width, // 宽(mm)
    height, // 高(mm)
    '', // 净重(kg)
    grossWeight // 毛重(kg)
  ])

  const excelData = [headers, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(excelData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { bookType: 'xls', type: 'buffer' })
}

export default {
  name: 'importLogisticsAttributes',
  description: '导入物流属性',
  execute: execute
}
