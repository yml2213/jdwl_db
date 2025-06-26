import { getAllCookies } from '../../utils/cookieHelper'
import * as XLSX from 'xlsx'
import { getCSGList_cancelJpSearch, getShopGoodsList } from '../../services/apiService'

// --- 内部核心函数 ---
// 这些函数被简化，移除日志和复杂返回，直接抛出错误。

async function getCSGListFromSkus(skuList, shopInfo, helpers) {
  helpers.log(`正在为 ${skuList.length} 个SKU获取CSG列表...`)
  const plainShopInfo = { ...shopInfo }
  const response = await getCSGList_cancelJpSearch(skuList, plainShopInfo)
  if (!response.success) {
    throw new Error(response.message || '获取CSG列表失败')
  }
  helpers.log(`成功获取 ${response.csgList.length} 条CSG数据。`)
  return response.csgList
}

async function uploadCancelJpSearchData(csgList, shopInfo, helpers) {
  helpers.log(`正在上传 ${csgList.length} 条CSG数据以取消京配...`)

  const allCookies = await getAllCookies()
  if (!allCookies) {
    throw new Error('获取Cookies失败')
  }

  const plainShopInfo = { ...shopInfo }
  const response = await window.electron.ipcRenderer.invoke('upload-cancel-jp-search-data', {
    cookies: allCookies,
    csgList,
    shopInfo: plainShopInfo
  })

  if (!response.success) {
    throw new Error(response.message || '上传取消京配打标数据失败')
  }
  helpers.log(`上传成功: ${response.message}`, 'success')
  return response
}

// --- 新增的通用CSG处理函数 ---
async function processCsgList(csgList, shopInfo, helpers) {
  const { log, updateProgress } = helpers
  const BATCH_SIZE = 2000 // 上传的批处理大小

  if (csgList.length > BATCH_SIZE) {
    log(`CSG总数(${csgList.length})超过${BATCH_SIZE}，将分批上传...`, 'warning')

    const batches = []
    for (let i = 0; i < csgList.length; i += BATCH_SIZE) {
      batches.push(csgList.slice(i, i + BATCH_SIZE))
    }

    log(`已将CSG列表分成 ${batches.length} 个批次。`)
    updateProgress(0, batches.length)

    const allResults = []
    for (let i = 0; i < batches.length; i++) {
      const batchCsgList = batches[i]
      log(`--- 开始上传批次 ${i + 1}/${batches.length} (${batchCsgList.length}个CSG) ---`)

      const batchResult = await uploadCancelJpSearchData(batchCsgList, shopInfo, helpers)
      allResults.push(batchResult.message)

      updateProgress(i + 1, batches.length)
      log(`--- 批次 ${i + 1}/${batches.length} 处理完毕 ---`)
    }
    return allResults
  }

  // CSG数量不多，直接处理
  if (csgList.length > 0) {
    const result = await uploadCancelJpSearchData(csgList, shopInfo, helpers)
    return [result.message]
  }
  return [] // 如果没有CSG，返回空数组
}

/**
 * "取消京配打标" 功能的核心执行函数 (已修正逻辑)
 * @param {object} context - { skuList, shopInfo, options }
 * @param {object} helpers - { log, updateProgress }
 * @returns {Promise<Array>} - 返回一个包含所有结果信息的数组
 */
async function cancelJpSearchExecute(context, helpers) {
  const { skuList, shopInfo } = context
  const { log } = helpers

  if (!skuList || skuList.length === 0) throw new Error('SKU列表为空')
  if (!shopInfo) throw new Error('未提供店铺信息')

  let csgListToProcess = []
  const isWholeStore = skuList.length === 1 && skuList[0] === 'WHOLE_STORE'

  if (isWholeStore) {
    // 【正确逻辑】整店操作：直接获取全店CSG列表
    log('开始整店操作，正在获取全店商品CSG列表...', 'info')
    const plainShopInfo = { ...shopInfo }
    const allGoodsResponse = await getShopGoodsList(plainShopInfo)

    if (!allGoodsResponse.success || !allGoodsResponse.csgList) {
      throw new Error(allGoodsResponse.message || '获取全店商品CSG列表失败')
    }
    csgListToProcess = allGoodsResponse.csgList
    log(`成功获取 ${csgListToProcess.length} 个店铺商品CSG。`, 'success')
  } else {
    // 【正确逻辑】SKU列表操作：将SKU转换为CSG
    csgListToProcess = await getCSGListFromSkus(skuList, shopInfo, helpers)
  }

  if (csgListToProcess.length > 0) {
    // 使用通用处理器来上传CSG列表
    return await processCsgList(csgListToProcess, shopInfo, helpers)
  } else {
    log('未找到需要处理的商品数据。', 'warning')
    return ['未找到可取消京配打标的商品']
  }
}

// 导出的新版 "功能定义" 对象
export default {
  name: 'cancelJpSearch',
  label: '取消京配打标',
  execute: cancelJpSearchExecute
}