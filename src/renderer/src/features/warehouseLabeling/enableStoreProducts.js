import { queryProductStatus, enableShopProducts } from '../../services/apiService'

/**
 * 检查批次中商品的状态并找出停用的商品
 * @param {object} params - 参数对象
 * @param {Array<string>} params.skus - 商品SKU列表
 * @param {string} params.shopNo - 店铺编号
 * @param {string} params.deptNo - 事业部编号
 * @param {object} helpers - 辅助函数，包含 log
 * @returns {Promise<Array<string>>} - 返回停用的SKU列表
 */
async function findDisabledProducts({ skus, shopNo, deptNo }, helpers) {
  const allDisabledProducts = []
  try {
    const QUERY_BATCH_SIZE = 1000
    const skuGroups = []
    for (let i = 0; i < skus.length; i += QUERY_BATCH_SIZE) {
      skuGroups.push(skus.slice(i, i + QUERY_BATCH_SIZE))
    }
    helpers.log(`将 ${skus.length} 个SKU分成 ${skuGroups.length} 组进行状态查询`)

    for (let i = 0; i < skuGroups.length; i++) {
      const group = skuGroups[i]
      helpers.log(`查询第 ${i + 1}/${skuGroups.length} 组, ${group.length}个SKU...`)
      const statusResult = await queryProductStatus(group, shopNo, deptNo)

      if (statusResult.success && statusResult.disabledItems.length > 0) {
        helpers.log(`发现 ${statusResult.disabledItems.length} 个停用商品`)
        allDisabledProducts.push(...statusResult.disabledItems)
      } else if (!statusResult.success) {
        helpers.log(`查询商品状态出错: ${statusResult.message}`, 'warning')
      }
      if (i < skuGroups.length - 1) await new Promise((r) => setTimeout(r, 500))
    }
  } catch (error) {
    helpers.log(`检查商品状态失败: ${error.message}`, 'error')
    throw error
  }
  return allDisabledProducts
}

export default {
  name: 'enableStoreProducts',
  label: '启用店铺商品',

  /**
   * 执行启用店铺商品功能
   * @param {object} context - 上下文对象
   * @param {object} helpers - 辅助函数对象
   * @returns {Promise<Object>} 执行结果
   */
  async execute(context, helpers) {
    helpers.log(`开始执行 [${this.label}] 功能...`)
    const { skus, store } = context

    if (!store || !store.shopNo || !store.deptNo) {
      throw new Error('未提供有效的店铺或事业部信息 (shopNo, deptNo)')
    }
    const { shopNo, deptNo } = store

    if (!skus || skus.length === 0) {
      helpers.log('SKU列表为空，无需执行。')
      return { success: true, message: 'SKU列表为空，跳过执行。' }
    }
    helpers.log(`店铺: ${shopNo}, 事业部: ${deptNo}`)

    // 1. 查找所有停用的商品
    const disabledSkus = await findDisabledProducts({ skus, shopNo, deptNo }, helpers)
    helpers.log(`状态检查完成，共发现 ${disabledSkus.length} 个停用商品。`)

    // 2. 如果有停用的商品，则启用它们
    if (disabledSkus.length > 0) {
      helpers.log(`准备启用 ${disabledSkus.length} 个商品...`)
      const enableResult = await enableShopProducts({ shopNo, deptNo, skuList: disabledSkus })

      if (enableResult.success) {
        helpers.log(`成功启用 ${disabledSkus.length} 个商品。`, 'success')
        return { success: true, message: `成功启用 ${disabledSkus.length} 个商品。` }
      } else {
        throw new Error(enableResult.message || '启用商品时发生未知 API 错误')
      }
    }

    helpers.log('所有商品状态正常，无需启用。', 'success')
    return { success: true, message: '所有商品状态均正常。' }
  },

  /**
   * 处理启用店铺商品结果
   * @returns {Promise<Object>} 处理结果
   */
  async handleResult() {
    // 启用店铺商品功能结果已经在execute方法中完成，不需要额外处理
    return null
  }
}
