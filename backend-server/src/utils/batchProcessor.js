/**
 * 批量执行给定函数处理项目列表。
 * @param {object} options - 批处理执行的选项。
 * @param {Array<any>} options.items - 要处理的项目数组。
 * @param {number} options.batchSize - 每批处理的项目数量。
 * @param {number} options.delay - 批次之间的延迟时间（毫秒）。
 * @param {Function} options.batchFn - 对每批项目执行的异步函数。它接收批次项目作为参数。
 * @param {Function} options.log - 日志记录函数。
 * @param {object} options.isRunning - 包含'value'属性的对象，用于检查任务是否应继续执行。
 * @returns {Promise<object>} 解析为聚合结果的Promise。
 */
export async function executeInBatches({ items, batchSize, delay, batchFn, log, isRunning }) {
  let successCount = 0
  let failureCount = 0
  const totalBatches = Math.ceil(items.length / batchSize)
  let overallMessage = ''

  for (let i = 0; i < items.length; i += batchSize) {
    if (!isRunning.value) {
      log('Task was stopped externally.', 'warn')
      break
    }

    const batchNumber = i / batchSize + 1
    const batch = items.slice(i, i + batchSize)
    log(`--- Starting batch ${batchNumber}/${totalBatches} ---`, 'info')

    let result = await batchFn(batch)

    // If the batch fails with a rate-limiting error, wait and retry once.
    if (
      result.success === false &&
      result.message &&
      (result.message.includes('频繁操作') || result.message.includes('只能导入一次'))
    ) {
      log(`Batch ${batchNumber} failed due to rate limiting. Retrying in ${delay / 1000}s...`, 'warn')
      await new Promise((resolve) => setTimeout(resolve, delay))
      log(`--- Retrying batch ${batchNumber}/${totalBatches} ---`, 'info')
      result = await batchFn(batch) // Retry the batch
    }

    if (result.success) {
      successCount++
      overallMessage += `Batch ${batchNumber}: ${result.message}\n`
      // If successful and not the last batch, wait before proceeding to the next one.
      if (i + batchSize < items.length) {
        log(`--- Batch ${batchNumber} finished. Waiting for ${delay / 1000}s... ---`, 'info')
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    } else {
      failureCount++
      overallMessage += `Batch ${batchNumber} failed: ${result.message}\n`
      log(`Batch ${batchNumber} failed. Halting further processing.`, 'error')
      break // Stop the entire process on a definitive failure.
    }
  }

  log('All batches processed.', 'info')
  return {
    success: failureCount === 0,
    successCount,
    failureCount,
    message: overallMessage.trim()
  }
}
