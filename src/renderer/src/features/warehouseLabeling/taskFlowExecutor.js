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

class TaskFlowExecutor {
    constructor(task, onLog) {
        this.task = task
        this.onLog = onLog // 日志回调函数
        this.isCancelled = false
    }

    log(message, level = 'info') {
        if (this.onLog) {
            this.onLog({
                message: `[${new Date().toLocaleTimeString()}] ${message}`,
                level
            })
        }
        console.log(message)
    }

    async execute() {
        this.log(`任务流 [${this.task.功能}] 开始执行...`)
        this.task.状态 = '执行中'

        for (const step of taskFlowSteps) {
            if (this.isCancelled) {
                this.log(`任务流被取消，停止执行。`, 'warning')
                this.task.状态 = '已取消'
                break
            }

            // 检查任务选项中是否启用了此步骤
            if (this.task.选项 && this.task.选项[step.option]) {
                this.log(`--- 开始执行步骤: ${step.name} ---`, 'step')

                try {
                    const result = await this.executeStepWithRetry(step)
                    if (!result.success) {
                        const errorMessage = `步骤 [${step.name}] 执行失败: ${result.message}`
                        this.log(errorMessage, 'error')
                        this.task.状态 = '失败'
                        this.task.结果 = errorMessage
                        return // 关键步骤失败，终止整个任务流
                    }

                    this.log(`步骤 [${step.name}] 执行成功。`, 'success')

                    // 如果是导入店铺商品步骤，则等待一段时间
                    if (step.option === 'importStore') {
                        this.log('等待15秒，以便服务器处理后台任务...')
                        await wait(15000)
                    }
                } catch (error) {
                    const errorMessage = `步骤 [${step.name}] 发生严重错误: ${error.message}`
                    this.log(errorMessage, 'error')
                    this.task.状态 = '失败'
                    this.task.结果 = errorMessage
                    return
                }
            }
        }

        if (this.task.状态 === '执行中') {
            this.log('任务流所有步骤执行完毕。', 'success')
            this.task.状态 = '成功'
            this.task.结果 = '任务流执行成功'
        }
    }

    async executeStepWithRetry(step, maxRetries = 2) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 执行原始步骤
                const inventoryAmount = this.task.选项.inventoryAmount || 1000
                let result
                if (step.option === 'useAddInventory') {
                    result = await step.executor.execute(
                        this.task.skuList,
                        this.task,
                        null,
                        inventoryAmount
                    )
                } else {
                    result = await step.executor.execute(this.task.skuList, this.task)
                }

                // 检查结果是否需要重试
                if (
                    result &&
                    !result.success &&
                    result.retryable &&
                    result.message &&
                    result.message.includes('分钟内只能导入一次')
                ) {
                    if (attempt < maxRetries) {
                        const delay = result.delay || 300000 // 默认5分钟
                        const randomDelay = Math.floor(Math.random() * 5000) // 增加随机延迟避免同时重试
                        const totalDelay = delay + randomDelay
                        this.log(
                            `步骤 [${step.name}] 遇到可重试错误: ${result.message
                            }. 将在约 ${Math.round(totalDelay / 60000)} 分钟后进行第 ${attempt + 1
                            } 次尝试...`,
                            'warning'
                        )
                        await wait(totalDelay)
                        continue // 继续下一次循环尝试
                    } else {
                        this.log(
                            `步骤 [${step.name}] 已达到最大重试次数 (${maxRetries})，标记为失败。`,
                            'error'
                        )
                        return {
                            success: false,
                            message: `重试 ${maxRetries} 次后仍然失败: ${result.message}`
                        }
                    }
                }

                // 如果执行成功或遇到不可重试的错误，则直接返回结果
                return result
            } catch (error) {
                this.log(`步骤 [${step.name}] 第 ${attempt} 次尝试时发生异常: ${error.message}`, 'error')
                if (attempt < maxRetries) {
                    // 对于未知异常，可以采用较短的延迟重试
                    await wait(5000)
                } else {
                    this.log(
                        `步骤 [${step.name}] 发生异常且已达到最大重试次数，标记为失败。`,
                        'error'
                    )
                    return {
                        success: false,
                        message: `重试 ${maxRetries} 次后因异常失败: ${error.message}`
                    }
                }
            }
        }
    }

    cancel() {
        this.isCancelled = true
    }
}

export default TaskFlowExecutor 