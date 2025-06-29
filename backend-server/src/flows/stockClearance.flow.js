/**
 * 后端工作流：清库下标
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

const workflowSteps = [
  {
    name: '清零库存分配',
    shouldExecute: (context) => context.options.clearStockAllocation,
    execute: (context, session) => executeTask('clearStockAllocation', context, session)
  },
  {
    name: '取消京配',
    shouldExecute: (context) => context.options.cancelJpSearch,
    execute: (context, session, log) => {
      log('注意：[取消京配] 功能暂未实现。', 'warn')
      // return Promise.resolve() // 简单返回，不执行任何操作
    }
  }
]

async function execute(context, session, log) {
  let currentContext = { ...context }
  let executedSomething = false

  for (const step of workflowSteps) {
    if (step.shouldExecute(currentContext)) {
      executedSomething = true
      try {
        log(`--- 开始执行步骤: ${step.name} ---`)
        const result = await step.execute(currentContext, session, log)
        if (result) {
          currentContext = { ...currentContext, ...result }
        }
        log(`步骤 [${step.name}] 执行成功。`)
      } catch (error) {
        log(`步骤 [${step.name}] 执行失败: ${error.message}`, 'error')
        throw new Error(`工作流在步骤 [${step.name}] 失败: ${error.message}`)
      }
    }
  }

  if (!executedSomething) {
    throw new Error('没有选择任何可执行的操作。')
  }

  log('--- 清库下标工作流执行完毕 ---', 'success')
  return { success: true, message: '工作流成功执行完毕。' }
}

export default {
  name: 'stockClearance',
  execute
} 