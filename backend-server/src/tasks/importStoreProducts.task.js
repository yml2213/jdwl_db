/**
 * 后端任务：导入店铺商品
 */
import * as XLSX from 'xlsx'
import { uploadStoreProducts } from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'
// 注意：这里的 executeInBatches 和其他工具函数也需要从前端迁移到后端
// import { executeInBatches } from './utils/taskUtils';

/**
 * 在后端创建包含SKU的Excel文件Buffer
 */
function createExcelFileAsBuffer(skuList, departmentInfo) {
  const excelData = [
    ['商家商品编号', '商品名称', '事业部商品编码'],
    ...skuList.map((sku) => [sku, `商品-${sku}`, departmentInfo.deptNo])
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
async function execute(context, sessionData) {
  const { skus, store, department } = context
  // const sessionData=context.session
  //   console.log('skus', skus)
  //   console.log('store', store)
  // 参数校验
  if (!store || !store.spShopNo) throw new Error('缺少有效的店铺信息或spShopNo')
  if (!department || !department.deptNo) throw new Error('缺少有效的事业部信息')
  if (!skus || skus.length === 0) throw new Error('SKU列表为空')
  // 会话验证已由server.js中间件处理，不再需要检查sessionId
  if (!sessionData || !sessionData.cookies) throw new Error('缺少会话信息')

  console.log(`[Task: importStoreProducts] "导入店铺商品" 开始，店铺 [${store.shopName}]...`)
  console.log(`[Task: importStoreProducts] 总共需要处理 ${skus.length} 个SKU.`)

  const batchFn = async (skuBatch) => {
    try {
      console.log(`[Task: importStoreProducts] 正在为 ${skuBatch.length} 个SKU生成Excel文件...`)
      const fileBuffer = createExcelFileAsBuffer(skuBatch, department)
      console.log(
        `[Task: importStoreProducts] Excel文件内存生成完毕，大小: ${fileBuffer.length} bytes`
      )

      const dataForUpload = { ...sessionData, store, department }

      console.log(`[Task: importStoreProducts] 调用jdApiService以上传文件...`)
      const uploadResult = await uploadStoreProducts(fileBuffer, dataForUpload)
      console.log(`[Task: importStoreProducts] 上传服务调用完成。`)
      console.log(`[Task: importStoreProducts] 结果======> ${JSON.stringify(uploadResult)}`)

      if (uploadResult.result === false) {
        return { success: false, message: uploadResult.msg || '京东API返回了一个未指定的业务错误。' }
      }
      return { success: true, message: `成功处理 ${skuBatch.length} 个SKU。` }
    } catch (error) {
      console.error('[Task: importStoreProducts] 批处理失败:', error)
      return { success: false, message: `批处理失败: ${error.message}` }
    }
  }

  const BATCH_SIZE = 2000
  const DELAY_MS = 60 * 1000

  const batchResults = await executeInBatches({
    items: skus,
    batchSize: BATCH_SIZE,
    delay: DELAY_MS,
    batchFn,
    log: (message, level = 'info') =>
      console.log(`[batchProcessor] [${level.toUpperCase()}]: ${message}`),
    isRunning: { value: true } // 假设任务总是在运行，除非被取消
  })

  if (!batchResults.success) {
    throw new Error(`导入店铺商品任务处理完成，但有失败的批次: ${batchResults.message}`)
  }

  return { success: true, message: `所有批次成功完成。 ${batchResults.message}` }
}

export default {
  name: 'importStoreProducts',
  description: '导入店铺商品',
  execute: execute
}
