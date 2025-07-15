/**
 * 后端任务：导入物流属性
 */
import * as jdApiService from '../services/jdApiService.js'
import * as XLSX from 'xlsx'
import { executeInBatches } from '../utils/batchProcessor.js'
import { saveExcelFile } from '../utils/fileUtils.js'

// 配置常量
const BATCH_SIZE = 2000
const BATCH_DELAY = 5 * 60 * 1000 // 京东限制5分钟一次
const TEMP_DIR_NAME = '导入物流属性'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus (生命周期对象), department, store, logisticsOptions
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn, skus: skuLifecycles, department, store, logisticsOptions } = context;

  try {
    updateFn({ message: 'importLogisticsAttributes 任务开始执行' });

    // 1. 参数校验
    if (!skuLifecycles || skuLifecycles.length === 0) {
      updateFn({ message: '商品列表为空，无需操作。', type: 'info' });
      return { success: true, message: '商品列表为空，无需操作。', data: [] };
    }
    if (!department || !department.deptNo) throw new Error('上下文中缺少有效的事业部信息。');
    if (!store) throw new Error('上下文中缺少有效的店铺信息。');
    if (!sessionData || !sessionData.jdCookies) throw new Error('缺少会话信息。');
    if (!logisticsOptions) throw new Error('上下文中缺少有效的物流参数。');

    updateFn({ message: `"导入物流属性" 开始，店铺 [${store.shopName}]...` });
    updateFn({ message: `总共需要处理 ${skuLifecycles.length} 个SKU.` });
    updateFn({ message: `使用的物流参数: ${JSON.stringify(logisticsOptions)}` });

    const batchFn = async (batchOfLifecycles) => {
      // batchOfLifecycles 是一个生命周期对象的数组
      try {
        if (!cancellationToken.value) return { success: false, message: '任务已取消' };

        const fileBuffer = createLogisticsExcelBuffer(batchOfLifecycles, department, logisticsOptions);

        const filePath = await saveExcelFile(fileBuffer, {
          dirName: TEMP_DIR_NAME,
          store: { shopName: department?.name?.replace(/[\\/:"*?<>|]/g, '_') || 'unknown-dept' },
          extension: 'xls'
        });
        if (filePath) updateFn({ message: `Excel文件已保存到: ${filePath}` });

        const result = await jdApiService.uploadLogisticsAttributesFile(fileBuffer, { ...sessionData, store });
        updateFn({ message: `API 响应: ${JSON.stringify(result)}` });

        if (result.success) {
          return {
            success: true,
            message: result.data || '物流属性导入成功',
            data: batchOfLifecycles.map(item => ({ sku: item.data.sellerGoodsSign || item.sku })) // 返回处理成功的SKU
          };
        } else if (result.data && result.data.includes('5分钟内只能导入一次')) {
          return { success: false, message: result.data }; // 让批处理器知道需要重试
        } else {
          throw new Error(result.data || '导入物流属性时发生未知错误');
        }
      } catch (error) {
        return { success: false, message: error.message };
      }
    };

    const results = await executeInBatches({
      items: skuLifecycles, // 传递整个生命周期对象数组
      batchSize: BATCH_SIZE,
      delay: BATCH_DELAY,
      delayBetweenBatches: BATCH_DELAY, // 添加成功批次之间的等待时间
      batchFn,
      log: (logData) => updateFn(typeof logData === 'string' ? { message: logData } : logData),
      isRunning: cancellationToken
    });

    if (!cancellationToken.value) return { success: false, message: '任务已取消。' };

    if (!results.success) {
      throw new Error(`导入物流属性任务处理完成，但有失败的批次: ${results.message}`);
    }

    return {
      success: true,
      message: `所有批次成功完成。 ${results.message}`,
      data: results.data // 返回聚合后的数据
    };
  } catch (error) {
    if (!cancellationToken.value) {
      const cancelMsg = '任务在执行中被用户取消。';
      updateFn({ message: cancelMsg, type: 'error' });
      return { success: false, message: cancelMsg };
    }
    throw new Error(`[导入物流属性] 任务执行失败: ${error.message}`);
  }
}

/**
 * 创建物流属性Excel文件的Buffer
 * @param {object[]} lifecycleItems - SKU生命周期对象数组
 * @param {object} department - 事业部信息对象
 * @param {object} logisticsOptions - 物流参数
 * @returns {Buffer}
 */
function createLogisticsExcelBuffer(lifecycleItems, department, logisticsOptions) {
  const {
    length = '120.00',
    width = '60.00',
    height = '6.00',
    grossWeight = '0.1'
  } = logisticsOptions || {};

  const headers = [
    '事业部商品编码',
    '事业部编码',
    '商家商品编号',
    '长(mm)',
    '宽(mm)',
    '高(mm)',
    '净重(kg)',
    '毛重(kg)'
  ];
  const dataRows = lifecycleItems.map((item) => {
    // 从生命周期对象的 data 属性中获取 sellerGoodsSign
    const sku = item.data.sellerGoodsSign || item.sku;
    return [
      '', // 事业部商品编码 (为空)
      department.deptNo, // 事业部编码
      sku, // 商家商品编号
      length, // 长(mm)
      width, // 宽(mm)
      height, // 高(mm)
      '', // 净重(kg)
      grossWeight // 毛重(kg)
    ];
  });

  const excelData = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { bookType: 'xls', type: 'buffer' });
}

export default {
  name: 'importLogisticsAttributes',
  description: '导入物流属性',
  execute
};
