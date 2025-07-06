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
    const { updateFn, skus: skuLifecycles, warehouse, vendor, department } = context;
    const inventoryAmount = context.options?.inventoryAmount || context.inventoryAmount || 1000;

    try {
        updateFn({ message: '开始执行添加库存任务...' });

        // 验证核心参数
        if (!warehouse?.id) throw new Error('未选择仓库，无法添加库存。');
        if (!vendor?.id) throw new Error('供应商信息不完整，无法创建采购单。');
        if (!sessionData?.jdCookies) throw new Error('缺少会话信息');

        if (!skuLifecycles || skuLifecycles.length === 0) {
            updateFn({ message: '没有可处理的商品，任务结束。', type: 'info' });
            return { success: true, message: '没有可处理的商品，任务结束。', data: [] };
        }

        updateFn({ message: '正在准备商品信息...' });

        // 定义批处理函数
        const batchFn = async (lifecycleBatch) => {
            // lifecycleBatch is an array of SKU lifecycle objects
            try {
                // Extract product data from lifecycle objects for the API
                const productBatch = lifecycleBatch.map(item => item.data);

                const response = await jdApiService.createPurchaseOrder(
                    productBatch,
                    { vendor, inventoryAmount, warehouse, department },
                    sessionData
                );
                updateFn({ message: `API响应: ${JSON.stringify(response)}` });

                if (response.resultCode === 1) {
                    return {
                        success: true,
                        message: response.resultMessage || `成功创建采购单。`,
                        // Return the SKUs that were processed in this batch
                        data: lifecycleBatch.map(item => ({ sku: item.sku }))
                    };
                } else {
                    return { success: false, message: response.resultMessage || '创建采购单失败' };
                }
            } catch (error) {
                return { success: false, message: `批处理异常: ${error.message}` };
            }
        };

        // 执行批处理
        updateFn({ message: `总共将为 ${skuLifecycles.length} 个商品创建采购单。` });
        const result = await executeInBatches({
            items: skuLifecycles,
            batchSize: BATCH_SIZE,
            delay: BATCH_DELAY,
            batchFn,
            log: (logData) => updateFn(typeof logData === 'string' ? { message: logData } : logData),
            isRunning: cancellationToken
        });

        if (!result.success) {
            throw new Error(`添加库存失败: ${result.message}`);
        }

        return {
            success: true,
            message: `所有采购单创建成功: ${result.message}`,
            data: result.data // Pass aggregated data back to orchestrator
        };

    } catch (error) {
        if (!cancellationToken.value) {
            return { success: false, message: '任务在执行中被用户取消。' }
        }
        const finalMessage = `[添加库存] 任务执行失败: ${error.message}`;
        updateFn({ message: finalMessage, type: 'error' });
        throw new Error(finalMessage);
    }
}

export default {
    name: 'addInventory',
    description: '添加库存',
    execute
};

// API响应示例: {resultCode: 1, resultMessage: '操作成功！生成单号：CPL4418085141643', resultData: null}
