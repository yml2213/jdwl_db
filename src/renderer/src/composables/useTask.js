import { reactive, toRefs } from 'vue'

/**
 * 一个通用的、可复用的任务执行器 (Vue Composable)
 * @param {object} featureDefinition - 功能定义对象，包含 name, label 和核心执行函数 execute
 */
export function useTask(featureDefinition) {
    // 响应式状态，用于驱动UI更新
    const state = reactive({
        isRunning: false,
        status: 'idle', // idle | running | success | error | batching
        logs: [],
        results: [],
        progress: { current: 0, total: 0 }
    })

    /**
     * 记录日志
     * @param {string} message - 日志信息
     * @param {'info' | 'success' | 'error' | 'warning'} type - 日志类型
     */
    const log = (message, type = 'info') => {
        state.logs.push({ message, type, time: new Date().toLocaleString() })
    }

    /**
     * 主执行函数
     * @param {object} context - 执行任务所需的上下文，例如 { skuList, shopInfo, options }
     * @returns {Promise<void>}
     */
    const execute = async (context) => {
        // 1. 初始化状态
        state.isRunning = true
        state.status = 'running'
        state.logs = []
        state.results = []
        state.progress = { current: 0, total: 0 }
        log(`任务 "${featureDefinition.label}" 开始...`, 'info')

        try {
            // 2. 定义传递给核心逻辑的辅助函数
            const helpers = {
                log,
                updateProgress: (current, total) => {
                    state.progress = { current, total }
                }
            }

            // 3. 调用功能定义中的核心逻辑
            const resultData = await featureDefinition.execute(context, helpers)

            // 4. 处理成功结果
            state.results = resultData
            state.status = 'success'
            log(`任务 "${featureDefinition.label}" 成功完成。`, 'success')
        } catch (error) {
            // 5. 处理异常
            console.error(`[useTask] 任务 "${featureDefinition.label}" 执行失败:`, error)
            state.status = 'error'
            log(error.message || '发生未知错误', 'error')
        } finally {
            // 6. 结束运行状态
            state.isRunning = false
        }
    }

    return {
        ...toRefs(state),
        execute
    }
} 