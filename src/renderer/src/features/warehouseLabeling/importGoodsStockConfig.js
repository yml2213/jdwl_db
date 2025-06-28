import { getSelectedDepartment, getSelectedShop } from '../../utils/storageHelper'
import { getAllCookies } from '../../utils/cookieHelper'
import * as XLSX from 'xlsx'
import { executeInBatches } from './utils/taskUtils'

const BATCH_SIZE = 2000
const BATCH_DELAY = 5 * 60 * 1000 // 5 minutes

/**
 * 创建Excel数据Buffer
 */
function _createExcelFileAsBuffer(skuList, department) {
  const shop = getSelectedShop()
  if (!shop) throw new Error('无法获取店铺信息')

  // 表头
  const headers = [
    '事业部编码',
    '主商品编码',
    '商家商品标识',
    '店铺编码',
    '库存管理方式',
    '库存比例/数值',
    '仓库编号'
  ]
  // 说明行
  const introRow = [
    'CBU开头的事业部编码',
    'CMG开头的商品编码，主商品编码与商家商品标识至少填写一个',
    '商家自定义的商品编码，主商品编码与商家商品标识至少填写一个',
    'CSP开头的店铺编码',
    '纯数值\n1-独占\n2-共享\n3-固定值',
    '库存方式为独占或共享时，此处填写大于等于0的正整数，所有独占（或共享）比例之和不能大于100\n库存方式为固定值时，填写仓库方式',
    '可空，只有在库存管理方式为3-固定值时，该仓库编码，若为空则按全部仓执行'
  ]
  // 数据行
  const rows = skuList.map((sku) => [
    department.deptNo, // 事业部编码
    '',                // 主商品编码
    sku,               // 商家商品标识
    shop.shopNo,       // 店铺编码
    1,                 // 库存管理方式
    100,               // 库存比例/数值
    ''                 // 仓库编号
  ])
  const excelData = [headers, introRow, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'GoodsStockConfig')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

/**
 * 主执行函数
 */
async function mainExecute(context, helpers) {
  const { skus, csgList } = context
  const { log, isRunning } = helpers

  // csgList 是 '获取店铺商品编号' 步骤的产物，比对 SKU 更准确
  const itemsToProcess = csgList || skus
  if (!itemsToProcess || itemsToProcess.length === 0) {
    throw new Error('没有可供处理的商品列表（SKU或CSG）。')
  }

  const department = getSelectedDepartment()
  if (!department) throw new Error('未选择事业部，无法启用库存商品分配')

  const cookies = await getAllCookies()
  const tokenCookie = cookies.find((c) => c.name === 'csrfToken')
  const csrfToken = tokenCookie ? tokenCookie.value : ''

  const batchFn = async (batchItems) => {
    try {
      log(`开始为 ${batchItems.length} 个商品生成库存分配文件...`, 'info')
      const fileBuffer = _createExcelFileAsBuffer(batchItems, department)
      log(`文件创建成功, 大小: ${fileBuffer.length} bytes`, 'info')

      const ipcPayload = {
        fileBuffer: Array.from(new Uint8Array(fileBuffer)),
        cookies,
        csrfToken
      }

      const ipcResult = await window.electron.ipcRenderer.invoke('upload-goods-stock-config', ipcPayload)

      // 根据此API的特性，resultCode '2' 表示成功提交异步任务
      if (ipcResult && ipcResult.resultCode === '2') {
        return { success: true, message: `任务已成功提交，日志文件: ${ipcResult.resultData}` }
      } else {
        // 其他情况都视为失败
        const errorMessage = `上传失败: ${JSON.stringify(ipcResult)}`
        log(errorMessage, 'error')
        return { success: false, message: errorMessage }
      }
    } catch (error) {
      log(`批次处理失败: ${error.message}`, 'error')
      return { success: false, message: error.message }
    }
  }

  const result = await executeInBatches({
    items: itemsToProcess,
    batchSize: BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log,
    isRunning
  })

  if (result.success) {
    log('所有批次的库存商品分配任务均已成功提交。', 'success')
  } else {
    log(`库存商品分配任务部分或全部失败: ${result.message}`, 'error')
    throw new Error(result.message || '库存商品分配任务执行失败')
  }

  return { success: result.success, message: result.message }
}

export default {
  name: 'importGoodsStockConfig',
  label: '启用库存商品分配',
  execute: mainExecute
} 