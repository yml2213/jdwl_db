/**
 * 后端任务：清零库存分配
 * 支持两种模式：
 * 1. 上传Excel文件，清零指定SKU的库存。
 * 2. 调用API，清零整个店铺的库存。
 */
import XLSX from 'xlsx'
import {
  clearStockForWholeStore,
  uploadInventoryAllocationFile,
} from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'
import { saveExcelFile } from '../utils/fileUtils.js'

// 配置常量
const BATCH_SIZE = 2000
const BATCH_DELAY = 5 * 60 * 1000 // 5分钟
const TEMP_DIR_NAME = '清零库存分配'

function createExcelFile(skuList, department, store) {
  const headers = [
    '事业部编码',
    '主商品编码',
    '商家商品标识',
    '店铺编码',
    '库存管理方式',
    '库存比例/数值',
    '仓库编号'
  ]
  const introRow = [
    'CBU开头的事业部编码',
    'CMG开头的商品编码，主商品编码与商家商品标识至少填写一个',
    '商家自定义的商品编码，主商品编码与商家商品标识至少填写一个',
    'CSP开头的店铺编码',
    '纯数值，1-独占，2-共享，3-固定值',
    '库存方式为独占或共享时，此处填写大于等于0的正整数，所有独占（或共享）比例之和不能大于100库存方为固定值时，填写正整数，不能大于当前商品的库存总数',
    '可空，只有在库存管理方式为3-固定值时，读取仓库编码，若为空则按全部仓库执行'
  ]
  const rows = skuList.map((sku) => [department.deptNo, '', sku, store.shopNo, 1, 0, '']) // 核心：库存比例为0
  const excelData = [headers, introRow, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'GoodsStockConfig')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

async function execute(context, sessionData) {
  const { skus, store, department, scope } = context

  // console.log('清空整个店铺的库存分配 ===>', context)
  // console.log('清空整个店铺的库存分配 ===>', sessionData)
  // console.log('库存分配清零 输入的 skus===>', skus)
  // console.log('库存分配清零  store===>', store)
  // console.log('库存分配清零  department===>', department)

  if (!skus || skus.length === 0) throw new Error('SKU列表为空')
  if (!store || !department) throw new Error('缺少店铺或事业部信息')

  // Mode selection: whole store or specific SKUs
  if (scope === 'whole_store') {
    // Whole store mode
    console.log(
      `[Task: clearStockAllocation] 整店库存清零模式，店铺: ${store.shopName}`
    )
    const result = await clearStockForWholeStore(store.id, department.id, sessionData)
    //  {"resultCode":1,"resultMessage":"操作成功！","resultData":null}
    if (result && result.resultCode === 1) {
      return { success: true, message: result.resultMessage || '整店库存清零成功。' }
    } else {
      const errorMessage = result ? JSON.stringify(result) : '整店库存清零失败'
      throw new Error(errorMessage)
    }
  } else {
    // Specific SKUs mode with batching
    console.log(
      `[Task: clearStockAllocation] 指定SKU库存清零模式，总SKU数量: ${skus.length}`
    )

    const batchFn = async (skuBatch) => {
      try {
        console.log(
          `[Task: clearStockAllocation] 正在为 ${skuBatch.length} 个SKU创建批处理文件...`
        )
        const fileBuffer = createExcelFile(skuBatch, department, store)

        // 临时文件保存到本地
        const filePath = await saveExcelFile(fileBuffer, {
          dirName: TEMP_DIR_NAME,
          store: store,
          extension: 'xlsx'
        })

        if (filePath) {
          console.log(`[Task: clearStockAllocation] 批处理文件已保存: ${filePath}`)
        }

        // 调用封装在 jdApiService 中的函数来上传文件
        const result = await uploadInventoryAllocationFile(fileBuffer, sessionData)

        console.log('库存分配清零 响应 result===>', result)

        // {"resultData":"report/goodsStockConfig/goodsStockConfigImportLog-威名2-1751360515796.csv","resultCode":"1"}
        // {"resultData":"report/goodsStockConfig/goodsStockConfigImportLog-威名2-1751360063858.csv","resultCode":"2"}
        // uploadInventoryAllocationFile 已经处理了重试逻辑，这里只需检查最终结果
        if (result && (result.resultCode == 1 || result.resultCode == 2)) {
          return { success: true, message: `批处理成功处理 ${skuBatch.length} 个SKU。` }
        } else {
          const errorMessage =
            result?.resultMessage || JSON.stringify(result) || '上传失败但未返回有效错误信息'
          return { success: false, message: errorMessage }
        }
      } catch (error) {
        console.error('[Task: clearStockAllocation] 批处理执行时发生严重错误:', error)
        return { success: false, message: `批处理失败: ${error.message}` }
      }
    }

    const batchResults = await executeInBatches({
      items: skus,
      batchSize: BATCH_SIZE,
      delay: BATCH_DELAY,
      batchFn,
      log: (message, level = 'info') =>
        console.log(`[batchProcessor] [${level.toUpperCase()}]: ${message}`),
      isRunning: { value: true } // 假设任务总是在运行
    })

    if (!batchResults.success) {
      throw new Error(`库存清零任务有失败的批次: ${batchResults.message}`)
    }

    return { success: true, message: `所有批次成功完成。 ${batchResults.message}` }
  }
}

export default {
  name: 'clearStockAllocation',
  description: '清零库存分配',
  execute: execute
} 