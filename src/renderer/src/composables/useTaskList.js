import { ref } from 'vue'
import { executeFlow } from '@/services/apiService'
import { getSelectedDepartment, getSelectedVendor } from '@/utils/storageHelper'

/**
 * @description 这是一个Vue组合式函数，用于封装和管理任务队列的所有逻辑。
 * 包括任务的添加、执行、状态更新和清理等。
 * @param {Array} initialTasks - 初始的任务列表（可选）。
 * @returns {object} 返回一个包含任务列表、日志、状态和操作方法的对象。
 */
export function useTaskList(initialTasks = []) {
  const taskList = ref(initialTasks)
  // 注意：不再在这里创建useTask实例，而是在执行具体任务时动态创建

  /**
   * @description 向队列中添加一个新任务。
   * @param {object} taskDetails - 包含任务所需信息的对象。
   */
  const addTask = (taskDetails) => {
    const newTask = {
      id: `task-${Date.now()}`,
      status: '等待中',
      result: '',
      logs: [], // 新增：用于存储该任务的日志
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      ...taskDetails
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
    task.logs = [] // 清空旧日志

    try {
      // 直接调用后端的flow执行器
      const result = await executeFlow(task.executionFeature, task.executionData)
      
      task.logs = result.logs || []

      if (result.success) {
        task.status = '成功'
        task.result = result.data?.message || '工作流执行成功'
      } else {
        task.status = '失败'
        task.result = result.message || '工作流执行失败，未知错误'
      }
    } catch (error) {
      console.error(`执行任务 ${task.id} 失败:`, error)
      task.status = '失败'
      task.result = error.message || '客户端执行异常'
      task.logs.push({ message: `[前端] 客户端执行异常: ${task.result}`, type: 'error' })
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
    taskList.value = taskList.value.filter((t) => t.status === '等待中' || t.status === '运行中')
  }

  /**
   * @description 清空整个任务队列。
   */
  const clearAllTasks = () => {
    taskList.value = []
  }

  const deleteTask = (taskId) => {
    taskList.value = taskList.value.filter((t) => t.id !== taskId)
  }

  // 返回状态和方法
  return {
    taskList,
    // 日志和状态现在是每个任务执行时动态生成的，不再是全局唯一的
    // taskFlowLogs: taskFlowState.logs,
    // taskFlowStatus: taskFlowState.status,
    addTask,
    executeTask,
    deleteTask,
    runAllTasks,
    clearFinishedTasks,
    clearAllTasks
  }
}
