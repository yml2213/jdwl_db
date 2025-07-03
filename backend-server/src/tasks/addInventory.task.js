/**
 * 后端任务：添加库存（通过api）
 */
import * as jdApiService from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'

// 配置常量
const BATCH_SIZE = 500
const BATCH_DELAY = 1000 // 1秒

/**
 * 主执行函数 - 由工作流或单任务调用
 * @param {object} context - 上下文
 * @returns {Promise<object>} 任务执行结果
 */
const execute = async (context, ...args) => {
    // 1. 兼容不同调用方式
    const [legacyUpdateFn, session] = args.length === 2 ? args : [args[0], context.session];
    const updateFn = typeof legacyUpdateFn === 'function' ? legacyUpdateFn : () => { };
    const sessionData = session || (args.length === 1 ? args[0] : context.session);

    let { allProductData, csgList, warehouse, vendor, department } = context;
    const inventoryAmount = context.options?.inventoryAmount || context.inventoryAmount || 1000;

    updateFn('开始执行添加库存任务...')

    // 2. 验证核心参数
    if (!warehouse?.id) throw new Error('未选择仓库，无法添加库存。')
    if (!vendor?.id) throw new Error('供应商信息不完整，无法创建采购单。')
    if (!sessionData?.cookies) throw new Error('缺少会话信息')

    updateFn('正在准备商品信息...');

    // 3. 区分模式准备商品数据
    if (!allProductData || allProductData.length === 0) {
        const skus = context.skus || [];
        updateFn(`单任务模式: 将为 ${skus.length} 个 SKU 查询商品详情...`);
        if (skus.length === 0) return { success: true, message: 'SKU列表为空' };

        try {
            const operationId = sessionData.operationId;
            if (!operationId) throw new Error('会话数据中缺少 operationId，无法查询商品数据。');

            allProductData = await jdApiService.queryProductDataBySkus(skus, department.id, operationId, sessionData);
            updateFn(`成功查询到 ${allProductData.length} 条商品数据。`);
        } catch (error) {
            throw new Error(`获取商品详情失败: ${error.message || '未知错误'}`);
        }
    } else {
        updateFn(`工作流模式: 使用上下文提供的 ${allProductData.length} 条商品数据。`);
    }

    if (!allProductData || allProductData.length === 0) {
        updateFn('没有可处理的商品，任务结束。');
        return { success: true, message: '没有可处理的商品，任务结束。' };
    }

    // 4. 执行批处理
    updateFn(`总共将为 ${allProductData.length} 个商品创建采购单。`);

    const result = await processBatches(allProductData, { ...context, inventoryAmount }, sessionData, updateFn);

    if (!result.success) {
        throw new Error(`添加库存失败: ${result.message}`);
    }

    return { success: true, message: `所有采购单创建成功: ${result.message}` };
}

/**
 * 批量处理商品列表创建采购单
 * @param {Array} products - 完整的商品对象列表
 * @param {object} context - 任务上下文
 * @param {object} sessionData - 会话数据
 * @param {Function} updateFn - 更新进度的回调函数
 * @returns {Promise<object>} 批处理结果
 */
async function processBatches(products, context, sessionData, updateFn) {
    const batchFn = async (productBatch, batchContext, batchIndex, totalBatches) => {
        const batchNo = batchIndex + 1;
        updateFn(`正在处理批次 ${batchNo}/${totalBatches}: ${productBatch.length} 个商品...`);

        try {
            const { vendor, inventoryAmount } = batchContext;
            const response = await jdApiService.createPurchaseOrder(
                productBatch,
                { ...batchContext, vendor, inventoryAmount },
                sessionData
            );
            updateFn(`批次 ${batchNo} API响应: ${JSON.stringify(response)}`);

            if (response.resultCode === 1) {
                const successMessage = response.resultMessage || `成功创建采购单。`;
                updateFn(`批次 ${batchNo} 完成: ${successMessage}`);
                return { success: true, message: successMessage, data: response.resultData };
            } else {
                const errorMessage = response.resultMessage || '创建采购单失败';
                updateFn({ message: `批次 ${batchNo} 失败: ${errorMessage}`, error: true });
                return { success: false, message: errorMessage };
            }
        } catch (error) {
            const errorMessage = `批次 ${batchNo} 处理异常: ${error.message}`;
            updateFn({ message: errorMessage, error: true });
            return { success: false, message: errorMessage };
        }
    };

    return await executeInBatches({
        items: products,
        batchSize: BATCH_SIZE,
        delay: BATCH_DELAY,
        batchFn,
        context,
        log: (message, type = 'info') => {
            updateFn({ message: `[批处理] ${message}`, type });
        },
        isRunning: { value: true }
    });
}

export default {
    name: 'addInventory',
    description: '添加库存',
    execute
};

// API响应示例: {resultCode: 1, resultMessage: '操作成功！生成单号：CPL4418085141643', resultData: null}
