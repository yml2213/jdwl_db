/**
 * 后端任务：清零库存分配
 * 通过上传一个将库存比例设置为0的Excel文件来实现。
 */
import XLSX from 'xlsx'
import FormData from 'form-data'
import { requestJdApi } from '../services/jdApiService.js'

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

  if (!skus || skus.length === 0) throw new Error('SKU列表为空')
  if (!store || !department) throw new Error('缺少店铺或事业部信息')

  const { cookies } = sessionData
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const csrfToken = cookies.find((c) => c.name === 'csrfToken')?.value
  if (!csrfToken) throw new Error('无法获取csrfToken')

  const fileBuffer = createExcelFile(skus, department, store)

  const url = 'https://o.jdl.com/goodsStockConfig/importGoodsStockConfig.do'
  const formData = new FormData()
  formData.append('file', fileBuffer, 'GoodsStockConfig.xlsx')
  formData.append('token', csrfToken)

  const headers = {
    ...formData.getHeaders(),
    Cookie: cookieString,
    Referer: 'https://o.jdl.com/goodsStockConfig/showImport.do'
  }

  const responseText = await requestJdApi({
    method: 'POST',
    url: url,
    data: formData,
    headers: headers
  })

  if (responseText && responseText.includes('导入成功')) {
    return { success: true, message: '库存清零任务上传成功' }
  } else {
    throw new Error(responseText || '库存清零任务上传失败')
  }
}

export default {
  name: 'clearStockAllocation',
  description: '清零库存分配',
  execute: execute
} 