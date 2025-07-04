import { ref, watch } from 'vue'
import { executeFlow, executeTask as apiExecuteTask, API_BASE_URL } from '@/services/apiService'
import { getSelectedDepartment, getSelectedVendor } from '@/utils/storageHelper'

/**
 * @description 这是一个Vue组合式函数，用于封装和管理任务队列的所有逻辑。
 * 包括任务的添加、执行、状态更新和清理等。
 * @returns {object} 返回一个包含任务列表、日志、状态和操作方法的对象。
 */
export function useTaskList() {
  const taskList = ref([])
  const activeTaskLogs = ref([])
  const selectedTask = ref(null)

  let eventSource = null

  // 监听 selectedTask 的变化，自动更新日志视图
  watch(selectedTask, (newTask) => {
    if (newTask) {
      activeTaskLogs.value = newTask.logs
    } else {
      activeTaskLogs.value = []
    }
  })

  const listenForLogs = (task) => {
    if (eventSource) {
      eventSource.close()
    }

    if (!task.taskId) {
      console.error('任务缺少 taskId，无法监听日志。')
      task.status = '失败'
      task.result = '内部错误：缺少任务ID。'
      return
    }

    eventSource = new EventSource(`${API_BASE_URL}/api/log-stream/${task.taskId}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // 检查是否是任务结束信号
        if (data.event === 'end') {
          console.log(`[SSE] 任务 ${task.name} 完成。`, data)
          task.status = data.success ? '成功' : '失败'
          task.result = data.message || (data.data ? (data.data.message || '执行完毕') : '未知结果')

          if (data.data?.message && data.data.message.length > (task.result || '').length) {
            task.result = data.data.message
          }

          eventSource.close()
          eventSource = null
        } else {
          // 普通日志消息
          task.logs.push(data)
          // 如果当前任务被选中，则实时更新日志视图
          if (selectedTask.value && selectedTask.value.id === task.id) {
            activeTaskLogs.value = [...task.logs]
          }
        }
      } catch (error) {
        console.error('[SSE] 解析日志数据失败:', error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('[SSE] 连接发生错误:', error)
      task.status = '失败'
      task.result = '与服务器的日志连接中断。'
      eventSource.close()
      eventSource = null
    }
  }

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
      taskId: null,
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

    // 选中当前执行的任务，以显示日志
    selectedTask.value = task

    try {
      // 创建一个干净的payload对象，只包含需要的数据
      const payload = {
        skus: Array.isArray(task.executionData.skus) ? [...task.executionData.skus] : [],
        store: task.executionData.store ? {
          id: task.executionData.store.id,
          shopNo: task.executionData.store.shopNo,
          shopName: task.executionData.store.shopName,
          spShopNo: task.executionData.store.spShopNo || task.executionData.store.shopNo,
          name: task.executionData.store.name || task.executionData.store.shopName
        } : {},
        warehouse: task.executionData.warehouse ? {
          id: task.executionData.warehouse.id,
          warehouseId: task.executionData.warehouse.warehouseId,
          warehouseNo: task.executionData.warehouse.warehouseNo,
          warehouseName: task.executionData.warehouse.warehouseName
        } : {},
        vendor: task.executionData.vendor ? {
          id: task.executionData.vendor.id,
          supplierNo: task.executionData.vendor.supplierNo,
          supplierName: task.executionData.vendor.supplierName
        } : {},
        department: task.executionData.department ? {
          id: task.executionData.department.id,
          deptNo: task.executionData.department.deptNo,
          name: task.executionData.department.name
        } : {}
      }

      // 添加其他可能的属性
      if (task.executionData.logistics) {
        payload.logistics = { ...task.executionData.logistics }
      }

      if (task.executionData.options) {
        payload.options = { ...task.executionData.options }
      }

      if (task.executionData.inventoryAmount) {
        payload.inventoryAmount = task.executionData.inventoryAmount
      }

      let taskId
      if (task.executionType === 'task') {
        taskId = await apiExecuteTask(task.executionFeature, payload)
      } else {
        taskId = await executeFlow(task.executionFeature, payload)
      }
      task.taskId = taskId
      listenForLogs(task)

    } catch (error) {
      console.error('启动任务执行出错:', error)
      task.status = '失败'
      task.result = error.message || '启动任务失败，请检查网络或后端服务。'
    }
  }

  /**
   * @description 按顺序执行队列中所有状态为"等待中"的任务。
   */
  const runAllTasks = async () => {
    for (const task of taskList.value) {
      if (task.status === '等待中') {
        await executeTask(task)
        // 在新的模型中，我们不等待任务完成，所以移除await
        // 注意：这会导致所有任务几乎同时启动。如果需要顺序执行，
        // 则需要一个更复杂的队列管理机制，监听每个任务的'end'事件。
        // 目前，我们保持并行启动。
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
    if (eventSource) eventSource.close()
    taskList.value = []
    selectedTask.value = null
  }

  const deleteTask = (taskId) => {
    const taskToDelete = taskList.value.find((t) => t.id === taskId)
    if (taskToDelete && selectedTask.value && selectedTask.value.id === taskId) {
      if (eventSource) eventSource.close()
      selectedTask.value = null
    }
    taskList.value = taskList.value.filter((t) => t.id !== taskId)
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
    clearAllTasks
  }
}
