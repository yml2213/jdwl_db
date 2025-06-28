/**
 * 任务流执行器 - 退货入库流程
 * 通过通用执行器生成器创建
 */
import returnStorageFeature from './returnStorage'
import { createTaskFlowExecutor } from './utils/taskUtils'

// 定义退货入库流程的所有步骤
const returnStorageSteps = [
  {
    name: '执行退货入库',
    // 只有一个步骤，所以总是执行
    shouldExecute: () => true,
    execute: (context, helpers) => returnStorageFeature.execute(context, helpers)
  }
]

// 调用通用生成器，创建并导出执行器
export default createTaskFlowExecutor('returnStorageFlow', '退货入库流程', returnStorageSteps)
