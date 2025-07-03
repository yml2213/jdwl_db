/**
 * 后端任务：获取商品详情 (包括CSG, CMG等)
 */
import * as jdApiService from '../services/jdApiService.js'

async function execute(context, sessionData) {
  const { skus } = context

  if (!skus || skus.length === 0) {
    return { success: true, message: 'SKU列表为空，无需获取商品详情。' }
  }

  try {
    const result = await jdApiService.fetchProductDetails(skus, sessionData)
    return { success: true, data: result }
  } catch (error) {
    console.error('获取商品详情时出错:', error)
    throw error
  }
}

export default {
  name: 'getProductDetails',
  description: '获取商品详情 (CSG, CMG等)',
  execute
} 