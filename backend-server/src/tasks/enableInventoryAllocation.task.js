import { executeInBatches } from '../utils/batchProcessor.js'
import * as jdApiService from '../services/jdApiService.js'

const API_BATCH_SIZE = 100 // 接口支持最多100个
const BATCH_DELAY = 1500 // 1.5秒

/**
 * 启用商品库存分配的任务
 * @param {object} context - 来自工作流或前端的数据
 * @param {object[]} context.skus - SKU 生命周期对象数组
 * @param {object} context.store - 店铺信息
 * @param {object} context.department - 事业部信息
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn, skus: skuLifecycles, store, department } = context

  if (!sessionData || !sessionData.jdCookies) {
    updateFn({ message: '错误：缺少会话信息。', type: 'error' })
    throw new Error('缺少会话信息')
  }

  if (!skuLifecycles || skuLifecycles.length === 0) {
    updateFn({ message: '没有需要处理的商品数据。', type: 'info' })
    return { success: true, message: '没有需要处理的商品数据。', data: [] }
  }

  updateFn({ message: `总共需要为 ${skuLifecycles.length} 个商品启用库存分配，将分批处理...` })

  const batchFn = async (batchOfLifecycles) => {
    try {
      const skus = batchOfLifecycles.map((item) => item.sku)
      updateFn({ message: `正在处理批次, SKUs: ${skus.length} 个` })

      // 1. 直接从 context 中构建所有需要的参数
      const goodsIdList = batchOfLifecycles.map((item) => item.data.goodsNo.replace('CMG', ''))
      if (goodsIdList.some((id) => !id)) {
        updateFn({ message: '批次中存在无效的goodsNo，无法提取goodsId。', type: 'error' })
        return { success: false, message: '批次中存在无效的goodsNo。' }
      }
      const goodsIdListStr = JSON.stringify(goodsIdList)

      const shopGoodsMap = batchOfLifecycles.reduce((acc, item) => {
        const goodsId = item.data.goodsNo.replace('CMG', '')
        const key = `${goodsId}_${store.id}`

        // 构建接口需要的产品信息对象
        acc[key] = {
          // ...item.data, // 包含 context 中已有的所有信息
          id: item.data.id, // CSG ID
          shopId: store.id,
          shopNo: store.shopNo,
          shopName: store.shopName,
          sellerId: department.sellerId,
          sellerNo: department.sellerNo,
          sellerName: department.sellerName,
          deptId: department.deptNo.replace('CBU', ''),
          deptNo: department.deptNo,
          deptName: department.name,
          goodsId: goodsId,
          goodsNo: item.data.goodsNo
        }
        return acc
      }, {})

      // console.log('shopGoodsMap---->', shopGoodsMap)

      const shopGoodsMapStr = JSON.stringify(shopGoodsMap)

      const goodsStockConfigsStr = JSON.stringify([
        {
          shopId: String(store.id),
          percent: '100',
          vmiPercent: '100',
          stockWay: '1'
        }
      ])

      // 2. 调用API
      const response = await jdApiService.batchSaveSetting(
        shopGoodsMapStr,
        goodsIdListStr,
        goodsStockConfigsStr,
        sessionData
      )

      if (response && response.success) {
        const msg = `批处理成功，影响 ${batchOfLifecycles.length} 个商品。`
        updateFn({ message: msg, type: 'success' })
        return {
          success: true,
          message: msg,
          data: batchOfLifecycles.map((item) => ({ sku: item.sku }))
        }
      }

      const errorMessage = (response && response.message) || JSON.stringify(response)
      updateFn({ message: `批处理失败: ${errorMessage}`, type: 'error' })
      return { success: false, message: errorMessage }
    } catch (error) {
      const errorMessage = `批处理时发生严重错误: ${error.message}`
      updateFn({ message: errorMessage, type: 'error' })
      return { success: false, message: errorMessage }
    }
  }

  const batchResult = await executeInBatches({
    items: skuLifecycles,
    batchSize: API_BATCH_SIZE,
    delay: BATCH_DELAY,
    delayBetweenBatches: BATCH_DELAY,
    batchFn,
    log: (logData) => updateFn(typeof logData === 'string' ? { message: logData } : logData),
    isRunning: cancellationToken
  })

  if (!batchResult.success) {
    const errorMsg = `任务未完全成功: ${batchResult.message}`
    updateFn({ message: errorMsg, type: 'error' })
    throw new Error(errorMsg)
  }

  updateFn({ message: `任务完成: 成功 ${batchResult.successCount} 批, 失败 ${batchResult.failureCount} 批。` })
  return {
    success: true,
    message: batchResult.message || '任务执行完毕。',
    data: batchResult.data
  }
}

export default {
  name: 'enableInventoryAllocation',
  description: '启用库存商品分配（API）',
  execute
}
