/**
 * 后端任务：导入店铺商品
 */
import * as XLSX from 'xlsx'
import { uploadStoreProducts } from '../services/jdApiService.js'
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
 * @param {object} context 包含 skus, store
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
  const { skus, store } = context

  //   console.log('skus', skus)
  //   console.log('store', store)
  // 参数校验
  if (!store || !store.spShopNo) throw new Error('缺少有效的店铺信息或spShopNo')
  if (!store.deptNo) throw new Error('缺少有效的事业部信息')
  if (!skus || skus.length === 0) throw new Error('SKU列表为空')
  if (!sessionData || !sessionData.sessionId) throw new Error('缺少会话ID')

  console.log(`[Task: importStoreProducts] "导入店铺商品" 开始，店铺 [${store.shopName}]...`)

  try {
    // 1. 根据 skus 生成 Excel 文件 buffer
    console.log(`[Task: importStoreProducts] 正在为 ${skus.length} 个SKU生成Excel文件...`)
    const fileBuffer = createExcelFileAsBuffer(skus, store)
    console.log(
      `[Task: importStoreProducts] Excel文件内存生成完毕，大小: ${fileBuffer.length} bytes`
    )

    // 准备上传所需的数据
    const dataForUpload = {
      ...sessionData,
      store: store,
      department: {
        // uploadStoreProducts 需要一个 department 对象
        deptId: store.deptId // 确保 payload 中包含 deptId
      }
    }

    // 2. 调用 jdApiService 上传文件，传递完整的会话数据
    console.log(`[Task: importStoreProducts] 调用jdApiService以上传文件...`)
    const uploadResult = await uploadStoreProducts(fileBuffer, dataForUpload)
    console.log(`[Task: importStoreProducts] 上传服务调用完成。`)

    // 3. 返回上传结果
    if (!uploadResult.success) {
      throw new Error(uploadResult.message || '上传店铺商品文件失败。')
    }

    console.log(`[Task: importStoreProducts] "导入店铺商品" 任务成功完成。`)
    return { success: true, message: uploadResult.message }
  } catch (error) {
    console.error('[Task: importStoreProducts] 任务执行失败:', error)
    // 确保抛出错误，以便 executeTask 接口可以捕获并返回给前端
    throw new Error(`导入店铺商品失败: ${error.message}`)
  }
}

export default {
  name: 'importStoreProducts',
  execute: execute
}
