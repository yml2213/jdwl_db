/**
 * 后端任务：获取商品详情 (包括CSG, CMG等)
 */
import { fetchProductDetails } from '../services/jdApiService.js'

async function execute(context, sessionData) {
  const { skus } = context

  if (!skus || skus.length === 0) {
    return { success: true, message: 'SKU列表为空，无需获取商品详情。' }
  }

  try {
    const result = await fetchProductDetails(skus, sessionData)
    return result
  } catch (error) {
    console.error('[Task: getProductDetails] 任务执行失败:', error)
    throw new Error(`获取商品详情失败: ${error.message}`)
  }
}

export default {
  name: 'getProductDetails',
  description: '获取商品详情 (CSG, CMG等)',
  execute: execute
} 