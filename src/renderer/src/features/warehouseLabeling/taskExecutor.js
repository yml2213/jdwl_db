/**
 * 任务执行器模块
 * 负责执行仓库标签系统的各种功能任务
 */
import enableStoreProductsFeature from './enableStoreProducts'
import importStoreProductsFeature from './importStoreProducts'
import importLogisticsPropsFeature from './importLogisticsProperties'
import importGoodsStockConfigFeature from './importGoodsStockConfig'
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
          // 获取原始错误信息
          let errorMessage = ''

          // 优先使用API返回的原始错误信息
          if (importResult.data) {
            errorMessage = importResult.data
          } else if (importResult.message) {
            errorMessage = importResult.message
          } else {
            errorMessage = '导入物流属性失败'
          }

          // 添加清晰的错误信息到结果
          functionResults.push(`导入物流属性: 失败 - ${errorMessage}`)
          hasFailures = true
        }
      } catch (importError) {
        functionResults.push(`导入物流属性: 错误 - ${importError.message || '未知错误'}`)
        console.error('导入物流属性失败:', importError)
        hasFailures = true
      }
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

        // 使用启用库存商品分配功能模块
        const warehouseResult = await importGoodsStockConfigFeature.execute(skuList)

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
      } catch (warehouseError) {
        // 检查是否允许跳过库存配置错误
        if (options.skipConfigErrors === true) {
          functionResults.push(`启用库存商品分配: 已跳过 - ${warehouseError.message || '未知错误'}`)
          console.warn('已跳过库存商品分配功能，继续执行其他功能')
        } else {
          functionResults.push(`启用库存商品分配: 错误 - ${warehouseError.message || '未知错误'}`)
          console.error('启用库存商品分配失败:', warehouseError)
          hasFailures = true
        }
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

  // 显示操作状态指示器
  const statusDiv = createStatusIndicator()

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
        const executionResult = await executeOneTask(task, shopInfo, taskOptions)

        // 更新计数
        if (executionResult.success) {
          successCount++
        } else {
          failureCount++
        }

        // 收集停用商品
        if (disabledProductsState && disabledProductsState.items) {
          allDisabledProducts.push(...disabledProductsState.items)
        }
      } catch (error) {
        console.error(`任务执行失败:`, error)

        // 更新任务状态
        task.状态 = '失败'
        task.结果 = error.message || '执行出错'
        failureCount++

        // 如果是致命错误，中断后续任务处理
        if (
          error.message &&
          (error.message.includes('登录') ||
            error.message.includes('权限') ||
            error.message.includes('会话'))
        ) {
          throw new Error(`任务执行失败: ${error.message}。后续任务将停止处理。`)
        }
      }

      // 如果不是最后一个任务，添加等待时间
      if (taskIndex < waitingTasks.length - 1) {
        await updateCountdown(statusDiv, waitTime)
      }
    }

    // 如果找到了停用商品，尝试启用它们
    if (defaultOptions && defaultOptions.useStore === true && allDisabledProducts.length > 0) {
      updateTaskStatus(statusDiv, `正在启用${allDisabledProducts.length}个停用商品...`)

      try {
        const enableResult = await enableShopProducts(allDisabledProducts)
        if (enableResult.success) {
          return {
            success: true,
            message: `处理成功：${successCount}个任务已完成，${allDisabledProducts.length}个停用商品已启用`,
            successCount,
            failureCount,
            enabledProductsCount: allDisabledProducts.length
          }
        } else {
          return {
            success: true,
            message: `处理完成：${successCount}个任务已完成，但启用${allDisabledProducts.length}个停用商品失败`,
            successCount,
            failureCount,
            enabledProductsCount: 0,
            enableError: enableResult.message
          }
        }
      } catch (error) {
        return {
          success: successCount > 0,
          message: `处理部分完成：${successCount}个任务已完成，但启用停用商品时出错`,
          successCount,
          failureCount,
          enabledProductsCount: 0,
          enableError: error.message
        }
      }
    }

    // 返回执行结果摘要
    if (successCount > 0 && failureCount > 0) {
      return {
        success: true,
        message: `处理完成，部分成功：成功${successCount}个任务，失败${failureCount}个任务`,
        successCount,
        failureCount
      }
    } else if (failureCount > 0) {
      return {
        success: false,
        message: `处理失败：所有${failureCount}个任务均未成功完成`,
        successCount,
        failureCount
      }
    } else {
      return {
        success: true,
        message: `处理成功：全部${successCount}个任务已成功完成`,
        successCount,
        failureCount
      }
    }
  } catch (error) {
    console.error('批量执行任务出错:', error)
    return {
      success: false,
      message: error.message || '执行任务时出错',
      error: error
    }
  } finally {
    // 移除状态指示器
    if (statusDiv && statusDiv.parentNode) {
      document.body.removeChild(statusDiv)
    }
  }
}
