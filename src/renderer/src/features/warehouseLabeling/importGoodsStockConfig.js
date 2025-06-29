import { executeTask } from '../../services/apiService'
import { getLocalStorage } from '@/utils/storageHelper'

/**
 * 主执行函数 - 新版
 * 负责调用后端统一任务接口
 */
async function mainExecute(context, helpers) {
  const { skus, csgList } = context
  const { log } = helpers

  log('正在请求后端执行[启用库存商品分配]任务...', 'info')

  const sessionId = getLocalStorage('sessionId')
  if (!sessionId) {
    throw new Error('无法获取会话ID，请重新登录。')
  }

  // 后端任务需要skus或csgList，以及会话ID来获取cookies和其他信息
  const payload = {
    skus,
    csgList,
    sessionId
  }

  // 调用后端通用任务执行接口
  const result = await executeTask('enableInventoryAllocation', payload)

  if (!result.success) {
    throw new Error(result.message || '后端执行库存分配任务失败。')
  }

  log(`后端任务成功完成: ${result.message}`, 'success')
  return result
}

export default {
  name: 'importGoodsStockConfig',
  label: '启用库存商品分配',
  execute: mainExecute
}
