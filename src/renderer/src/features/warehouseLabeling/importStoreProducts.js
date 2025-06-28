/**
 * 功能定义: 导入店铺商品
 */
import * as XLSX from 'xlsx'
import { executeInBatches } from './utils/taskUtils'

const BATCH_SIZE = 2000 // 每次导入的SKU数量
const BATCH_DELAY = 60 * 1000 // 每批之间的延迟，单位毫秒 (1分钟)

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
async function execute(context, { log, isRunning, isManual }) {
  const { skus, store } = context

  // 参数校验
  if (!store || !store.spShopNo) throw new Error('缺少有效的店铺信息或spShopNo')
  if (!store || !store.deptNo) throw new Error('缺少有效的事业部信息')
  if (!skus || skus.length === 0) throw new Error('SKU列表为空')

  if (!isManual) {
    log(`任务 "导入店铺商品" 开始...`, 'info')
  }

  const batchFn = async (batchSkus) => {
    log(`为店铺 [${store.shopName}] 生成包含 ${batchSkus.length} 个SKU的导入文件...`, 'info')
    const fileBuffer = _createExcelFileAsBuffer(batchSkus, store)
    log(`文件创建成功，大小: ${fileBuffer.length} bytes`, 'info')

    log('通过IPC请求主进程上传文件...', 'info')
    return await window.electron.ipcRenderer.invoke('upload-store-products', {
      fileBuffer,
      shopInfo: JSON.parse(JSON.stringify(store)),
      departmentInfo: JSON.parse(JSON.stringify(store))
    })
  }

  const result = await executeInBatches({
    items: skus,
    batchSize: BATCH_SIZE,
    delay: BATCH_DELAY,
    batchFn,
    log,
    isRunning
  })

  if (result && result.success) {
    log('所有店铺商品批次导入任务提交成功。', 'success')
  } else {
    log(`店铺商品导入任务部分或全部失败: ${result.message}`, 'error')
    throw new Error(result.message || '店铺商品导入任务执行失败')
  }

  // 即使部分失败，也返回成功，因为错误已在日志中记录，并且executeInBatches会继续执行
  // taskFlowExecutor将根据最终结果决定是否继续
  return { success: result.success, message: result.message }
}

export default {
  name: 'importStore',
  label: '导入店铺商品',
  execute: execute
}
