/**
 * 后端任务：获取商品的CSG（店铺商品）编号
 * CSG（Cloud Shop Goods）是京东仓储系统中对店铺内商品的唯一标识
 *
 * @version 3.0.0
 * @description
 * - 简化了API调用，仅使用最核心的store和skus信息，避免上下文污染。
 * - 增加了内置的智能重试机制，以应对京东后台处理延迟。
 */

import * as jdApiService from '../services/jdApiService.js'

/**
 * 延迟执行的辅助函数
 * @param {number} ms - 延迟的毫秒数
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, store
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
    const { skus, store } = context

    // --- 1. 参数校验 ---
    if (!skus || skus.length === 0) {
        return { success: false, message: 'SKU列表为空，无法查询CSG。' }
    }
    if (!store || !store.shopNo) {
        throw new Error('店铺信息不完整，缺少shopNo，无法查询CSG。')
    }
    if (!sessionData || !sessionData.cookies) {
        throw new Error('缺少会话信息，无法查询CSG。')
    }

    console.log(`[Task: getCSG v3.0] 开始为 ${skus.length} 个SKU查询CSG，店铺: ${store.name}`)


    // --- 3. 执行查询，内置重试逻辑 ---
    const MAX_ATTEMPTS = 3
    const RETRY_DELAY_MS = 5 * 1000 // 5秒内尝试三次

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`[Task: getCSG v3.0] 正在进行第 ${attempt} 次查询尝试...`)
        try {
            const result = await jdApiService.getCsgBySkus(skus, sessionData)

            // console.log('getCSG 的getCsgBySkus---1  result===>', result)

            if (result && result.success && result.products && result.products.length > 0) {
                // 成功获取到结果，提取CSG并返回
                const productsWithCsg = result.products.filter((p) => p.shopGoodsNo)
                if (productsWithCsg.length > 0) {
                    console.log(`[Task: getCSG v3.0] 第 ${attempt} 次尝试成功，获取到 ${productsWithCsg.length} 个商品的CSG。`)
                    return {
                        success: true,
                        csgList: productsWithCsg, // 返回完整的商品对象列表
                        message: `成功获取 ${productsWithCsg.length} 个商品的CSG。`
                    }
                }
            }
            // 如果第一次尝试失败（包括result.success为false或products为空），则记录日志，准备重试
            console.log(`[Task: getCSG v3.0] 第 ${attempt} 次尝试未能获取到有效的CSG信息。`)
            if (attempt < MAX_ATTEMPTS) {
                console.log(`[Task: getCSG v3.0] 将在 ${RETRY_DELAY_MS / 1000} 秒后重试...`)
                await delay(RETRY_DELAY_MS)
            }
        } catch (error) {
            console.error(`[Task: getCSG v3.0] 第 ${attempt} 次尝试时发生严重错误:`, error)
            // 如果发生严重错误，不再重试，直接抛出异常
            throw new Error(`获取CSG时发生网络或API错误: ${error.message}`)
        }
    }

    // --- 4. 所有尝试均失败后返回 ---
    console.log('[Task: getCSG v3.0] 所有尝试均告失败，无法获取CSG。')
    return {
        success: false,
        csgList: [],
        message: '在多次尝试后，仍未能查询到任何商品的CSG信息。可能是后台任务处理延迟过长。'
    }
}

export default {
    name: 'getCSG',
    description: '根据SKU获取CSG编号 (版本 2.0，带重试)',
    execute: execute
} 