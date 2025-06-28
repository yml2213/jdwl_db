import * as XLSX from 'xlsx'

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
async function enableJpSearchExecute(context, helpers) {
  const { csgList } = context
  const { log } = helpers

  if (!csgList || csgList.length === 0) {
    throw new Error('上下文中未提供有效的CSG列表，无法执行京配打标。')
  }

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
  // 不再在这里检查，将逻辑移到核心执行函数中
  helpers.log('提示: 京配打标功能会将所有CSG在一次操作中提交。', 'info')
  return await enableJpSearchExecute(context, helpers)
}

export default {
  name: 'enableJpSearch',
  label: '启用京配打标生效',
  execute: mainExecute // 使用包装后的执行函数
}
