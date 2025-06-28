import { executeTask } from '../../services/apiService'

export default {
  name: 'enableStoreProducts',
  label: '启用店铺商品',

  /**
   * 执行启用店铺商品功能
   * @param {object} context - 包含 skus 和 store 的上下文对象
   * @param {object} helpers - 日志记录和进度更新的辅助函数对象
   * @returns {Promise<Object>} 执行结果
   */
  async execute(context, helpers) {
    const { skus, store } = context

    helpers.log(`开始执行 [${this.label}] 功能...`)

    // 关键信息校验
    if (!store || !store.id || !store.deptId || !store.sellerId) {
      const errorMsg = '缺失店铺、部门或供应商的ID信息，无法继续。'
      helpers.log(errorMsg, 'error')
      throw new Error(errorMsg)
    }
    if (!skus || skus.length === 0) {
      helpers.log('SKU列表为空，无需执行。')
      return { success: true, message: 'SKU列表为空，跳过执行。' }
    }

    helpers.log(`店铺: ${store.shopName || store.id}, 正在处理 ${skus.length} 个SKU...`)

    // 构建后端任务所需的payload
    const payload = {
      skus,
      store: { id: store.id, name: store.shopName },
      department: { id: store.deptId, name: store.deptName },
      vendor: { id: store.sellerId, name: store.sellerName || store.sellerNo }
    }

    try {
      helpers.log('正在调用后端服务执行启用操作...')
      const result = await executeTask('enableStoreProducts', payload)

      if (result.success) {
        helpers.log(result.message, 'success')
        return { success: true, message: result.message, data: result.data }
      } else {
        throw new Error(result.message || '后端任务执行失败')
      }
    } catch (error) {
      helpers.log(`[${this.label}] 功能执行失败: ${error.message}`, 'error')
      throw error // 重新抛出错误，以便上层调用者可以捕获
    }
  }
}
