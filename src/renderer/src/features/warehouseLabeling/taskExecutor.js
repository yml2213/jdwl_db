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
import { getSelectedDepartment } from '../../utils/storageHelper'

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
    console.log('============ 任务执行开始 ============')
    console.log('任务ID:', task.id)
    console.log('任务SKU:', task.sku)
    console.log('任务选项:', JSON.stringify(task.选项 || options || {}))
    
    // 确保任务有选项对象
    const taskOptions = task.选项 || options || {}
    console.log('处理后的任务选项:', taskOptions)
    
    // 打印每个选项的值
    console.log('选项 - importStore (导入店铺商品):', taskOptions.importStore ? '启用' : '未启用')
    console.log('选项 - useStore (启用店铺商品):', taskOptions.useStore ? '启用' : '未启用')
    console.log('选项 - importProps (导入物流属性):', taskOptions.importProps ? '启用' : '未启用')
    console.log('选项 - useMainData (添加库存):', taskOptions.useMainData ? '启用' : '未启用')
    console.log('选项 - useAddInventory (添加库存):', taskOptions.useAddInventory ? '启用' : '未启用')
    console.log('选项 - inventoryAmount (库存数量):', taskOptions.inventoryAmount || '默认1000')
    console.log('选项 - useWarehouse (启用商品库存分配):', taskOptions.useWarehouse ? '启用' : '未启用')
    console.log('选项 - useJdEffect (启用京配打标):', taskOptions.useJdEffect ? '启用' : '未启用')
    console.log('选项 - cancelJpSearch (取消京配打标):', taskOptions.cancelJpSearch ? '启用' : '未启用')
    console.log('选项 - clearStockAllocation (库存分配清零):', taskOptions.clearStockAllocation ? '启用' : '未启用')
    
    // 确保任务有店铺信息
    const taskShopInfo = task.店铺信息 || shopInfo
    
    // 如果shopInfo是对象但不是正确的shopInfo格式，尝试从task中获取店铺名称并获取详细信息
    if (shopInfo && typeof shopInfo === 'object' && !shopInfo.shopNo && task.店铺) {
      console.log('获取到的shopInfo不完整，尝试从任务店铺名称获取店铺信息:', task.店铺)
      // 这里可以添加获取完整店铺信息的逻辑
    }
    
    // 确保任务有事业部信息
    let taskDeptInfo = task.事业部信息
    if (!taskDeptInfo) {
      // 如果任务没有事业部信息，尝试从localStorage获取
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
      
      // 执行入仓打标功能 - 导入店铺商品
      if (taskOptions.importStore) {
        console.log('执行入仓打标 - 导入店铺商品功能')
        const importStoreModule = await import('./importStoreProducts.js')
        const result = await importStoreModule.default.execute(task.skuList, task)
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = task.importLogs || []
        task.importLogs.push({
          type: 'import-result',
          message: `导入店铺商品结果: ${result.message}`,
          timestamp: new Date().toLocaleString()
        })
      }
      
      // 执行入仓打标功能 - 启用店铺商品
      if (taskOptions.useStore) {
        console.log('执行入仓打标 - 启用店铺商品功能')
        const enableStoreModule = await import('./enableStoreProducts.js')
        const result = await enableStoreModule.default.execute(task.skuList, task)
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = task.importLogs || []
        task.importLogs.push({
          type: 'enable-result',
          message: `启用店铺商品结果: ${result.message}`,
          timestamp: new Date().toLocaleString()
        })
      }
      
      // 执行入仓打标功能 - 导入物流属性
      if (taskOptions.importProps) {
        console.log('执行入仓打标 - 导入物流属性功能')
        const importLogisticsModule = await import('./importLogisticsProperties.js')
        const result = await importLogisticsModule.default.execute(task.skuList, task)
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = task.importLogs || []
        task.importLogs.push({
          type: 'props-result',
          message: `导入物流属性结果: ${result.message}`,
          timestamp: new Date().toLocaleString()
        })
      }
      
      // 执行启用京配打标生效
      if (taskOptions.useJdEffect) {
        console.log('执行启用京配打标生效功能')
        const enableJpSearchModule = await import('./enableJpSearch.js')
        const result = await enableJpSearchModule.default.execute(task.skuList, task, (batchTask) => {
          // 如果有创建批次任务的回调函数，可以在这里调用
          if (window.addTaskToList && typeof window.addTaskToList === 'function') {
            window.addTaskToList(batchTask)
          }
        })
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = task.importLogs || []
        task.importLogs.push({
          type: 'jpSearch-result',
          message: `启用京配打标结果: ${result.message}`,
          timestamp: new Date().toLocaleString()
        })
      }
      
      // 执行启用商品库存分配功能
      if (taskOptions.useWarehouse) {
        console.log('执行启用商品库存分配功能')
        const importGoodsStockConfigModule = await import('./importGoodsStockConfig.js')
        const result = await importGoodsStockConfigModule.default.execute(task.skuList, task, (batchTask) => {
          // 如果有创建批次任务的回调函数，可以在这里调用
          if (window.addTaskToList && typeof window.addTaskToList === 'function') {
            window.addTaskToList(batchTask)
          }
        })
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = task.importLogs || []
        task.importLogs.push({
          type: 'stockConfig-result',
          message: `启用商品库存分配结果: ${result.message}`,
          timestamp: new Date().toLocaleString()
        })
      }
      
      // 执行添加库存功能
      if (taskOptions.useMainData || taskOptions.useAddInventory) {
        console.log('执行添加库存功能')
        const addInventoryModule = await import('./addInventory.js')
        // 获取库存数量参数
        const inventoryAmount = taskOptions.inventoryAmount || 1000
        console.log(`使用库存数量: ${inventoryAmount}`)
        
        const result = await addInventoryModule.default.execute(task.skuList, task, (batchTask) => {
          // 如果有创建批次任务的回调函数，可以在这里调用
          if (window.addTaskToList && typeof window.addTaskToList === 'function') {
            window.addTaskToList(batchTask)
          }
        }, inventoryAmount)
        
        // 更新任务状态
        task.状态 = result.success ? '成功' : '失败'
        task.结果 = result.message || (result.success ? '成功' : '失败')
        task.importLogs = task.importLogs || []
        task.importLogs.push({
          type: 'addInventory-result',
          message: `添加库存结果: ${result.message}`,
          timestamp: new Date().toLocaleString()
        })
      }
      
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
    // 添加错误日志
    if (!task.importLogs) {
      task.importLogs = []
    }
    task.importLogs.push({
      type: 'error',
      message: `执行出错: ${error.message || '未知错误'}`,
      timestamp: new Date().toLocaleString()
    })
  } finally {
    console.log('============ 任务执行完成 ============')
    console.log('任务ID:', task.id)
    console.log('最终状态:', task.状态)
    console.log('任务结果:', task.结果)
    
    // 如果任务状态仍然是"执行中"，但已经完成了所有处理，则标记为成功
    if (task.状态 === '执行中') {
      console.log('任务执行完成但状态仍为"执行中"，更新为"成功"')
      task.状态 = '成功'
      if (!task.结果 || task.结果 === '') {
        task.结果 = '任务已完成'
      }
    }
  }
}

/**
 * 批量执行任务
 * @param {Array} waitingTasks - 等待中的任务列表
 * @param {Object} shopInfo - 店铺信息
 * @param {Object} disabledProductsState - 停用商品状态对象
 * @param {Object} defaultOptions - 默认功能选项，如果任务中没有选项将使用此默认值
 * @returns {Promise<Object>} 执行结果
 */
export async function executeTasks(
  waitingTasks,
  shopInfo,
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
    console.log('任务状态更新:', message)
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
      
      console.log('任务执行选项:', taskOptions)
      console.log('入仓打标选项 - importStore:', taskOptions.importStore)
      console.log('入仓打标选项 - useStore:', taskOptions.useStore)

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
      
      // 确保shopInfo有正确的值
      if (!shopInfo || !shopInfo.shopNo) {
        console.log('shopInfo不完整，尝试从全局配置或者任务中获取店铺信息')
        if (window.currentShopInfo) {
          shopInfo = window.currentShopInfo
          console.log('从全局配置获取到店铺信息:', shopInfo.shopName)
        }
      }

      try {
        // 执行任务并打印详细日志
        console.log(`开始执行任务 ${taskIndex + 1}/${waitingTasks.length}, SKU数量: ${skuList.length}`)
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

      // 如果不是最后一个任务，则继续处理下一个
      if (taskIndex < waitingTasks.length - 1) {
        updateTaskStatus(statusDiv, `准备处理下一个任务...`)
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