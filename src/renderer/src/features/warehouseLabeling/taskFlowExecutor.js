/**
 * 任务流执行器 - 入仓打标流程
 * 通过通用执行器生成器创建
 */
import importStoreProductsFeature from './importStoreProducts'
import enableStoreProductsFeature from './enableStoreProducts'
import logisticsAttributesFeature from './logisticsAttributes'
import addInventoryFeature from './addInventory'
import importGoodsStockConfigFeature from './importGoodsStockConfig'
import enableJpSearchFeature from './enableJpSearch'
import { executeTask } from '../../services/apiService'
import { createTaskFlowExecutor } from './utils/taskUtils'

// 1. 定义此流程独有的所有步骤
const taskFlowSteps = [
  {
    name: '导入店铺商品',
    shouldExecute: (context) => context.options.importStore,
    execute: (context, helpers) => importStoreProductsFeature.execute(context, helpers)
  },
  {
    name: '启用店铺商品',
    shouldExecute: (context) => context.options.useStore,
    execute: (context, helpers) => enableStoreProductsFeature.execute(context, helpers)
  },
  {
    name: '等待后台任务处理',
    shouldExecute: (context) =>
      context.options.importStore && context.quickSelect === 'warehouseLabeling',
    execute: async (context, { log }) => {
      log('--- 开始执行步骤: 等待后台任务处理 ---', 'step')
      log('等待3秒，以便服务器处理后台任务...', 'info')
      await new Promise((resolve) => setTimeout(resolve, 3000))
      log('步骤 [等待后台任务处理] 执行成功.', 'success')
    }
  },
  {
    name: '获取店铺商品编号',
    shouldExecute: (context) =>
      context.options.importStore && context.quickSelect === 'warehouseLabeling',
    execute: async (context, { log }) => {
      log('正在请求后端执行[获取店铺商品编号]任务...', 'info')
      const result = await executeTask('getCSG', {
        skus: context.skus,
        store: context.store
      })
      if (!result.success || !result.csgList || result.csgList.length === 0) {
        throw new Error(result.message || '未能获取到CSG编号，可能是后台任务尚未完成。')
      }
      log(`成功获取到 ${result.csgList.length} 个CSG编号。`, 'success')
      return { csgList: result.csgList }
    }
  },
  {
    name: '导入物流属性',
    shouldExecute: (context) => context.options.importProps,
    execute: (context, helpers) => logisticsAttributesFeature.execute(context, helpers)
  },
  {
    name: '等待物流属性后台任务处理',
    shouldExecute: (context) => context.options.importProps,
    execute: async (context, { log }) => {
      log('--- 开始执行步骤: 等待物流属性后台任务处理 ---', 'step')
      log('等待3秒，以便服务器处理后台任务...', 'info')
      await new Promise((resolve) => setTimeout(resolve, 3000))
      log('步骤 [等待物流属性后台任务处理] 执行成功.', 'success')
    }
  },
  {
    name: '添加库存',
    shouldExecute: (context) => context.options.useAddInventory,
    execute: (context, helpers) => addInventoryFeature.execute(context, helpers)
  },
  {
    name: '启用库存商品分配',
    shouldExecute: (context) => context.options.useMainData,
    execute: (context, helpers) => importGoodsStockConfigFeature.execute(context, helpers)
  },
  {
    name: '启用京配打标生效',
    shouldExecute: (context) => context.options.useJPEffect,
    execute: (context, helpers) => enableJpSearchFeature.execute(context, helpers)
  }
]

// 2. 调用生成器，传入特定配置，并导出结果
export default createTaskFlowExecutor('warehouseLabelingFlow', '入仓打标流程', taskFlowSteps)
