/**
 * 后端任务：导入店铺商品
 */
import * as XLSX from 'xlsx'
import { uploadStoreProducts } from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'
import fs from 'fs'
import path from 'path'


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
async function execute(context, sessionData) {
  const { skus, store, department, vendor } = context
  // const sessionData=context.session
  // console.log('context', context)
  // console.log('sessionData', sessionData)
  // console.log('store', store)
  // 参数校验
  if (!store || !store.spShopNo)
    throw new Error('缺少有效的店铺信息 (spShopNo)')
  if (!department || !department.deptNo) throw new Error('缺少有效的事业部信息')
  if (!skus || skus.length === 0) throw new Error('SKU列表为空')
  // 会话验证已由server.js中间件处理，不再需要检查sessionId
  if (!sessionData || !sessionData.cookies) throw new Error('缺少会话信息')

  console.log(`[Task: importStoreProducts] "导入店铺商品" 开始，店铺 [${store.name}]...`)
  console.log(`[Task: importStoreProducts] 总共需要处理 ${skus.length} 个SKU.`)

  const batchFn = async (skuBatch) => {
    try {
      console.log(`[Task: importStoreProducts] 正在为 ${skuBatch.length} 个SKU生成Excel文件...`)
      const fileBuffer = createExcelFileAsBuffer(skuBatch, vendor)
      console.log(
        `[Task: importStoreProducts] Excel文件内存生成完毕，大小: ${fileBuffer.length} bytes`
      )

      // 将生成的Excel文件保存到本地
      try {
        const tempDir = path.resolve(process.cwd(), 'temp', '导入店铺商品')
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }
        const timestamp = new Date().toISOString().replace(/:/g, '-')
        const shopNameForFile = store?.name?.replace(/[\\/:"*?<>|]/g, '_') || 'unknown-shop'
        const filename = `${timestamp}_${shopNameForFile}.xls`
        const filePath = path.join(tempDir, filename)
        fs.writeFileSync(filePath, fileBuffer)
        console.log(`[Task: importStoreProducts] Excel文件已保存到: ${filePath}`)
      } catch (saveError) {
        console.error(`[Task: importStoreProducts] 保存Excel文件失败:`, saveError)
        // 保存失败不应中断整个任务，仅记录错误
      }

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
