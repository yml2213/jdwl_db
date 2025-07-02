/**
 * 后端任务：启用京配打标生效
 */
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { uploadJpSearchFile } from '../services/jdApiService.js'
import getCSGTask from './getCSG.task.js'
import { executeInBatches } from '../utils/batchProcessor.js'
import { getFormattedChinaTime } from '../utils/timeUtils.js'

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
  const { skus, store } = context
  let { csgList } = context

  if (!csgList && skus && skus.length > 0) {
    console.log(
      `[Task: enableJpSearch] 未提供CSG列表，将通过SKU查询CSG...`
    )
    const csgContext = { ...context }
    const csgResult = await getCSGTask.execute(csgContext, sessionData)
    if (!csgResult.success) {
      throw new Error(`获取CSG失败: ${csgResult.message}`)
    }
    csgList = csgResult.csgList
  }

  const itemsToProcess = csgList
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

  const batchFn = async (batchItems) => {
    try {
      const fileBuffer = createJpSearchExcelBuffer(batchItems)

      // 保存文件到本地
      try {
        const tempDir = path.resolve(process.cwd(), 'temp', '启用京配打标生效')
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }
        const timestamp = getFormattedChinaTime()
        const shopNameForFile = store?.shopName?.replace(/[\\/:"*?<>|]/g, '_') || 'unknown-shop'
        const filename = `${timestamp}_${shopNameForFile}.xls`
        const filePath = path.join(tempDir, filename)
        fs.writeFileSync(filePath, fileBuffer)
        console.log(`[Task: enableJpSearch] Excel文件已保存到: ${filePath}`)
      } catch (saveError) {
        console.error(`[Task: enableJpSearch] 保存Excel文件失败:`, saveError)
        // 不中断流程
      }

      const response = await uploadJpSearchFile(fileBuffer, sessionData)

      if (response && response.resultCode === 1) {
        return { success: true, message: response.resultData || '京配打标任务提交成功。' }
      }

      // 检查频率限制错误
      if (response && response.message && response.message.includes('频繁操作')) {
        return { success: false, message: response.message }
      }

      const errorMessage = response.message || '启用京配打标时发生未知错误'
      return { success: false, message: errorMessage }
    } catch (error) {
      console.error('[Task: enableJpSearch] 批处理异常:', error)
      return { success: false, message: `批处理异常: ${error.message}` }
    }
  }

  const BATCH_SIZE = 5000
  const BATCH_DELAY = 1 * 60 * 1000 // 1 minute

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
    throw new Error(`启用京配打标生效失败: ${result.message}`)
  }

  return { success: true, message: result.message }
}

export default {
  name: 'enableJpSearch',
  description: '启用京配打标生效',
  execute: execute
} 