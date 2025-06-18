/**
 * 任务执行器模块
 * 负责执行仓库标签系统的各种功能任务
 */
import enableStoreProductsFeature from './enableStoreProducts'
import importStoreProductsFeature from './importStoreProducts'
import importLogisticsPropsFeature from './importLogisticsProperties'
import importGoodsStockConfigFeature from './importGoodsStockConfig'
import enableJpSearchFeature from './enableJpSearch'
import importProductNamesFeature from './importProductNames'
import { enableShopProducts } from '../../services/apiService'
import {
  extractTaskSkuList,
  createStatusIndicator,
  updateCountdown,
  updateTaskStatus,
  updateTaskResult
} from './utils/taskUtils'

/**
 * 执行单个任务
 * @param {Object} task - 任务对象
 * @param {Object} shopInfo - 店铺信息
 * @param {Object} options - 功能选项
 * @returns {Promise<Object>} 执行结果
 */
export async function executeOneTask(task, shopInfo, options) {
  if (!task) {
    throw new Error('缺少任务信息')
  }

  // 对于物流属性导入任务，不需要店铺信息
  const isLogisticsImport =
    options && options.importProps === true && !options.importStore && !options.useStore

  if (!isLogisticsImport && !shopInfo) {
    throw new Error('缺少店铺信息')
  }

  // 标记为执行中
  task.状态 = '执行中'

  // 存储功能执行结果
  const functionResults = []
  let hasFailures = false

  try {
    // 启用店铺商品功能 - 使用独立模块
    if (options.useStore === true) {
      try {
        console.log('执行[启用店铺商品]功能，SKU:', task.sku)

        // 提取SKU
        const skuList = extractTaskSkuList(task)
        if (skuList.length === 0) {
          throw new Error('没有有效的SKU')
        }

        // 调用商品状态检查API
        const result = await enableStoreProductsFeature.execute(skuList, shopInfo)

        if (result.success) {
          functionResults.push(`启用店铺商品: 成功 - 已检查商品状态`)

          // 如果找到了停用商品，尝试启用它们
          if (result.disabledProducts && result.disabledProducts.length > 0) {
            const enableResult = await enableShopProducts(result.disabledProducts)
            if (enableResult.success) {
              functionResults.push(
                `启用停用商品: 成功 - 已启用${result.disabledProducts.length}个商品`
              )
            } else {
              functionResults.push(`启用停用商品: 失败 - ${enableResult.message}`)
              hasFailures = true
            }
          }
        } else {
          functionResults.push(`启用店铺商品: 失败 - ${result.message || '检查状态失败'}`)
          hasFailures = true
        }
      } catch (checkError) {
        functionResults.push(`启用店铺商品: 失败 - ${checkError.message || '未知错误'}`)
        console.error('启用店铺商品失败:', checkError)
        hasFailures = true
      }
    }

    // 导入店铺商品功能 - 使用独立模块
    if (options.importStore === true) {
      try {
        console.log('执行[导入店铺商品]功能，SKU:', task.sku)

        // 提取SKU
        const skuList = extractTaskSkuList(task)
        if (skuList.length === 0) {
          throw new Error('没有有效的SKU')
        }

        // 使用导入店铺商品功能模块
        const importResult = await importStoreProductsFeature.execute(skuList, shopInfo)

        if (importResult.success) {
          functionResults.push(`导入店铺商品: 成功`)
        } else {
          functionResults.push(`导入店铺商品: 失败 - ${importResult.message}`)
          hasFailures = true
        }
      } catch (importError) {
        functionResults.push(`导入店铺商品: 错误 - ${importError.message || '未知错误'}`)
        console.error('导入店铺商品失败:', importError)
        hasFailures = true
      }
    }

    // 导入物流属性功能 - 使用独立模块
    if (options.importProps === true) {
      try {
        console.log('执行[导入物流属性]功能，SKU:', task.sku || task.skuList)

        // 提取SKU
        const skuList = extractTaskSkuList(task)
        if (skuList.length === 0) {
          throw new Error('没有有效的SKU')
        }

        // 使用导入物流属性功能模块
        const importResult = await importLogisticsPropsFeature.execute(skuList)

        if (importResult.success) {
          functionResults.push(`导入物流属性: 成功 - 处理了${importResult.processedCount}个SKU`)
        } else {
          // 获取错误信息
          let errorMessage = ''
          if (importResult.errorDetail) {
            // 使用收集到的详细错误信息
            errorMessage = importResult.errorDetail
          } else if (importResult.data) {
            // 使用API返回的原始错误信息
            errorMessage = importResult.data
          } else if (importResult.message) {
            errorMessage = importResult.message
          } else {
            errorMessage = '导入物流属性失败'
          }

          // 添加清晰的错误信息到结果
          functionResults.push(`导入物流属性: 失败 - ${errorMessage}`)
          hasFailures = true

          // 更新任务的结果字段，确保显示具体的错误原因
          task.结果 = errorMessage
        }
      } catch (importError) {
        const errorMessage = importError.message || '未知错误'
        functionResults.push(`导入物流属性: 错误 - ${errorMessage}`)
        console.error('导入物流属性失败:', importError)
        hasFailures = true
        // 更新任务的结果字段
        task.结果 = errorMessage
      }
    }

    // 导入商品简称功能
    if (options.importProductNames === true) {
      // 商品简称功能需要在用户界面上通过文件上传实现，不需要在任务执行器中处理
      functionResults.push(`导入商品简称: 请在界面上传Excel文件`)
    }

    // 启用库存商品分配功能
    if (options.useWarehouse === true) {
      try {
        console.log('执行[启用库存商品分配]功能，SKU:', task.sku)

        // 提取SKU
        const skuList = extractTaskSkuList(task)
        if (skuList.length === 0) {
          throw new Error('没有有效的SKU')
        }

        // 创建批次任务的回调函数，用于将批次任务添加到任务列表
        const createBatchTask = (batchTask) => {
          if (!batchTask) return;
          
          console.log('创建批次任务', batchTask);
          
          // 将批次任务添加到任务列表
          if (this.addTaskToList) {
            this.addTaskToList(batchTask);
          }
        };

        // 使用启用库存商品分配功能模块，传入createBatchTask回调
        const warehouseResult = await importGoodsStockConfigFeature.execute(skuList, task, createBatchTask)

        // 将分批导入日志添加到任务中，用于UI展示
        if (warehouseResult.importLogs) {
          if (!task.importLogs) {
            task.importLogs = [];
          }
          task.importLogs = task.importLogs.concat(warehouseResult.importLogs);
          console.log(`添加${warehouseResult.importLogs.length}条导入日志到任务`);
        }

        if (warehouseResult.success) {
          functionResults.push(`启用库存商品分配: 成功`)
        } else {
          // 检查是否允许跳过库存配置错误
          if (options.skipConfigErrors === true) {
            functionResults.push(`启用库存商品分配: 已跳过 - ${warehouseResult.message}`)
            console.warn('已跳过库存商品分配功能，继续执行其他功能')
          } else {
            functionResults.push(`启用库存商品分配: 失败 - ${warehouseResult.message}`)
            hasFailures = true
          }
        }
      } catch (error) {
        console.error('启用库存商品分配出错:', error)
        functionResults.push(`启用库存商品分配: 失败 - ${error.message || '未知错误'}`)
        hasFailures = true
      }
    }

    // 启用京配打标生效功能
    if (options.useJdEffect === true) {
      try {
        console.log('执行[启用京配打标生效]功能，SKU:', task.sku)

        // 提取SKU
        const skuList = extractTaskSkuList(task)
        if (skuList.length === 0) {
          throw new Error('没有有效的SKU')
        }

        // 创建批次任务的回调函数，用于将批次任务添加到任务列表
        const createBatchTask = (batchTask) => {
          if (!batchTask) return;
          
          console.log('创建批次任务', batchTask);
          
          // 将批次任务添加到任务列表
          if (this.addTaskToList) {
            this.addTaskToList(batchTask);
          }
        };

        // 使用启用京配打标生效功能模块，传入createBatchTask回调
        const jpSearchResult = await enableJpSearchFeature.execute(skuList, task, createBatchTask)

        // 将分批导入日志添加到任务中，用于UI展示
        if (jpSearchResult.importLogs) {
          if (!task.importLogs) {
            task.importLogs = [];
          }
          task.importLogs = task.importLogs.concat(jpSearchResult.importLogs);
          console.log(`添加${jpSearchResult.importLogs.length}条导入日志到任务`);
        }

        if (jpSearchResult.success) {
          // 检查是否是后台任务
          if (jpSearchResult.message && jpSearchResult.message.includes('后台任务')) {
            functionResults.push(`启用京配打标生效: 已提交后台任务，请稍后在任务日志中查看结果`)
          } else {
            functionResults.push(`启用京配打标生效: 成功`)
          }
        } else {
          functionResults.push(`启用京配打标生效: 失败 - ${jpSearchResult.message}`)
          hasFailures = true
        }
      } catch (error) {
        console.error('启用京配打标生效出错:', error)
        functionResults.push(`启用京配打标生效: 失败 - ${error.message || '未知错误'}`)
        hasFailures = true
      }
    }

    // 更新任务状态
    updateTaskResult(task, functionResults, hasFailures)

    return {
      success: !hasFailures && functionResults.length > 0,
      functionResults,
      status: task.状态
    }
  } catch (error) {
    console.error('执行任务失败:', error)
    task.状态 = '失败'
    task.结果 = error.message || '执行出错'

    return {
      success: false,
      error: error.message || '未知错误',
      status: '失败'
    }
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

      // 执行任务
      const result = await executeOneTask(task, shopInfo, taskOptions)

      // 根据执行结果更新计数
      if (result && result.success) {
        successCount++
      } else {
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
