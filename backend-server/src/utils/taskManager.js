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
function registerTask(taskId) {
    if (runningTasks.has(taskId)) {
        console.warn(`[TaskManager] Task with ID ${taskId} is already registered.`)
        // 如果任务已存在，可能需要先取消旧的
        cancelTask(taskId)
    }

    const cancellationToken = { value: true }
    runningTasks.set(taskId, cancellationToken)
    console.log(`[TaskManager] Task ${taskId} registered. Total running tasks: ${runningTasks.size}`)
    return cancellationToken
}

/**
 * 取消一个正在运行的任务。
 * @param {string} taskId - 要取消的任务的ID。
 */
function cancelTask(taskId) {
    if (runningTasks.has(taskId)) {
        const cancellationToken = runningTasks.get(taskId)
        cancellationToken.value = false
        console.log(`[TaskManager] Task ${taskId} cancellation requested.`)
        // 不立即从map中删除，等待任务循环自行终止和注销
    } else {
        console.warn(`[TaskManager] Attempted to cancel task ${taskId}, but it was not found.`)
    }
}

/**
 * 任务完成后注销。
 * @param {string} taskId - 任务的ID。
 */
function deregisterTask(taskId) {
    if (runningTasks.delete(taskId)) {
        console.log(
            `[TaskManager] Task ${taskId} deregistered. Total running tasks: ${runningTasks.size}`
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
        return runningTasks.get(taskId).value
    }
    return false
}

export const taskManager = {
    registerTask,
    cancelTask,
    deregisterTask,
    isTaskRunning
} 