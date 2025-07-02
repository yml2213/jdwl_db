/**
 * 后端任务：启用京配打标生效
 * 7.3 优化 使用 getProductData.task.js 查询商品数据
 */
import XLSX from 'xlsx'
import { uploadJpSearchFile } from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'
import getProductData from './getProductData.task.js'
import { saveExcelFile } from '../utils/fileUtils.js'

// 配置常量
const BATCH_SIZE = 5000
const BATCH_DELAY = 1 * 60 * 1000 // 1 minute
const TEMP_DIR_NAME = '启用京配打标生效'

/**
 * 主执行函数 - 由工作流调用
 * @param {object} context 包含 skus 和 store 信息
 * @param {Function} updateFn 更新进度的回调函数
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, updateFn, sessionData) {
  const { skus, store } = context
  // console.log('enableJpSearch.task.js -- context:', context)
  // console.log('enableJpSearch.task.js -- sessionData:', sessionData)

  // console.log('enableJpSearch.task.js -- skus:', skus)
  // console.log('enableJpSearch.task.js -- store:', store)

  // 验证输入参数
  if (!skus || !Array.isArray(skus) || skus.length === 0) {
    return { success: false, message: '请提供有效的SKU列表' }
  }

  if (!sessionData || !sessionData.cookies) {
    throw new Error('缺少会话信息')
  }

  try {
    console.log(`[Task: enableJpSearch] 准备通过SKU查询CSG...`)
    updateFn('获取CSG...')

    // 获取商品数据
    const payload = { skus }
    const result = await getProductData.execute(payload, updateFn, sessionData)

    // 验证商品数据
    if (!result || !result.data || result.data.length === 0) {
      return { success: false, message: '未能获取到商品列表，请检查SKU是否正确。' }
    }

    // 提取CSG列表
    const csgList = result.data.map((p) => p.shopGoodsNo).filter(Boolean)
    if (csgList.length === 0) {
      return { success: false, message: '未找到有效的CSG编号' }
    }

    console.log(`[Task: enableJpSearch] 获取到 ${csgList.length} 个商品的CSG编号。`)
    console.log(`[Task: enableJpSearch] "启用京配打标生效" 开始，店铺 [${store?.shopName || '未知店铺'}]...`)

    // 执行批处理
    const result2 = await processInBatches(csgList, store, sessionData)

    if (!result2.success) {
      throw new Error(`启用京配打标生效失败: ${result2.message}`)
    }

    return { success: true, message: result2.message }
  } catch (error) {
    console.error(`[Task: enableJpSearch] 执行失败:`, error)
    return { success: false, message: `执行失败: ${error.message}` }
  }
}

/**
 * 批量处理CSG列表
 * @param {string[]} csgList - CSG编号列表
 * @param {object} store - 店铺信息
 * @param {object} sessionData - 会话数据
 * @returns {Promise<object>} 批处理结果
 */
async function processInBatches(csgList, store, sessionData) {
  const batchFn = async (itemsToProcess) => {
    try {
      // 创建Excel文件Buffer
      const fileBuffer = createJpSearchExcelBuffer(itemsToProcess)

      // 保存文件到本地
      const filePath = await saveExcelFile(fileBuffer, {
        dirName: TEMP_DIR_NAME,
        store: store,
        extension: 'xls'
      })

      // 上传文件到京东API
      const response = await uploadJpSearchFile(fileBuffer, sessionData)

      if (response && response.resultCode === 1) {
        return {
          success: true,
          message: response.resultData || '京配打标任务提交成功。',
          filePath
        }
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

  return await executeInBatches({
    items: csgList,
    batchSize: BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log: (message, type = 'info') => {
      console.log(`[enableJpSearch] [${type.toUpperCase()}] ${message}`)
    },
    isRunning: { value: true }
  })
}

/**
 * 创建用于京配查询的Excel文件Buffer
 * @param {string[]} items - CSG编号列表
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

export default {
  name: 'enableJpSearch',
  description: '启用京配打标生效',
  execute
} 