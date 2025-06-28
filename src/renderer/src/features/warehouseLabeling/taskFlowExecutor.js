/**
 * 任务流执行器
 * 专用于处理'入仓打标'等多步骤、有顺序、有延迟的任务流
 */
import importStoreProductsFeature from './importStoreProducts'
import logisticsAttributesFeature from './logisticsAttributes'
import addInventoryFeature from './addInventory'
import importGoodsStockConfigFeature from './importGoodsStockConfig'
import enableJpSearchFeature from './enableJpSearch'
import { executeTask } from '../../services/apiService'

// 定义任务流的每个步骤
const taskFlowSteps = [
    {
        name: '导入店铺商品',
        shouldExecute: (context) => context.options.importStore,
        execute: (context, helpers) => importStoreProductsFeature.execute(context, helpers)
    },
    {
        name: '等待后台任务处理',
        shouldExecute: (context) => context.options.importStore && context.quickSelect === 'warehouseLabeling',
        execute: async (context, { log }) => {
            log('--- 开始执行步骤: 等待后台任务处理 ---', 'step')
            log('等待3秒，以便服务器处理后台任务...', 'info')
            await new Promise((resolve) => setTimeout(resolve, 3000))
            log('步骤 [等待后台任务处理] 执行成功.', 'success')
        }
    },
    {
        name: '获取店铺商品编号',
        shouldExecute: (context) => context.options.importStore && context.quickSelect === 'warehouseLabeling',
        execute: async (context, { log }) => {
            log('正在请求后端执行[获取店铺商品编号]任务...', 'info')
            // 调用后端的 'getCSG' 任务
            const result = await executeTask('getCSG', {
                skus: context.skus,
                store: context.store
            })
            if (!result.success || !result.csgList || result.csgList.length === 0) {
                throw new Error(result.message || '未能获取到CSG编号，可能是后台任务尚未完成。')
            }
            log(`成功获取到 ${result.csgList.length} 个CSG编号。`, 'success')
            // **关键**: 返回 csgList 以便合并到 context 中
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

                    // 将上一步的结果合并到上下文中，为下一步做准备
                    if (result && typeof result === 'object') {
                        Object.assign(context, result)
                    }

                    if (result && result.success === false) {
                        const errorMessage = `步骤 [${step.name}] 执行失败: ${result.message}`
                        log(errorMessage, 'error')
                        // 抛出错误，以便被外层 `useTask` 的 catch 块捕获
                        throw new Error(errorMessage)
                    }
                    if (!isManual) {
                        log(`步骤 [${step.name}] 执行成功。`, 'success')
                    }
                } catch (e) {
                    const errorMessage = e.message || '未知错误'
                    log(`步骤 [${step.name}] 发生意外错误: ${errorMessage}`, 'error')
                    // 重新抛出错误，确保任务状态被正确设置为失败
                    throw new Error(`步骤 [${step.name}] 失败: ${errorMessage}`)
                }
            }
        }

        log(`任务 "${context.taskName}" 所有步骤执行完毕。`, 'success')
        return { success: true, message: '任务执行成功' }
    }
}
