/**
 * 任务处理工具函数
 * 用于处理仓库标签系统中的通用任务处理逻辑
 */

/**
 * 提取任务中的SKU列表
 * @param {Object} task - 任务对象
 * @returns {Array<string>} 有效的SKU列表
 */
export function extractTaskSkuList(task) {
  // 如果是批量任务，使用存储的SKU列表
  let skuList = []
  if (task.skuList && Array.isArray(task.skuList)) {
    skuList = [...task.skuList] // 使用数组拷贝，避免引用问题
  } else {
    // 如果是单个任务，将任务的SKU作为数组元素
    // 确保sku不是任务名称（不含"批量任务"字样）
    const sku = task.sku
    if (sku && !sku.includes('批量任务')) {
      skuList = [sku]
    }
  }

  // 过滤掉无效的SKU
  return skuList.filter((sku) => {
    return sku && typeof sku === 'string' && sku.trim() !== '' && !sku.includes('批量任务')
  })
}

/**
 * 创建状态指示器
 * @returns {HTMLElement} 状态指示器DOM元素
 */
export function createStatusIndicator() {
  const statusDiv = document.createElement('div')
  statusDiv.className = 'batch-processing-status'
  statusDiv.innerHTML = `<div class="status-content">
    <div class="status-spinner"></div>
    <div class="status-text">正在处理任务，请稍候...</div>
    <div class="status-countdown"></div>
  </div>`
  document.body.appendChild(statusDiv)
  return statusDiv
}

/**
 * 更新等待倒计时
 * @param {HTMLElement} statusDiv - 状态指示器DOM元素
 * @param {Number} waitTimeSeconds - 等待时间（秒）
 * @returns {Promise} 等待完成的Promise
 */
export function updateCountdown(statusDiv, waitTimeSeconds) {
  return new Promise((resolve) => {
    const countdownElement = statusDiv.querySelector('.status-countdown')
    if (!countdownElement) {
      setTimeout(resolve, waitTimeSeconds * 1000)
      return
    }

    countdownElement.style.marginTop = '10px'
    countdownElement.style.fontSize = '14px'

    // 等待时间（毫秒）
    const waitTimeMs = waitTimeSeconds * 1000

    // 启动倒计时
    let remainingTime = waitTimeMs
    const countdownInterval = setInterval(() => {
      remainingTime -= 1000
      if (remainingTime <= 0) {
        clearInterval(countdownInterval)
        countdownElement.textContent = '准备处理下一个任务...'
        resolve()
      } else {
        const seconds = Math.ceil(remainingTime / 1000)
        countdownElement.textContent = `等待处理下一个任务: ${seconds}秒`
      }
    }, 1000)

    // 显示初始倒计时
    countdownElement.textContent = `等待处理下一个任务: ${waitTimeSeconds}秒`
  })
}

/**
 * 更新任务状态UI
 * @param {HTMLElement} statusDiv - 状态指示器DOM元素
 * @param {String} message - 状态消息
 */
export function updateTaskStatus(statusDiv, message) {
  const statusText = statusDiv.querySelector('.status-text')
  if (statusText) {
    statusText.textContent = message
  }
}

/**
 * 更新任务结果状态
 * @param {Object} task - 任务对象
 * @param {Array} functionResults - 功能执行结果数组
 * @param {Boolean} hasFailures - 是否有执行失败的功能
 * @returns {String} 任务状态
 */
export function updateTaskResult(task, functionResults, hasFailures) {
  if (functionResults.length === 0) {
    task.状态 = '失败'
    task.结果 = '没有执行任何功能'
    return '失败'
  } else if (hasFailures) {
    task.状态 = '部分成功'
    task.结果 = functionResults.join('; ')
    return '部分成功'
  } else {
    task.状态 = '成功'
    task.结果 = functionResults.join('; ')
    return '成功'
  }
}

/**
 * 获取状态样式类
 * @param {String} status - 状态文本
 * @returns {String} 对应的CSS类名
 */
export function getStatusClass(status) {
  switch (status) {
    case '等待中':
      return 'waiting'
    case '执行中':
      return 'processing'
    case '成功':
      return 'success'
    case '失败':
      return 'failure'
    case '部分成功':
      return 'partial-success'
    case '暂存':
      return 'temp-saved'
    default:
      return ''
  }
}
