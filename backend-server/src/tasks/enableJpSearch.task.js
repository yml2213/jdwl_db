/**
 * 后端任务：启用京配打标生效
 */
import XLSX from 'xlsx'
import { uploadJpSearchFile } from '../services/jdApiService.js'

/**
 * 创建用于京配查询的Excel文件Buffer
 * @param {string[]} items - 商品SKU或CSG列表
 * @returns {Buffer}
 */
function createJpSearchExcelBuffer(items) {
  const headers = ['店铺商品编号 (CSG编码)', '京配搜索 (0否, 1是)']
  const dataRows = items.map((item) => [item, 1])
  const excelData = [headers, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(excelData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { bookType: 'xls', type: 'buffer' })
}

/**
 * 主执行函数 - 由工作流调用
 * @param {object} context 包含 skus, csgList
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
  const { skus, csgList, store } = context

  const itemsToProcess = csgList || skus
  if (!itemsToProcess || itemsToProcess.length === 0) {
    return { success: true, message: '商品列表为空，无需操作。' }
  }

  if (!sessionData || !sessionData.cookies) {
    throw new Error('缺少会话信息')
  }

  console.log(
    `[Task: enableJpSearch] "启用京配打标生效" 开始，店铺 [${store.shopName}]...`
  )
  console.log(
    `[Task: enableJpSearch] 将为 ${itemsToProcess.length} 个商品启用京配打标。`
  )

  try {
    const fileBuffer = createJpSearchExcelBuffer(itemsToProcess)
    const response = await uploadJpSearchFile(fileBuffer, sessionData)

    console.log('启用京配打标生效=======> response', response)

    if (response && response.resultCode === 1) {
          return { success: true, message: response.resultData || '京配打标任务提交成功。' }
    } else {
      const errorMessage = response.message || '启用京配打标时发生未知错误'
      throw new Error(errorMessage)
    }
  } catch (error) {
    console.error('[Task: enableJpSearch] 任务执行失败:', error)
    throw new Error(`启用京配打标生效失败: ${error.message}`)
  }
}

export default {
  name: 'enableJpSearch',
  description: '启用京配打标生效',
  execute: execute
} 