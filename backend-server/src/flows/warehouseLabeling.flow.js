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
    shouldExecute: (context) => context.options.importStore,
    execute: (context, session, log) => executeTask('importStoreProducts', context, session, log)
  },
  waitAfterImport: {
    name: '等待店铺商品导入后台处理',
    shouldExecute: (context) => context.options.importStore,
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
    shouldExecute: (context) => context.options.useStore,
    execute: (context, session, log) => executeTask('enableStoreProducts', context, session, log)
  },
  getCSGList: {
    name: '获取店铺商品编号',
    shouldExecute: (context) => context.options.importStore,
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
    shouldExecute: (context) => context.options.importProps,
    execute: (context, session, log) => {
      const taskPayload = { ...context, logisticsOptions: context.options.logistics }
      return executeTask('importLogisticsAttributes', taskPayload, session, log)
    }
  },
  enableInventoryAllocation: {
    name: '启用库存商品分配',
    batchSize: 2000,
    delayBetweenBatches: 5, // 5 秒
    shouldExecute: (context) => context.options.useMainData,
    execute: (context, session, log) =>
      executeTask('enableInventoryAllocation', context, session, log)
  },
  addInventory: {
    name: '添加库存',
    batchSize: 500,
    delayBetweenBatches: 60, // 1 分钟
    shouldExecute: (context) => context.options.useAddInventory,
    execute: (context, session, log) => executeTask('addInventory', context, session, log)
  },
  enableJpSearch: {
    name: '启用京配打标生效',
    batchSize: 2000,
    delayBetweenBatches: 5, // 5 秒
    shouldExecute: (context) => context.options.useJPEffect,
    execute: (context, session, log) => executeTask('enableJpSearch', context, session, log)
  }
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

/**
 * 主执行函数
 * @param {object} context - 从前端接收的完整上下文 (payload)
 * @param {object} session - 当前用户的会话对象
 * @param {Function} log - 用于发送日志回前端的函数
 */
async function execute(context, session, log) {
  // --- 标准化上下文 ---
  // 强制净化并统一上下文，确保所有任务都使用源自同一个店铺实体的信息。
  if (context.store) {
    const { store } = context
    if (store.shopName && store.name !== store.shopName) {
      console.log(`[Workflow Normalization] 标准化店铺名称: 从 "${store.name}" 改为 "${store.shopName}"`)
      store.name = store.shopName
    }

    // 基于 store 对象，重建纯净的 department 和 vendor 对象，防止上下文污染
    context.department = {
      id: store.deptId,
      name: store.deptName,
      deptNo: store.deptNo,
      sellerId: store.sellerId,
      sellerName: store.sellerName,
      sellerNo: store.sellerNo
    }
    context.vendor = {
      id: store.supplierNo, // 假设供应商编号在 store.supplierNo
      name: store.deptName, // 通常供应商名称与事业部名称相同
      supplierNo: store.supplierNo
    }

    console.log('[Workflow Normalization] 上下文已净化，确保数据一致性。')
  }

  let currentContext = { ...context }
  const isWorkflow = context.quickSelect === 'warehouseLabeling'

  const enhancedLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    log(`[${timestamp}] ${message}`, type)
  }

  enhancedLog(`--- 工作流 [入仓打标] 开始 (${isWorkflow ? '工作流模式' : '手动模式'}) ---`)

  // --- 阶段1: 执行串行前置任务 ---
  enhancedLog('--- 阶段1: 开始执行初始化任务 ---')
  try {
    const setupTaskKeys = ['importStoreProducts', 'waitAfterImport', 'enableStoreProducts', 'getCSGList']
    for (const taskKey of setupTaskKeys) {
      const task = tasks[taskKey]
      if (isWorkflow || task.shouldExecute(currentContext)) {
        // 在执行 getCSGList 任务前，添加详细的上下文日志
        if (taskKey === 'getCSGList') {
          const contextToLog = {
            skus: currentContext.skus,
            store: currentContext.store,
            department: currentContext.department,
            vendor: currentContext.vendor
          }
          enhancedLog(
            `[Debug] 即将执行 getCSGList，传入的上下文关键内容: \n${JSON.stringify(
              contextToLog,
              null,
              2
            )}`,
            'info'
          )
        }

        enhancedLog(`[初始化] 开始执行: ${task.name}`)
        const result = await task.execute(currentContext, session, enhancedLog)
        if (result && result.success === false) {
          throw new Error(result.message || `任务 ${task.name} 返回失败状态。`)
        }
        if (result && typeof result === 'object') {
          currentContext = { ...currentContext, ...result }
        }
        enhancedLog(`[初始化] 成功完成: ${task.name}`, 'success')
      }
    }
    enhancedLog('--- 阶段1: 初始化任务全部完成 ---', 'success')
  } catch (error) {
    enhancedLog(`初始化阶段失败: ${error.message}`, 'error')
    throw error
  }

  // --- 阶段2: 并行流水线批处理 ---
  const csgList = currentContext.csgList || []
  const shouldRunPipelines = isWorkflow ||
    tasks.importLogisticsAttributes.shouldExecute(currentContext) ||
    tasks.enableInventoryAllocation.shouldExecute(currentContext)

  if (!shouldRunPipelines) {
    enhancedLog('--- 工作流结束: 无需执行后续批处理任务。 ---', 'success')
    return { success: true, message: '工作流前置任务执行完毕。' }
  }

  if (csgList.length === 0) {
    if (isWorkflow) {
      enhancedLog('商品CSG列表为空，无法进行后续批处理，工作流终止。', 'error')
      throw new Error('在工作流模式下，未能获取到任何商品，无法继续执行。')
    }
    enhancedLog('商品CSG列表为空，无法进行批处理，工作流结束。', 'warning')
    return { success: true, message: '商品CSG列表为空，无法进行后续操作。' }
  }

  enhancedLog(`--- 阶段2: 开始处理 ${csgList.length} 个商品 ---`)

  // --- 定义物流处理流水线 ---
  const logisticsPipeline = async () => {
    const logPrefix = '[物流线]'
    enhancedLog(`${logPrefix} ==> 流程启动`)

    if (!isWorkflow && !tasks.importLogisticsAttributes.shouldExecute(currentContext)) {
      enhancedLog(`${logPrefix} 无需执行，跳过。`, 'info')
      return `${logPrefix} 已跳过`
    }

    const mainTask = tasks.importLogisticsAttributes
    const dependentTask = tasks.addInventory
    const mainBatches = createBatches(csgList, mainTask.batchSize)
    const downstreamPromises = [] // 用于收集所有"发射"出去的依赖任务的Promise

    for (let i = 0; i < mainBatches.length; i++) {
      const mainBatch = mainBatches[i]
      const batchId = `批次 ${i + 1}/${mainBatches.length}`
      enhancedLog(`${logPrefix}[${batchId}] ==> 开始执行主任务 [${mainTask.name}] for ${mainBatch.length} 个商品...`)

      // 1. 执行主任务 (导入物流属性) 并等待其完成
      await mainTask.execute(
        { ...currentContext, csgList: mainBatch, skus: mainBatch },
        session,
        enhancedLog
      )
      enhancedLog(`${logPrefix}[${batchId}] <== 主任务 [${mainTask.name}] 执行完毕`, 'success')

      // 2. 将依赖任务作为一个独立的异步过程"发射"出去，不在此处等待
      const downstreamPromise = (async () => {
        enhancedLog(`${logPrefix}[${batchId}] --> 已触发依赖任务 [${dependentTask.name}] 异步执行...`)
        if (isWorkflow || dependentTask.shouldExecute(currentContext)) {
          const subBatches = createBatches(mainBatch, dependentTask.batchSize)
          for (let j = 0; j < subBatches.length; j++) {
            const subBatch = subBatches[j]
            const subBatchId = `子批次 ${j + 1}/${subBatches.length}`

            enhancedLog(`${logPrefix}[${batchId}][${subBatchId}] --> 开始处理...`)
            const dependentContext = { ...currentContext, csgList: subBatch, skus: subBatch, products: subBatch }
            await dependentTask.execute(dependentContext, session, enhancedLog)
            enhancedLog(`${logPrefix}[${batchId}][${subBatchId}] <-- [${dependentTask.name}] 执行完毕`, 'success')

            if (j < subBatches.length - 1) {
              await delayWithCountdown(
                dependentTask.delayBetweenBatches,
                enhancedLog,
                `${logPrefix}[${batchId}][${subBatchId}]`
              )
            }
          }
          enhancedLog(`${logPrefix}[${batchId}] <-- 所有依赖任务处理完成`, 'success')
        }
      })()
      downstreamPromises.push(downstreamPromise) // 收集Promise以便最后等待

      // 3. 如果不是最后一个主批次，则等待主任务的批次间隔，然后开始下一个主批次
      if (i < mainBatches.length - 1) {
        await delayWithCountdown(
          mainTask.delayBetweenBatches,
          enhancedLog,
          `${logPrefix} 主任务批次间`
        )
      }
    }

    // 等待所有被"发射"出去的后台任务全部完成
    await Promise.all(downstreamPromises)
    return `${logPrefix} 所有批次及依赖任务均已处理完成`
  }

  // --- 定义库存分配流水线 ---
  const allocationPipeline = async () => {
    const logPrefix = '[分配线]'
    enhancedLog(`${logPrefix} ==> 流程启动`)

    if (!isWorkflow && !tasks.enableInventoryAllocation.shouldExecute(currentContext)) {
      enhancedLog(`${logPrefix} 无需执行，跳过。`, 'info')
      return `${logPrefix} 已跳过`
    }

    const task1 = tasks.enableInventoryAllocation
    const task2 = tasks.enableJpSearch
    // 假设此流水线中的任务批次大小一致，若不一致需采用类似物流线的复杂逻辑
    const batches = createBatches(csgList, task1.batchSize)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const batchId = `批次 ${i + 1}/${batches.length}`
      const batchContext = { ...currentContext, csgList: batch, skus: batch }

      enhancedLog(`${logPrefix}[${batchId}] ==> 开始处理 ${batch.length} 个商品...`)

      // 1. 启用库存分配
      if (isWorkflow || task1.shouldExecute(batchContext)) {
        await task1.execute(batchContext, session, enhancedLog)
        enhancedLog(`${logPrefix}[${batchId}] <== [${task1.name}] 执行完毕`, 'success')
        if (batches.length > 1) await delayWithCountdown(task1.delayBetweenBatches, enhancedLog, `${logPrefix}[${batchId}] [${task1.name}]`)
      }

      // 2. 启用京配打标
      if (isWorkflow || task2.shouldExecute(batchContext)) {
        await task2.execute(batchContext, session, enhancedLog)
        enhancedLog(`${logPrefix}[${batchId}] <== [${task2.name}] 执行完毕`, 'success')
        if (batches.length > 1 && i < batches.length - 1) {
          // 批次之间等待
          await delayWithCountdown(
            task2.delayBetweenBatches,
            enhancedLog,
            `${logPrefix}[${batchId}] [${task2.name}]`
          )
        }
      }
      enhancedLog(`${logPrefix}[${batchId}] <== 处理完成`, 'success')
    }
    return `${logPrefix} 所有批次处理完成`
  }

  // --- 并行执行两个流水线 ---
  try {
    enhancedLog('--- 并行启动 [物流线] 与 [分配线] ---')
    const results = await Promise.all([logisticsPipeline(), allocationPipeline()])
    enhancedLog('--- 阶段2: 所有批处理任务完成 ---', 'success')
    results.forEach(res => enhancedLog(res, 'success'))
    enhancedLog('--- 工作流 [入仓打标] 所有任务执行完毕 ---', 'success')
    return { success: true, message: '工作流成功执行完毕。' }
  } catch (error) {
    enhancedLog(`批处理阶段出现严重错误: ${error.message}`, 'error')
    throw error
  }
}

export default {
  name: 'warehouseLabeling',
  execute
} 