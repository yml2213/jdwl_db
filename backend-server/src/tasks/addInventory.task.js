/**
 * 后端任务：添加库存（通过api）
 */
import { createPurchaseOrder } from '../services/jdApiService.js'
import getProductDataTask from './getProductData.task.js'
import { executeInBatches } from '../utils/batchProcessor.js'

// 配置常量
const BATCH_SIZE = 500
const BATCH_DELAY = 1000 // 1秒

/**
 * 主执行函数 - 由工作流调用
 * @param {object} context - 包含 skus, products, warehouse, vendor, inventoryAmount 等信息
 * @param {Function} updateFn - 更新进度的回调函数 
 * @param {object} sessionData - 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, updateFn, sessionData) {
    try {
        let { skus, products, warehouse, vendor, inventoryAmount } = context

        // 打印重要信息用于调试
        console.log('[Task: addInventory] 开始执行添加库存任务')
        console.log('[Task: addInventory] 仓库信息:', warehouse?.warehouseName || '未指定仓库')
        console.log('[Task: addInventory] 供应商信息:', vendor?.name || '未指定供应商')
        console.log('[Task: addInventory] SKU数量:', skus?.length || 0)
        console.log('[Task: addInventory] 库存数量:', inventoryAmount || '未指定数量')

        // 验证输入参数
        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return { success: false, message: '请提供有效的SKU列表' }
        }

        if (!warehouse || !warehouse.id) {
            throw new Error('未选择仓库，无法添加库存。')
        }

        if (!vendor || !vendor.id) {
            throw new Error('供应商信息不完整，无法创建采购单。')
        }

        if (!sessionData || !sessionData.cookies) {
            throw new Error('缺少会话信息')
        }

        // 进度更新
        updateFn?.('正在准备商品信息...')

        // 获取商品详情
        if (!products || products.length === 0) {
            console.log('[Task: addInventory] 未在上下文中找到商品详情，将自动执行查询...')
            // 适配 updateFn, 因为 getProductDataTask 的 updateFn 需要接收一个对象
            const taskUpdateFn = (update) => {
                if (update && typeof update.message === 'string') {
                    updateFn?.(update.message)
                }
            }
            const detailsResult = await getProductDataTask.execute(context, taskUpdateFn, sessionData)

            if (!detailsResult.success || !detailsResult.data) {
                throw new Error(`自动获取商品详情失败: ${detailsResult.message || '未知错误'}`)
            }
            products = detailsResult.data
        } else if (products.length !== skus.length) {
            console.warn(
                `[Task: addInventory] 警告: 查找到的商品(${products.length})与输入的SKU(${skus.length})数量不匹配。将只处理匹配到的商品。`
            )
        }

        if (!products || products.length === 0) {
            return { success: false, message: '没有可处理的商品，任务结束。' }
        }

        console.log(`[Task: addInventory] "添加库存" 开始，仓库 [${warehouse.warehouseName}]...`)
        console.log(`[Task: addInventory] 总共将为 ${products.length} 个商品创建采购单。`)

        // 更新进度
        updateFn?.(`将为 ${products.length} 个商品创建采购单...`)

        // console.log('[Task: addInventory] --- products ======>', products)
        // 执行批处理
        const result = await processBatches(products, context, sessionData, updateFn)

        if (!result.success) {
            throw new Error(`添加库存失败: ${result.message}`)
        }

        return { success: true, message: `所有采购单创建成功: ${result.message}` }
    } catch (error) {
        console.error(`[Task: addInventory] 执行失败:`, error)
        updateFn?.(`执行失败: ${error.message}`)
        return { success: false, message: `执行失败: ${error.message}` }
    }
}

/**
 * 批量处理商品列表创建采购单
 * @param {Array} products - 商品列表
 * @param {object} context - 任务上下文
 * @param {object} sessionData - 会话数据
 * @param {Function} updateFn - 更新进度的回调函数
 * @returns {Promise<object>} 批处理结果
 */
async function processBatches(products, context, sessionData, updateFn) {
    const batchFn = async (productBatch, batchContext, batchIndex, totalBatches) => {
        try {
            const batchNo = batchIndex + 1
            console.log(`[Task: addInventory] 正在处理批次 ${batchNo}/${totalBatches}: ${productBatch.length} 个商品...`)
            updateFn?.(`正在处理批次 ${batchNo}/${totalBatches}: ${productBatch.length} 个商品...`)

            const { vendor, inventoryAmount } = batchContext
            const response = await createPurchaseOrder(
                productBatch,
                { ...batchContext, vendor, inventoryAmount },
                sessionData
            )
            console.log('[Task: addInventory] 创建采购单响应:', response)

            if (response.resultCode === 1) {
                const successMessage = response.resultMessage || `成功创建采购单。`
                updateFn?.(`批次 ${batchNo} 完成: ${successMessage}`)
                return {
                    success: true,
                    message: successMessage,
                    data: response.resultData
                }
            } else {
                // 返回可识别的失败信息
                const errorMessage = response.resultMessage || '创建采购单失败';
                updateFn?.(`批次 ${batchNo} 失败: ${errorMessage}`)
                return { success: false, message: errorMessage }
            }
        } catch (error) {
            console.error('[Task: addInventory] 批处理异常:', error)
            updateFn?.(`批次处理异常: ${error.message}`)
            return { success: false, message: `批处理异常: ${error.message}` }
        }
    }

    return await executeInBatches({
        items: products,
        batchSize: BATCH_SIZE,
        delay: BATCH_DELAY,
        batchFn,
        context,
        log: (message, type = 'info') => {
            console.log(`[addInventory] [${type.toUpperCase()}] ${message}`)
        },
        isRunning: { value: true }
    })
}

export default {
    name: 'addInventory',
    description: '添加库存',
    execute
}

// API响应示例: {resultCode: 1, resultMessage: '操作成功！生成单号：CPL4418085141643', resultData: null}
