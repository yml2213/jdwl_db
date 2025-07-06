import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import webSocketService from '@/services/webSocketService'
import { getSessionId } from '@/utils/cookieHelper'

/**
 * @description 这是一个Vue组合式函数，用于封装和管理任务队列的所有逻辑。
 * 包括任务的添加、执行、状态更新和清理等。
 * @returns {object} 返回一个包含任务列表、日志、状态和操作方法的对象。
 */
export function useTaskList() {
  const taskList = ref([])
  const activeTaskLogs = ref([])
  const selectedTask = ref(null)

  const handleWebSocketMessage = (message) => {
    const { event, taskId, data, ...rest } = message
    if (!taskId) return

    const task = taskList.value.find((t) => t.id === taskId)
    if (!task) return

    switch (event) {
      case 'log':
        // 如果是对象形式的日志，通常是结构化信息
        if (typeof data === 'object' && data !== null) {
          // 特殊处理等待事件
          if (data.event === 'waiting') {
            task.status = '等待中'
            task.result = data.message || `触发频率限制，将在 ${data.delay / 1000}s 后重试`
            task.isWaiting = true // 增加一个等待状态标识
            // 在延迟后自动清除等待状态
            setTimeout(() => {
              if (task.status === '等待中') {
                task.status = '运行中'
                task.result = '继续执行...'
              }
              task.isWaiting = false
            }, data.delay)
          } else {
            // 其他结构化日志，推入日志数组
            task.logs.push(JSON.stringify(data))
          }
        } else {
          // 普通字符串日志
          task.logs.push(data)
        }

        if (selectedTask.value && selectedTask.value.id === taskId) {
          activeTaskLogs.value = [...task.logs]
        }
        break
      case 'end':
        task.status = rest.success ? '成功' : '失败'
        task.result = rest.success ? data : rest.message || '执行失败'
        task.isExecuting = false
        task.isWaiting = false // 确保结束时清除等待状态
        break
      case 'error':
        task.status = '失败'
        task.result = rest.message || '任务执行出错'
        task.isWaiting = false // 确保错误时清除等待状态
        break
    }
  }

  onMounted(() => {
    webSocketService.on('message', handleWebSocketMessage)
  })

  onBeforeUnmount(() => {
    webSocketService.off('message', handleWebSocketMessage)
  })

  watch(selectedTask, (newTask) => {
    activeTaskLogs.value = newTask ? newTask.logs : []
  })

  /**
   * @description 向队列中添加一个新任务。
   * @param {object} taskDetails - 包含任务所需信息的对象。
   */
  const addTask = (taskDetails) => {
    const newTask = {
      ...taskDetails,
      id: `task-${Date.now()}-${Math.random()}`,
      status: '等待中',
      result: '',
      logs: [],
      isWaiting: false, // 初始化 isWaiting 状态
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    }
    taskList.value.push(newTask)
  }

  /**
   * @description 执行指定的任务。
   * @param {object} taskToRun - 要执行的任务对象。
   */
  const executeTask = async (taskToRun) => {
    const task = taskList.value.find((t) => t.id === taskToRun.id)
    if (!task) return

    task.status = '运行中'
    task.logs = []
    task.result = ''
    selectedTask.value = task

    try {
      const payload = { ...task.executionData }

      console.log(`[executeTask] 1. Preparing to send task '${task.name}'.`)
      const sessionId = await getSessionId()
      console.log(`[executeTask] 2. Retrieved sessionId to be sent: ${sessionId}`)

      // 统一通过 WebSocket 执行任务，后端会根据 taskName 区分是 task 还是 flow
      webSocketService.send({
        action: 'start_task',
        taskId: task.id,
        taskName: task.executionFeature,
        isFlow: task.executionType === 'flow', // 传递类型给后端
        payload: payload,
        sessionId: sessionId
      })
      console.log(`[executeTask] 3. Task sent over WebSocket.`)
    } catch (error) {
      console.error(`启动任务 ${task.name} 出错:`, error)
      task.status = '失败'
      task.result = error.message || '启动任务时发生未知错误。'
    }
  }

  /**
   * @description 取消一个正在执行的任务。
   * @param {string} taskId - 要取消的任务的ID。
   */
  const cancelTask = (taskId) => {
    const task = taskList.value.find((t) => t.id === taskId)
    if (!task) {
      console.warn(`[cancelTask] 无法找到ID为 ${taskId} 的任务。`)
      return
    }

    // 立即更新前端状态
    task.status = '已取消'
    task.result = '任务已被用户请求取消。'
    task.isExecuting = false
    task.isWaiting = false

    // 向后端发送取消请求
    webSocketService.send({
      action: 'cancel_task',
      taskId: taskId
    })
    console.log(`[cancelTask] 已发送取消请求至后端，任务ID: ${taskId}`)
  }

  /**
   * @description 按顺序执行队列中所有状态为"等待中"的任务。
   */
  const runAllTasks = async () => {
    for (const task of taskList.value) {
      if (task.status === '等待中') {
        await executeTask(task)
      }
    }
  }

  /**
   * @description 从队列中清除所有已完成（成功或失败）的任务。
   */
  const clearFinishedTasks = () => {
    taskList.value = taskList.value.filter(
      (t) => t.status === '等待中' || t.status === '运行中'
    )
  }

  /**
   * @description 清空整个任务队列。
   */
  const clearAllTasks = () => {
    taskList.value = []
    selectedTask.value = null
  }

  const deleteTask = (taskId) => {
    const taskIndex = taskList.value.findIndex((t) => t.id === taskId)
    if (taskIndex !== -1) {
      if (selectedTask.value && selectedTask.value.id === taskId) {
        selectedTask.value = null
      }
      taskList.value.splice(taskIndex, 1)
    }
  }

  const setSelectedTask = (task) => {
    selectedTask.value = task
  }

  // 返回状态和方法
  return {
    taskList,
    selectedTask,
    activeTaskLogs,
    addTask,
    executeTask,
    deleteTask,
    cancelTask,
    runAllTasks,
    clearFinishedTasks,
    clearAllTasks,
    setSelectedTask
  }
}
