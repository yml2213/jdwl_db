import XLSX from 'xlsx';
import { executeInBatches } from '../utils/batchProcessor.js';
import * as jdApiService from '../services/jdApiService.js';
import { saveExcelFile } from '../utils/fileUtils.js';

const API_BATCH_SIZE = 2000; // 2000个商品 一个批次
const BATCH_DELAY = 1000;  // 1秒
const TEMP_DIR_NAME = '启用库存商品分配';

/**
 * 启用商品库存分配的任务
 * @param {object} context - 来自工作流或前端的数据
 * @param {object[]} [context.allProductData] - 包含完整商品信息的对象数组
 * @param {string[]} [context.skus] - 商品SKU列表（单任务模式）
 * @param {object} context.store - 店铺信息
 * @param {object} context.department - 事业部信息
 */
const execute = async (context, ...args) => {
  const [legacyUpdateFn, session] = args.length === 2 ? args : [args[0], context.session];
  const updateFn = typeof legacyUpdateFn === 'function' ? legacyUpdateFn : () => { };
  const sessionData = session || (args.length === 1 ? args[0] : context.session);

  let { allProductData, skus, store, department } = context;

  if (!sessionData || !sessionData.cookies) {
    updateFn('错误：缺少会话信息。');
    throw new Error('缺少会话信息');
  }

  // 如果没有直接提供 allProductData，但提供了 skus，则通过 skus 查询
  if ((!allProductData || allProductData.length === 0) && skus && skus.length > 0) {
    updateFn(`单任务模式：通过 ${skus.length} 个SKU查询商品数据...`);
    try {
      const operationId = sessionData.operationId
      allProductData = await jdApiService.queryProductDataBySkus(
        skus,
        department.id,
        operationId,
        sessionData
      );

      if (allProductData && allProductData.length > 0) {
        updateFn(`成功查询到 ${allProductData.length} 个商品的详细数据。`);
      } else {
        const message = '未能通过SKU查询到任何商品数据。';
        updateFn(message);
        return { success: true, message };
      }
    } catch (error) {
      const errorMessage = `通过SKU查询商品数据时出错: ${error.message}`;
      updateFn({ message: errorMessage, error: true });
      throw new Error(errorMessage);
    }
  }

  if (!allProductData || allProductData.length === 0) {
    updateFn('没有需要处理的商品数据。');
    return { success: true, message: '没有需要处理的商品数据。' };
  }

  updateFn(`总共需要为 ${allProductData.length} 个商品启用库存分配，将分批处理...`);

  const batchFn = async (batchItems) => {
    try {
      const fileBuffer = createExcelFile(batchItems, department, store);
      const filePath = await saveExcelFile(fileBuffer, { dirName: TEMP_DIR_NAME, store, extension: 'xlsx' });
      updateFn(`库存分配文件已保存到: ${filePath}`);

      const response = await jdApiService.uploadInventoryAllocationFile(fileBuffer, sessionData);
      updateFn(`API 响应: ${JSON.stringify(response)}`);

      if (response && (response.resultCode === '1' || response.resultCode === 1 || response.resultCode === '2' || response.resultCode === 2)) {
        const msg = response.resultData || `批处理成功，影响 ${batchItems.length} 个商品。`;
        updateFn(msg);
        return { success: true, message: msg };
      }
      const errorMessage = response.resultMessage || JSON.stringify(response);
      updateFn({ message: `批处理失败: ${errorMessage}`, error: true });
      return { success: false, message: errorMessage };
    } catch (error) {
      const errorMessage = `批处理时发生严重错误: ${error.message}`;
      updateFn({ message: errorMessage, error: true });
      return { success: false, message: errorMessage };
    }
  };

  const batchResult = await executeInBatches({
    items: allProductData,
    batchSize: API_BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log: (message, type = 'info') => updateFn({ message: `[批处理] ${message}`, type }),
    isRunning: { value: true },
  });

  if (!batchResult.success) {
    const errorMsg = `任务未完全成功: ${batchResult.message}`;
    updateFn({ message: errorMsg, error: true });
    throw new Error(errorMsg);
  }

  updateFn(`任务完成: 成功 ${batchResult.successCount} 批, 失败 ${batchResult.failureCount} 批。`);
  return { success: true, message: batchResult.message || '任务执行完毕。' };
};

function createExcelFile(productDataList, department, store) {
  const headers = ['事业部编码', '主商品编码', '商家商品标识', '店铺编码', '库存管理方式', '库存比例/数值', '仓库编号'];
  const introRow = ['CBU开头的事业部编码', 'CMG开头的商品编码，主商品编码与商家商品标识至少填写一个', '商家自定义的商品编码，主商品编码与商家商品标识至少填写一个', 'CSP开头的店铺编码', '纯数值，1-独占，2-共享，3-固定值', '库存方式为独占或共享时，此处填写大于等于0的正整数...', '可空...'];
  const rows = productDataList.map((p) => [
    department.deptNo,
    p.goodsNo, // 主商品编码 (CMG)
    p.sellerGoodsSign, // 商家商品标识 (SKU)
    store.shopNo,
    1, // 1-独占
    100,
    '',
  ]);

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
