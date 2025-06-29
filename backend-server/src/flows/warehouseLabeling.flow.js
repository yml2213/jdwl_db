/**
 * 后端工作流：入仓打标
 * 负责编排一系列后端任务，以完成一个完整的业务流程。
 */
import path from 'path'
import { fileURLToPath } from 'url'

// 动态加载并执行任务的辅助函数
async function executeTask(taskName, payload, session) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const taskPath = path.join(__dirname, '..', 'tasks', `${taskName}.task.js`)
  const taskModule = await import(taskPath)
  if (!taskModule.default || typeof taskModule.default.execute !== 'function') {
    throw new Error(`任务 ${taskName} 或其 execute 方法未找到`)
  }
  return taskModule.default.execute(payload, session)
}

// 定义工作流的所有步骤
const workflowSteps = [
  {
    name: '导入店铺商品',
    shouldExecute: (context) => context.options.importStore,
    execute: (context, session) => executeTask('importStoreProducts', context, session)
  },
  {
    name: '启用店铺商品',
    shouldExecute: (context) => context.options.useStore,
    execute: (context, session) => executeTask('enableStoreProducts', context, session)
  },
  {
    name: '等待后台任务处理',
    shouldExecute: (context) =>
      context.options.importStore && context.quickSelect === 'warehouseLabeling',
    execute: async (context, session, log) => {
      log('等待3秒，以便服务器处理后台任务...')
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  },
  {
    name: '获取店铺商品编号',
    shouldExecute: (context) =>
      context.options.importStore && context.quickSelect === 'warehouseLabeling',
    execute: async (context, session, log) => {
      const result = await executeTask('getCSG', context, session)
      if (!result.success || !result.csgList || result.csgList.length === 0) {
        throw new Error(result.message || '未能获取到CSG编号，可能是后台任务尚未完成。')
      }
      log(`成功获取到 ${result.csgList.length} 个CSG编号。`)
      // 将 csgList 返回，以合并到主上下文中供后续步骤使用
      return { csgList: result.csgList }
    }
  },
  {
    name: '导入物流属性',
    shouldExecute: (context) => context.options.importProps,
    execute: (context, session) => executeTask('importLogisticsAttributes', context, session)
  },
  {
    name: '等待物流属性后台任务处理',
    shouldExecute: (context) => context.options.importProps,
    execute: async (context, session, log) => {
      log('等待3秒，以便服务器处理后台任务...')
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  },
  // TODO: `addInventory` 任务尚不存在，暂时注释
  // {
  //   name: '添加库存',
  //   shouldExecute: (context) => context.options.useAddInventory,
  //   execute: (context, session) => executeTask('addInventory', context, session),
  // },
  {
    name: '启用库存商品分配',
    shouldExecute: (context) => context.options.useMainData,
    execute: (context, session) => executeTask('enableInventoryAllocation', context, session)
  }
  // TODO: `enableJpSearch` 任务尚不存在，暂时注释
  // {
  //   name: '启用京配打标生效',
  //   shouldExecute: (context) => context.options.useJPEffect,
  //   execute: (context, session) => executeTask('enableJpSearch', context, session),
  // },
]

/**
 * 主执行函数
 * @param {object} context - 从前端接收的完整上下文 (payload)
 * @param {object} session - 当前用户的会话对象
 * @param {Function} log - 用于发送日志回前端的函数
 */
async function execute(context, session, log) {
  let currentContext = { ...context }

  for (const step of workflowSteps) {
    if (step.shouldExecute(currentContext)) {
      try {
        log(`--- 开始执行步骤: ${step.name} ---`)
        const result = await step.execute(currentContext, session, log)

        if (result && typeof result === 'object') {
          // 将步骤的执行结果合并到上下文中，供后续步骤使用
          currentContext = { ...currentContext, ...result }
        }
        log(`步骤 [${step.name}] 执行成功。`)
      } catch (error) {
        log(`步骤 [${step.name}] 执行失败: ${error.message}`, 'error')
        // 抛出错误以终止整个工作流
        throw new Error(`工作流在步骤 [${step.name}] 失败: ${error.message}`)
      }
    }
  }

  log('--- 工作流所有步骤执行完毕 ---', 'success')
  return {
    success: true,
    message: '工作流成功执行完毕。'
  }
}

export default {
  name: 'warehouseLabeling',
  execute
} 