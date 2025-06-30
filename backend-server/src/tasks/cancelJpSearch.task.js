/**
 * 后端任务：取消京配打标
 * 支持两种模式：
 * 1. 整店取消京配打标
 * 2. 部分取消京配打标
 */
import XLSX from 'xlsx'
import {
    uploadJpSearchFile,
    getJpEnabledCsgsForStore
} from '../services/jdApiService.js'

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
 * @param {object} context 包含 skus, csgList, store, options
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, sessionData) {
    const { skus, csgList, store, options } = context
    const isWholeStore = options?.cancelJpSearchScope === 'all'

    if (!sessionData || !sessionData.cookie) {
        throw new Error('缺少会话信息')
    }

    console.log(
        `[Task: cancelJpSearch] "取消京配打标" 开始，店铺 [${store.shopName}], 模式: ${isWholeStore ? '整店' : '部分'}`
    )

    try {
        let itemsToProcess = []
        if (isWholeStore) {
            // 1. Get all products with JP search enabled for the entire store
            console.log('[Task: cancelJpSearch] 正在查询整店已开启京配的商品...')
            itemsToProcess = await getJpEnabledCsgsForStore(sessionData)
        } else {
            itemsToProcess = csgList || skus
        }

        if (!itemsToProcess || itemsToProcess.length === 0) {
            const message = isWholeStore
                ? '店铺内没有已开启京配搜索的商品，无需操作。'
                : '商品列表为空，无需操作。'
            return { success: true, message }
        }

        console.log(
            `[Task: cancelJpSearch] 查询到 ${itemsToProcess.length} 个商品，将为它们取消京配打标。`
        )

        // 2. Create Excel and upload
        const fileBuffer = createJpSearchExcelBuffer(itemsToProcess)
        const response = await uploadJpSearchFile(fileBuffer, sessionData)

        console.log('取消京配打标=======> response', response)

        if (response && response.resultCode === 1) {
            return {
                success: true,
                message: `${response.resultData || '取消京配打标任务提交成功。'} (共 ${itemsToProcess.length} 个商品)`
            }
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