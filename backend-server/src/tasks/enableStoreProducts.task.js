/**
 * 后端任务：启用店铺商品
 * 这个任务有双重职责:
 *   1. 启用商品主数据 (使用CMG编码，直接调用API)
 *   2. 启用店铺内商品 (使用CSG编码，通过上传Excel)
 * 核心逻辑是先找出已停用的商品，然后只对它们执行以上两个操作。
 * 
 * [jdApiService] 尝试上传商品状态更新文件 (importUpdateShopGoodsStatus.do)...
 * [jdApiService] 文件上传成功，响应: { resultCode: 0, resultMessage: '超过限制的最大数500' }
 * 
 * 
 * 
 */
import * as jdApiService from '../services/jdApiService.js'
import * as XLSX from 'xlsx'
import { saveExcelFile } from '../utils/fileUtils.js'

const TEMP_DIR_NAME = '启用店铺商品'

/**
 * @param {object} context
 * @param {object[]} context.skus - SKU 生命周期对象数组
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn, skus: skuLifecycles } = context;

  if (!sessionData || !sessionData.jdCookies) {
    const errorMsg = '错误: 缺少会话信息'
    updateFn({ message: errorMsg, type: 'error' })
    throw new Error(errorMsg)
  }

  const messages = []

  try {
    updateFn({ message: '开始执行 "启用店铺商品" 任务...' });

    if (!skuLifecycles || skuLifecycles.length === 0) {
      const msg = '没有需要检查的SKU，任务结束。'
      updateFn({ message: msg, type: 'info' })
      return { success: true, message: msg, data: [] }
    }

    const skusToCheck = skuLifecycles.map(item => item.sku);

    if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

    updateFn({ message: `正在查询 ${skusToCheck.length} 个SKU中已停用的商品...` })
    const disabledProducts = await jdApiService.getDisabledProducts(skusToCheck, sessionData)

    if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

    // 查询已停用的商品主数据
    const disabledProductsMasterData = await jdApiService.getDisabledProductMasterDataBySkus(skusToCheck, sessionData)


    // 检查是否有需要启用的商品
    const hasDisabledItems = disabledProducts.length > 0 || disabledProductsMasterData.length > 0

    if (!hasDisabledItems) {
      const message = '所有被检查的商品和商品主数据均为启用状态，无需操作。'
      updateFn({ message, type: 'info' })
      // 即使没有禁用的商品，任务也算成功完成了对所有SKU的"检查"
      return { success: true, message, data: skusToCheck.map(sku => ({ sku })) }
    }

    // 输出详细的检查结果
    updateFn({
      message: `检查结果: 发现${disabledProducts.length}个停用商品, ${disabledProductsMasterData.length}个停用商品主数据`,
      type: 'info'
    })




    // 启用商品主数据 是根据商品主数据编号（CMG编码）来启用的，所以需要查询已停用的商品主数据
    const cmgList = disabledProductsMasterData.map(item => item.goodsNo).filter(Boolean)

    if (cmgList.length > 0) {
      updateFn({ message: `正在启用 ${cmgList.length} 个商品主数据...` })

      // 创建进度更新函数
      const progressUpdateFn = (message) => {
        updateFn({ message, type: 'info' })
      }

      const result = await jdApiService.enableStoreProducts(
        cmgList,
        sessionData,
        progressUpdateFn,
        cancellationToken
      )

      if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

      if (!result.success) throw new Error(`启用主数据失败`)
      const msg = `启用主数据成功(${cmgList.length}个)`
      messages.push(msg)
      updateFn({ message: msg, type: 'success' })
    }

    // 启用店铺商品 是根据店铺商品编号（CSG编码）来启用的，所以需要查询已停用的店铺商品
    updateFn({ message: `查询到 ${disabledProducts.length} 个已停用的商品，准备执行启用操作...` })
    const csgList = disabledProducts.map((p) => p.shopGoodsNo).filter(Boolean)
    if (csgList.length > 0) {
      updateFn({ message: `正在通过上传文件启用 ${csgList.length} 个店铺商品...` })
      const fileBuffer = createStatusUpdateExcel(csgList)
      const filePath = await saveExcelFile(fileBuffer, {
        dirName: TEMP_DIR_NAME,
        store: context.store,
        extension: 'xls'
      })
      updateFn({ message: `状态更新Excel文件已保存到: ${filePath}` })
      const uploadResult = await jdApiService.uploadStatusUpdateFile(fileBuffer, {
        ...sessionData,
        ...context
      })

      if (!cancellationToken.value) return { success: false, message: '任务已取消。' }

      const match = uploadResult.message.match(/成功(?:导入|更新)\s*(\d+)\s*条/)
      const successCount = match ? parseInt(match[1], 10) : csgList.length
      const msg = `启用店铺商品成功(${successCount}个)`
      messages.push(msg)
      updateFn({ message: msg, type: 'success' })
    }

    const finalMessage = `任务完成: ${messages.join('; ')}`
    updateFn({ message: finalMessage, type: 'success' });

    // 返回已处理（即之前被禁用）的商品的SKU列表
    const processedSkus = disabledProducts.map(p => ({ sku: p.sellerGoodsSign }));

    return { success: true, message: finalMessage, data: processedSkus }
  } catch (error) {
    if (!cancellationToken.value) {
      const cancelMsg = '任务在执行中被用户取消。'
      updateFn({ message: cancelMsg, type: 'error' })
      return { success: false, message: cancelMsg }
    }
    const errorMsg = `[启用店铺商品] 任务执行失败: ${error.message}`
    updateFn({ message: errorMsg, type: 'error' })
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
  execute,
}
