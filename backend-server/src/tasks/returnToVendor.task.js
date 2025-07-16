import * as jdApiService from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'

const STOCK_QUERY_BATCH_SIZE = 500 // API限制可能在500左右，留一些余量
const RETURN_EXECUTION_BATCH_SIZE = 500
const BATCH_DELAY = 1500 // 1.5秒

/**
 * 后端任务：退供应商库存
 * 1. 从 context 获取商品列表 (getProductData 的输出)
 * 2. 分批查询这些商品的可用库存
 * 3. 对有库存的商品分批执行退货操作
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
    const { skus: skuLifecycles, store, department, vendor, warehouse, scope, updateFn } = context

    updateFn('退供应商库存任务开始...')

    if (scope === 'whole_store') {
        updateFn('整店退供应商库存模式暂不支持，任务跳过。', 'warning')
        return { success: true, message: '整店模式暂不支持，已跳过。' }
    }

    if (!skuLifecycles || skuLifecycles.length === 0) {
        throw new Error('SKU列表为空，无法执行操作。')
    }
    if (!vendor?.supplierNo) {
        throw new Error('供应商信息不完整 (缺少 supplierNo)，无法创建退货单。')
    }
    if (!warehouse?.warehouseNo) {
        throw new Error('仓库信息不完整 (缺少 warehouseNo)，无法创建退货单。')
    }

    const productsWithData = skuLifecycles.filter((p) => p.data?.goodsNo)
    if (productsWithData.length === 0) {
        updateFn('未找到任何包含有效 CMG 编码的商品，任务结束。', 'info')
        return { success: true, message: '没有可处理的商品。' }
    }

    updateFn(`共找到 ${productsWithData.length} 个有效商品，准备分批查询库存...`)

    // --- 1. 分批查询库存 ---
    const stockQueryBatchFn = async (batchOfProducts) => {
        const cmgList = batchOfProducts.map((p) => p.data.goodsNo)
        try {
            const stockInfo = await jdApiService.getReturnableStock(
                cmgList,
                department.deptNo.replace('CBU', ''),
                warehouse.warehouseNo,
                sessionData
            )
            if (stockInfo && stockInfo.frontRtsItemList) {
                return { success: true, data: stockInfo.frontRtsItemList }
            }
            return { success: true, data: [] }
        } catch (error) {
            updateFn(`查询库存批次失败: ${error.message}`, 'error')
            return { success: false, message: error.message, data: [] }
        }
    }

    const stockQueryResults = await executeInBatches({
        items: productsWithData,
        batchSize: STOCK_QUERY_BATCH_SIZE,
        delay: BATCH_DELAY,
        batchFn: stockQueryBatchFn,
        log: (msg) => updateFn(`[库存查询]: ${msg}`),
        isRunning: cancellationToken
    })

    if (!stockQueryResults.success) {
        throw new Error(`查询库存时有批次失败: ${stockQueryResults.message}`)
    }

    const allStockItems = stockQueryResults.data.flat()
    const itemsToReturn = allStockItems
        .filter((item) => Number(item.usableNum) > 0)
        .map((item) => ({
            goodsNo: item.goodsNo,
            applyOutQty: String(item.usableNum)
        }))

    if (itemsToReturn.length === 0) {
        updateFn('所有商品可用库存均为0，无需退货。', 'info')
        return { success: true, message: '所有商品库存为0。' }
    }

    updateFn(`查询到 ${itemsToReturn.length} 个商品有可用库存，准备分批执行退货...`)

    // --- 2. 分批执行退货 ---
    const returnExecutionBatchFn = async (batchOfItemsToReturn) => {
        const returnPayload = {
            deptNo: department.deptNo,
            supplierNo: vendor.supplierNo,
            warehouseNo: warehouse.warehouseNo,
            extractionWay: '1',
            remark: '',
            rtsStockStatus: '1',
            rtsItems: batchOfItemsToReturn
        }

        try {
            const result = await jdApiService.returnToVendor(returnPayload, sessionData)
            if (result && result.resultCode === 1) {
                const successMsg = `退货单批次创建成功: ${result.resultData}，处理了 ${batchOfItemsToReturn.length} 个商品。`
                updateFn(successMsg, 'success')
                return { success: true, message: successMsg, data: result.resultData }
            } else {
                const errorMsg = result?.resultMessage || '创建退货单批次时发生未知错误。'
                updateFn(`退货批次失败: ${errorMsg}`, 'error')
                return { success: false, message: errorMsg }
            }
        } catch (error) {
            updateFn(`退货批次执行时发生严重错误: ${error.message}`, 'error')
            return { success: false, message: error.message }
        }
    }

    const returnExecutionResults = await executeInBatches({
        items: itemsToReturn,
        batchSize: RETURN_EXECUTION_BATCH_SIZE,
        delay: BATCH_DELAY,
        batchFn: returnExecutionBatchFn,
        log: (msg) => updateFn(`[执行退货]: ${msg}`),
        isRunning: cancellationToken
    })

    if (!returnExecutionResults.success) {
        throw new Error(`退货执行时有批次失败: ${returnExecutionResults.message}`)
    }

    const finalMessage = `退供应商库存任务完成。成功创建 ${returnExecutionResults.data.filter(Boolean).length
        } 个退货单。`
    updateFn(finalMessage, 'success')
    return { success: true, message: finalMessage }
}

export default {
    name: 'returnToVendor',
    description: '退供应商库存',
    execute: execute
} 