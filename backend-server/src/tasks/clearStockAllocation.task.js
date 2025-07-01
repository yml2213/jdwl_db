/**
 * 后端任务：清零库存分配
 * 支持两种模式：
 * 1. 上传Excel文件，清零指定SKU的库存。
 * 2. 调用API，清零整个店铺的库存。
 */
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import {
  clearStockForWholeStore,
  uploadInventoryAllocationFile
} from '../services/jdApiService.js'

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
  console.log('库存分配清零 输入的 skus===>', skus)
  console.log('库存分配清零  store===>', store)
  console.log('库存分配清零  department===>', department)

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
    // Specific SKUs mode (original logic)
    console.log(
      `[Task: clearStockAllocation] 指定SKU库存清零模式，SKU数量: ${skus.length}`
    )
    const { cookies } = sessionData
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    const csrfToken = cookies.find((c) => c.name === 'csrfToken')?.value
    if (!csrfToken) throw new Error('无法获取csrfToken')

    const fileBuffer = createExcelFile(skus, department, store)

    // 临时文件保存到本地
    try {
      const tempDir = path.resolve(process.cwd(), 'temp', '清零库存分配')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/:/g, '-')
      const shopNameForFile =
        store?.shopName?.replace(/[\\/:"*?<>|]/g, '_') || 'unknown-shop'
      const fileName = `${timestamp}_${shopNameForFile}.xlsx`
      const filePath = path.join(tempDir, fileName)
      fs.writeFileSync(filePath, fileBuffer)
      console.log(`[Task: clearStockAllocation] 临时文件已保存: ${filePath}`)
    } catch (saveError) {
      console.error('[Task: clearStockAllocation] 保存Excel文件失败:', saveError)
      // Saving the file is for logging/debugging, should not interrupt the main task.
    }

    // 调用封装在 jdApiService 中的函数来上传文件
    const responseText = await uploadInventoryAllocationFile(fileBuffer, sessionData)

    // The response is expected to be a string that looks like JSON.
    try {
      const result = JSON.parse(responseText)
      if (result && result.success === true) {
        return { success: true, message: '库存清零任务上传成功' }
      } else {
        const errorMessage = result ? result.message || JSON.stringify(result) : '上传失败但未返回有效错误信息'
        throw new Error(errorMessage)
      }
    } catch (e) {
      console.error('[Task: clearStockAllocation] Failed to parse JSON response:', responseText)
      throw new Error('上传失败，无法解析服务器响应。')
    }
  }
}

export default {
  name: 'clearStockAllocation',
  description: '清零库存分配',
  execute: execute
} 