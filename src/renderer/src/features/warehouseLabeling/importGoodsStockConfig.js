import { getSelectedDepartment, getSelectedShop } from '../../utils/storageHelper'
import { getAllCookies } from '../../utils/cookieHelper'
import * as XLSX from 'xlsx'
import { wait } from './utils/taskUtils'

/**
 * 更新任务对象的状态和日志
 */
function _updateTask(task, status, messages = [], logs = null) {
  if (!task) return
  task.状态 = status
  task.结果 = messages
  if (logs) {
    task.importLogs = logs
  }
}

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
 * 单个批次的主执行函数
 */
async function importGoodsStockConfigExecute(context, helpers) {
  const skuList = context.skuList || context.skus
  const { task } = context
  const { log } = helpers
  const result = {
    success: false,
    message: '',
    importLogs: [],
    results: []
  }
  const startTime = new Date()

  try {
    if (!skuList || skuList.length === 0) throw new Error('SKU列表为空')
    const department = getSelectedDepartment()
    if (!department) throw new Error('未选择事业部，无法启用库存商品分配')

    log(`开始为 ${skuList.length} 个SKU生成库存分配文件...`, 'info')
    const fileBuffer = _createExcelFileAsBuffer(skuList, department)
    log(`文件创建成功, 大小: ${fileBuffer.length} bytes`, 'info')

    // 保存Excel到本地Downloads目录，便于人工比对
    try {
      const saveResult = await window.electron.ipcRenderer.invoke('saveFileToDownloads', fileBuffer, 'goodsStockConfigTemplate_debug.xlsx')
      if (saveResult && saveResult.success) {
        log('已将Excel文件保存到下载目录: goodsStockConfigTemplate_debug.xlsx', 'info')
      } else {
        log('保存Excel到本地失败', 'warn')
      }
    } catch (e) {
      log('保存Excel到本地异常: ' + e.message, 'warn')
    }

    // 获取 cookies
    const cookies = await getAllCookies()
    const tokenCookie = cookies.find((c) => c.name === 'csrfToken')
    const csrfToken = tokenCookie ? tokenCookie.value : ''

    // 通过IPC请求主进程上传库存分配文件
    const ipcPayload = { fileBuffer: Array.from(new Uint8Array(fileBuffer)), cookies, csrfToken }

    const resultIPC = await window.electron.ipcRenderer.invoke(
      'upload-goods-stock-config',
      ipcPayload
    )

    const endTime = new Date()
    result.success = resultIPC && resultIPC.success
    result.message = resultIPC.message
    result.results.push(result.message)
    const processingTime = (endTime - startTime) / 1000
    result.importLogs.push({
      type: result.success ? 'success' : 'error',
      message: result.message,
      time: endTime.toLocaleString(),
      processingTime
    })
    _updateTask(task, result.success ? '成功' : '失败', result.results, result.importLogs)
    return result
  } catch (error) {
    log(`批次处理失败: ${error.message}`, 'error')
    result.success = false
    result.message = `批次处理失败: ${error.message}`
    result.results.push(result.message)
    result.importLogs.push({
      type: 'error',
      message: result.message,
      time: new Date().toLocaleString()
    })
    _updateTask(task, '失败', result.results, result.importLogs)
    return result
  }
}

/**
 * 带批处理的包装执行函数
 */
async function mainExecute(context, helpers) {
  const skuList = context.skuList || context.skus
  const { task } = context
  const { log } = helpers
  const BATCH_SIZE = 2000
  const totalBatches = Math.ceil(skuList.length / BATCH_SIZE)
  let processedCount = 0
  let failedCount = 0
  const errorMessages = []

  for (let i = 0; i < totalBatches; i++) {
    const batchSkus = skuList.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    const batchContext = { ...context, skuList: batchSkus, task: task }
    try {
      const batchResult = await importGoodsStockConfigExecute(batchContext, helpers)
      if (batchResult.success) {
        processedCount += batchSkus.length
      } else {
        failedCount += batchSkus.length
        errorMessages.push(batchResult.message || '一个批次处理失败')
      }
    } catch (error) {
      failedCount += batchSkus.length
      errorMessages.push(error.message || '一个批次处理时发生未知错误')
    }
    if (i < totalBatches - 1) {
      log('等待5分钟，以避免API频率限制...', 'info')
      await wait(300000)
    }
  }

  if (failedCount > 0) {
    return {
      success: false,
      message: `库存分配完成，但有 ${failedCount} 个失败。错误: ${errorMessages.join('; ')}`,
      processedCount,
      failedCount
    }
  }

  return {
    success: true,
    message: `成功为 ${processedCount} 个SKU启用库存分配。`,
    processedCount,
    failedCount
  }
}

export default {
  name: 'importGoodsStockConfig',
  label: '启用库存商品分配',
  execute: mainExecute
} 