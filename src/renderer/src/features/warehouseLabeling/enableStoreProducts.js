import { queryProductStatus } from '../../services/apiService'
import { getSelectedDepartment } from '../../utils/storageHelper'

/**
 * 检查批次中商品的状态并找出停用的商品
 * @param {Array} skuList - 商品SKU列表
 * @param {Object} shopInfo - 店铺信息
 * @param {Number} currentBatch - 当前批次索引
 * @param {Number} totalBatches - 总批次数
 * @param {Array} allDisabledProducts - 收集所有停用商品的数组
 */
async function checkProductStatus(
  skuList,
  shopInfo,
  currentBatch,
  totalBatches,
  allDisabledProducts
) {
  console.log(`开始检查批次 ${currentBatch}/${totalBatches} 的商品状态`)

  try {
    // 获取事业部和店铺信息
    const department = getSelectedDepartment()

    if (!department) {
      throw new Error('缺少事业部信息')
    }

    // 将SKU按1000个一组进行分割
    const QUERY_BATCH_SIZE = 1000
    const skuGroups = []

    for (let i = 0; i < skuList.length; i += QUERY_BATCH_SIZE) {
      skuGroups.push(skuList.slice(i, i + QUERY_BATCH_SIZE))
    }

    console.log(`将${skuList.length}个SKU分成${skuGroups.length}组进行状态查询`)

    // 遍历每个SKU组，查询状态
    for (let groupIndex = 0; groupIndex < skuGroups.length; groupIndex++) {
      const skuGroup = skuGroups[groupIndex]
      console.log(
        `查询第${groupIndex + 1}/${skuGroups.length}组SKU状态，包含${skuGroup.length}个SKU`
      )

      // 调用API查询商品状态
      const statusResult = await queryProductStatus(skuGroup, shopInfo, department)

      if (statusResult.success) {
        if (statusResult.disabledItems.length > 0) {
          console.log(`发现${statusResult.disabledItems.length}个停用商品`)

          // 将找到的停用商品添加到全局列表
          allDisabledProducts.push(...statusResult.disabledItems)
        }
      } else {
        console.warn(`查询商品状态出错: ${statusResult.message}`)
      }

      // 如果不是最后一组，添加短暂延迟避免频繁请求
      if (groupIndex < skuGroups.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    console.log(
      `批次${currentBatch}/${totalBatches}状态检查完成，累计发现${allDisabledProducts.length}个停用商品`
    )
  } catch (error) {
    console.error('检查商品状态失败:', error)
    throw error
  }
}

export default {
  name: 'enableStoreProducts',
  label: '启用店铺商品',

  /**
   * 执行启用店铺商品功能
   * @param {Array<string>} skuList - SKU列表
   * @param {Object} shopInfo - 店铺信息
   * @returns {Promise<Object>} 执行结果
   */
  async execute(skuList, shopInfo) {
    console.log('执行[启用店铺商品]功能，SKU列表:', skuList)
    console.log('选项状态: useStore = true, importStore = false')

    // 获取事业部信息
    const department = getSelectedDepartment()
    if (!department) {
      console.error('未选择事业部，无法启用店铺商品')
      throw new Error('未选择事业部，无法启用店铺商品')
    }

    console.log('使用事业部:', department.deptName)
    console.log('使用店铺:', shopInfo.shopName)

    // 收集停用商品
    const allDisabledProducts = []

    // 查询商品状态
    await checkProductStatus(skuList, shopInfo, 1, 1, allDisabledProducts)

    console.log(`商品状态查询完成，发现${allDisabledProducts.length}个停用商品`)

    return {
      success: true,
      message: `商品状态查询完成，发现${allDisabledProducts.length}个停用商品`,
      disabledProducts: allDisabledProducts,
      skuCount: skuList.length,
      processedCount: skuList.length,
      failedCount: 0,
      skippedCount: 0
    }
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
