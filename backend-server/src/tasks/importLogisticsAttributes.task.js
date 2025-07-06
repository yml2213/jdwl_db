/**
 * 后端任务：导入物流属性
 */
import * as jdApiService from '../services/jdApiService.js'
import * as XLSX from 'xlsx'
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
const execute = async (context, updateFn, sessionData, cancellationToken = { value: true }) => {
  // 兼容工作流和单任务调用
  if (typeof updateFn !== 'function') {
    cancellationToken = sessionData || { value: true }
    sessionData = updateFn
    updateFn = () => { }
  }

  try {
    if (!cancellationToken.value) {
      return { success: false, message: '任务已取消。' }
    }
    // 1. 统一获取物流参数，兼容工作流和单任务模式
    const logisticsOptions = context.logisticsOptions || context.logistics
    const { csgList, department, store } = context

    // 统一数据源：工作流使用csgList，单任务使用skus
    const itemsToProcess = csgList || context.skus || []

    // 1. 参数校验
    if (itemsToProcess.length === 0) {
      const msg = '商品列表为空，无需操作。'
      updateFn(msg)
      return { success: true, message: msg }
    }
    if (!department || !department.deptNo) {
      const msg = '缺少有效的事业部信息。'
      updateFn({ message: msg, error: true })
      throw new Error(msg)
    }
    if (!store) {
      const msg = '缺少有效的店铺信息。'
      updateFn({ message: msg, error: true })
      throw new Error(msg)
    }
    if (!sessionData || !sessionData.jdCookies) {
      const msg = '缺少会话信息'
      updateFn({ message: msg, error: true })
      throw new Error(msg)
    }
    if (!logisticsOptions) {
      const msg = '上下文中缺少有效的物流参数 (logisticsOptions 或 logistics)'
      updateFn({ message: msg, error: true })
      throw new Error(msg)
    }

    updateFn(`"导入物流属性" 开始，事业部 [${department.name} - ${department.deptNo}]...`)
    updateFn(`将为 ${itemsToProcess.length} 个商品导入物流属性。`)
    updateFn(`使用的物流参数: ${JSON.stringify(logisticsOptions)}`)

    const batchFn = async (batchItems) => {
      // 内部的try-catch保持不变，用于处理单个批次的特定逻辑
      try {
        if (!cancellationToken.value) {
          // 在批处理函数内部也进行检查
          return { success: false, message: '任务已取消' }
        }

        const fileBuffer = createLogisticsExcelBuffer(batchItems, department, logisticsOptions)

        const filePath = await saveExcelFile(fileBuffer, {
          dirName: TEMP_DIR_NAME,
          store: { shopName: department?.name?.replace(/[\\/:"*?<>|]/g, '_') || 'unknown-dept' },
          extension: 'xls'
        })

        if (filePath) {
          updateFn(`Excel文件已保存到: ${filePath}`)
        }

        const dataForApi = { ...sessionData, store }
        const result = await jdApiService.uploadLogisticsAttributesFile(fileBuffer, dataForApi)
        updateFn(`API 响应: ${JSON.stringify(result)}`)

        if (result.success) {
          return { success: true, message: result.data || '物流属性导入成功' }
        } else if (result.data && result.data.includes('5分钟内只能导入一次')) {
          return { success: false, message: result.data } // 让批处理器知道需要重试
        } else {
          const errorMessage = result.data || '导入物流属性时发生未知错误'
          updateFn({ message: `导入失败: ${errorMessage}`, error: true })
          throw new Error(errorMessage) // 抛出错误以在批处理器中被捕获为失败
        }
      } catch (error) {
        const errorMessage = `批处理失败: ${error.message}`
        updateFn({ message: errorMessage, error: true })
        // 确保即使在捕获错误后，也能将失败状态正确传播回批处理器
        return { success: false, message: errorMessage }
      }
    }

    const batchResults = await executeInBatches({
      items: itemsToProcess,
      batchSize: BATCH_SIZE,
      delay: BATCH_DELAY,
      batchFn,
      log: (logData, level = 'info') => {
        // 如果 logData 是我们为前端定制的事件对象，直接传递
        if (typeof logData === 'object' && logData !== null && logData.event) {
          updateFn(logData)
        } else {
          // 否则，作为普通日志消息处理
          updateFn({ message: `[批处理] ${String(logData)}`, type: level })
        }
      },
      isRunning: cancellationToken
    })

    if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

    if (!batchResults.success) {
      const errorMsg = `导入物流属性任务处理完成，但有失败的批次: ${batchResults.message}`
      updateFn({ message: errorMsg, error: true })
      throw new Error(errorMsg)
    }

    return { success: true, message: `所有批次成功完成。 ${batchResults.message}` }
  } catch (error) {
    if (!cancellationToken.value) {
      const cancelMsg = '任务在执行中被用户取消。'
      updateFn({ message: cancelMsg, error: true })
      return { success: false, message: cancelMsg }
    }
    // 如果不是因为取消而出错，则重新抛出原始错误
    const errorMsg = `[导入物流属性] 任务执行失败: ${error.message}`
    updateFn({ message: errorMsg, error: true })
    throw new Error(errorMsg)
  }
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
  execute
}
