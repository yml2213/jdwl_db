/**
 * 后端任务：获取店铺商品CSG编号
 */

import { fetchCSGList } from '../services/jdApiService.js'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, store
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
    const { skus, store } = context

    if (!skus || skus.length === 0) {
        throw new Error('SKU列表为空')
    }
    if (!sessionData || !sessionData.sessionId) {
        throw new Error('缺少会话ID')
    }

    console.log(`[Task: getCSG] "获取CSG编号" 开始，店铺: ${store.shopName}...`)
    console.log(`[Task: getCSG] 使用会话ID: ${sessionData.sessionId}`)

    try {
        // 调用 jdApiService 获取 CSG 列表，传递完整的会话数据
        const csgResult = await fetchCSGList(skus, sessionData)

        if (!csgResult.success || !csgResult.csgList || csgResult.csgList.length === 0) {
            throw new Error(csgResult.message || '未能获取到CSG编号。')
        }

        console.log(`[Task: getCSG] 成功获取到 ${csgResult.csgList.length} 个CSG编号。`)

        // 将CSG列表添加到上下文，供后续任务使用
        return { success: true, csgList: csgResult.csgList }
    } catch (error) {
        console.error('[Task: getCSG] 获取CSG编号失败:', error)
        throw new Error(`获取CSG编号失败: ${error.message}`)
    }
}

export default {
    name: 'getCSG',
    execute: execute,
} 