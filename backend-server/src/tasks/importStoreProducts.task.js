/**
 * 后端任务：导入店铺商品
 */
import XLSX from 'xlsx'
// 注意：这里的 executeInBatches 和其他工具函数也需要从前端迁移到后端
// 我们暂时先将它注释，关注核心逻辑
// import { executeInBatches } from './utils/taskUtils'; 

/**
 * 在后端创建包含SKU的Excel文件Buffer
 */
function createExcelFileAsBuffer(skuList, departmentInfo) {
    const excelData = [
        ['商家商品编号', '商品名称', '事业部商品编码'],
        ...skuList.map((sku) => [sku, `商品-${sku}`, departmentInfo.deptNo]),
    ]
    const worksheet = XLSX.utils.aoa_to_sheet(excelData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
    return XLSX.write(workbook, { bookType: 'xls', type: 'buffer' })
}

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, store
 * @param {object} sessionData 包含 cookies
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
    const { skus, store } = context

    // 参数校验
    if (!store || !store.spShopNo) throw new Error('缺少有效的店铺信息或spShopNo')
    if (!store.deptNo) throw new Error('缺少有效的事业部信息')
    if (!skus || skus.length === 0) throw new Error('SKU列表为空')

    console.log(`[Task: importStoreProducts] "导入店铺商品" 开始...`)

    // TODO: 将分批逻辑 (executeInBatches) 也迁移到后端
    // 暂时先处理单批次逻辑
    console.log(`[Task: importStoreProducts] 为店铺 [${store.shopName}] 生成包含 ${skus.length} 个SKU的导入文件...`)
    const fileBuffer = createExcelFileAsBuffer(skus, store)
    console.log(`[Task: importStoreProducts] 文件创建成功，大小: ${fileBuffer.length} bytes`)

    // 在这里，我们将文件转发到京东服务器
    try {
        // TODO: 实现真正的京东API请求转发逻辑 forwardToJdApi
        console.log('[Task: importStoreProducts] 使用的会话信息: ', sessionData.sessionId)
        console.log('[Task: importStoreProducts] （占位符）模拟将导入文件转发到京东服务器。')
        // 使用 sessionData.cookies 来发起请求

        return { success: true, message: '店铺商品导入任务提交成功。' }
    } catch (error) {
        console.error('[Task: importStoreProducts] 导入店铺商品失败:', error)
        throw new Error(`导入店铺商品失败: ${error.message}`)
    }
}

export default {
    name: 'importStoreProducts',
    execute: execute,
} 