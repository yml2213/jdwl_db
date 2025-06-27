/**
 * 功能定义: 导入店铺商品
 */
import * as XLSX from 'xlsx'

/**
 * 创建包含SKU的Excel文件，并返回其Buffer
 * @param {string[]} skuList - SKU列表
 * @param {object} departmentInfo - 事业部信息
 * @returns {Buffer} - The generated Excel file as a Buffer.
 */
function _createExcelFileAsBuffer(skuList, departmentInfo) {
  const excelData = [
    ['商家商品编号', '商品名称', '事业部商品编码'],
    ...skuList.map((sku) => [sku, `商品-${sku}`, departmentInfo.deptNo])
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  // 返回Buffer而不是File对象
  return XLSX.write(workbook, { bookType: 'xls', type: 'buffer' })
}

/**
 * 主执行函数
 * 通过IPC将文件和数据发送到主进程进行上传
 */
async function execute(context, { log, isManual }) {
  const { skuList, shopInfo, departmentInfo } = context

  // 参数校验
  if (!shopInfo || !shopInfo.spShopNo) throw new Error('缺少有效的店铺信息或spShopNo')
  if (!departmentInfo || !departmentInfo.deptNo) throw new Error('缺少有效的事业部信息')
  if (!skuList || skuList.length === 0) throw new Error('SKU列表为空')

  if (!isManual) {
    log(`任务 "导入店铺商品" 开始...`, 'info')
  }

  log(`开始为店铺 [${shopInfo.shopName}] 生成商品导入文件...`, 'info')
  const fileBuffer = _createExcelFileAsBuffer(skuList, departmentInfo)
  log(`文件创建成功，大小: ${fileBuffer.length} bytes`, 'info')

  log('通过IPC请求主进程上传文件...', 'info')
  const result = await window.electron.ipcRenderer.invoke('upload-store-products', {
    fileBuffer,
    // 确保传递的是纯净的数据对象，避免Proxy问题
    shopInfo: JSON.parse(JSON.stringify(shopInfo)),
    departmentInfo: JSON.parse(JSON.stringify(departmentInfo))
  })

  if (result && result.success) {
    log('主进程返回成功信息', 'success')
    if (!isManual) {
      log(`任务 "导入店铺商品" 所有步骤执行完毕。`, 'success')
    }
    return { success: true, message: result.message }
  } else {
    log(`主进程返回错误: ${result.message}`, 'error')
    throw new Error(result.message || '主进程文件上传失败')
  }
}

export default {
  name: 'importStore',
  label: '导入店铺商品',
  execute: execute
}
