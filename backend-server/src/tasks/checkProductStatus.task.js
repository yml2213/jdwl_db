/**
 * 后端任务：检查并返回指定SKU列表中的停用商品。
 * 该任务旨在将前端的批处理逻辑迁移到后端，简化客户端操作。
 */
import * as jdApiService from '../services/jdApiService.js'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context - 包含 skus, store, department 的上下文对象
 * @param {object} sessionData - 包含会话全部信息的对象, jdApiService会用到
 * @returns {Promise<object>} - 任务执行结果，包含 disabledProducts 和 enabledProducts
 */
async function execute(context, sessionData) {
  const { skus, store, department } = context

  // 1. 参数校验
  if (!skus || skus.length === 0) {
    console.warn('[Task: checkProductStatus] SKU列表为空，任务提前结束。')
    return { success: true, disabledProducts: [], enabledProducts: [] }
  }
  if (!sessionData || !sessionData.jdCookies) {
    throw new Error('缺少有效的会话信息 (sessionData)')
  }
  if (!store || !department) {
    throw new Error('缺少有效的店铺或部门信息')
  }

  console.log(`[Task: checkProductStatus] 开始检查 ${skus.length} 个SKU的状态...`)

  try {
    // 2. 将店铺和部门信息附加到 sessionData 中，因为 getDisabledProducts 需要它们
    const enrichedSessionData = {
      ...sessionData,
      store: store,
      departmentInfo: department
    }

    // 3. 调用 jdApiService 中的核心逻辑
    const { disabledProducts, enabledProducts } = await jdApiService.getDisabledProducts(
      skus,
      enrichedSessionData
    )

    console.log(
      `[Task: checkProductStatus] 状态检查完成。停用: ${disabledProducts.length}个, 启用: ${enabledProducts.length}个。`
    )

    // 4. 返回成功结果
    return {
      success: true,
      message: '商品状态检查成功',
      disabledProducts,
      enabledProducts
    }
  } catch (error) {
    console.error('[Task: checkProductStatus] 任务执行失败:', error)
    // 确保抛出错误，以便上层API可以捕获并返回给前端
    throw new Error(`检查商品状态失败: ${error.message}`)
  }
}

export default {
  name: 'checkProductStatus',
  description: '检查商品状态并返回停用列表',
  execute: execute
}
