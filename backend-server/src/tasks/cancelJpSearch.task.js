/**
 * 后端任务：取消京配打标
 */
import XLSX from 'xlsx'
import { uploadJpSearchFile } from '../services/jdApiService.js'

/**
 * 创建用于取消京配查询的Excel文件Buffer
 * @param {string[]} items - 商品SKU或CSG列表
 * @returns {Buffer}
 */
function createJpSearchExcelBuffer(items) {
    const headers = ['店铺商品编号 (CSG编码)', '京配搜索 (0否, 1是)']
    // Key change: Set the value to 0 to disable JP search.
    const dataRows = items.map((item) => [item, 0])
    const excelData = [headers, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    return XLSX.write(wb, { bookType: 'xls', type: 'buffer' })
}

/**
 * 主执行函数 - 由工作流调用
 * @param {object} context 包含 skus, csgList
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
    const { skus, store } = context

    // For this operation, we should probably use SKUs directly.
    const itemsToProcess = skus
    if (!itemsToProcess || itemsToProcess.length === 0) {
        return { success: true, message: '商品列表为空，无需操作。' }
    }

    if (!sessionData || !sessionData.cookies) {
        throw new Error('缺少会话信息')
    }

    console.log(
        `[Task: cancelJpSearch] "取消京配打标" 开始，店铺 [${store.shopName}]...`
    )
    console.log(
        `[Task: cancelJpSearch] 将为 ${itemsToProcess.length} 个商品取消京配打标。`
    )

    try {
        const fileBuffer = createJpSearchExcelBuffer(itemsToProcess)
        const response = await uploadJpSearchFile(fileBuffer, sessionData)
        // {resultCode: 1,resultMessage: '操作成功！',
        // resultData: '导入文件之后将进入后台任务处理阶段，任务编号：updateshopgoodsjpsearch20250630172724,请稍后在任务日志查看导入结果' }


        console.log('取消京配打标=======> response', response)

        if (response && response.resultCode === 1) {
            return { success: true, message: response.resultData || '取消京配打标任务提交成功。' }
        } else {
            const errorMessage = response.message || '取消京配打标时发生未知错误'
            throw new Error(errorMessage)
        }
    } catch (error) {
        console.error('[Task: cancelJpSearch] 任务执行失败:', error)
        throw new Error(`取消京配打标失败: ${error.message}`)
    }
}

export default {
    name: 'cancelJpSearch',
    description: '取消京配打标',
    execute: execute
} 