/**
 * 后端任务：启用京配打标生效
 * 7.3 优化 使用 getProductData.task.js 查询商品数据
 */
import XLSX from 'xlsx'
import * as jdApiService from '../services/jdApiService.js'
import { saveExcelFile } from '../utils/fileUtils.js'
import { executeInBatches } from '../utils/batchProcessor.js'

const TEMP_DIR_NAME = '启用京配打标生效'
const API_BATCH_SIZE = 5000 // Excel上传类任务的批次可以大一些
const BATCH_DELAY = 1000 * 10  // 10秒

/**
 * 主执行函数 - 为一批CSG启用京配打标
 * @param {object} context 包含 skus (生命周期对象) 和 store 信息
 * @param {object[]} context.skus - SKU 生命周期对象数组
 * @param {object} context.store - 店铺信息
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn, skus: skuLifecycles, store } = context;

  if (!sessionData || !sessionData.jdCookies) {
    updateFn({ message: '错误: 缺少会话信息。', type: 'error' });
    throw new Error('缺少会话信息');
  }

  try {
    const itemsToProcess = skuLifecycles.filter(item => item.data && item.data.shopGoodsNo);

    if (itemsToProcess.length === 0) {
      updateFn({ message: '没有需要启用京配打标的商品 (未找到CSG编码)。', type: 'info' });
      return { success: true, message: '没有可处理的商品。', data: [] };
    }

    updateFn({ message: `总共需要为 ${itemsToProcess.length} 个商品启用京配打标，将分批处理...` });

    const batchFn = async (batchOfLifecycles) => {
      try {
        const csgBatch = batchOfLifecycles.map(item => item.data.shopGoodsNo);
        const fileBuffer = createJpSearchExcelBuffer(csgBatch);

        const filePath = await saveExcelFile(fileBuffer, {
          dirName: TEMP_DIR_NAME,
          store: store,
          extension: 'xls'
        });
        updateFn({ message: `京配打标文件已保存到: ${filePath}` });

        const response = await jdApiService.uploadJpSearchFile(fileBuffer, sessionData);
        updateFn({ message: `API 响应: ${JSON.stringify(response)}` });

        if (response && (response.resultCode === 1 || response.resultCode === '1')) {
          const msg = response.resultData || `批处理成功，影响 ${csgBatch.length} 个商品。`;
          return {
            success: true,
            message: msg,
            data: batchOfLifecycles.map(item => ({ sku: item.sku }))
          };
        } else if (response.resultCode === 2000 || response.resultMessage?.includes('无需重复开启')) {
          const msg = response.resultMessage || '京配打标任务--商品已开启,无需重复开启。';
          // 即使是重复开启，也视为此SKU已成功完成该步骤
          return {
            success: true,
            message: msg,
            data: batchOfLifecycles.map(item => ({ sku: item.sku }))
          };
        }
        const errorMessage = response.resultMessage || '启用京配打标时发生未知错误';
        return { success: false, message: errorMessage };
      } catch (error) {
        return { success: false, message: `批处理时发生严重错误: ${error.message}` };
      }
    };

    const batchResult = await executeInBatches({
      items: itemsToProcess,
      batchSize: API_BATCH_SIZE,
      delay: BATCH_DELAY,
      batchFn,
      log: (logData) => updateFn(typeof logData === 'string' ? { message: logData } : logData),
      isRunning: cancellationToken
    });

    if (!batchResult.success) {
      throw new Error(`启用京配打标任务未完全成功: ${batchResult.message}`);
    }

    updateFn({ message: `任务完成: 成功 ${batchResult.successCount} 批, 失败 ${batchResult.failureCount} 批。` });
    return {
      success: true,
      message: batchResult.message || '任务执行完毕。',
      data: batchResult.data
    };
  } catch (error) {
    if (!cancellationToken.value) {
      return { success: false, message: '任务在执行中被用户取消。' };
    }
    const finalMessage = `[启用京配打标] 任务执行失败: ${error.message}`;
    updateFn({ message: finalMessage, type: 'error' });
    throw new Error(finalMessage);
  }
}

/**
 * 创建用于京配查询的Excel文件Buffer
 * @param {string[]} items - CSG编号列表
 * @returns {Buffer}
 */
function createJpSearchExcelBuffer(items) {
  const headers = ['店铺商品编号 (CSG编码)', '京配搜索 (0否, 1是)'];
  const dataRows = items.map((item) => [item, 1]);
  const excelData = [headers, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  return XLSX.write(wb, { bookType: 'xls', type: 'buffer' });
}

export default {
  name: 'enableJpSearch',
  description: '启用京配打标生效 (内置分批)',
  execute
}; 