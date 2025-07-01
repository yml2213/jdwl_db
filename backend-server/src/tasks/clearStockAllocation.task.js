/**
 * 后端任务：清零库存分配
 * 支持两种模式：
 * 1. 上传Excel文件，清零指定SKU的库存。
 * 2. 调用API，清零整个店铺的库存。
 */
import XLSX from 'xlsx'
import FormData from 'form-data'
import { requestJdApi, clearStockForWholeStore } from '../services/jdApiService.js'

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
  const rows = skuList.map((sku) => [department.deptNo, '', sku, store.shopNo, 1, 0, '']) // 核心：库存比例为0
  const excelData = [headers, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'GoodsStockConfig')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

async function execute(context, sessionData) {
  const { skus, store, department } = context

  // console.log('清空整个店铺的库存分配 ===>', context)
  // console.log('清空整个店铺的库存分配 ===>', sessionData)
  console.log('库存分配清零 输入的 skus===>', skus)
  console.log('库存分配清零  store===>', store)
  console.log('库存分配清零  department===>', department)

  if (!skus || skus.length === 0) throw new Error('SKU列表为空')
  if (!store || !department) throw new Error('缺少店铺或事业部信息')

  // Mode selection: whole store or specific SKUs
  if (skus.length === 1 && skus[0] === 'WHOLE_STORE') {
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

    const url = 'https://o.jdl.com/goodsStockConfig/importGoodsStockConfig.do'
    const formData = new FormData()
    formData.append('goodsStockConfigExcelFile', fileBuffer, 'GoodsStockConfig.xlsx')

    const headers = {
      ...formData.getHeaders(),
      Cookie: cookieString,
      Referer: 'https://o.jdl.com/goToMainIframe.do'
    }

    const responseText = await requestJdApi({
      method: 'POST',
      url: url,
      data: formData,
      headers: headers
    })

    console.log('库存分配清零 上传的文件 responseText===>', responseText)

    // The response is expected to be a JSON object.
    // Check for a success flag in the returned object.
    if (responseText && responseText.success === true) {
      return { success: true, message: '库存清零任务上传成功' }
    } else {
      // If the check fails, throw an error with the detailed response.
      const errorMessage = responseText ? JSON.stringify(responseText) : '库存清零任务上传失败'
      throw new Error(errorMessage)
    }
  }
}

export default {
  name: 'clearStockAllocation',
  description: '清零库存分配',
  execute: execute
} 