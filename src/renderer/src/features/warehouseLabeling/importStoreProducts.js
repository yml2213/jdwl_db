import { batchProcessSKUs } from '../../services/apiService'
import { getSelectedDepartment } from '../../utils/storageHelper'

export default {
  name: 'importStore',
  label: '导入店铺商品',

  /**
   * 执行导入店铺商品功能
   * @param {Array<string>} skuList - SKU列表
   * @param {Object} shopInfo - 店铺信息
   * @returns {Promise<Object>} 执行结果
   */
  async execute(skuList, shopInfo) {
    // 如果传入的是任务对象，使用其skuList属性
    if (typeof skuList === 'object' && !Array.isArray(skuList) && skuList.skuList) {
      console.log('从任务对象中获取SKU列表:', skuList.skuList.length)
      // 如果shopInfo是任务对象，尝试提取店铺信息
      if (!shopInfo || !shopInfo.shopNo) {
        console.log('店铺信息不完整，尝试从任务对象中获取')
        if (skuList.店铺信息) {
          shopInfo = skuList.店铺信息
        } else if (skuList.店铺) {
          // 如果任务对象中有店铺名称，尝试从全局状态获取完整店铺信息
          console.log('尝试基于店铺名称查找完整店铺信息:', skuList.店铺)
          if (window.currentShopInfo) {
            shopInfo = window.currentShopInfo
          }
        }
      }
      skuList = skuList.skuList
    }

    console.log('执行[导入店铺商品]功能，SKU列表:', skuList)
    console.log('使用店铺信息:', shopInfo ? shopInfo.shopName : '未提供')

    // 获取事业部信息
    const department = getSelectedDepartment()
    if (!department) {
      throw new Error('未选择事业部，无法导入商品')
    }
    console.log('使用事业部信息:', department)

    try {
      // 调用批量处理SKU的功能
      const result = await batchProcessSKUs(
        skuList,
        shopInfo,
        true, // importStore
        false, // useStore
        department
      )

      return {
        success: result.success,
        message: result.message,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount
      }
    } catch (error) {
      console.error('导入店铺商品失败:', error)
      return {
        success: false,
        message: `导入失败: ${error.message || '未知错误'}`,
        processedCount: 0,
        failedCount: skuList.length,
        skippedCount: 0
      }
    }
  },

  /**
   * 处理导入结果
   * @returns {Promise<Object>} 处理结果
   */
  async handleResult() {
    // 导入功能结果已经在execute方法中完成，不需要额外处理
    return null
  }
}
