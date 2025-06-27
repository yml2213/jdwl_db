import { getAllCookies } from '../../utils/cookieHelper'
import * as XLSX from 'xlsx'

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
function _createExcelFileAsBuffer(csgList) {
  const data = csgList.map((csg) => ({
    'CSG Code': csg,
    '是否开启京配查询': '是'
  }))
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

/**
 * 获取CSG列表 (API Call)
 */
async function _getCSGList(skuList, helpers) {
  const { log } = helpers
  try {
    const { getCSGList: getCSGListFromApi } = await import('../../services/apiService.js')
    const result = await getCSGListFromApi(skuList)
    if (!result.success) throw new Error(result.message || '获取CSG列表失败')
    log('获取CSG列表成功', 'debug')
    if (!result.csgList || result.csgList.length === 0) throw new Error('未找到对应的CSG编号')
    return result.csgList
  } catch (error) {
    log(`获取CSG列表失败: ${error.message}`, 'error')
    throw error
  }
}

/**
 * 主执行函数
 */
async function enableJpSearchExecute(context, helpers) {
  const { skuList } = context
  const { log } = helpers

  if (!skuList || skuList.length === 0) throw new Error('SKU列表为空')

  log('开始获取CSG列表...', 'info')
  const csgList = await _getCSGList(skuList, helpers)

  log(`获取到 ${csgList.length} 个CSG，开始生成Excel文件...`, 'info')
  const fileBuffer = _createExcelFileAsBuffer(csgList)
  log(`Excel文件创建成功, 大小: ${fileBuffer.length} bytes`, 'info')

  log('通过IPC请求主进程上传京配打标文件...', 'info')
  const result = await window.electron.ipcRenderer.invoke('upload-jp-search-data', {
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

// ... 批处理逻辑 ...
// 由于这个功能API本身不支持按批次返回结果，我们一次性处理所有SKU
// 如果未来需要分批，这里的外部循环逻辑需要保留和调整
// 但目前，我们直接调用上面的 execute 函数
async function mainExecute(context, helpers) {
  const { skuList } = context;
  const BATCH_SIZE = 500;
  if (skuList.length > BATCH_SIZE) {
    helpers.log('提示: 京配打标功能会将所有SKU在一次操作中提交。', 'info');
  }
  return await enableJpSearchExecute(context, helpers);
}

export default {
  name: 'enableJpSearch',
  label: '启用京配打标生效',
  execute: mainExecute // 使用包装后的执行函数
}
