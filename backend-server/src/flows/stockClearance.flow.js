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
    execute: (context, session) => executeTask('cancelJpSearch', context, session)
  }
]

async function execute(context, session, log) {
  let currentContext = { ...context }
  let executedSomething = false
  const stepResults = []

  for (const step of workflowSteps) {
    if (step.shouldExecute(currentContext)) {
      executedSomething = true
      try {
        log(`--- 开始执行步骤: ${step.name} ---`)
        const result = await step.execute(currentContext, session, log)
        if (result) {
          currentContext = { ...currentContext, ...result }
          stepResults.push({ name: step.name, message: result.message })
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
  // Return a combined message from all successful steps
  const finalMessage =
    stepResults.map((r) => `${r.name}: ${r.message}`).join('; ') || '工作流成功执行完毕。'
  return { success: true, message: finalMessage, results: stepResults }
}

export default {
  name: 'stockClearance',
  execute
} 