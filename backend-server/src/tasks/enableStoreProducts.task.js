/**
 * 后端任务：启用店铺商品 （包含主数据和店铺内状态）
 * - 核心逻辑：查询指定SKU列表，仅对其中"已停用"的商品执行启用操作。
 * - 支持工作流调用和单任务调用。
 * - 执行两个核心操作：
 *   1. 启用商品主数据 (使用CMG编码)
 *   2. 启用店铺内商品 (使用CSG编码，通过上传Excel)
 */
import {
  enableStoreProducts,
  getDisabledProducts,
  uploadStatusUpdateFile
} from '../services/jdApiService.js'
import * as XLSX from 'xlsx'
import { saveExcelFile } from '../utils/fileUtils.js'

const TEMP_DIR_NAME = '启用店铺商品'

/**
 * 主执行函数
 * @param {object} context - 上下文对象
 * @param {function | object} updateFn - 更新函数或 sessionData
 * @param {object} sessionData - 单任务模式下的 sessionData
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, updateFn, sessionData) {
  // 1. 兼容不同调用方式，确保参数正确
  if (typeof updateFn !== 'function') {
    sessionData = updateFn
    updateFn = () => { }
  }

  const messages = []

  try {
    // 2. 统一获取需要检查的SKU列表
    const skusToCheck = context.skus || (context.allProductData ? context.allProductData.map(p => p.sellerGoodsSign) : [])
    if (skusToCheck.length === 0) {
      return { success: true, message: '没有需要检查的SKU，任务结束。' }
    }

    // 3. 查询已停用的商品 (核心)
    updateFn({ message: `正在查询 ${skusToCheck.length} 个SKU中已停用的商品...` })
    const disabledProducts = await getDisabledProducts(skusToCheck, sessionData)

    if (disabledProducts.length === 0) {
      const message = '所有被检查的商品状态均为启用，无需操作。'
      updateFn({ message, isCompleted: true })
      return { success: true, message }
    }
    updateFn({ message: `查询到 ${disabledProducts.length} 个已停用的商品，准备执行启用操作...` })

    // 4. 操作一：启用商品主数据 (使用CMG)
    const cmgList = disabledProducts.map((p) => p.goodsNo).filter(Boolean)
    if (cmgList.length > 0) {
      const numericCmgs = cmgList.map((cmg) => cmg.replace('CMG', ''))
      updateFn({ message: `正在启用 ${numericCmgs.length} 个商品主数据...` })
      const result = await enableStoreProducts(numericCmgs, sessionData)
      if (result.resultCode !== 1) throw new Error(`启用主数据失败: ${result.resultMessage}`)
      messages.push(`启用主数据成功(${numericCmgs.length}个)`)
    }

    // 5. 操作二：启用店铺商品 (使用CSG)
    const csgList = disabledProducts.map((p) => p.shopGoodsNo).filter(Boolean)
    if (csgList.length > 0) {
      updateFn({ message: `正在通过上传文件启用 ${csgList.length} 个店铺商品...` })
      const headers = ['店铺商品编号 (CSG编码)', '商品状态(1启用, 2停用)']
      const dataRows = csgList.map((csg) => [csg, 1])
      const excelData = [headers, ...dataRows]
      const ws = XLSX.utils.aoa_to_sheet(excelData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      const fileBuffer = XLSX.write(wb, { bookType: 'xls', type: 'buffer' })

      await saveExcelFile(fileBuffer, {
        dirName: TEMP_DIR_NAME,
        store: { shopName: context.store?.name },
        extension: 'xls'
      })

      const uploadResult = await uploadStatusUpdateFile(fileBuffer, { ...sessionData, ...context })
      const match = uploadResult.message.match(/成功(?:导入|更新)\s*(\d+)\s*条/)
      const successCount = match ? match[1] : csgList.length
      messages.push(`启用店铺商品成功(${successCount}个)`)
    }

    // 6. 返回最终结果
    const finalMessage = messages.join('; ') || '没有需要启用的商品。'
    updateFn({ message: finalMessage, isCompleted: true })
    return { success: true, message: finalMessage }
  } catch (error) {
    const errorMessage = `任务执行出错: ${error.message}`
    console.error(`[Task: enableStoreProducts] ${errorMessage}`, error)
    updateFn({ message: errorMessage, error: true })
    throw error
  }
}

export default {
  name: 'enableStoreProducts',
  description: '启用店铺商品（包含主数据和店铺内状态）',
  execute: execute
}
