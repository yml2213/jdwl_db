/**
 * 后端工作流：入仓打标
 * 负责编排一系列后端任务，以完成一个完整的业务流程。
 */
import path from 'path'
import { fileURLToPath } from 'url'

// 动态加载并执行任务的辅助函数
async function executeTask(taskName, payload, session, log) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const taskPath = path.join(__dirname, '..', 'tasks', `${taskName}.task.js`)
  const taskModule = await import(taskPath)
  if (!taskModule.default || typeof taskModule.default.execute !== 'function') {
    throw new Error(`任务 ${taskName} 或其 execute 方法未找到`)
  }
  log(`开始执行任务: ${taskName}...`)
  const result = await taskModule.default.execute(payload, session)
  log(`任务: ${taskName} 执行完成`)
  return result
}

// 任务定义，包含批处理和延迟的配置
const tasks = {
  importStoreProducts: {
    name: '导入店铺商品',
    shouldExecute: (context) => context.options.importStoreProducts,
    execute: (context, session, log) => executeTask('importStoreProducts', context, session, log)
  },
  waitAfterImport: {
    name: '等待店铺商品导入后台处理',
    shouldExecute: (context) => context.options.importStoreProducts,
    execute: async (context, session, log) => {
      const waitSeconds = 5
      const logPrefix = '[初始化][等待商品导入]'
      await delayWithCountdown(
        waitSeconds,
        log,
        `${logPrefix} 京东后台正在处理商品数据，请稍候...`
      )
      log(`${logPrefix} 等待完成，继续下一步操作。`, 'success')
      return { success: true }
    }
  },
  enableStoreProducts: {
    name: '启用店铺商品',
    shouldExecute: (context) => context.options.enableStoreProducts,
    execute: (context, session, log) => executeTask('enableStoreProducts', context, session, log)
  },
  getCSGList: {
    name: '获取店铺商品编号',
    shouldExecute: (context) => context.options.importStoreProducts,
    execute: async (context, session, log) => {
      log('正在获取店铺商品CSG编号列表...')
      const result = await executeTask('getCSG', context, session, log)
      if (!result.success || !result.csgList || result.csgList.length === 0) {
        throw new Error(result.message || '未能获取到CSG编号，可能是后台任务尚未完成。')
      }
      log(`成功获取到 ${result.csgList.length} 个CSG编号。`)
      return { csgList: result.csgList }
    }
  },
  importLogisticsAttributes: {
    name: '导入物流属性',
    batchSize: 2000,
    delayBetweenBatches: 300, // 5 分钟
    shouldExecute: (context) => context.options.importLogisticsAttributes,
    execute: (context, session, log) => {
      const taskPayload = { ...context, logisticsOptions: context.logistics }
      return executeTask('importLogisticsAttributes', taskPayload, session, log)
    }
  },
  enableInventoryAllocation: {
    name: '启用库存商品分配',
    batchSize: 2000,
    delayBetweenBatches: 5, // 5 秒
    shouldExecute: (context) => context.options.enableInventoryAllocation,
    execute: (context, session, log) =>
      executeTask('enableInventoryAllocation', context, session, log)
  },
  addInventory: {
    name: '添加库存',
    batchSize: 500,
    delayBetweenBatches: 60, // 1 分钟
    shouldExecute: (context) => context.options.addInventory,
    execute: (context, session, log) => executeTask('addInventory', context, session, log)
  },
  enableJpSearch: {
    name: '启用京配打标生效',
    batchSize: 2000,
    delayBetweenBatches: 5, // 5 秒
    shouldExecute: (context) => context.options.enableJpSearch,
    execute: (context, session, log) => executeTask('enableJpSearch', context, session, log)
  },
  importProductNames: (context, session, log) =>
    executeTask('importProductNames', context, session, log)
}

// --- 辅助函数 ---
function createBatches(items, batchSize) {
  const batches = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }
  return batches
}

async function delayWithCountdown(seconds, log, messagePrefix) {
  if (seconds <= 0) return
  log(`${messagePrefix} 开始等待 ${seconds} 秒...`)
  for (let i = seconds; i > 0; i--) {
    // 对于较长的等待，可以减少日志输出频率
    if (seconds > 30 && i % 30 !== 0 && i > 10) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      continue
    }
    if (seconds <= 30 || (seconds > 30 && (i % 30 === 0 || i <= 10))) {
      log(`${messagePrefix} ...剩余 ${i} 秒...`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  log(`${messagePrefix} 等待结束。`, 'success')
}

// Main execution function
async function execute(context, session, log) {
  log('开始执行工作流: 入仓打标...', 'info')
  log(`[调试] 收到的原始 context: ${JSON.stringify(context, null, 2)}`, 'info')

  // 确保 context.options 存在，避免后续操作因 undefined 出错
  let currentContext = {
    ...context,
    options: context.options || {}
  }
  let csgList = currentContext.skus || []

  try {
    // 步骤 1: 准备商品源
    if (tasks.importStoreProducts.shouldExecute(currentContext)) {
      await tasks.importStoreProducts.execute(currentContext, session, log)
      await tasks.waitAfterImport.execute(currentContext, session, log)
    } else if (tasks.enableStoreProducts.shouldExecute(currentContext)) {
      await tasks.enableStoreProducts.execute(currentContext, session, log)
    }

    // 步骤 2: 获取商品 CSG 列表
    // 如果是通过导入或使用店铺所有商品，则需要从页面获取 CSG 列表
    if (currentContext.options.importStoreProducts || currentContext.options.enableStoreProducts) {
      log('正在获取店铺商品CSG编号列表...')
      const result = await executeTask('getCSG', currentContext, session, log)
      if (!result.success || !result.csgList || result.csgList.length === 0) {
        throw new Error(result.message || '未能获取到CSG编号，可能是后台任务尚未完成。')
      }
      log(`成功获取到 ${result.csgList.length} 个CSG编号。`)
      csgList = result.csgList
    }

    if (!csgList || csgList.length === 0) {
      log('没有需要处理的商品 (SKU/CSG 列表为空)，工作流结束。', 'warning')
      return { success: true, message: '没有需要处理的商品。' }
    }

    currentContext = { ...currentContext, csgList }

    // 步骤 3: 执行批量任务 - 顺序根据 note.txt 调整
    const batchableTasksDefinition = [
      { name: 'importLogisticsAttributes', task: tasks.importLogisticsAttributes },
      { name: 'addInventory', task: tasks.addInventory },
      { name: 'enableInventoryAllocation', task: tasks.enableInventoryAllocation },
      { name: 'enableJpSearch', task: tasks.enableJpSearch }
    ]

    for (const taskDef of batchableTasksDefinition) {
      if (taskDef.task.shouldExecute(currentContext)) {
        log(`开始批量任务: ${taskDef.task.name}...`, 'info')
        const batches = createBatches(csgList, taskDef.task.batchSize)
        log(`商品列表已分为 ${batches.length} 个批次进行处理，每批次 ${taskDef.task.batchSize} 个。`)

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i]
          const batchContext = { ...currentContext, csgList: batch }
          log(`处理批次 ${i + 1}/${batches.length} (共 ${batch.length} 个商品)...`)
          await taskDef.task.execute(batchContext, session, log)

          if (i < batches.length - 1 && taskDef.task.delayBetweenBatches > 0) {
            await delayWithCountdown(
              taskDef.task.delayBetweenBatches,
              log,
              `批次 ${i + 1} 处理完毕，等待 ${taskDef.task.delayBetweenBatches} 秒`
            )
          }
        }
        log(`批量任务: ${taskDef.task.name} 已全部处理完成。`, 'success')
      }
    }

    log('工作流: 入仓打标 执行完毕。', 'success')
    return { success: true, message: '入仓打标工作流执行完毕' }
  } catch (error) {
    log(`工作流执行时发生错误: ${error.message}`, 'error')
    console.error(error)
    return { success: false, message: `工作流失败: ${error.message}` }
  }
}

export default { execute } 