/**
 * Executes a given function over a list of items in batches.
 * @param {object} options - The options for batch execution.
 * @param {Array<any>} options.items - The array of items to process.
 * @param {number} options.batchSize - The number of items in each batch.
 * @param {number} options.delay - The delay in milliseconds between batches.
 * @param {Function} options.batchFn - The async function to execute for each batch. It receives the batch items as an argument.
 * @param {Function} options.log - A logging function.
 * @param {object} options.isRunning - An object with a 'value' property to check if the task should continue.
 * @returns {Promise<object>} A promise that resolves with the aggregated results.
 */
async function executeInBatches({ items, batchSize, delay, batchFn, log, isRunning }) {
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

    const result = await batchFn(batch)
    if (result.success) {
      successCount++
    } else {
      failureCount++
    }
    overallMessage += `Batch ${batchNumber}: ${result.message}\n`

    if (i + batchSize < items.length) {
      log(`--- Batch ${batchNumber} finished. Waiting for ${delay / 1000}s... ---`, 'info')
      await new Promise((resolve) => setTimeout(resolve, delay))
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

module.exports = { executeInBatches }
