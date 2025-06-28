/**
 * 后端任务：启用店铺商品
 */
import XLSX from 'xlsx'
import { getDisabledProducts, uploadStatusUpdateFile } from '../services/jdApiService.js'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, store, department, vendor
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
  const { skus, store } = context

  // 1. 参数校验
  if (!skus || skus.length === 0) {
    return { success: true, message: 'SKU列表为空，无需操作。' }
  }
  if (!store) {
    throw new Error('缺少有效的店铺信息。')
  }
  if (!sessionData || !sessionData.sessionId) {
    throw new Error('缺少会话ID')
  }

  console.log(`[Task: enableStoreProducts] "启用店铺商品" 开始，店铺 [${store.name}]...`)

  try {
    // 准备调用API所需的数据，合并上下文和会话信息
    const dataForApi = { ...sessionData, store }

    // 2. 查询停用的商品
    console.log(`[Task: enableStoreProducts] 正在查询 ${skus.length} 个SKU的状态...`)
    const disabledProducts = await getDisabledProducts(skus, dataForApi)

    if (!disabledProducts || disabledProducts.length === 0) {
      console.log('[Task: enableStoreProducts] 所有商品状态正常，无需启用。')
      return { success: true, message: '所有商品状态均正常，无需启用。' }
    }

    // 3. 提取CSG编号并创建Excel文件
    const csgNumbers = disabledProducts.map((p) => p.shopGoodsNo)
    console.log(
      `[Task: enableStoreProducts] 发现 ${csgNumbers.length} 个停用商品，准备通过上传文件启用...`
    )

    // 创建Excel数据
    const headers = ['店铺商品编号 (CSG编码)', '商品状态(1启用, 2停用)']
    const dataRows = csgNumbers.map((csg) => [csg, 1])
    const excelData = [headers, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const fileBuffer = XLSX.write(wb, { bookType: 'xls', type: 'buffer' })

    // 4. 上传文件以启用商品
    const result = await uploadStatusUpdateFile(fileBuffer, dataForApi)

    console.log('[Task: enableStoreProducts] "启用店铺商品" 任务成功完成。')
    // 从返回的HTML中提取有用的信息
    const match = result.message.match(/成功(?:导入|更新)\s*(\d+)\s*条/)
    const successCount = match ? match[1] : csgNumbers.length

    return { success: true, message: `成功启用 ${successCount} 个商品。` }
  } catch (error) {
    console.error('[Task: enableStoreProducts] 任务执行失败:', error)
    throw new Error(`启用店铺商品失败: ${error.message}`)
  }
}

export default {
  name: 'enableStoreProducts',
  description: '启用店铺商品',
  execute: execute
}
