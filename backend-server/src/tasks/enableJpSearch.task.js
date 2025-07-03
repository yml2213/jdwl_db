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
const BATCH_DELAY = 1000  // 1秒

/**
 * 主执行函数 - 为一批CSG启用京配打标
 * @param {object} context 包含 csgList 和 store 信息
 * @param {string[]} [context.csgList] - CSG编码列表 (工作流模式)
 * @param {string[]} [context.skus] - SKU列表 (单任务模式)
 * @param {object} context.store - 店铺信息
 */
const execute = async (context, ...args) => {
  // 兼容工作流（2个参数）和单独执行（3个参数）
  const [legacyUpdateFn, session] = args.length === 2 ? args : [args[0], context.session];
  const updateFn = typeof legacyUpdateFn === 'function' ? legacyUpdateFn : () => { };
  const sessionData = session || (args.length === 1 ? args[0] : context.session);

  let { csgList, skus, store, department } = context;

  if (!sessionData || !sessionData.cookies) {
    updateFn('错误: 缺少会话信息。');
    throw new Error('缺少会话信息');
  }

  // 如果没有直接提供 csgList，但提供了 skus，则通过 skus 查询
  if ((!csgList || csgList.length === 0) && skus && skus.length > 0) {
    updateFn(`未提供CSG列表，将通过 ${skus.length} 个SKU进行查询...`);
    try {
      const operationId = sessionData.operationId;
      if (!operationId) {
        throw new Error('会话数据中缺少 operationId，无法查询商品数据。');
      }

      const productDataList = await jdApiService.queryProductDataBySkus(
        skus,
        department.id,
        operationId,
        sessionData
      );

      if (productDataList && productDataList.length > 0) {
        csgList = productDataList.map((p) => p.shopGoodsNo).filter(Boolean);
        updateFn(`成功查询到 ${csgList.length} 个商品的CSG编码。`);
      } else {
        updateFn('未能通过SKU查询到任何有效的商品CSG编码。');
      }
    } catch (error) {
      const errorMessage = `通过SKU查询CSG时出错: ${error.message}`;
      console.error(errorMessage, error);
      updateFn(errorMessage);
      throw new Error(errorMessage);
    }
  }

  if (!csgList || !Array.isArray(csgList) || csgList.length === 0) {
    updateFn('没有需要启用京配打标的商品。');
    return { success: true, message: '没有需要处理的商品。' };
  }

  updateFn(`总共需要为 ${csgList.length} 个商品启用京配打标，将分批处理...`);

  const batchFn = async (batchCsgList) => {
    try {
      const fileBuffer = createJpSearchExcelBuffer(batchCsgList);
      await saveExcelFile(fileBuffer, {
        dirName: TEMP_DIR_NAME,
        store: store,
        extension: 'xls',
      });
      const response = await jdApiService.uploadJpSearchFile(fileBuffer, sessionData);
      if (response && response.resultCode === 1) {
        updateFn(`批处理成功，影响 ${batchCsgList.length} 个商品。`);
        return { success: true, message: response.resultData || '京配打标任务提交成功。' };
      } else if (response.resultCode === 2000) {
        return { success: false, message: response.resultMessage || '京配打标任务--商品已开启,无需重复开启。' };
      }
      const errorMessage = response.resultMessage || '启用京配打标时发生未知错误';
      updateFn(`批处理失败: ${errorMessage}`);
      return { success: false, message: errorMessage };
    } catch (error) {
      const errorMessage = `批处理时发生严重错误: ${error.message}`;
      console.error(errorMessage, error);
      updateFn(errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  const batchResult = await executeInBatches({
    items: csgList,
    batchSize: API_BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log: (message, type = 'info') => updateFn(`[批处理] [${type.toUpperCase()}] ${message}`),
    isRunning: { value: true },
  });

  if (!batchResult.success) {
    throw new Error(`启用京配打标任务未完全成功: ${batchResult.message}`);
  }

  updateFn(`任务完成: 成功 ${batchResult.successCount} 批, 失败 ${batchResult.failureCount} 批。`);
  return { success: true, message: batchResult.message || '任务执行完毕。' };
};

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
  execute,
}; 