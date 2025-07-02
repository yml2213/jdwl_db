import { queryProductDataBySkus } from '../services/jdApiService.js'

/**
 * @param {object} payload - 任务负载，需要包含 `skus` 数组
 * @param {function} updateFn - 用于发送进度更新的函数
 * @param {object} sessionContext - 用户会话上下文，包含认证信息、事业部信息和操作ID
 */
async function execute(payload, updateFn, sessionContext) {
    const { skus } = payload
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
        throw new Error('请求负载中必须包含一个非空的SKU数组。')
    }

    const { departmentInfo, operationId } = sessionContext
    if (!departmentInfo || !departmentInfo.id) {
        throw new Error('会话上下文中缺少有效的事业部信息 (departmentInfo)。')
    }
    if (!operationId) {
        throw new Error('会话上下文中缺少有效的查询方案ID (operationId)。')
    }

    const deptId = departmentInfo.id

    try {
        updateFn({ message: `正在查询 ${skus.length} 个SKU...` })

        const allProductData = await queryProductDataBySkus(skus, deptId, operationId, sessionContext)

        console.log(`任务完成，共获取到 ${allProductData.length} 条商品数据。`)
        updateFn({ message: '所有商品数据获取完毕。', isCompleted: true, data: allProductData })

        return { success: true, data: allProductData }
    } catch (error) {
        console.error(`查询商品数据时出错:`, error)
        updateFn({ message: `查询失败: ${error.message}`, error: true })
        throw new Error(`查询商品数据时失败: ${error.message}`)
    }
}

export default {
    name: 'getProductData',
    description: '根据SKU列表批量获取商品详细数据',
    execute
} 