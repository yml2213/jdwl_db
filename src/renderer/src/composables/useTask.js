import { reactive, toRefs, onMounted, onUnmounted, readonly, ref, toRef } from 'vue'

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

    const error = ref(null)

    /**
     * 记录日志
     * @param {string} message - 日志信息
     * @param {'info' | 'success' | 'error' | 'warning'} type - 日志类型
     */
    const log = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        state.logs.push({ timestamp, message, type })
        console.log(`[useTask Log - ${type}]: ${message}`)
    }

    onMounted(() => {
        const handleLog = (event, logData) => {
            log(`[IPC] ${logData.message}`, logData.type)
        }
        window.electron.ipcRenderer.on('ipc-log', handleLog)

        onUnmounted(() => {
            window.electron.ipcRenderer.removeListener('ipc-log', handleLog)
        })
    })

    /**
     * 主执行函数
     * @param {object} context - 执行任务所需的上下文，例如 { skuList, shopInfo, options }
     * @returns {Promise<void>}
     */
    const execute = async (context) => {
        // 1. 初始化状态
        state.isRunning = true
        state.status = 'running'
        state.logs.length = 0
        state.results = []
        state.progress = { current: 0, total: 0 }
        const taskLabel = context.taskName || featureDefinition.label
        log(`任务 "${taskLabel}" 开始...`, 'info')

        try {
            // 2. 定义传递给核心逻辑的辅助函数
            const helpers = {
                log,
                updateProgress: (current, total) => {
                    state.progress = { current, total }
                },
                isRunning: readonly(toRef(state, 'isRunning'))
            }

            // 3. 调用功能定义中的核心逻辑
            const resultData = await featureDefinition.execute(context, helpers)

            // 4. 处理成功结果
            state.results = resultData
            state.status = 'success'
            log(`任务 "${taskLabel}" 成功完成。`, 'success')
            return resultData
        } catch (e) {
            // 5. 处理异常
            const taskLabel = context.taskName || featureDefinition.label
            console.error(`[useTask] 任务 "${taskLabel}" 执行失败:`, e)
            state.status = 'error'
            error.value = e
            const errorMessage = e.message || '发生未知错误'
            log(errorMessage, 'error')
            throw e
        } finally {
            // 6. 结束运行状态
            state.isRunning = false
        }
    }

    return {
        ...toRefs(state),
        error,
        execute
    }
} 