/**
 * 后端任务：取消京配打标
 * 支持两种模式：
 * 1. 整店取消京配打标
 * 2. 部分取消京配打标
 */
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import {
    uploadJpSearchFile,
    getJpEnabledCsgsForStore
} from '../services/jdApiService.js'
import getCSGTask from './getCSG.task.js'
import { executeInBatches } from '../utils/batchProcessor.js'

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
    const { skus, store, options } = context
    let { csgList } = context
    const isWholeStore = options?.cancelJpSearchScope === 'all'

    if (!sessionData || !sessionData.cookies) {
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
            if (!csgList && skus && skus.length > 0) {
                console.log(
                    `[Task: cancelJpSearch] 未提供CSG列表，将通过SKU查询CSG...`
                )
                const csgContext = { ...context }
                const csgResult = await getCSGTask.execute(csgContext, sessionData)
                if (!csgResult.success) {
                    throw new Error(`获取CSG失败: ${csgResult.message}`)
                }
                csgList = csgResult.csgList
            }
            itemsToProcess = csgList || []
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

        const batchFn = async (batchItems) => {
            try {
                console.log(`[Task: cancelJpSearch] 正在为 ${batchItems.length} 个商品创建批处理文件...`)
                const fileBuffer = createJpSearchExcelBuffer(batchItems)

                // 保存文件到本地
                try {
                    const tempDir = path.resolve(process.cwd(), 'temp', '取消京配打标')
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true })
                    }
                    const timestamp = new Date().toISOString().replace(/:/g, '-')
                    const shopNameForFile =
                        store?.shopName?.replace(/[\\/:"*?<>|]/g, '_') || 'unknown-shop'
                    const filename = `${timestamp}_${shopNameForFile}.xls`
                    const filePath = path.join(tempDir, filename)
                    fs.writeFileSync(filePath, fileBuffer)
                    console.log(`[Task: cancelJpSearch] 批处理文件已保存: ${filePath}`)
                } catch (saveError) {
                    console.error('[Task: cancelJpSearch] 保存Excel文件失败:', saveError)
                }

                const response = await uploadJpSearchFile(fileBuffer, sessionData)
                if (response && response.resultCode === 1) {
                    return {
                        success: true,
                        message: `${response.resultData || '取消京配打标任务提交成功。'} (处理了 ${batchItems.length
                            } 个商品)`
                    }
                } else {
                    const errorMessage = response?.message || '取消京配打标时发生未知错误'
                    return { success: false, message: errorMessage }
                }
            } catch (error) {
                console.error('[Task: cancelJpSearch] 批处理执行时发生严重错误:', error)
                return { success: false, message: `批处理失败: ${error.message}` }
            }
        }

        const BATCH_SIZE = 5000
        const DELAY_MS = 1 * 60 * 1000

        const batchResults = await executeInBatches({
            items: itemsToProcess,
            batchSize: BATCH_SIZE,
            delay: DELAY_MS,
            batchFn,
            log: (message, level = 'info') =>
                console.log(`[batchProcessor] [${level.toUpperCase()}]: ${message}`),
            isRunning: { value: true }
        })

        if (!batchResults.success) {
            throw new Error(`取消京配打标任务有失败的批次: ${batchResults.message}`)
        }

        return { success: true, message: `所有批次成功完成。 ${batchResults.message}` }
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