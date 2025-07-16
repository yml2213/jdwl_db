/**
 * 后端任务： 库存分配清零
 * 支持两种模式：
 * 1. 调用API，清零指定SKU的库存。 (依赖 getProductData 任务)
 * 2. 调用API，清零整个店铺的库存。
 */
import * as jdApiService from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'

// 配置常量
const API_BATCH_SIZE = 100
const API_BATCH_DELAY = 1500


async function execute(context, sessionData) {
  const { skus: skuLifecycles, store, department, scope, updateFn } = context

  updateFn('库存分配清零任务开始...')
  updateFn(`操作范围: ${scope === 'whole_store' ? '整店' : '指定SKU'}`)
  updateFn(`输入SKU数量: ${skuLifecycles?.length || 'N/A'}`)
  updateFn(`店铺: ${store?.shopName}`)
  updateFn(`事业部: ${department?.name}`)

  if (!store || !department) throw new Error('缺少店铺或事业部信息')

  if (scope === 'whole_store') {
    // Whole store mode
    updateFn(`[Task: clearStockAllocation] 整店库存清零模式，店铺: ${store.shopName}`)
    const result = await jdApiService.clearStockForWholeStore(
      store.id,
      department.deptNo.split('CBU')[1],
      sessionData,
      updateFn
    )
    updateFn(`[clearStockAllocation] API 返回结果: ${JSON.stringify(result)}`)
    //  {"resultCode":1,"resultMessage":"操作成功！","resultData":null}
    if (result && result.resultCode === 1) {
      const message = result.resultMessage || '整店库存清零成功。'
      updateFn(message)
      return { success: true, message: message }
    } else {
      const errorMessage = result ? JSON.stringify(result) : '整店库存清零失败'
      throw new Error(errorMessage)
    }
  }

  // Specific SKUs mode
  if (!skuLifecycles || skuLifecycles.length === 0) {
    throw new Error('SKU列表为空，无法执行按SKU清零的操作。')
  }

  const productsWithData = skuLifecycles.filter((p) => p.data)
  if (productsWithData.length !== skuLifecycles.length) {
    updateFn(
      `警告: ${skuLifecycles.length - productsWithData.length} 个SKU缺少详细商品数据，将被跳过。`,
      'warning'
    )
  }

  if (productsWithData.length === 0) {
    throw new Error('没有包含有效商品数据的SKU，任务无法继续。')
  }

  updateFn(`[Task: clearStockAllocation] 指定SKU库存清零模式，有效SKU数量: ${productsWithData.length}`)

  const batchFn = async (batchOfLifecycles) => {
    try {
      const skus = batchOfLifecycles.map((item) => item.sku)
      updateFn(`正在处理批次, SKUs: ${skus.length} 个`)

      const goodsIdList = batchOfLifecycles
        .map((item) => item.data.goodsNo?.replace('CMG', ''))
        .filter(Boolean)

      if (goodsIdList.length !== batchOfLifecycles.length) {
        updateFn('批次中部分商品缺少goodsNo，该批次可能不完整。', 'warning')
      }
      if (goodsIdList.length === 0) {
        return { success: true, message: '批次中所有商品都缺少goodsNo，已跳过。' }
      }

      const goodsIdListStr = JSON.stringify(goodsIdList)

      const shopGoodsMap = batchOfLifecycles.reduce((acc, item) => {
        if (!item.data || !item.data.goodsNo) return acc
        const goodsId = item.data.goodsNo.replace('CMG', '')
        const key = `${goodsId}_${store.id}`

        acc[key] = {
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
      const shopGoodsMapStr = JSON.stringify(shopGoodsMap)

      // 核心改动：库存比例设置为0
      const goodsStockConfigsStr = JSON.stringify([
        {
          shopId: String(store.id),
          percent: '0',
          vmiPercent: '0',
          stockWay: '1'
        }
      ])

      const response = await jdApiService.batchSaveSetting(
        shopGoodsMapStr,
        goodsIdListStr,
        goodsStockConfigsStr,
        sessionData
      )

      if (response && response.success) {
        const msg = `批处理成功，为 ${batchOfLifecycles.length} 个商品清零库存分配。`
        updateFn(msg, 'success')
        return { success: true, message: msg }
      } else {
        const errorMessage = (response && response.message) || JSON.stringify(response)
        updateFn(`批处理失败: ${errorMessage}`, 'error')
        return { success: false, message: errorMessage }
      }
    } catch (error) {
      const errorMessage = `批处理时发生严重错误: ${error.message}`
      updateFn(errorMessage, 'error')
      return { success: false, message: errorMessage }
    }
  }

  const batchResults = await executeInBatches({
    items: productsWithData,
    batchSize: API_BATCH_SIZE,
    delay: API_BATCH_DELAY,
    batchFn,
    log: (message, level = 'info') => updateFn(`[批处理]: ${message}`, level),
    isRunning: { value: true }
  })

  if (!batchResults.success) {
    throw new Error(`库存清零任务有失败的批次: ${batchResults.message}`)
  }

  const finalMessage = `所有批次成功完成。 ${batchResults.message}`
  updateFn(finalMessage, 'success')
  return { success: true, message: finalMessage }
}

export default {
  name: 'clearStockAllocation',
  description: '库存分配清零',
  execute: execute
} 