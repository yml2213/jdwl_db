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
 * @param {object} context 包含 skus, store, department
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, updateFn, sessionData, cancellationToken = { value: true }) {
  // 优雅地处理两种不同的调用方式：
  // 1. 单项任务调用: execute(context, updateFn, sessionData, cancellationToken)
  // 2. 工作流调用: execute(context, sessionData, cancellationToken) - (updateFn is sessionData)
  if (typeof updateFn !== 'function') {
    // 这是工作流调用
    cancellationToken = sessionData || { value: true } // cancellationToken is the 3rd arg
    sessionData = updateFn // sessionData is the 2nd arg
    updateFn = () => { } // 提供一个无操作的 updateFn
  }

  try {
    updateFn('importStoreProducts 任务开始执行')

    const { skus, store, department, vendor } = context

    // 参数校验
    if (!store || !store.spShopNo) {
      const errorMsg = '缺少有效的店铺信息 (spShopNo)';
      updateFn({ message: errorMsg, error: true });
      throw new Error(errorMsg);
    }
    if (!department || !department.deptNo) {
      const errorMsg = '缺少有效的事业部信息';
      updateFn({ message: errorMsg, error: true });
      throw new Error(errorMsg);
    }
    if (!skus || skus.length === 0) {
      const errorMsg = 'SKU列表为空';
      updateFn({ message: errorMsg, error: true });
      throw new Error(errorMsg);
    }
    if (!sessionData || !sessionData.jdCookies) {
      const errorMsg = '缺少会话信息';
      updateFn({ message: errorMsg, error: true });
      throw new Error(errorMsg);
    }
    if (!vendor || !vendor.id) {
      const errorMsg = '缺少有效的供应商信息';
      updateFn({ message: errorMsg, error: true });
      throw new Error(errorMsg);
    }

    updateFn(`"导入店铺商品" 开始，店铺 [${store.name}]...`)
    updateFn(`总共需要处理 ${skus.length} 个SKU.`)

    const batchFn = async (skuBatch) => {
      try {
        updateFn(`正在为 ${skuBatch.length} 个SKU生成Excel文件...`)
        const fileBuffer = createExcelFileAsBuffer(skuBatch, vendor)
        updateFn(
          `Excel文件内存生成完毕，大小: ${fileBuffer.length} bytes`
        )

        // 将生成的Excel文件保存到本地
        const filePath = await saveExcelFile(fileBuffer, {
          dirName: TEMP_DIR_NAME,
          store: { shopName: store?.name },
          extension: 'xls'
        })

        if (filePath) {
          updateFn(`Excel文件已保存到: ${filePath}`)
        }

        const dataForUpload = { ...sessionData, store, department }

        updateFn(`调用jdApiService以上传文件...`)
        const uploadResult = await jdApiService.uploadStoreProducts(fileBuffer, dataForUpload)
        updateFn(`上传服务调用完成。`)
        updateFn(`API响应: ${JSON.stringify(uploadResult)}`)

        if (uploadResult.result === false) {
          return { success: false, message: uploadResult.msg || '京东API返回了一个未指定的业务错误。' }
        }
        return { success: true, message: uploadResult.msg || `成功处理 ${skuBatch.length} 个SKU。` }
      } catch (error) {
        const errorMessage = `批处理失败: ${error.message}`;
        updateFn({ message: errorMessage, error: true });
        return { success: false, message: errorMessage }
      }
    }

    const batchResults = await executeInBatches({
      items: skus,
      batchSize: BATCH_SIZE,
      delay: BATCH_DELAY,
      batchFn,
      log: (logData, level = 'info') => {
        // 如果 logData 是我们为前端定制的事件对象，直接传递
        if (typeof logData === 'object' && logData !== null && logData.event) {
          updateFn(logData)
        } else {
          // 否则，作为普通日志消息处理
          updateFn({ message: `[批处理] ${String(logData)}`, type: level })
        }
      },
      isRunning: cancellationToken
    })

    if (!cancellationToken.value) {
      return { success: false, message: '任务被用户取消。' }
    }

    if (!batchResults.success) {
      throw new Error(`导入店铺商品任务处理完成，但有失败的批次: ${batchResults.message}`)
    }

    return { success: true, message: `所有批次成功完成。 ${batchResults.message}` }
  } catch (error) {
    const finalMessage = `importStoreProducts 任务执行出错: ${error.message}`;
    updateFn({ message: finalMessage, error: true });
    throw new Error(finalMessage);
  }
}

export default {
  name: 'importStoreProducts',
  description: '导入店铺商品',
  execute: execute
}
