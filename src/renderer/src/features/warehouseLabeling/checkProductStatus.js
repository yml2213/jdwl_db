import { batchProcessSKUs } from '../../services/apiService'
import { getSelectedDepartment } from '../../utils/storageHelper'

export default {
  name: 'checkProductStatus',
  label: '查询商品状态',

  /**
   * 执行查询商品状态功能
   * @param {Array<string>} skuList - SKU列表
   * @param {Object} shopInfo - 店铺信息
   * @returns {Promise<Object>} 执行结果
   */
  async execute(skuList, shopInfo) {
    console.log('执行[查询商品状态]功能，SKU列表:', skuList)

    // 获取事业部信息
    const department = getSelectedDepartment()
    if (!department) {
      throw new Error('未选择事业部，无法查询商品状态')
    }

    // 调用批量处理SKU的功能，仅查询状态
    const result = await batchProcessSKUs(
      skuList,
      shopInfo,
      false, // importStore
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
  },

  /**
   * 处理查询结果
   * @returns {Promise<Object>} 处理结果
   */
  async handleResult() {
    // 查询状态功能结果已经在execute方法中完成，不需要额外处理
    return null
  }
}
