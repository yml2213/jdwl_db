import { getSelectedDepartment } from '../../utils/storageHelper'
import * as XLSX from 'xlsx'
import { getAllCookies } from '../../utils/cookieHelper'

// 内部API调用和数据处理函数保持不变，但会经过简化
// 注意：这些内部函数现在接收 a `helpers` 对象用于日志记录，并且在出错时会直接抛出异常

async function _callResetGoodsStockRatioAPI(shopInfo) {
  const selectedDepartment = getSelectedDepartment()
  if (!selectedDepartment) {
    throw new Error('未选择事业部')
  }

  const allCookies = await getAllCookies(selectedDepartment.value)
  if (!allCookies) {
    throw new Error('获取Cookies失败')
  }

  // 修复：将 shopInfo 转换为纯对象，避免IPC克隆错误
  const plainShopInfo = { ...shopInfo }

  console.log('调用 reset-goods-stock-ratio, shopInfo:', plainShopInfo, 'dept:', selectedDepartment)

  const response = await window.electron.ipcRenderer.invoke('reset-goods-stock-ratio', {
    cookies: allCookies,
    shopInfo: plainShopInfo,
    departmentInfo: selectedDepartment
  })

  if (!response.success) {
    throw new Error(response.message || '整店清零API调用失败')
  }
  return response
}

async function _callClearanceAPI(skuList, shopInfo) {
  const selectedDepartment = getSelectedDepartment()
  if (!selectedDepartment) {
    throw new Error('未选择事业部')
  }

  const allCookies = await getAllCookies(selectedDepartment.value)
  if (!allCookies) {
    throw new Error('获取Cookies失败')
  }

  const response = await window.electron.ipcRenderer.invoke('upload-stock-allocation-clearance-data', {
    cookies: allCookies,
    skuList,
    shopInfo,
    departmentInfo: selectedDepartment
  })

  if (!response.success) {
    throw new Error(response.message || 'SKU清零API调用失败')
  }
  return response
}

/**
* 处理整店清零的核心逻辑
* @param {object} shopInfo - 店铺信息
* @param {object} helpers - 辅助函数对象 { log }
* @returns {Array} 结果数组
*/
async function _processWholeStoreClearance(shopInfo, { log }) {
  if (!shopInfo || !shopInfo.shopNo) {
    throw new Error('未提供有效的店铺信息，无法执行整店清零')
  }

  log('开始调用整店清零API...')
  const clearanceResult = await _callResetGoodsStockRatioAPI(shopInfo)
  log(`整店清零完成: ${clearanceResult.message}`, 'success')

  return [clearanceResult.message]
}

/**
* 处理一个批次的SKU的核心逻辑
* @param {Array} skuList - SKU列表
* @param {object} shopInfo - 店铺信息
* @param {object} helpers - 辅助函数对象 { log }
* @returns {Array} 结果数组
 */
async function _processBatch(skuList, shopInfo, { log }) {
  log(`开始为 ${skuList.length} 个SKU调用清零API...`)
  const batchResult = await _callClearanceAPI(skuList, shopInfo)
  log(`批处理完成: ${batchResult.message}`, 'success')

  // 返回一个包含处理信息的数组，可以根据需要自定义
  return batchResult.results || [batchResult.message]
}

/**
 * "库存分配清零" 功能的核心执行函数
 * @param {object} context - { skuList, shopInfo, options }
 * @param {object} helpers - { log, updateProgress }
 * @returns {Promise<Array>} - 返回一个包含所有结果信息的数组
   */
async function stockAllocationClearanceExecute(context, helpers) {
  const { skuList, shopInfo } = context
  const { log, updateProgress } = helpers

  if (!skuList || skuList.length === 0) {
    throw new Error('SKU列表为空，无法执行操作')
  }

  // 检查是否是整店操作
  const isWholeStore = skuList.length === 1 && skuList[0] === 'WHOLE_STORE'

  if (isWholeStore) {
    return await _processWholeStoreClearance(shopInfo, helpers)
  }

  // 如果SKU数量大于2000，分批处理
  const BATCH_SIZE = 2000
  if (skuList.length > BATCH_SIZE) {
    log(`SKU数量(${skuList.length})超过${BATCH_SIZE}，将分批处理...`, 'warning')

    const batches = []
    for (let i = 0; i < skuList.length; i += BATCH_SIZE) {
      batches.push(skuList.slice(i, i + BATCH_SIZE))
    }

    log(`已将SKU列表分成 ${batches.length} 个批次。`)
    updateProgress(0, batches.length)

    const allResults = []
    for (let i = 0; i < batches.length; i++) {
      const batchSkuList = batches[i]
      log(`--- 开始处理批次 ${i + 1}/${batches.length} (${batchSkuList.length}个SKU) ---`)

      const batchResult = await _processBatch(batchSkuList, shopInfo, helpers)
      allResults.push(...batchResult)
      updateProgress(i + 1, batches.length)

      log(`--- 批次 ${i + 1}/${batches.length} 处理完毕 ---`)
    }
    return allResults
  }

  // SKU数量不多，直接处理
  return await _processBatch(skuList, shopInfo, helpers)
}

// 导出的新版 "功能定义" 对象
export default {
  name: 'stockAllocationClearance',
  label: '库存分配清零',
  execute: stockAllocationClearanceExecute
} 