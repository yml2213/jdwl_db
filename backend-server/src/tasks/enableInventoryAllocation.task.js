import XLSX from 'xlsx';
import { executeInBatches } from '../utils/batchProcessor.js';
import * as jdApiService from '../services/jdApiService.js';
import { saveExcelFile } from '../utils/fileUtils.js';

const API_BATCH_SIZE = 2000; // 2000个商品 一个批次
const BATCH_DELAY = 5 * 60 * 1000 + 3000; // 5分3秒
const TEMP_DIR_NAME = '启用库存商品分配';

/**
 * 启用商品库存分配的任务
 * @param {object} context - 来自工作流或前端的数据
 * @param {object[]} context.skus - SKU 生命周期对象数组
 * @param {object} context.store - 店铺信息
 * @param {object} context.department - 事业部信息
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn, skus: skuLifecycles, store, department } = context;

  if (!sessionData || !sessionData.jdCookies) {
    updateFn({ message: '错误：缺少会话信息。', type: 'error' });
    throw new Error('缺少会话信息');
  }

  // 在新编排器模式下，数据已由前置任务提供，直接使用即可。
  if (!skuLifecycles || skuLifecycles.length === 0) {
    updateFn({ message: '没有需要处理的商品数据。', type: 'info' });
    return { success: true, message: '没有需要处理的商品数据。', data: [] };
  }

  updateFn({ message: `总共需要为 ${skuLifecycles.length} 个商品启用库存分配，将分批处理...` });

  const batchFn = async (batchOfLifecycles) => {
    try {
      // batchOfLifecycles 是一组生命周期对象
      const fileBuffer = createExcelFile(batchOfLifecycles, department, store);
      const filePath = await saveExcelFile(fileBuffer, { dirName: TEMP_DIR_NAME, store, extension: 'xlsx' });
      updateFn({ message: `库存分配文件已保存到: ${filePath}` });

      const response = await jdApiService.uploadInventoryAllocationFile(fileBuffer, sessionData, (log) => updateFn(log));
      updateFn({ message: `API 响应: ${JSON.stringify(response)}` });

      if (response && response.resultMessage && response.resultMessage.includes('频繁操作')) {
        return { success: false, message: response.resultMessage };
      }

      if (response && (response.resultCode === '1' || response.resultCode === 1 || response.resultCode === '2' || response.resultCode === 2)) {
        const msg = response.resultData || `批处理成功，影响 ${batchOfLifecycles.length} 个商品。`;
        updateFn({ message: msg, type: 'success' });
        return {
          success: true,
          message: msg,
          data: batchOfLifecycles.map(item => ({ sku: item.sku }))
        };
      }

      const errorMessage = response.resultMessage || JSON.stringify(response);
      updateFn({ message: `批处理失败: ${errorMessage}`, type: 'error' });
      return { success: false, message: errorMessage };
    } catch (error) {
      const errorMessage = `批处理时发生严重错误: ${error.message}`;
      updateFn({ message: errorMessage, type: 'error' });
      return { success: false, message: errorMessage };
    }
  };

  const batchResult = await executeInBatches({
    items: skuLifecycles,
    batchSize: API_BATCH_SIZE,
    delay: BATCH_DELAY,
    delayBetweenBatches: BATCH_DELAY, // 成功批次之间也等待300秒
    batchFn,
    log: (logData) => updateFn(typeof logData === 'string' ? { message: logData } : logData),
    isRunning: cancellationToken,
  });

  if (!batchResult.success) {
    const errorMsg = `任务未完全成功: ${batchResult.message}`;
    updateFn({ message: errorMsg, type: 'error' });
    throw new Error(errorMsg);
  }

  updateFn({ message: `任务完成: 成功 ${batchResult.successCount} 批, 失败 ${batchResult.failureCount} 批。` });
  return {
    success: true,
    message: batchResult.message || '任务执行完毕。',
    data: batchResult.data
  };
};

function createExcelFile(lifecycleItems, department, store) {
  const headers = ['事业部编码', '主商品编码', '商家商品标识', '店铺编码', '库存管理方式', '库存比例/数值', '仓库编号'];
  const introRow = ['CBU开头的事业部编码', 'CMG开头的商品编码，主商品编码与商家商品标识至少填写一个', '商家自定义的商品编码，主商品编码与商家商品标识至少填写一个', 'CSP开头的店铺编码', '纯数值，1-独占，2-共享，3-固定值', '库存方式为独占或共享时，此处填写大于等于0的正整数...', '可空...'];
  const rows = lifecycleItems.map((item) => {
    // 从生命周期对象的 data 属性中获取所需信息
    const productData = item.data;
    return [
      department.deptNo,
      productData.goodsNo || '', // 主商品编码 (CMG)
      item.sku || productData.sellerGoodsSign || '', // 商家商品标识 (SKU)
      store.shopNo,
      1, // 1-独占
      100,
      '',
    ];
  });

  const excelData = [headers, introRow, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'GoodsStockConfig');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}

export default {
  name: 'enableInventoryAllocation',
  description: '启用库存商品分配（文件上传, 内置分批）',
  execute,
};
