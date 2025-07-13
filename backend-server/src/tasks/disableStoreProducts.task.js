import * as jdApiService from '../services/jdApiService.js'

export default {
    name: 'disable-store-products',
    description: '停用店铺的商品，支持按SKU或整店模式。',
    execute: async (context, sessionData, cancellationToken) => {
        const { mode, skus, updateFn } = context

        const _updateFn = (msg, isError = false) => {
            updateFn({ message: msg, isError })
        }

        _updateFn('任务开始：停用店铺商品...')

        try {
            if (cancellationToken.isCancellationRequested) {
                _updateFn('任务已取消。')
                return { success: false, message: '任务已取消' }
            }

            let productsToDisable = []

            if (mode === 'sku') {
                if (!skus || skus.length === 0) {
                    throw new Error('SKU 模式下必须提供 SKU 列表。')
                }
                _updateFn(`SKU模式：正在查询 ${skus.length} 个SKU中的启用商品...`)
                const enabledProducts = await jdApiService.getEnabledProductsBySkus(skus, sessionData)
                productsToDisable = enabledProducts.map((p) => p.shopGoodsNo)
                _updateFn(`查询到 ${productsToDisable.length} 个已启用的店铺商品可供停用。`)
                if (productsToDisable.length === 0) {
                    _updateFn('未查询到任何可停用的启用商品，任务结束。')
                    return { success: true, message: '未找到可停用商品' }
                }
            } else if (mode === 'store') {
                _updateFn('整店模式：正在查询店铺中所有已启用的商品...')
                const enabledProducts = await jdApiService.getEnabledProductsForStore(context, sessionData)
                productsToDisable = enabledProducts.map((p) => p.shopGoodsNo)
                _updateFn(`查询到 ${productsToDisable.length} 个已启用的店铺商品可供停用。`)
                if (productsToDisable.length === 0) {
                    _updateFn('店铺内未找到任何已启用的商品，任务结束。')
                    return { success: true, message: '店铺内未找到可停用商品' }
                }
            } else {
                throw new Error(`未知的操作模式: ${mode}`)
            }

            if (cancellationToken.isCancellationRequested) {
                _updateFn('任务已取消。')
                return { success: false, message: '任务已取消' }
            }

            _updateFn(`准备停用 ${productsToDisable.length} 个商品...`)

            await jdApiService.disableStoreProducts(
                productsToDisable,
                sessionData,
                _updateFn,
                cancellationToken
            )

            _updateFn('所有商品停用操作已成功完成。')
            return { success: true, message: '停用店铺商品成功' }
        } catch (error) {
            console.error(`[disableStoreProducts.task] 任务执行失败:`, error)
            const message = error.message === '用户取消了操作' ? '任务已取消。' : `任务失败: ${error.message}`
            _updateFn(message, true)
            return { success: false, message }
        }
    }
} 