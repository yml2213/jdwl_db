/**
 * 后端任务：导入店铺商品
 */
import * as jdApiService from '../services/jdApiService.js'
import * as XLSX from 'xlsx'
import { executeInBatches } from '../utils/batchProcessor.js'
import { saveExcelFile } from '../utils/fileUtils.js'

// 配置常量
const BATCH_SIZE = 2000
const BATCH_DELAY = 60 * 1000 // 1分钟
const TEMP_DIR_NAME = '导入店铺商品'

/**
 * 在后端创建包含SKU的Excel文件Buffer
 */
function createExcelFileAsBuffer(skuList, vendor) {
  const excelData = [
    ['POP店铺商品编号 (SKU编码)', '商家商品标识', '商品条码', '是否代销 (0-否, 1-是)', '供应商CMG编码'],
    ...skuList.map((sku) => [sku, sku, sku, 0, vendor.id])
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  return XLSX.write(workbook, { bookType: 'xls', type: 'buffer' })
}

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus (生命周期对象), store, department
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn, skus: skuLifecycles, store, department, vendor } = context;

  try {
    updateFn({ message: 'importStoreProducts 任务开始执行' });

    // 参数校验
    if (!store || !store.spShopNo) throw new Error('缺少有效的店铺信息 (spShopNo)');
    if (!department || !department.deptNo) throw new Error('缺少有效的事业部信息');
    if (!vendor || !vendor.id) throw new Error('缺少有效的供应商信息');
    if (!sessionData || !sessionData.jdCookies) throw new Error('缺少会话信息');
    if (!skuLifecycles || skuLifecycles.length === 0) {
      updateFn({ message: 'SKU列表为空', type: 'warn' });
      return { success: true, message: 'SKU列表为空，无需执行。', data: [] };
    }

    const skuStrings = skuLifecycles.map(item => item.sku);

    updateFn({ message: `"导入店铺商品" 开始，店铺 [${store.name}]...` });
    updateFn({ message: `总共需要处理 ${skuStrings.length} 个SKU.` });

    const batchFn = async (skuBatch) => {
      // 这里的 skuBatch 是一个字符串数组
      try {
        updateFn({ message: `正在为 ${skuBatch.length} 个SKU生成Excel文件...` });
        const fileBuffer = createExcelFileAsBuffer(skuBatch, vendor);

        const filePath = await saveExcelFile(fileBuffer, {
          dirName: TEMP_DIR_NAME,
          store: { shopName: store?.name },
          extension: 'xls'
        });
        if (filePath) updateFn({ message: `Excel文件已保存到: ${filePath}` });

        const uploadResult = await jdApiService.uploadStoreProducts(fileBuffer, { ...sessionData, store, department });
        updateFn({ message: `API响应: ${JSON.stringify(uploadResult)}` });

        if (uploadResult.result === false) {
          return { success: false, message: uploadResult.msg || '京东API返回了一个未指定的业务错误。' };
        }

        // 成功时，返回带有 data 的结果，以便编排器可以跟踪
        return {
          success: true,
          message: uploadResult.msg || `成功处理 ${skuBatch.length} 个SKU。`,
          data: skuBatch.map(sku => ({ sku })) // 将字符串数组转换为编排器期望的格式
        };

      } catch (error) {
        const errorMessage = `批处理失败: ${error.message}`;
        updateFn({ message: errorMessage, type: 'error' });
        return { success: false, message: errorMessage };
      }
    };

    const batchResults = await executeInBatches({
      items: skuStrings,
      batchSize: BATCH_SIZE,
      delay: BATCH_DELAY,
      batchFn,
      log: (logData) => updateFn(typeof logData === 'string' ? { message: logData } : logData),
      isRunning: cancellationToken
    });

    if (!cancellationToken.value) {
      return { success: false, message: '任务被用户取消。' };
    }

    if (!batchResults.success) {
      throw new Error(`导入店铺商品任务处理完成，但有失败的批次: ${batchResults.message}`);
    }

    return {
      success: true,
      message: `所有批次成功完成。 ${batchResults.message}`,
      data: batchResults.data // 将聚合后的数据返回给编排器
    };

  } catch (error) {
    const finalMessage = `importStoreProducts 任务执行出错: ${error.message}`;
    updateFn({ message: finalMessage, type: 'error' });
    throw new Error(finalMessage);
  }
}

export default {
  name: 'importStoreProducts',
  description: '导入店铺商品',
  execute: execute
};
