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
  const { csgList, skus } = context // csgList可能由前置任务提供, skus来自原始输入
  const { log } = helpers
  let finalCsgList = csgList

  // 如果没有直接提供csgList，但有skus，则尝试通过API获取
  if (!finalCsgList || finalCsgList.length === 0) {
    if (!skus || skus.length === 0) {
      throw new Error('执行京配打标需要 CSG 列表或 SKU 列表，但两者均未提供。')
    }
    log('未直接提供CSG列表，开始通过SKU获取...', 'info')
    // 注意：这里传递的是 skus，即用户在UI上输入的原始SKU列表
    finalCsgList = await _getCSGList(skus, helpers)
  }

  log(`获取到 ${finalCsgList.length} 个CSG，开始生成Excel文件...`, 'info')
  const fileBuffer = _createExcelFileAsBuffer(finalCsgList)
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
