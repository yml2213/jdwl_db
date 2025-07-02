import { ref } from 'vue'
import { executeFlow, executeTask as apiExecuteTask } from '@/services/apiService'
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
    // 确保存储店铺和仓库信息的完整性
    const storeInfo = taskDetails.store;
    const warehouseInfo = taskDetails.warehouse;

    const newTask = {
      id: `task-${Date.now()}`,
      status: '等待中',
      result: '',
      logs: [], // 新增：用于存储该任务的日志
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      // 确保存储完整信息
      store: storeInfo,
      warehouse: warehouseInfo,
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
    task.logs = []
    task.result = ''

    try {
      let result;
      // The payload is already perfectly constructed in executionData
      const payload = task.executionData;

      if (task.executionType === 'task') {
        result = await apiExecuteTask(task.executionFeature, payload)
        task.logs = result.logs || [{ message: result.message || JSON.stringify(result.data), type: 'info', timestamp: new Date().toISOString() }];
      } else { // Default to 'flow'
        result = await executeFlow(task.executionFeature, payload)
        task.logs = result.logs || []
      }

      if (result.success) {
        task.status = '成功'
        task.result = result.data?.msg || result.data?.message || result.message || '操作执行完毕'
      } else {
        task.status = '失败'
        task.result = result.message || '未知错误，请检查提交日志'
      }
    } catch (error) {
      task.status = '失败'
      task.result = error.response?.data?.message || error.message || '执行时发生未知网络或脚本错误'
      if (task.logs.length === 0 || !task.logs.find((log) => log.message.includes(task.result))) {
        task.logs.push({
          message: `前端捕获到错误: ${task.result}`,
          type: 'error',
          timestamp: new Date().toISOString()
        })
      }
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
