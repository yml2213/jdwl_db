/**
 * 后端任务：导入物流属性
 */
import XLSX from 'xlsx'
import { uploadLogisticsAttributesFile } from '../services/jdApiService.js'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, warehouse, logisticsOptions
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
  const { skus, csgList, store, logisticsOptions } = context

  // 1. 参数校验
  const itemsToProcess = csgList || skus
  if (!itemsToProcess || itemsToProcess.length === 0) {
    return { success: true, message: '商品列表为空，无需操作。' }
  }
  if (!store || !store.deptNo) {
    throw new Error('缺少有效的事业部信息。')
  }
  if (!sessionData || !sessionData.sessionId) {
    throw new Error('缺少会话ID')
  }

  console.log(
    `[Task: importLogisticsAttributes] "导入物流属性" 开始，事业部 [${store.deptName}]...`
  )
  console.log(
    `[Task: importLogisticsAttributes] 将为 ${itemsToProcess.length} 个商品导入物流属性。`
  )
  console.log('[Task: importLogisticsAttributes] 使用的物流参数:', logisticsOptions)

  try {
    // 2. 创建物流属性Excel文件Buffer
    const fileBuffer = createLogisticsExcelBuffer(itemsToProcess, store, logisticsOptions)

    // 3. 上传文件
    const dataForApi = { ...sessionData, store }
    const result = await uploadLogisticsAttributesFile(fileBuffer, dataForApi)

    // 4. 处理API响应
    //   { success: false, tipMsg: '', data: '5分钟内只能导入一次,请稍后再试!!' }
    if (result && result.success) {
      console.log('[Task: importLogisticsAttributes] "导入物流属性" 任务成功完成。')
      return { success: true, message: result.data || '物流属性导入成功' }
    } else if (result.data.includes('5分钟内只能导入一次')) {
      console.log(
        '[Task: importLogisticsAttributes] "导入物流属性" 5分钟内只能导入一次,请稍后再试!!'
      )
      return { success: false, message: result.data || '5分钟内只能导入一次,请稍后再试!!' }
    } else {
      const errorMessage = result.data || '导入物流属性时发生未知错误'
      console.error(`[Task: importLogisticsAttributes] 导入失败: ${errorMessage}`)
      throw new Error(errorMessage)
    }
  } catch (error) {
    console.error('[Task: importLogisticsAttributes] 任务执行失败:', error)
    throw new Error(`导入物流属性失败: ${error.message}`)
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
  execute: execute
}
