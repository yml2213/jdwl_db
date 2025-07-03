/**
 * 后端任务：取消京配打标
 * 支持两种模式：
 * 1. 整店取消京配打标
 * 2. 部分取消京配打标
 * 7.4 优化 使用 getProductData.task.js 查询商品数据
 */
import XLSX from 'xlsx'
import {
    uploadJpSearchFile,
    getJpEnabledCsgsForStore
} from '../services/jdApiService.js'
import getProductData from './getProductData.task.js'
import { executeInBatches } from '../utils/batchProcessor.js'
import { saveExcelFile } from '../utils/fileUtils.js'

// 配置常量
const BATCH_SIZE = 5000
const BATCH_DELAY = 1 * 60 * 1000 // 1分钟
const TEMP_DIR_NAME = '取消京配打标'

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
 * 批量处理需要取消京配打标的商品
 * @param {string[]} itemsToProcess - 商品CSG列表
 * @param {object} store - 店铺信息
 * @param {object} sessionData - 会话数据
 * @returns {Promise<object>} 批处理结果
 */
async function processInBatches(itemsToProcess, store, sessionData) {
    const batchFn = async (batchItems) => {
        try {
            console.log(`[Task: cancelJpSearch] 正在为 ${batchItems.length} 个商品创建批处理文件...`)
            const fileBuffer = createJpSearchExcelBuffer(batchItems)

            // 保存文件到本地
            const filePath = await saveExcelFile(fileBuffer, {
                dirName: TEMP_DIR_NAME,
                store: store,
                extension: 'xls'
            })

            if (filePath) {
                console.log(`[Task: cancelJpSearch] 批处理文件已保存: ${filePath}`)
            }

            const response = await uploadJpSearchFile(fileBuffer, sessionData)
            console.log('取消京配打标=======> response', response)

            if (response && response.resultCode === 1) {
                return {
                    success: true,
                    message: `${response.resultData || '取消京配打标任务提交成功。'} (处理了 ${batchItems.length
                        } 个商品)`
                }
            }

            // 检查频率限制错误
            if (response && response.message && response.message.includes('频繁操作')) {
                return { success: false, message: response.message }
            }

            const errorMessage = response?.message || '取消京配打标时发生未知错误'
            return { success: false, message: errorMessage }
        } catch (error) {
            console.error('[Task: cancelJpSearch] 批处理执行时发生严重错误:', error)
            return { success: false, message: `批处理失败: ${error.message}` }
        }
    }

    return await executeInBatches({
        items: itemsToProcess,
        batchSize: BATCH_SIZE,
        delay: BATCH_DELAY,
        batchFn,
        log: (message, level = 'info') =>
            console.log(`[batchProcessor] [${level.toUpperCase()}]: ${message}`),
        isRunning: { value: true }
    })
}

/**
 * 主执行函数 - 由工作流调用
 * @param {object} context 包含 skus, csgList, store, options
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, updateFn = () => { }, sessionData) {
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
            // 1. 获取整店已开启京配的商品
            console.log('[Task: cancelJpSearch] 正在查询整店已开启京配的商品...')
            itemsToProcess = await getJpEnabledCsgsForStore(sessionData)
        } else {
            // 2. 如果只提供了SKU，先查询CSG
            if (!csgList && skus && skus.length > 0) {
                console.log(
                    `[Task: cancelJpSearch] 未提供CSG列表，将通过SKU查询CSG...`
                )
                const payload = { skus }
                const result = await getProductData.execute(
                    payload,
                    updateFn,
                    sessionData
                )

                if (!result || !result.data || result.data.length === 0) {
                    throw new Error('获取商品数据失败，请检查SKU是否正确。')
                }
                csgList = result.data.map((p) => p.shopGoodsNo).filter(Boolean)
            }
            itemsToProcess = csgList || []
        }

        if (!itemsToProcess || itemsToProcess.length === 0) {
            const message = isWholeStore
                ? '店铺内没有已开启京配搜索的商品，无需操作。'
                : '商品列表为空，无需操作。'
            return { success: true, message }
        }

        // 对CSG列表去重
        const uniqueItems = [...new Set(itemsToProcess)]
        const duplicatesCount = itemsToProcess.length - uniqueItems.length
        if (duplicatesCount > 0) {
            console.log(
                `[Task: cancelJpSearch] 已移除${duplicatesCount}个重复的CSG编码，去重后还剩${uniqueItems.length}个商品。`
            )
        }

        console.log(
            `[Task: cancelJpSearch] 查询到 ${uniqueItems.length} 个商品，将为它们取消京配打标。`
        )

        // 批量处理
        const batchResults = await processInBatches(uniqueItems, store, sessionData)

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