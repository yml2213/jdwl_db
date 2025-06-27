/**
 * 任务流执行器
 * 专用于处理'入仓打标'等多步骤、有顺序、有延迟的任务流
 */
import {
    wait
} from './utils/taskUtils'
import importStoreProductsFeature from './importStoreProducts'
import logisticsAttributesFeature from './logisticsAttributes'
import addInventoryFeature from './addInventory'
import importGoodsStockConfigFeature from './importGoodsStockConfig'
import enableJpSearchFeature from './enableJpSearch'

// 定义任务流的每个步骤
const taskFlowSteps = [
    {
        name: '导入店铺商品',
        shouldExecute: (context) => context.options.importStore,
        execute: (context, helpers) => importStoreProductsFeature.execute(context, helpers)
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

    async execute(context, helpers) {
        const { log, isRunning } = helpers;

        log('入仓打标流程开始...', 'info');

        for (const step of taskFlowSteps) {
            if (!isRunning.value) {
                log('任务被取消，停止执行。', 'warning');
                return { success: false, message: '任务已取消' };
            }

            if (step.shouldExecute(context)) {
                log(`--- 开始执行步骤: ${step.name} ---`, 'info');
                try {
                    const result = await step.execute(context, helpers);
                    if (result && result.success === false) {
                        // 如果步骤执行返回明确的失败，则中断流程
                        throw new Error(result.message || `步骤 [${step.name}] 执行失败，但未提供明确错误信息。`);
                    }
                    log(`步骤 [${step.name}] 执行成功。`, 'success');
                } catch (error) {
                    const errorMessage = `步骤 [${step.name}] 发生错误: ${error.message}`;
                    log(errorMessage, 'error');
                    throw new Error(errorMessage);
                }
            }
        }

        log('入仓打标流程所有步骤执行完毕。', 'success');
        return { success: true, message: '入仓打标流程执行成功' };
    }
} 