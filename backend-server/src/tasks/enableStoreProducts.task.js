/**
 * 后端任务：启用店铺商品
 * 这个任务有双重职责:
 *   1. 启用商品主数据 (使用CMG编码，直接调用API)
 *   2. 启用店铺内商品 (使用CSG编码，通过上传Excel)
 * 核心逻辑是先找出已停用的商品，然后只对它们执行以上两个操作。
 */
import * as jdApiService from '../services/jdApiService.js'
import * as XLSX from 'xlsx'
import { saveExcelFile } from '../utils/fileUtils.js'

const TEMP_DIR_NAME = '启用店铺商品'

/**
 * @param {object} context
 * @param {object[]} [context.allProductData] - 从工作流传入的完整商品数据
 * @param {string[]} [context.skus] - 从单任务模式传入的SKU列表
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn } = context; // 从上下文中解构出 updateFn

  if (!sessionData || !sessionData.jdCookies) {
    const errorMsg = '错误: 缺少会话信息'
    updateFn({ message: errorMsg, error: true })
    throw new Error(errorMsg)
  }

  const messages = []

  try {
    updateFn('开始执行 "启用店铺商品" 任务...')
    const skusToCheck =
      context.skus || (context.allProductData ? context.allProductData.map((p) => p.sellerGoodsSign) : [])
    if (skusToCheck.length === 0) {
      const msg = '没有需要检查的SKU，任务结束。'
      updateFn(msg)
      return { success: true, message: msg }
    }

    if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

    updateFn(`正在查询 ${skusToCheck.length} 个SKU中已停用的商品...`)
    const disabledProducts = await jdApiService.getDisabledProducts(skusToCheck, sessionData)

    if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

    if (disabledProducts.length === 0) {
      const message = '所有被检查的商品状态均为启用，无需操作。'
      updateFn(message)
      return { success: true, message }
    }
    updateFn(`查询到 ${disabledProducts.length} 个已停用的商品，准备执行启用操作...`)

    const cmgList = disabledProducts.map((p) => p.goodsNo).filter(Boolean)
    if (cmgList.length > 0) {
      const numericCmgs = cmgList.map((cmg) => cmg.replace('CMG', ''))
      updateFn(`正在启用 ${numericCmgs.length} 个商品主数据...`)
      const result = await jdApiService.enableStoreProducts(numericCmgs, sessionData)

      if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

      if (result.resultCode !== 1) throw new Error(`启用主数据失败: ${result.resultMessage}`)
      const msg = `启用主数据成功(${numericCmgs.length}个)`
      messages.push(msg)
      updateFn(msg)
    }

    const csgList = disabledProducts.map((p) => p.shopGoodsNo).filter(Boolean)
    if (csgList.length > 0) {
      updateFn(`正在通过上传文件启用 ${csgList.length} 个店铺商品...`)
      const fileBuffer = createStatusUpdateExcel(csgList)
      const filePath = await saveExcelFile(fileBuffer, {
        dirName: TEMP_DIR_NAME,
        store: context.store,
        extension: 'xls'
      })
      updateFn(`状态更新Excel文件已保存到: ${filePath}`)
      const uploadResult = await jdApiService.uploadStatusUpdateFile(fileBuffer, {
        ...sessionData,
        ...context
      })

      if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

      const match = uploadResult.message.match(/成功(?:导入|更新)\s*(\d+)\s*条/)
      const successCount = match ? parseInt(match[1], 10) : csgList.length
      const msg = `启用店铺商品成功(${successCount}个)`
      messages.push(msg)
      updateFn(msg)
    }

    const finalMessage = `任务完成: ${messages.join('; ')}`
    updateFn(finalMessage)
    return { success: true, message: finalMessage }
  } catch (error) {
    if (!cancellationToken.value) {
      const cancelMsg = '任务在执行中被用户取消。'
      updateFn({ message: cancelMsg, error: true })
      return { success: false, message: cancelMsg }
    }
    const errorMsg = `[启用店铺商品] 任务执行失败: ${error.message}`
    updateFn({ message: errorMsg, error: true })
    throw new Error(errorMsg)
  }
}

function createStatusUpdateExcel(csgList) {
  const headers = ['店铺商品编号 (CSG编码)', '商品状态(1启用, 2停用)']
  const dataRows = csgList.map((csg) => [csg, 1]) // 1 = 启用
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'sheet1')
  return XLSX.write(wb, { bookType: 'xls', type: 'buffer' })
}

export default {
  name: 'enableStoreProducts',
  description: '启用店铺商品（包含主数据和店铺内状态）',
  requiredContext: ['skus', 'store'], // 定义任务执行所必需的上下文参数
  outputContext: [], // 定义任务不向上层输出参数
  execute,
}
