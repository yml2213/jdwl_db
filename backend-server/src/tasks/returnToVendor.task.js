import * as jdApiService from '../services/jdApiService.js'

/**
 * 后端任务：退供应商库存
 * 1. 从 context 获取商品列表 (getProductData 的输出)
 * 2. 查询这些商品的可用库存
 * 3. 对有库存的商品执行退货操作
 */
async function execute(context, sessionData) {
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

    updateFn(`共找到 ${productsWithData.length} 个有效商品，正在查询库存...`)
    const cmgList = productsWithData.map((p) => p.data.goodsNo)

    const stockInfo = await jdApiService.getReturnableStock(
        cmgList,
        department.deptNo.replace('CBU', ''),
        warehouse.warehouseNo,
        sessionData
    )

    if (!stockInfo || !stockInfo.frontRtsItemList || stockInfo.frontRtsItemList.length === 0) {
        updateFn('查询不到任何商品的库存信息，或所有商品库存为0。', 'info')
        return { success: true, message: '所有商品库存为0或查询失败。' }
    }

    const itemsToReturn = stockInfo.frontRtsItemList
        .filter((item) => Number(item.usableNum) > 0)
        .map((item) => ({
            goodsNo: item.goodsNo,
            applyOutQty: String(item.usableNum)
        }))

    if (itemsToReturn.length === 0) {
        updateFn('所有商品可用库存均为0，无需退货。', 'info')
        return { success: true, message: '所有商品库存为0。' }
    }

    updateFn(`查询到 ${itemsToReturn.length} 个商品有可用库存，准备执行退货...`)

    // 从 context 或 默认值构造退货单的其它信息
    // 注意：地址等信息当前为硬编码，未来可能需要从配置或更详细的 context 中获取
    //   "deptNo": "CBU22010232593780",
    //   "supplierNo": "CMS4418047117122",
    //   "warehouseNo": "800014897",
    //   "extractionWay": "1",
    //   "remark": "",
    //   "rtsStockStatus": "1",
    //   "rtsItems": [
    //     {
    //       "goodsNo": "CMG4422340065821",
    //       "applyOutQty": "3000"
    //     }
    //   ]
    // }
    const returnPayload = {
        deptNo: department.deptNo,
        supplierNo: vendor.supplierNo,
        warehouseNo: warehouse.warehouseNo,
        extractionWay: '1',
        remark: '',
        rtsStockStatus: '1',
        rtsItems: itemsToReturn
    }

    const result = await jdApiService.returnToVendor(returnPayload, sessionData)

    console.log('returnToVendor result---->', result)

    if (result && result.resultCode === 1) {
        const successMsg = `退货单创建成功: ${result.resultData}，共处理 ${itemsToReturn.length} 个商品。`
        updateFn(successMsg, 'success')
        return { success: true, message: successMsg, data: result.resultData }
    } else {
        const errorMsg = result?.resultMessage || '创建退货单时发生未知错误。'
        updateFn(`退货失败: ${errorMsg}`, 'error')
        throw new Error(errorMsg)
    }
}

export default {
    name: 'returnToVendor',
    description: '退供应商库存',
    execute: execute
} 