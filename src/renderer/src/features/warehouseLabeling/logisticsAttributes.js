/**
 * 功能定义: 导入物流属性 (前端部分)
 * 改为调用后端任务
 */
import { executeTask } from '../../services/apiService'

export default {
  name: 'logisticsAttributes',
  label: '导入物流属性',
  execute: async (context, helpers) => {
    const { log } = helpers
    const { skus, store, csgList, options } = context

    log('开始执行[导入物流属性]流程...')

    // 1. 参数校验
    if (!store || !store.deptNo) {
      throw new Error('无法获取有效的事业部信息，流程终止。')
    }
    const itemsToProcess = csgList || skus
    if (!itemsToProcess || itemsToProcess.length === 0) {
      helpers.log('商品列表为空，无需执行。', 'warn')
      return { success: true, message: '商品列表为空，跳过执行。' }
    }

    log(`将为 ${itemsToProcess.length} 个商品请求后端导入物流属性...`, 'info')

    // 2. 构建后端任务所需的payload
    const payload = {
      skus,
      csgList,
      store,
      logisticsOptions: options?.logistics || {}
    }

    try {
      // 3. 调用通用的任务执行接口
      const result = await executeTask('importLogisticsAttributes', payload)

      console.log(`[导入物流属性] 前端收到结果======>`, result)

      if (result && result.success) {
        log('后端任务[导入物流属性]成功完成。', 'success')
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
}
