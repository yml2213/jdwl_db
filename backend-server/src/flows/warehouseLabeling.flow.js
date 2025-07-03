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
  enableStoreProducts: {
    name: '启用店铺商品',
    shouldExecute: (context) => context.options.enableStoreProducts,
    execute: (context, session, log) => executeTask('enableStoreProducts', context, session, log)
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

// 主执行函数
async function execute(context, session, log) {
  log('开始执行工作流: 入仓打标...', 'info')
  log(`[调试] 收到的原始 context: ${JSON.stringify(context, null, 2)}`, 'info')

  // 确保 context.options 存在，避免后续操作因 undefined 出错
  let currentContext = {
    ...context,
    options: context.options || {}
  }
  // 统一商品源：无论是手动输入还是文件导入，都从 context.skus 获取
  const skuList = currentContext.skus || []

  try {
    // 如果没有提供任何 SKU，则直接结束
    if (skuList.length === 0) {
      log('没有需要处理的商品 (SKU 列表为空)，工作流结束。', 'warning')
      return { success: false, message: '没有需要处理的商品。' }
    }

    // 步骤 1: 执行预备任务
    if (tasks.importStoreProducts.shouldExecute(currentContext)) {
      await tasks.importStoreProducts.execute({ ...currentContext, skus: skuList }, session, log)
    }

    // 步骤 2: 核心数据查询 - 使用 getProductData 获取所有需要的商品信息
    log(`开始使用 getProductData 获取 ${skuList.length} 个SKU的详细数据...`)
    const productDataResult = await executeTask('getProductData', { skus: skuList }, session, log)
    if (!productDataResult.success || !productDataResult.data || productDataResult.data.length === 0) {
      throw new Error(productDataResult.message || '未能获取到商品详细信息。')
    }
    log(`成功获取到 ${productDataResult.data.length} 条商品详细数据。`)
    const allProductData = productDataResult.data

    // 步骤 3: 执行 启用店铺商品 任务 (此任务包含启用主数据和店铺商品两个步骤)
    if (tasks.enableStoreProducts.shouldExecute(currentContext)) {
      // 传递完整的商品数据，让任务自己提取所需信息
      await tasks.enableStoreProducts.execute({ ...currentContext, allProductData }, session, log)
    }

    // 步骤 4: 准备并执行后续的批量任务 (需要CSG - shopGoodsNo)
    const csgList = allProductData.map(p => p.shopGoodsNo).filter(Boolean)
    if (csgList.length === 0) {
      log('未能从查询结果中提取到任何有效的CSG编码，无法执行后续批量任务。', 'error')
      throw new Error('未能提取到有效的CSG编码。')
    }
    log(`提取到 ${csgList.length} 个CSG编码，准备执行批量任务...`)

    currentContext = { ...currentContext, csgList, allProductData }

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