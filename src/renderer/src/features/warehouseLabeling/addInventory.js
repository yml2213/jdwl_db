import { getAllCookies } from '../../utils/cookieHelper'
import { getCMGBySkuList } from '../../services/apiService'
import { getSelectedDepartment, getSelectedWarehouse, getSelectedVendor } from '../../utils/storageHelper'
import { wait } from './utils/taskUtils'

/**
 * 更新任务对象的状态和日志
 * @param {object} task - 要更新的任务对象
 * @param {string} status - 新的状态 ('处理中', '成功', '失败')
 * @param {Array<string>} messages - 结果消息数组
 * @param {Array<object>} logs - 新的日志条目
 */
function _updateTask(task, status, messages = [], logs = null) {
  if (!task) return
  task.状态 = status
  task.结果 = messages
  if (logs) {
    task.importLogs = logs
  }
}

/**
 * 上传库存数据
 * @param {Array} goodsList - 商品列表数据
 * @param {object} helpers - 辅助函数
 * @returns {Promise<Object>} 上传结果
 */
async function _uploadInventoryData(goodsList, helpers) {
  const { log } = helpers
  try {
    log(`处理批次商品数量: ${goodsList.length}`, 'debug')

    const deptInfo = getSelectedDepartment()
    if (!deptInfo) throw new Error('未选择事业部，无法添加库存')
    log(`事业部信息: ${deptInfo.deptName}`, 'debug')

    const warehouseInfo = getSelectedWarehouse()
    if (!warehouseInfo) throw new Error('未选择仓库，无法添加库存')
    log(`仓库信息: ${warehouseInfo.warehouseName}`, 'debug')

    const vendorInfo = getSelectedVendor()
    if (!vendorInfo) throw new Error('未选择供应商，无法添加库存')
    log(`供应商信息: ${vendorInfo.supplierName}`, 'debug')

    const cookies = await getAllCookies()
    const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
    log(`获取到cookies: ${cookieString ? '已获取' : '未获取'}`, 'debug')

    const goodsJson = JSON.stringify(goodsList)
    log(`商品JSON长度: ${goodsJson.length}`, 'debug')

    let supplierIdValue = vendorInfo.id
    if (typeof supplierIdValue === 'string' && supplierIdValue.match(/^[A-Za-z]+\d+$/)) {
      supplierIdValue = supplierIdValue.replace(/^[A-Za-z]+/, '')
    }
    log(`处理后的供应商ID: ${supplierIdValue}`, 'debug')

    const formData = new FormData()
    formData.append('goodsJson', goodsJson)
    formData.append('deptId', deptInfo.deptId)
    formData.append('deptName', deptInfo.deptName)
    formData.append('warehouseId', warehouseInfo.id)
    formData.append('warehouseName', warehouseInfo.warehouseName)
    formData.append('supplierId', supplierIdValue)
    formData.append('supplierName', vendorInfo.name)
    formData.append('poType', '01')
    formData.append('businessType', '1')
    log('FormData创建完成', 'debug')

    const response = await fetch('https://jdi.jd.com/stock/initialization/import.action', {
      method: 'POST',
      body: formData,
      headers: { Cookie: cookieString }
    })

    if (!response.ok) throw new Error(`网络响应错误: ${response.statusText}`)

    const responseData = await response.json()
    log(`库存导入接口响应: ${JSON.stringify(responseData)}`, 'debug')

    if (responseData.resultCode === 1 || responseData.resultCode === '1') {
      return {
        success: true,
        message: `库存添加成功，采购单号: ${responseData.poNo}`,
        poNumber: responseData.poNo,
        processedCount: goodsList.length,
        failedCount: 0
      }
    } else {
      return {
        success: false,
        message: `库存添加失败: ${responseData.message || '未知错误'}`,
        processedCount: 0,
        failedCount: goodsList.length
      }
    }
  } catch (error) {
    log(`上传库存数据出错: ${error.message}`, 'error')
    throw error
  }
}

/**
 * 处理一个批次的SKU
 * @param {object} context - 上下文对象
 * @param {Number} inventoryAmount - 库存数量
 * @param {object} helpers - 辅助函数
 * @returns {Promise<object>} 处理结果
 */
async function _processBatch(context, inventoryAmount, helpers) {
  const { skuList, task } = context
  const { log } = helpers
  const result = {
    success: false,
    message: '',
    importLogs: [],
    results: []
  }
  const startTime = new Date()

  try {
    const batchNumber = task?.批次编号 || 1
    const totalBatches = task?.总批次数 || 1

    const startMessage = `开始处理第${batchNumber}/${totalBatches}批，共${skuList.length}个SKU`
    result.importLogs.push({ type: 'batch-start', message: startMessage, time: startTime.toLocaleString() })
    _updateTask(task, '处理中', [startMessage])

    const goodsList = await getCMGBySkuList(skuList, inventoryAmount)
    if (!goodsList || goodsList.length === 0) throw new Error('获取商品列表失败')
    log(`获取到的商品列表数量: ${goodsList.length}`, 'debug')

    const uploadResult = await _uploadInventoryData(goodsList, helpers)
    const endTime = new Date()

    result.success = uploadResult.success
    result.message = uploadResult.message
    result.results.push(result.message)

    const processingTime = (endTime - startTime) / 1000
    result.importLogs.push({
      type: uploadResult.success ? 'success' : 'error',
      message: result.message,
      time: endTime.toLocaleString(),
      processingTime
    })

    _updateTask(task, uploadResult.success ? '成功' : '失败', result.results, result.importLogs)

    return result
  } catch (error) {
    log(`处理批次出错: ${error.message}`, 'error')
    result.success = false
    result.message = `批次处理失败: ${error.message || '未知错误'}`
    result.results.push(result.message)
    result.importLogs.push({
      type: 'error',
      message: result.message,
      time: new Date().toLocaleString()
    })
    _updateTask(task, '失败', result.results, result.importLogs)
    return result
  }
}

/**
 * 执行添加库存功能
 * @param {object} context - { skuList, task, options }
 * @param {object} helpers - { log, updateProgress, createBatchTask }
 * @returns {Promise<object>} 执行结果
 */
async function addInventoryExecute(context, helpers) {
  const { skuList, options } = context
  const { log } = helpers || {}
  const inventoryAmount = options?.inventoryAmount || 1000
  const BATCH_SIZE = 500
  const totalBatches = Math.ceil(skuList.length / BATCH_SIZE)
  let processedCount = 0
  let failedCount = 0
  const errorMessages = []

  for (let i = 0; i < totalBatches; i++) {
    const batchSkus = skuList.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    try {
      const batchContext = { ...context, skuList: batchSkus }
      const batchResult = await _processBatch(batchContext, inventoryAmount, helpers)
      if (batchResult.success) {
        processedCount += batchSkus.length
      } else {
        failedCount += batchSkus.length
        errorMessages.push(batchResult.message || '一个批次处理失败')
      }
    } catch (error) {
      failedCount += batchSkus.length
      errorMessages.push(error.message || '一个批次处理时发生未知错误')
    }
    if (i < totalBatches - 1) {
      await wait(30000)
    }
  }

  if (failedCount > 0) {
    return {
      success: false,
      message: `添加库存完成，但有 ${failedCount} 个失败。错误: ${errorMessages.join('; ')}`,
      processedCount,
      failedCount
    }
  }

  return {
    success: true,
    message: `成功添加 ${processedCount} 个SKU的库存。`,
    processedCount,
    failedCount
  }
}

export default {
  name: 'addInventory',
  label: '添加库存',
  execute: addInventoryExecute
} 