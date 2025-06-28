/**
 * 任务流执行器 - 清库下架流程
 * 通过通用执行器生成器创建
 */
import stockAllocationClearanceFeature from './stockAllocationClearance'
import cancelJpSearchFeature from './cancelJpSearch'
import { createTaskFlowExecutor } from './utils/taskUtils'

// 1. 定义清库下架流程的所有步骤
const stockClearanceSteps = [
  {
    name: '库存分配清零',
    shouldExecute: (context) => context.options.clearStockAllocation,
    execute: (context, helpers) => stockAllocationClearanceFeature.execute(context, helpers)
  },
  {
    name: '取消京配打标',
    shouldExecute: (context) => context.options.cancelJpSearch,
    execute: (context, helpers) => cancelJpSearchFeature.execute(context, helpers)
  }
]

// 2. 调用通用生成器，创建并导出执行器
export default createTaskFlowExecutor('stockClearanceFlow', '清库下架流程', stockClearanceSteps)
