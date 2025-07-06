/**
 * 批量执行给定函数处理项目列表。
 * @param {object} options - 批处理执行的选项。
 * @param {Array<any>} options.items - 要处理的项目数组。
 * @param {number} options.batchSize - 每批处理的项目数量。
 * @param {number} options.delay - 批次之间的延迟时间（毫秒）。
 * @param {Function} options.batchFn - 对每批项目执行的异步函数。它接收批次项目作为参数。
 * @param {Function} options.log - 日志记录函数。
 * @param {object} options.isRunning - 包含'value'属性的对象，用于检查任务是否应继续执行。
 * @param {number} [options.delayBetweenBatches=0] - 成功批次之间的可选延迟（毫秒）。
 * @param {object} [options.context={}] - 传递给batchFn的附加上下文对象
 * @returns {Promise<object>} 解析为聚合结果的Promise。
 */
export async function executeInBatches({
  items,
  batchSize,
  delay,
  batchFn,
  log,
  isRunning,
  context = {},
  delayBetweenBatches = 0
}) {
  let successCount = 0
  let failureCount = 0
  const totalBatches = Math.ceil(items.length / batchSize)
  const messages = []

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
      (result.message.includes('频繁操作') ||
        result.message.includes('只能导入一次') ||
        result.message.includes('请稍后再试'))
    ) {
      const retryDelay = delay // 使用主 'delay' 作为重试延迟
      log(`第 ${batchNumber} 批因频率限制失败。将在 ${retryDelay / 1000} 秒后重试...`, 'warn')
      // 向前端发送等待状态
      log({
        event: 'waiting',
        message: `第 ${batchNumber} 批触发频率限制，将在 ${retryDelay / 1000} 秒后重试...`,
        delay: retryDelay
      })

      // 在实际等待之前检查任务是否已取消
      if (!isRunning.value) {
        log('任务在等待重试前被终止。', 'warn')
        break
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay))

      // 在重试前再次检查
      if (!isRunning.value) {
        log('任务在重试前被终止。', 'warn')
        break
      }

      log(`--- 重试第 ${batchNumber}/${totalBatches} 批 ---`, 'info')
      result = await batchFn(batch, context, i / batchSize, totalBatches) // Retry the batch
    }

    if (result.success) {
      successCount++
      if (result.message) messages.push(result.message)
      // 如果成功且不是最后一批，并且设置了批次间延迟，则等待
      if (i + batchSize < items.length && delayBetweenBatches > 0) {
        log(`--- 第 ${batchNumber} 批完成。等待 ${delayBetweenBatches / 1000} 秒... ---`, 'info')
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches))
      }
    } else {
      failureCount++
      if (result.message) messages.push(`第 ${batchNumber} 批失败: ${result.message}`);
      log(`第 ${batchNumber} 批失败。停止后续处理。`, 'error')
      break // Stop the entire process on a definitive failure.
    }
  }

  log('所有批次处理完成。', 'info')
  return {
    success: failureCount === 0,
    successCount,
    failureCount,
    messages: messages,
    message: messages.join('; ')
  }
}
