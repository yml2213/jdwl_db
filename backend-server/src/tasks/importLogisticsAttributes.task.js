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
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn } = context // 从上下文中解构出 updateFn
  try {
    updateFn('importLogisticsAttributes 任务开始执行')

    // 从上下文中获取所需数据
    const { skus, department, store, logisticsOptions } = context

    // 检查商品列表是否为空
    if (!skus || skus.length === 0) {
      updateFn({ message: '商品列表为空，无需操作。', type: 'info' })
      return { success: true, message: '商品列表为空，无需操作。' }
    }

    // 将 skus 数组转换为京东API需要的格式
    const itemsToProcess = skus.map((sku) => ({
      skuId: sku,
      ...logisticsOptions
    }))

    updateFn(`"导入物流属性" 开始，店铺 [${store.name}]...`)
    updateFn(`总共需要处理 ${itemsToProcess.length} 个SKU.`)

    // 2. 参数校验
    if (!department || !department.deptNo) {
      throw new Error('上下文中缺少有效的事业部信息。')
    }
    if (!store) {
      throw new Error('上下文中缺少有效的店铺信息。')
    }
    if (!sessionData || !sessionData.jdCookies) {
      throw new Error('缺少会话信息。')
    }
    if (!logisticsOptions) {
      throw new Error('上下文中缺少有效的物流参数。')
    }

    updateFn(`"导入物流属性" 开始，事业部 [${department.name} - ${department.deptNo}]...`)
    updateFn(`将为 ${itemsToProcess.length} 个商品导入物流属性。`)
    updateFn(`使用的物流参数: ${JSON.stringify(logisticsOptions)}`)

    const batchFn = async (batchItems) => {
      // 内部的try-catch保持不变，用于处理单个批次的特定逻辑
      try {
        if (!cancellationToken.value) {
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
          throw new Error(errorMessage) // 抛出错误以在批处理器中被捕获为失败
        }
      } catch (error) {
        // 确保即使在捕获错误后，也能将失败状态正确传播回批处理器
        return { success: false, message: error.message }
      }
    }

    const results = await executeInBatches({
      items: itemsToProcess,
      batchSize: BATCH_SIZE,
      delay: BATCH_DELAY,
      batchFn,
      // 逻辑已移至 server.js 的智能 updateFn, 这里只需直接传递即可
      log: updateFn,
      isRunning: cancellationToken
    })

    if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

    if (!results.success) {
      throw new Error(`导入物流属性任务处理完成，但有失败的批次: ${results.message}`)
    }

    return { success: true, message: `所有批次成功完成。 ${results.message}` }
  } catch (error) {
    if (!cancellationToken.value) {
      const cancelMsg = '任务在执行中被用户取消。'
      updateFn({ message: cancelMsg, error: true })
      return { success: false, message: cancelMsg }
    }
    // 如果不是因为取消而出错，则重新抛出原始错误
    throw new Error(`[导入物流属性] 任务执行失败: ${error.message}`)
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
  requiredContext: ['itemsToProcess', 'department', 'store', 'logisticsOptions'],
  outputContext: [], // 此任务不向共享上下文输出数据
  execute
}
