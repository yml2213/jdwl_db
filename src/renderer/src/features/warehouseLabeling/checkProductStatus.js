import { queryProductStatus } from '../../services/apiService'
import { getSelectedDepartment, getSelectedShop } from '../../utils/storageHelper'

const BATCH_SIZE = 1000 // 每个请求的最大SKU数量

/**
 * 主执行函数
 * @param {string[]} skusToCheck - 需要检查状态的SKU列表
 * @param {function} log - 日志回调函数
 * @returns {Promise<Object>} - 返回包含已停用和已启用商品列表的对象
 */
async function mainExecute(skusToCheck, log = console.log) {
  if (!skusToCheck || skusToCheck.length === 0) {
    log('没有需要检查状态的SKU。', 'warn')
    return { disabledProducts: [], enabledProducts: [] }
  }

  log(`开始检查 ${skusToCheck.length} 个SKU的状态...`)

  const totalSkus = skusToCheck.length
  let allDisabledProducts = []
  let allEnabledProducts = []
  let processedCount = 0

  for (let i = 0; i < totalSkus; i += BATCH_SIZE) {
    const batch = skusToCheck.slice(i, i + BATCH_SIZE)
    log(`正在处理批次: ${Math.floor(i / BATCH_SIZE) + 1}，包含 ${batch.length} 个SKU...`)

    try {
      // 直接调用apiService中的queryProductStatus
      const { disabledProducts, enabledProducts } = await queryProductStatus(
        batch,
        getSelectedShop(),
        getSelectedDepartment()
      )
      allDisabledProducts = allDisabledProducts.concat(disabledProducts)
      allEnabledProducts = allEnabledProducts.concat(enabledProducts)
      processedCount += batch.length
      log(`批次处理完成。已处理 ${processedCount}/${totalSkus} 个SKU。`)
    } catch (error) {
      log(`处理批次时出错: ${error.message}`, 'error')
      // 这里我们选择记录错误并继续
    }
  }

  log(
    `状态检查完成。停用: ${allDisabledProducts.length}个, 启用: ${allEnabledProducts.length}个。`,
    'success'
  )

  return {
    disabledProducts: allDisabledProducts,
    enabledProducts: allEnabledProducts
  }
}

export default {
  name: 'checkProductStatus',
  label: '检查商品状态(停用)',
  execute: mainExecute
}
