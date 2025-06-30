/**
 * 后端工作流：退货入库
 */
import path from 'path'
import { fileURLToPath } from 'url'

async function executeTask(taskName, payload, session) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const taskPath = path.join(__dirname, '..', 'tasks', `${taskName}.task.js`)
  const taskModule = await import(taskPath)
  return taskModule.default.execute(payload, session)
}

async function execute(context, session, log) {
  log('--- 开始执行步骤: 退货入库 ---')
  try {
    const result = await executeTask('returnStorage', context, session)
    if (result && result.success === false) {
      throw new Error(result.message || '退货入库任务返回失败状态。')
    }
    log('步骤 [退货入库] 执行成功。')
    return { success: true, message: result.message || '工作流执行完毕。' }
  } catch (error) {
    log(`步骤 [退货入库] 执行失败: ${error.message}`, 'error')
    throw new Error(`工作流在步骤 [退货入库] 失败: ${error.message}`)
  }
}

export default {
  name: 'returnStorage',
  description: '退货入库',
  execute
} 