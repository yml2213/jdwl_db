import { endSessionOperation } from '../services/jdApiService.js'

async function execute(payload, updateFn, session) {
    if (!session) {
        throw new Error('执行此任务需要有效的会话。')
    }

    const { operationId } = payload
    if (!operationId) {
        throw new Error('执行注销任务需要 operationId。')
    }

    try {
        console.log(`开始执行 logoutSession 任务, operationId: ${operationId}`)
        updateFn({ message: '正在结束会话操作...' })

        const result = await endSessionOperation(operationId, session)

        if (!result.success) {
            throw new Error('结束会话操作失败。')
        }

        updateFn({ message: '会话操作已成功结束。', isCompleted: true })
        console.log('logoutSession 任务执行成功。')
        return { success: true }
    } catch (error) {
        console.error('logoutSession 任务执行失败:', error)
        updateFn({ message: `任务失败: ${error.message}`, isCompleted: true, error: true })
        return { success: false, message: error.message }
    }
}

export default {
    name: 'logoutSession',
    description: '注销应用会话，清理操作ID',
    execute
} 