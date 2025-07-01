/**
 * 后端任务：获取商品的CSG（店铺商品）编号
 * CSG（Cloud Shop Goods）是京东仓储系统中对店铺内商品的唯一标识
 */

import {
    fetchProductDetails
} from '../services/jdApiService.js'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, store, department, vendor
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
    const { skus, store, department, vendor } = context

    if (!skus || skus.length === 0) {
        return {
            success: false,
            message: 'SKU列表为空，无法查询CSG。'
        }
    }
    if (!sessionData || !sessionData.cookies) {
        throw new Error('缺少会话信息')
    }

    console.log(`[Task: getCSG] 开始为 ${skus.length} 个SKU查询CSG...`)

    try {
        const { store, department } = context
        console.log(`[Task: getCSG] 开始为 ${skus.length} 个SKU查询CSG...`)
        const enrichedSession = { ...sessionData, store, department }
        const result = await fetchProductDetails(skus, enrichedSession)

        if (result && result.success && result.products && result.products.length > 0) {
            const csgList = result.products.map(p => p.shopGoodsNo).filter(Boolean)
            if (csgList.length === 0) {
                console.log('[Task: getCSG] 查询到的商品中没有有效的CSG信息。')
                return {
                    success: false,
                    csgList: [],
                    message: '查询到的商品中没有有效的CSG信息。'
                }
            }

            console.log(`[Task: getCSG] 成功查询到 ${csgList.length} 个CSG。`)
            return {
                success: true,
                csgList: csgList,
                message: `成功获取 ${csgList.length} 个CSG。`
            }
        } else {
            console.log('[Task: getCSG] 未查询到任何商品的CSG信息。')
            return {
                success: false,
                csgList: [],
                message: '未能查询到任何CSG信息。'
            }
        }
    } catch (error) {
        console.error('[Task: getCSG] 执行失败:', error)
        throw new Error(`获取CSG失败: ${error.message}`)
    }
}

export default {
    name: 'getCSG',
    description: '根据SKU获取CSG编号',
    execute: execute,
} 