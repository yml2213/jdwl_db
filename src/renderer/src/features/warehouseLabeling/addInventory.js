import { getAllCookies } from '../../utils/cookieHelper'
import { getCMGBySkuList } from '../../services/apiService'
import { executeInBatches } from './utils/taskUtils'

const BATCH_SIZE = 500
const BATCH_DELAY = 30 * 1000 // 30 seconds

/**
 * 主执行函数
 * @param {object} context - { skus, store, warehouse, options }
 * @param {object} helpers - { log, isRunning }
 * @returns {Promise<object>} 执行结果
 */
async function addInventoryExecute(context, helpers) {
  const { skus: skuList, options, store, warehouse } = context
  const { log, isRunning } = helpers

  if (!skuList || !Array.isArray(skuList) || skuList.length === 0) {
    throw new Error('SKU列表无效或为空。')
  }

  if (!store || !warehouse) {
    throw new Error('店铺或仓库信息不完整。')
  }

  const inventoryAmount = options?.inventoryAmount || 1000
  log(`开始添加库存，每个SKU将添加 ${inventoryAmount} 个库存。`)

  const cookies = await getAllCookies()
  const tokenCookie = cookies.find((c) => c.name === 'csrfToken')
  const csrfToken = tokenCookie ? tokenCookie.value : ''
  if (!csrfToken) {
    log('未能获取到csrfToken，可能导致请求失败。', 'warning')
  }

  const batchFn = async (batchSkus) => {
    try {
      log(`正在为 ${batchSkus.length} 个SKU获取商品信息...`, 'info')
      const goodsList = await getCMGBySkuList(batchSkus, inventoryAmount, store, warehouse)
      if (!goodsList || goodsList.length === 0) {
        throw new Error('获取商品列表(CMG)失败或列表为空')
      }
      log(`获取到 ${goodsList.length} 个商品信息，准备上传。`, 'info')

      const plainContext = JSON.parse(
        JSON.stringify({ ...context, goodsList, cookies, csrfToken })
      )

      return await window.api.addInventory(plainContext)
    } catch (error) {
      log(`批次处理失败: ${error.message}`, 'error')
      return { success: false, message: error.message }
    }
  }

  const result = await executeInBatches({
    items: skuList,
    batchSize: BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log,
    isRunning
  })

  if (result.success) {
    log('所有批次的库存添加任务均已成功提交。', 'success')
  } else {
    log(`库存添加任务部分或全部失败: ${result.message}`, 'error')
    throw new Error(result.message || '库存添加任务执行失败')
  }

  return { success: result.success, message: result.message }
}

export default {
  name: 'addInventory',
  label: '添加库存',
  execute: addInventoryExecute
} 