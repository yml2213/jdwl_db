/**
 * 任务流执行器
 * 专用于处理'入仓打标'等多步骤、有顺序、有延迟的任务流
 */
import importStoreProductsFeature from './importStoreProducts'
import logisticsAttributesFeature from './logisticsAttributes'
import addInventoryFeature from './addInventory'
import importGoodsStockConfigFeature from './importGoodsStockConfig'
import enableJpSearchFeature from './enableJpSearch'
import enableStoreProductsFeature from './enableStoreProducts'

// 定义任务流的每个步骤
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
        shouldExecute: (context) => context.options.importStore,
        execute: async (context, { log, isRunning }) => {
            log('--- 开始执行步骤: 等待后台任务处理 ---', 'step')
            log('等待3秒，以便服务器处理后台任务...', 'info')
            await new Promise((resolve) => setTimeout(resolve, 3000))
            log('步骤 [等待后台任务处理] 执行成功.', 'success')
        }
    },
    {
        name: '导入物流属性',
        shouldExecute: (context) => context.options.importProps,
        execute: (context, helpers) => logisticsAttributesFeature.execute(context, helpers)
    },
    {
        name: '添加库存',
        shouldExecute: (context) => context.options.useAddInventory,
        execute: (context, helpers) => addInventoryFeature.execute(context, helpers)
    },
    {
        name: '启用库存商品分配',
        shouldExecute: (context) => context.options.useWarehouse,
        execute: (context, helpers) => importGoodsStockConfigFeature.execute(context, helpers)
    },
    {
        name: '启用京配打标生效',
        shouldExecute: (context) => context.options.useJdEffect,
        execute: (context, helpers) => enableJpSearchFeature.execute(context, helpers)
    }
]

export default {
    name: 'warehouseLabelingFlow',
    label: '入仓打标流程',

    async execute(context, { log: originalLog, isRunning }) {
        const isManual = context.quickSelect === 'manual'

        const log = (message, type) => {
            if (isManual && type === 'step') {
                return // 在手动模式下，不记录步骤信息
            }
            originalLog(message, type)
        }

        log(`任务 "${context.taskName}" 开始...`, 'info')

        for (const step of taskFlowSteps) {
            if (step.shouldExecute(context)) {
                if (!isRunning.value) {
                    log('任务被手动取消。', 'warning')
                    return { success: false, message: '任务已取消' }
                }

                if (!isManual) {
                    log(`--- 开始执行步骤: ${step.name} ---`, 'step')
                }
                try {
                    const result = await step.execute(context, { log, isRunning, isManual })
                    if (result && result.success === false) {
                        log(`步骤 [${step.name}] 执行失败: ${result.message}`, 'error')
                        return result
                    }
                    if (!isManual) {
                        log(`步骤 [${step.name}] 执行成功。`, 'success')
                    }
                } catch (e) {
                    const errorMessage = e.message || '未知错误'
                    log(`步骤 [${step.name}] 发生意外错误: ${errorMessage}`, 'error')
                    return { success: false, message: `步骤 [${step.name}] 失败: ${errorMessage}` }
                }
            }
        }

        log(`任务 "${context.taskName}" 所有步骤执行完毕。`, 'success')
        return { success: true, message: '任务执行成功' }
    }
} 