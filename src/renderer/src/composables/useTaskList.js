import { ref } from 'vue'
import { useTask } from '@/composables/useTask.js'
import taskFlowExecutor from '@/features/warehouseLabeling/taskFlowExecutor'
import { getSelectedDepartment, getSelectedVendor } from '@/utils/storageHelper'

/**
 * @description 这是一个Vue组合式函数，用于封装和管理任务队列的所有逻辑。
 * 包括任务的添加、执行、状态更新和清理等。
 * @param {Array} initialTasks - 初始的任务列表（可选）。
 * @returns {object} 返回一个包含任务列表、日志、状态和操作方法的对象。
 */
export function useTaskList(initialTasks = []) {
  // --- 响应式状态 ---
  const taskList = ref(initialTasks) // 任务队列
  // 引入底层的任务流执行器
  const { execute: executeTaskFlow, ...taskFlowState } = useTask(taskFlowExecutor)

  /**
   * @description 向队列中添加一个新任务。
   * @param {object} taskDetails - 包含任务所需信息的对象。
   */
  const addTask = (taskDetails) => {
    const newTask = {
      id: `task-${Date.now()}`,
      status: '等待中',
      result: '',
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
    try {
      const departmentInfo = getSelectedDepartment()
      const vendorInfo = getSelectedVendor()
      // 构建后端任务所需的完整上下文
      const context = {
        skus: task.skus,
        options: task.options,
        store: { ...task.selectedStore, ...departmentInfo },
        warehouse: task.selectedWarehouse,
        vendor: vendorInfo,
        taskName: task.featureName,
        quickSelect: task.quickSelect
      }

      await executeTaskFlow(context)

      // 根据执行结果更新任务状态
      if (taskFlowState.status.value === 'success') {
        task.status = '成功'
        task.result = '任务执行成功'
      } else {
        task.status = '失败'
        // 从日志中找到最后一条错误信息作为结果
        const errorLog = taskFlowState.logs.value
          .slice()
          .reverse()
          .find((l) => l.type === 'error')
        task.result = errorLog ? errorLog.message : '执行失败，未知错误'
      }
    } catch (error) {
      console.error(`执行任务 ${task.id} 失败:`, error)
      task.status = '失败'
      task.result = error.message || '客户端执行异常'
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

  // 返回状态和方法
  return {
    taskList,
    taskFlowLogs: taskFlowState.logs, // 任务流的详细日志
    taskFlowStatus: taskFlowState.status, // 任务流的总体状态
    addTask,
    executeTask,
    runAllTasks,
    clearFinishedTasks,
    clearAllTasks
  }
}
