import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { executeFlow as apiExecuteFlow } from '@/services/apiService'
import webSocketService from '@/services/webSocketService'

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
        task.logs.push(data)
        if (selectedTask.value && selectedTask.value.id === taskId) {
          activeTaskLogs.value = [...task.logs]
        }
        break
      case 'end':
        task.status = rest.success ? '成功' : '失败'
        task.result = rest.success
          ? rest.data?.message || '执行成功'
          : rest.message || '执行失败'
        break
      case 'error':
        task.status = '失败'
        task.result = rest.message || '任务执行出错'
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

      // 注意：这里我们假设 executionType 决定了是调用旧的 flow 还是新的 task
      // 未来可以统一为一种 WebSocket 消息
      if (task.executionType === 'flow') {
        // 旧的工作流执行方式（如果还需要保留）
        const result = await apiExecuteFlow(task.executionFeature, payload)
        // 假设旧的 flow 执行完后也需要某种方式更新状态
        task.status = result.success ? '成功' : '失败'
        task.result = result.message || '工作流执行完毕'

      } else {
        // 新的、通过 WebSocket 执行任务的方式
        webSocketService.send({
          action: 'start_task',
          taskId: task.id,
          taskName: task.executionFeature,
          payload: payload
        })
      }
    } catch (error) {
      console.error(`启动任务 ${task.name} 出错:`, error)
      task.status = '失败'
      task.result = error.message || '启动任务时发生未知错误。'
    }
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
    runAllTasks,
    clearFinishedTasks,
    clearAllTasks,
    setSelectedTask
  }
}
