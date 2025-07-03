/**
 * 后端任务：启用店铺商品
 * 直接调用API以启用指定的商品主数据。
 * 此任务现在作为 "入仓打标" 工作流的一部分被调用。
 */
import { enableStoreProducts } from '../services/jdApiService.js'

/**
 * 主执行函数 - 由工作流调用
 * @param {object} context 包含 csgList
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
  const { csgList } = context

  if (!csgList || csgList.length === 0) {
    return { success: true, message: '商品列表为空，无需启用。' }
  }

  try {
    console.log(`[Task: enableStoreProducts] 开始启用 ${csgList.length} 个商品...`)

    const result = await enableStoreProducts(csgList, sessionData)
    console.log('[Task: enableStoreProducts] API 调用结果:', result)

    if (result.resultCode !== 1) {
      const errorMessage = `启用商品主数据失败: ${result.resultMessage || '未知错误'}`
      console.error(errorMessage)
      throw new Error(errorMessage)
    }

    const message = `成功请求启用 ${csgList.length} 个商品。`
    console.log(`[Task: enableStoreProducts] ${message}`)
    return { success: true, message }
  } catch (error) {
    console.error('enableStoreProducts 任务执行出错:', error)
    // 将错误向上抛出，由工作流统一处理
    throw error
  }
}

export default {
  name: 'enableStoreProducts',
  description: '启用店铺商品',
  execute: execute
}
