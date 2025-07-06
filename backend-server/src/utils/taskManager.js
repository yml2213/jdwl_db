/**
 * 任务管理器
 * 用于跟踪、取消和管理正在进行的后端任务。
 */

// 使用 Map 来存储正在运行的任务，键为 taskId，值为取消令牌
const runningTasks = new Map()

/**
 * 注册一个新任务。
 * @param {string} taskId - 任务的唯一标识符。
 * @returns {object} 返回一个取消令牌对象 { isRunning: { value: true } }。
 *                   调用者应该在任务执行循环中检查 this.isRunning.value。
 */
function registerTask(taskId, ws) {
    if (runningTasks.has(taskId)) {
        console.warn(`[任务管理器] ID为 ${taskId} 的任务已经注册。`)
        // 如果任务已存在，可能需要先取消旧的
        cancelTask(taskId)
    }

    const cancellationToken = { value: true }
    // 现在存储一个包含令牌和ws连接的对象
    runningTasks.set(taskId, { token: cancellationToken, ws })
    console.log(`[任务管理器] 任务 ${taskId} 已注册。当前运行任务总数: ${runningTasks.size}`)
    return cancellationToken
}

/**
 * 取消一个正在运行的任务。
 * @param {string} taskId - 要取消的任务的ID。
 */
function cancelTask(taskId) {
    if (runningTasks.has(taskId)) {
        const taskInfo = runningTasks.get(taskId)
        taskInfo.token.value = false
        console.log(`[任务管理器] 任务 ${taskId} 已请求取消。`)
        // 不立即从map中删除，等待任务循环自行终止和注销
    } else {
        console.warn(`[任务管理器] 尝试取消任务 ${taskId}，但未找到该任务。`)
    }
}

/**
 * 任务完成后注销。
 * @param {string} taskId - 任务的ID。
 */
function deregisterTask(taskId) {
    if (runningTasks.delete(taskId)) {
        console.log(
            `[任务管理器] 任务 ${taskId} 已注销。当前运行任务总数: ${runningTasks.size}`
        )
    }
}

/**
 * 检查任务是否仍在运行（或已被取消）。
 * @param {string} taskId - 任务的ID。
 * @returns {boolean} 如果任务仍在运行返回 true，否则 false。
 */
function isTaskRunning(taskId) {
    if (runningTasks.has(taskId)) {
        return runningTasks.get(taskId).token.value
    }
    return false
}

/**
 * 检查任务是否已被取消。
 * @param {string} taskId - 任务的ID。
 * @returns {boolean} 如果任务被取消了返回 true，否则 false。
 */
function isCancelled(taskId) {
    if (runningTasks.has(taskId)) {
        // 如果令牌的value为false，说明任务被取消了
        return runningTasks.get(taskId).token.value === false
    }
    // 如果任务不存在，我们视其为“未被取消”（因为它也无法执行）
    // 或者可以认为已结束，不属于“被取消”状态。
    return false
}

/**
 * 清理与特定WebSocket连接关联的所有任务。
 * @param {WebSocket} ws - 已关闭的WebSocket连接实例。
 */
function cleanup(ws) {
    let cleanedCount = 0;
    for (const [taskId, taskInfo] of runningTasks.entries()) {
        if (taskInfo.ws === ws) {
            cancelTask(taskId);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        console.log(`[任务管理器] 清理了与已关闭连接相关的 ${cleanedCount} 个任务。`);
    }
}


export const taskManager = {
    registerTask,
    cancelTask,
    deregisterTask,
    isTaskRunning,
    isCancelled,
    cleanup
} 