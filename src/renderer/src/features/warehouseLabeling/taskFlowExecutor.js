/**
 * 任务流执行器
 * 专用于处理'入仓打标'等多步骤、有顺序、有延迟的任务流
 */
import {
    wait
} from './utils/taskUtils'
import importStoreProductsFeature from './importStoreProducts'
import importLogisticsPropsFeature from './importLogisticsProperties'
import addInventoryFeature from './addInventory'
import importGoodsStockConfigFeature from './importGoodsStockConfig'
import enableJpSearchFeature from './enableJpSearch'
import enableStoreProductsFeature from './enableStoreProducts'

// 定义任务流的每个步骤
const taskFlowSteps = [{
    name: '导入店铺商品',
    option: 'importStore',
    executor: importStoreProductsFeature
},
{
    name: '导入物流属性',
    option: 'importProps',
    executor: importLogisticsPropsFeature
},
{
    name: '添加库存',
    option: 'useAddInventory',
    executor: addInventoryFeature
},
{
    name: '启用库存商品分配',
    option: 'useWarehouse',
    executor: importGoodsStockConfigFeature
},
{
    name: '启用京配打标生效',
    option: 'useJdEffect',
    executor: enableJpSearchFeature
}
]

async function executeStep(step, context, helpers, inventoryAmount) {
    // 适配器模式：根据步骤决定调用新接口还是旧接口
    if (step.executor.name === 'importStore') {
        // importStore 已经重构，直接调用新接口
        return await step.executor.execute(context, helpers)
    }

    // 对于尚未重构的模块，继续使用模拟的旧接口
    const mockTask = {
        店铺信息: context.shopInfo,
        事业部信息: context.departmentInfo,
        选项: context.options
    }

    let result
    if (step.option === 'useAddInventory') {
        result = await step.executor.execute(context.skuList, mockTask, null, inventoryAmount)
    } else {
        result = await step.executor.execute(context.skuList, mockTask)
    }

    if (!result.success) {
        throw new Error(result.message)
    }
    return result
}

export default {
    name: 'warehouseLabelingFlow',
    label: '入仓打标流程',

    async execute(context, helpers) {
        const { log, isCancelled } = helpers
        const { options, skuList } = context
        const inventoryAmount = options.inventoryAmount || 1000

        log({ message: `入仓打标流程开始...`, level: 'info' })

        for (const step of taskFlowSteps) {
            if (isCancelled()) {
                log({ message: `任务被取消，停止执行。`, level: 'warning' })
                return
            }

            if (options && options[step.option]) {
                log({ message: `--- 开始执行步骤: ${step.name} ---`, level: 'step' })

                try {
                    await executeStep(step, context, helpers, inventoryAmount)
                    log({ message: `步骤 [${step.name}] 执行成功。`, level: 'success' })

                    if (step.option === 'importStore') {
                        log({ message: '等待15秒，以便服务器处理后台任务...', level: 'info' })
                        await wait(15000)
                    }
                } catch (error) {
                    const errorMessage = `步骤 [${step.name}] 发生错误: ${error.message}`
                    log({ message: errorMessage, level: 'error' })
                    // 抛出错误以终止整个流程
                    throw new Error(errorMessage)
                }
            }
        }

        log({ message: '入仓打标流程所有步骤执行完毕。', level: 'success' })
        return { success: true, message: '入仓打标流程执行成功' }
    }
} 