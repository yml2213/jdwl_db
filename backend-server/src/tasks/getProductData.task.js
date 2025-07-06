import * as jdApiService from '../services/jdApiService.js'

/**
 * @param {object} context - 任务上下文
 * @param {object[]} context.skus - SKU 生命周期对象数组
 * @param {function} context.updateFn - 用于发送进度更新的函数
 * @param {object} sessionData - 用户会话上下文
 * @param {object} cancellationToken - 取消令牌
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
    const { skus: skuLifecycles, updateFn, department } = context;

    if (!skuLifecycles || !Array.isArray(skuLifecycles) || skuLifecycles.length === 0) {
        throw new Error('上下文中必须包含一个非空的SKU生命周期对象数组。');
    }

    // 从生命周期对象中提取SKU字符串列表
    const skuStrings = skuLifecycles.map(item => item.sku);

    const { operationId } = sessionData;
    // 修正: 从 context 而不是 sessionData 获取 department 信息
    if (!department || !department.deptNo) {
        throw new Error('上下文中缺少有效的事业部信息 (department)。');
    }
    if (!operationId) {
        throw new Error('会话上下文中缺少有效的查询方案ID (operationId)。');
    }

    // const deptId = department.id;
    const deptId = department.deptNo.split('CBU')[1]

    try {
        updateFn({ message: `正在为 ${skuStrings.length} 个SKU查询商品数据...` });

        // API调用保持不变，它接收一个简单的SKU字符串数组
        const allProductData = await jdApiService.queryProductDataBySkus(
            skuStrings,
            deptId,
            operationId,
            sessionData
        );

        if (!cancellationToken.value) return { success: false, message: '任务已取消' };

        updateFn({ message: `查询完成，共获取到 ${allProductData.length} 条商品数据。` });

        // 构建返回给编排器的数据
        // 核心改动：返回一个对象数组，每个对象都包含 'sku' 键和从API获取的数据
        const updatedSkuData = allProductData.map(product => ({
            sku: product.sellerGoodsSign, // 使用 sellerGoodsSign 作为 SKU 标识符
            ...product // 将查询到的所有其他商品数据也一并返回
        }));

        return {
            success: true,
            message: `成功获取到 ${allProductData.length} 条商品数据。`,
            data: updatedSkuData
        };
    } catch (error) {
        console.error(`查询商品数据时出错:`, error);
        throw new Error(`查询商品数据时失败: ${error.message}`);
    }
}

export default {
    name: 'getProductData',
    description: '根据SKU列表批量获取商品详细数据',
    execute
}; 