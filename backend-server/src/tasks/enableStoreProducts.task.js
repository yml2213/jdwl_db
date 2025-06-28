/**
 * 后端任务：启用店铺商品
 */
import { getDisabledProducts, enableProductsByCSG } from '../services/jdApiService.js'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, store, department, vendor
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
  const { skus, store, department, vendor } = context

  // 1. 参数校验
  if (!skus || skus.length === 0) {
    return { success: true, message: 'SKU列表为空，无需操作。' }
  }
  if (!store || !department || !vendor) {
    throw new Error('缺少有效的店铺、部门或供应商信息。')
  }
  if (!sessionData || !sessionData.sessionId) {
    throw new Error('缺少会话ID')
  }

  console.log(`[Task: enableStoreProducts] "启用店铺商品" 开始，店铺 [${store.name}]...`)

  try {
    // 准备调用API所需的数据，合并上下文和会话信息
    const dataForApi = { ...sessionData, store, department, vendor }

    // 2. 查询停用的商品
    console.log(`[Task: enableStoreProducts] 正在查询 ${skus.length} 个SKU的状态...`)
    const disabledProducts = await getDisabledProducts(skus, dataForApi)

    if (!disabledProducts || disabledProducts.length === 0) {
      console.log('[Task: enableStoreProducts] 所有商品状态正常，无需启用。')
      return { success: true, message: '所有商品状态均正常，无需启用。' }
    }

    // 3. 提取CSG编号并启用商品
    const csgNumbers = disabledProducts.map((p) => p.shopGoodsNo)
    console.log(`[Task: enableStoreProducts] 发现 ${csgNumbers.length} 个停用商品，准备启用...`)

    const result = await enableProductsByCSG(csgNumbers, dataForApi)

    console.log('[Task: enableStoreProducts] "启用店铺商品" 任务成功完成。')
    return { success: true, message: `成功启用 ${csgNumbers.length} 个商品。`, data: result }
  } catch (error) {
    console.error('[Task: enableStoreProducts] 任务执行失败:', error)
    throw new Error(`启用店铺商品失败: ${error.message}`)
  }
}

export default {
  name: 'enableStoreProducts',
  execute: execute
}
