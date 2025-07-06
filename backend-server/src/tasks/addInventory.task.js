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
async function execute(context, sessionData, cancellationToken = { value: true }) {
    const { updateFn } = context;
    let { allProductData, csgList, warehouse, vendor, department } = context;
    const inventoryAmount = context.options?.inventoryAmount || context.inventoryAmount || 1000;

    try {
        updateFn('开始执行添加库存任务...')

        // 2. 验证核心参数
        if (!warehouse?.id) throw new Error('未选择仓库，无法添加库存。')
        if (!vendor?.id) throw new Error('供应商信息不完整，无法创建采购单。')
        if (!sessionData?.jdCookies) throw new Error('缺少会话信息')

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

        // 4. 定义批处理函数
        const batchFn = async (productBatch) => {
            try {
                const response = await jdApiService.createPurchaseOrder(
                    productBatch,
                    { vendor, inventoryAmount, warehouse, department },
                    sessionData
                );
                updateFn(`API响应: ${JSON.stringify(response)}`);

                if (response.resultCode === 1) {
                    return { success: true, message: response.resultMessage || `成功创建采购单。`, data: response.resultData };
                } else {
                    return { success: false, message: response.resultMessage || '创建采购单失败' };
                }
            } catch (error) {
                return { success: false, message: `批处理异常: ${error.message}` };
            }
        };

        // 5. 执行批处理
        updateFn(`总共将为 ${allProductData.length} 个商品创建采购单。`);
        const result = await executeInBatches({
            items: allProductData,
            batchSize: BATCH_SIZE,
            delay: BATCH_DELAY,
            batchFn,
            log: updateFn,
            isRunning: cancellationToken
        });

        if (!result.success) {
            throw new Error(`添加库存失败: ${result.message}`);
        }

        return { success: true, message: `所有采购单创建成功: ${result.message}` };

    } catch (error) {
        if (!cancellationToken.value) {
            return { success: false, message: '任务在执行中被用户取消。' }
        }
        const finalMessage = `[添加库存] 任务执行失败: ${error.message}`;
        updateFn({ message: finalMessage, error: true });
        throw new Error(finalMessage);
    }
}

export default {
    name: 'addInventory',
    description: '添加库存',
    requiredContext: ['warehouse', 'vendor', 'department', 'skus'],
    outputContext: [],
    execute
};

// API响应示例: {resultCode: 1, resultMessage: '操作成功！生成单号：CPL4418085141643', resultData: null}
