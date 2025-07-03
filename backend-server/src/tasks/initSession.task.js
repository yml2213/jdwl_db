import * as jdApiService from '../services/jdApiService.js'
import db from '../utils/db.js'

/**
 * @param {object} payload - The task payload (unused).
 * @param {function} updateFn - A function to send progress updates (unused).
 * @param {object} sessionContext - The user's session context, containing uniqueKey and auth info.
 */
async function execute(payload, updateFn, sessionContext) {
    if (!sessionContext || !sessionContext.uniqueKey) {
        throw new Error('执行此任务需要包含 uniqueKey 的有效会话。')
    }

    const { uniqueKey } = sessionContext

    // 仅为了日志可读性，对 uniqueKey 进行解码
    const decodedKeyForLogging = (() => {
        try {
            const parts = uniqueKey.split('-')
            if (parts.length > 1) {
                // 假设最后一个 '-' 之后是ID，之前是用户名
                const pinPart = parts.slice(0, -1).join('-')
                const deptIdPart = parts[parts.length - 1]
                return `${decodeURIComponent(pinPart)}-${deptIdPart}`
            }
            return decodeURIComponent(uniqueKey) // 如果格式不符，尝试全部解码
        } catch (e) {
            return uniqueKey // 解码失败则返回原始key
        }
    })()

    try {
        updateFn({ message: '正在检查本地方案ID...' })

        // 1. 检查数据库中是否已存在方案ID
        const existingSchemeId = db.data.schemes[uniqueKey]
        if (existingSchemeId) {
            console.log(`为 ${decodedKeyForLogging} 找到已存在的方案ID: ${existingSchemeId}`)
            updateFn({ message: `找到已存在的方案ID: ${existingSchemeId}`, isCompleted: true })
            return { success: true, operationId: existingSchemeId }
        }

        // 2. 如果未找到，则创建新的方案
        console.log(`未找到 ${decodedKeyForLogging} 的方案ID，开始创建新方案...`)
        updateFn({ message: '未找到方案ID，正在创建新方案...' })

        const result = await jdApiService.startSessionOperation(sessionContext)

        if (!result.success) {
            throw new Error('启动会话操作（创建新方案）失败。')
        }

        const newSchemeId = result.operationId

        // 3. 将新的ID存入数据库
        db.data.schemes[uniqueKey] = newSchemeId
        await db.write() // 将更改持久化到 db.json 文件

        console.log(`为 ${decodedKeyForLogging} 创建并保存了新的方案ID: ${newSchemeId}`)

        // 4. 立即从京东服务器删除该方案，但本地保留ID
        try {
            console.log(`立即从京东服务器删除方案ID: ${newSchemeId}...`)
            await jdApiService.endSessionOperation(newSchemeId, sessionContext)
            console.log(`方案ID ${newSchemeId} 已成功从京东服务器删除。`)
        } catch (deleteError) {
            // 如果删除失败，仅记录错误，不影响主流程，因为ID仍被视为可用
            console.error(
                `从京东删除方案ID ${newSchemeId} 失败，但流程将继续:`,
                deleteError.message
            )
        }

        updateFn({ message: `新方案已成功创建，ID: ${newSchemeId}`, isCompleted: true, data: result })

        return { success: true, operationId: newSchemeId }
    } catch (error) {
        console.error(`initSession 任务执行失败 (${decodedKeyForLogging}):`, error)
        updateFn({ message: `任务失败: ${error.message}`, isCompleted: true, error: true })
        return { success: false, message: error.message }
    }
}

export default {
    name: 'initSession',
    description: '初始化应用会话，获取或创建操作ID并存入数据库',
    execute
} 