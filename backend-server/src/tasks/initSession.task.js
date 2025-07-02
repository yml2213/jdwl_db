import { startSessionOperation } from '../services/jdApiService.js'

async function execute(payload, updateFn, session) {
    if (!session) {
        throw new Error('执行此任务需要有效的会话。')
    }

    try {
        console.log('开始执行 initSession 任务...')
        updateFn({ message: '正在启动会话操作...' })

        const result = await startSessionOperation(session)

        if (!result.success) {
            throw new Error('启动会话操作失败。')
        }

        updateFn({ message: `会话操作已成功启动，ID: ${result.operationId}`, isCompleted: true, data: result })
        console.log('initSession 任务执行成功。')
        return { success: true, operationId: result.operationId }
    } catch (error) {
        console.error('initSession 任务执行失败:', error)
        updateFn({ message: `任务失败: ${error.message}`, isCompleted: true, error: true })
        return { success: false, message: error.message }
    }
}

export default {
    name: 'initSession',
    description: '初始化应用会话，获取操作ID',
    execute
} 