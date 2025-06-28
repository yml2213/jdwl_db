import * as XLSX from 'xlsx'
import { executeInBatches } from './utils/taskUtils'

const BATCH_SIZE = 2000
const BATCH_DELAY = 30 * 1000 // 30 seconds

/**
 * 创建Excel数据Buffer
 */
function _createExcelFileAsBuffer(csgList) {
  const excelData = [
    ['店铺商品编号（CSG编码）必填', '京配搜索（0否，1是）'],
    ...csgList.map((csg) => [csg, '1'])
  ]

  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  return XLSX.write(workbook, { bookType: 'xls', type: 'buffer' })
}

/**
 * 主执行函数
 */
async function mainExecute(context, helpers) {
  const { csgList } = context
  const { log, isRunning } = helpers

  if (!csgList || csgList.length === 0) {
    throw new Error('上下文中未提供有效的CSG列表，无法执行京配打标。')
  }

  const batchFn = async (batchCsg) => {
    log(`为 ${batchCsg.length} 个CSG生成京配打标Excel文件...`, 'info')
    const fileBuffer = _createExcelFileAsBuffer(batchCsg)
    log(`Excel文件创建成功, 大小: ${fileBuffer.length} bytes`, 'info')

    log('通过IPC请求主进程上传京配打标文件...', 'info')
    return await window.electron.ipcRenderer.invoke('upload-jp-search-data', {
      fileBuffer
    })
  }

  const result = await executeInBatches({
    items: csgList,
    batchSize: BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log,
    isRunning
  })

  if (result.success) {
    log('所有批次的京配打标任务均已成功提交。', 'success')
  } else {
    log(`京配打标任务部分或全部失败: ${result.message}`, 'error')
    throw new Error(result.message || '京配打标任务执行失败')
  }

  return { success: result.success, message: result.message }
}

export default {
  name: 'enableJpSearch',
  label: '启用京配打标生效',
  execute: mainExecute // 使用包装后的执行函数
}
