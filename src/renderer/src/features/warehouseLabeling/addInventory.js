import { getAllCookies } from '../../utils/cookieHelper'
import { getCMGBySkuList } from '../../services/apiService'
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
 * @param {object} context - 上下文对象
 * @param {object} helpers - 辅助函数
 * @returns {Promise<Object>} 上传结果
 */
async function _uploadInventoryData(goodsList, context, helpers) {
  const { log } = helpers
  try {
    log(`通过IPC调用主进程添加库存，商品数量: ${goodsList.length}`, 'debug')

    // 获取 cookies 和 csrfToken
    const cookies = await getAllCookies()
    const tokenCookie = cookies.find((c) => c.name === 'csrfToken')
    const csrfToken = tokenCookie ? tokenCookie.value : ''

    // 将 goodsList, cookies, csrfToken 添加到 context 中，以便传递给主进程
    const newContext = { ...context, goodsList, cookies, csrfToken }

    // 克隆对象以移除响应式代理，防止IPC错误
    const plainContext = JSON.parse(JSON.stringify(newContext))

    // 通过IPC调用主进程执行上传
    const result = await window.api.addInventory(plainContext)

    log('主进程添加库存操作结果:', 'debug', result)

    // 返回主进程的处理结果
    return result
  } catch (error) {
    console.error('调用主进程添加库存失败:', error)
    log(`调用主进程添加库存失败: ${error.message}`, 'error')
    return { success: false, message: `客户端错误: ${error.message}` }
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
  const { skus: skuList, task, store, warehouse } = context
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

    const goodsList = await getCMGBySkuList(skuList, inventoryAmount, store, warehouse)
    if (!goodsList || goodsList.length === 0) throw new Error('获取商品列表失败')
    log(`获取到的商品列表数量: ${goodsList.length}`, 'debug')

    const uploadResult = await _uploadInventoryData(goodsList, context, helpers)
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
 * @param {object} context - { skus: skuList, task, options }
 * @param {object} helpers - { log, updateProgress, createBatchTask }
 * @returns {Promise<object>} 执行结果
 */
async function addInventoryExecute(context, helpers) {
  const { skus: skuList, options } = context
  const { log } = helpers || {}

  if (!skuList || !Array.isArray(skuList)) {
    throw new Error('SKU列表无效或缺失。')
  }

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