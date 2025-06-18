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
      skuList = skuList.skuList
    }

    console.log('执行[导入店铺商品]功能，SKU列表:', skuList)

    // 获取事业部信息
    const department = getSelectedDepartment()
    if (!department) {
      throw new Error('未选择事业部，无法导入商品')
    }

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
