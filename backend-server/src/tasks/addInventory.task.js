/**
 * 后端任务：添加库存（通过api）
 */
import { createPurchaseOrder } from '../services/jdApiService.js'
import getProductDetailsTask from './getProductDetails.task.js'
import { executeInBatches } from '../utils/batchProcessor.js'

/**
 * 主执行函数 - 由工作流调用
 * @param {object} context - 包含 skus, csgList, warehouse, options
 * @param {object} sessionData - 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
    let { skus, products, warehouse, vendor } = context
    // console.log('addInventory---1  context===>', context)
    console.log('addInventory---1  vendor===>', vendor)

    if (!skus || skus.length === 0) {
        return { success: true, message: '商品列表为空，无需操作。' }
    }

    // 如果没有预先获取商品详情，则立即获取
    if (!products || products.length === 0) {
        console.log('[Task: addInventory] 未在上下文中找到商品详情，将自动执行查询...')
        const detailsResult = await getProductDetailsTask.execute(context, sessionData)
        if (!detailsResult.success || !detailsResult.products) {
            throw new Error(`自动获取商品详情失败: ${detailsResult.message || '未知错误'}`)
        }
        products = detailsResult.products
    }

    // 确保拿到的商品详情与SKU数量一致
    if (products.length !== skus.length) {
        console.warn(
            `[Task: addInventory] 警告: 查找到的商品(${products.length})与输入的SKU(${skus.length})数量不匹配。将只处理匹配到的商品。`
        )
    }

    if (products.length === 0) {
        return { success: true, message: '没有可处理的商品，任务结束。' }
    }

    if (!warehouse || !warehouse.id) {
        throw new Error('未选择仓库，无法添加库存。')
    }
    // console.log('vendor', vendor)
    if (!vendor || !vendor.id) {
        throw new Error('供应商信息不完整，无法创建采购单。')
    }

    console.log(`[Task: addInventory] "添加库存" 开始，仓库 [${warehouse.warehouseName}]...`)
    console.log(`[Task: addInventory] 总共将为 ${products.length} 个商品创建采购单。`)

    const batchFn = async (productBatch) => {
        try {
            console.log(`[Task: addInventory] 正在为 ${productBatch.length} 个商品创建采购单...`)
            const response = await createPurchaseOrder(productBatch, context, sessionData)
            console.log('[Task: addInventory] 创建采购单响应:', response)

            if (response.resultCode === 1) {
                return { success: true, message: response.resultMessage || `成功创建采购单。` }
            } else {
                // 返回可识别的失败信息
                return { success: false, message: response.resultMessage || '创建采购单失败' }
            }
        } catch (error) {
            console.error('[Task: addInventory] 批处理异常:', error)
            return { success: false, message: `批处理异常: ${error.message}` }
        }
    }

    const BATCH_SIZE = 500
    const BATCH_DELAY = 1000 // 1 

    const result = await executeInBatches({
        items: products,
        batchSize: BATCH_SIZE,
        delay: BATCH_DELAY,
        batchFn,
        log: (message, type = 'info') => {
            console.log(`[batchProcessor] [${type.toUpperCase()}] ${message}`)
        },
        isRunning: { value: true }
    })

    if (!result.success) {
        throw new Error(`添加库存失败: ${result.message}`)
    }

    return { success: true, message: `所有采购单创建成功: ${result.message}` }
}

export default {
    name: 'addInventory',
    description: '添加库存',
    execute: execute
}


// {resultCode: 1,resultMessage: '操作成功！生成单号：CPL4418085141643',resultData: null}
