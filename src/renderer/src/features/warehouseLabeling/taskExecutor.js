/**
 * 任务执行器模块
 * 负责执行仓库标签系统的各种功能任务
 */
import enableStoreProductsFeature from './enableStoreProducts'
import importStoreProductsFeature from './importStoreProducts'
import importLogisticsPropsFeature from './importLogisticsProperties'
import importGoodsStockConfigFeature from './importGoodsStockConfig'
import enableJpSearchFeature from './enableJpSearch'
import stockAllocationClearanceFeature from './stockAllocationClearance'
import cancelJpSearchFeature from './cancelJpSearch'
import { enableShopProducts, clearStockAllocation, cancelJdDeliveryTag } from '../../services/apiService'
import {
  extractTaskSkuList
} from './utils/taskUtils'

/**
 * 执行单个任务
 * @param {Object} task - 任务对象
 * @param {Object} shopInfo - 店铺信息
 * @param {Object} options - 任务选项
 * @returns {Promise<void>}
 */
export async function executeOneTask(task, shopInfo, options = {}) {
  if (!task) {
    console.error('无效的任务对象')
    return
  }

  console.log('执行任务:', task)

  // 标记任务为执行中
  task.状态 = '执行中'

  try {
    // 确保任务有选项对象
    const taskOptions = task.选项 || options || {}
    
    // 确保任务有店铺信息
    const taskShopInfo = task.店铺信息 || shopInfo
    
    // 确保任务有事业部信息
    let taskDeptInfo = task.事业部信息
    if (!taskDeptInfo) {
      // 如果任务没有事业部信息，尝试从localStorage获取
      const { getSelectedDepartment } = require('../../utils/storageHelper')
      taskDeptInfo = getSelectedDepartment()
      console.log('从localStorage获取事业部信息:', taskDeptInfo)
      // 将获取到的事业部信息保存到任务中
      task.事业部信息 = taskDeptInfo
    }

    // 根据任务类型执行相应功能
    if (task.skuList && task.skuList.length === 1 && task.skuList[0] === 'WHOLE_STORE') {
      console.log('执行[整店取消京配打标]功能')
      
      // 检查是否有整店取消京配打标选项
      if (taskOptions.wholeCancelJpSearch) {
        const cancelJpSearchModule = await import('./cancelJpSearch.js')
        const result = await cancelJpSearchModule.default.execute(task.skuList, task)
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = result.cancelJpSearchLogs || []
      }
      
      // 检查是否有整店库存分配清零选项
      if (taskOptions.wholeStoreClearance) {
        const stockAllocationClearanceModule = await import('./stockAllocationClearance.js')
        const result = await stockAllocationClearanceModule.default.execute(task.skuList, task)
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = result.clearanceLogs || []
      }
    } else {
      // 执行普通SKU列表任务
      
      // 执行取消京配打标功能
      if (taskOptions.cancelJpSearch) {
        const cancelJpSearchModule = await import('./cancelJpSearch.js')
        const result = await cancelJpSearchModule.default.execute(task.skuList, task)
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = result.cancelJpSearchLogs || []
      }
      
      // 执行库存分配清零功能
      if (taskOptions.clearStockAllocation) {
        const stockAllocationClearanceModule = await import('./stockAllocationClearance.js')
        const result = await stockAllocationClearanceModule.default.execute(task.skuList, task)
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = result.clearanceLogs || []
      }
    }
  } catch (error) {
    console.error('执行任务出错:', error)
    task.状态 = '失败'
    task.结果 = `执行出错: ${error.message || '未知错误'}`
  }
}

/**
 * 批量执行任务
 * @param {Array} waitingTasks - 等待中的任务列表
 * @param {Object} shopInfo - 店铺信息
 * @param {Number} waitTime - 任务间等待时间（秒）
 * @param {Object} disabledProductsState - 停用商品状态对象
 * @param {Object} defaultOptions - 默认功能选项，如果任务中没有选项将使用此默认值
 * @returns {Promise<Object>} 执行结果
 */
export async function executeTasks(
  waitingTasks,
  shopInfo,
  waitTime,
  disabledProductsState,
  defaultOptions
) {
  if (!waitingTasks || waitingTasks.length === 0) {
    return {
      success: false,
      message: '没有等待中的任务',
      successCount: 0,
      failureCount: 0
    }
  }

  if (!shopInfo) {
    return {
      success: false,
      message: '未选择店铺',
      successCount: 0,
      failureCount: 0
    }
  }

  // 创建状态显示div
  const statusDiv = document.createElement('div')
  statusDiv.style.position = 'fixed'
  statusDiv.style.top = '10px'
  statusDiv.style.right = '10px'
  statusDiv.style.padding = '10px'
  statusDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
  statusDiv.style.color = 'white'
  statusDiv.style.borderRadius = '5px'
  statusDiv.style.zIndex = '9999'
  document.body.appendChild(statusDiv)

  // 更新状态显示的函数
  function updateTaskStatus(element, message) {
    element.textContent = message
  }

  try {
    // 处理每一个任务
    let successCount = 0
    let failureCount = 0
    const allDisabledProducts = [] // 用于存储所有任务中的停用商品

    // 循环处理每个任务
    for (let taskIndex = 0; taskIndex < waitingTasks.length; taskIndex++) {
      const task = waitingTasks[taskIndex]

      // 获取任务中存储的选项，如果没有则使用当前表单中的选项
      const taskOptions = task.选项 || defaultOptions || {}

      // 正确获取SKU列表
      const skuList = extractTaskSkuList(task)

      if (skuList.length === 0) {
        console.warn('任务中没有有效的SKU，将跳过此任务')
        task.状态 = '失败'
        task.结果 = '没有有效的SKU'
        failureCount++
        continue
      }

      // 更新状态显示
      updateTaskStatus(
        statusDiv,
        `正在处理任务: ${taskIndex + 1}/${waitingTasks.length} (${skuList.length}个SKU)`
      )

      // 处理状态
      task.状态 = '执行中'

      try {
        // 执行任务
        await executeOneTask(task, shopInfo, taskOptions)

        // 根据执行结果更新计数
        if (task.状态 === '成功') {
          successCount++
        } else {
          failureCount++
        }
      } catch (error) {
        console.error('任务执行出错:', error)
        task.状态 = '失败'
        task.结果 = `执行出错: ${error.message || '未知错误'}`
        failureCount++
      }

      // 如果不是最后一个任务，且设置了等待时间，则等待指定时间
      if (taskIndex < waitingTasks.length - 1 && waitTime > 0) {
        updateTaskStatus(statusDiv, `等待${waitTime}秒后处理下一个任务...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime * 1000))
      }
    }

    // 返回执行结果
    return {
      success: failureCount === 0,
      message: `任务执行完成: 成功${successCount}个, 失败${failureCount}个`,
      successCount,
      failureCount,
      disabledProducts: allDisabledProducts
    }
  } catch (error) {
    console.error('执行任务出错:', error)
    return {
      success: false,
      message: `执行任务出错: ${error.message || '未知错误'}`,
      successCount: 0,
      failureCount: waitingTasks.length,
      error
    }
  } finally {
    // 移除状态显示
    document.body.removeChild(statusDiv)
  }
}