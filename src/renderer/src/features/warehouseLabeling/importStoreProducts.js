/**
 * 功能定义: 导入店铺商品 (前端部分)
 * 只负责收集参数并调用后端任务
 */
import { executeTask } from '../../services/apiService'

/**
 * 主执行函数
 */
async function execute(context, { log, isManual }) {
  const { skus, store } = context

  // 参数校验
  if (!store || !store.spShopNo) throw new Error('缺少有效的店铺信息')
  if (!skus || skus.length === 0) throw new Error('SKU列表为空')

  if (!isManual) {
    log(`任务 "导入店铺商品" 开始...`, 'info')
  }

  log(`正在请求后端执行[导入店铺商品]任务，包含 ${skus.length} 个SKU...`, 'info')

  try {
    // 调用通用的任务执行接口
    const result = await executeTask('importStoreProducts', context)

    if (result && result.success) {
      log('后端任务提交成功。', 'success')
      return result
    } else {
      log(`后端任务执行失败: ${result.message}`, 'error')
      throw new Error(result.message || '后端任务执行失败')
    }
  } catch (error) {
    log(`调用后端任务时发生网络错误: ${error.message}`, 'error')
    throw error
  }
}

export default {
  name: 'importStore',
  label: '导入店铺商品',
  execute: execute
}
