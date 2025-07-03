/**
 * 批量执行给定函数处理项目列表。
 * @param {object} options - 批处理执行的选项。
 * @param {Array<any>} options.items - 要处理的项目数组。
 * @param {number} options.batchSize - 每批处理的项目数量。
 * @param {number} options.delay - 批次之间的延迟时间（毫秒）。
 * @param {Function} options.batchFn - 对每批项目执行的异步函数。它接收批次项目作为参数。
 * @param {Function} options.log - 日志记录函数。
 * @param {object} options.isRunning - 包含'value'属性的对象，用于检查任务是否应继续执行。
 * @param {object} [options.context={}] - 传递给batchFn的附加上下文对象
 * @returns {Promise<object>} 解析为聚合结果的Promise。
 */
export async function executeInBatches({ items, batchSize, delay, batchFn, log, isRunning, context = {} }) {
  let successCount = 0
  let failureCount = 0
  const totalBatches = Math.ceil(items.length / batchSize)
  let overallMessage = ''

  for (let i = 0; i < items.length; i += batchSize) {
    if (!isRunning.value) {
      log('任务被外部终止。', 'warn')
      break
    }

    const batchNumber = i / batchSize + 1
    const batch = items.slice(i, i + batchSize)
    log(`--- 开始执行第 ${batchNumber}/${totalBatches} 批 ---`, 'info')

    let result = await batchFn(batch, context, i / batchSize, totalBatches)

    // If the batch fails with a rate-limiting error, wait and retry once.
    if (
      result.success === false &&
      result.message &&
      (result.message.includes('频繁操作') || result.message.includes('只能导入一次'))
    ) {
      log(`第 ${batchNumber} 批因频率限制失败。将在 ${delay / 1000} 秒后重试...`, 'warn')
      await new Promise((resolve) => setTimeout(resolve, delay))
      log(`--- 重试第 ${batchNumber}/${totalBatches} 批 ---`, 'info')
      result = await batchFn(batch, context, i / batchSize, totalBatches) // Retry the batch
    }

    if (result.success) {
      successCount++
      overallMessage += `第 ${batchNumber} 批: ${result.message}\n`
      // If successful and not the last batch, wait before proceeding to the next one.
      if (i + batchSize < items.length) {
        log(`--- 第 ${batchNumber} 批完成。等待 ${delay / 1000} 秒... ---`, 'info')
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    } else {
      failureCount++
      overallMessage += `第 ${batchNumber} 批失败: ${result.message}\n`
      log(`第 ${batchNumber} 批失败。停止后续处理。`, 'error')
      break // Stop the entire process on a definitive failure.
    }
  }

  log('所有批次处理完成。', 'info')
  return {
    success: failureCount === 0,
    successCount,
    failureCount,
    message: overallMessage.trim()
  }
}
