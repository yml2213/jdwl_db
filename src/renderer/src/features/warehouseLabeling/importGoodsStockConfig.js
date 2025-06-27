import { getSelectedDepartment, getSelectedShop } from '../../utils/storageHelper'
import * as XLSX from 'xlsx'
import { wait } from './utils/taskUtils'

/**
 * 创建Excel数据Buffer
 */
function _createExcelFileAsBuffer(skuList, department) {
  const shop = getSelectedShop()
  if (!shop) throw new Error('无法获取店铺信息')

  const headers = [
    '事业部编码',
    '事业部名称',
    '店铺编号',
    '店铺名称',
    '商品编码',
    '是否启用库存归属'
  ]
  const rows = skuList.map((sku) => [
    department.deptNo,
    department.deptName,
    shop.shopNo,
    shop.shopName,
    sku,
    '是'
  ])
  const excelData = [headers, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

/**
 * 单个批次的主执行函数
 */
async function importGoodsStockConfigExecute(context, helpers) {
  const { skuList } = context
  const { log } = helpers

  if (!skuList || skuList.length === 0) throw new Error('SKU列表为空')

  const department = getSelectedDepartment()
  if (!department) throw new Error('未选择事业部，无法启用库存商品分配')

  log(`开始为 ${skuList.length} 个SKU生成库存分配文件...`, 'info')
  const fileBuffer = _createExcelFileAsBuffer(skuList, department)
  log(`文件创建成功, 大小: ${fileBuffer.length} bytes`, 'info')

  log('通过IPC请求主进程上传库存分配文件...', 'info')
  const result = await window.electron.ipcRenderer.invoke('upload-goods-stock-config', {
    fileBuffer
  })

  if (result && result.success) {
    log('主进程返回成功信息', 'success')
    return { success: true, message: result.message }
  } else {
    log(`主进程返回错误: ${result.message}`, 'error')
    throw new Error(result.message || '主进程文件上传失败')
  }
}

/**
 * 带批处理的包装执行函数
 */
async function mainExecute(context, helpers) {
  const { skuList } = context
  const BATCH_SIZE = 2000

  let allResults = { success: true, messages: [] }

  for (let i = 0; i < skuList.length; i += BATCH_SIZE) {
    const batchSkus = skuList.slice(i, i + BATCH_SIZE)
    const batchContext = { ...context, skuList: batchSkus }
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1

    helpers.log(`处理批次 ${batchNumber}，SKU数量: ${batchSkus.length}`, 'info')

    try {
      const batchResult = await importGoodsStockConfigExecute(batchContext, helpers)
      if (!batchResult.success) {
        allResults.success = false
      }
      allResults.messages.push(`批次 ${batchNumber}: ${batchResult.message}`)
    } catch (error) {
      allResults.success = false
      const errorMessage = `批次 ${batchNumber} 失败: ${error.message}`
      allResults.messages.push(errorMessage)
      helpers.log(`批次处理失败: ${error.message}`, 'error')
    }

    if (i + BATCH_SIZE < skuList.length) {
      helpers.log('等待5分钟，以避免API频率限制...', 'info')
      await wait(300000) // 5 minutes
    }
  }

  return {
    success: allResults.success,
    message: allResults.messages.join('; ')
  }
}

export default {
  name: 'importGoodsStockConfig',
  label: '启用库存商品分配',
  execute: mainExecute
} 