/**
 * 后端任务： 取消京配打标
 * 支持两种模式：
 * 1. 整店取消京配打标
 * 2. 部分取消京配打标
 * 7.4 优化 使用 getProductData.task.js 查询商品数据
 * 7.5 优化 优先使用会话中的方案ID，避免重复创建
 * 7.6 修复 整店模式和SKU模式
 */
import XLSX from 'xlsx'
import * as jdApiService from '../services/jdApiService.js'
import { executeInBatches } from '../utils/batchProcessor.js'
import { saveExcelFile } from '../utils/fileUtils.js'

// 配置常量
const BATCH_SIZE = 5000
const BATCH_DELAY = 1000
const TEMP_DIR_NAME = '取消京配打标'

/**
 * 创建用于取消京配查询的Excel文件Buffer
 * @param {string[]} items - 商品SKU或CSG列表
 * @returns {Buffer}
 */
function createJpSearchExcelBuffer(items) {
    const headers = ['店铺商品编号 (CSG编码)', '京配搜索 (0否, 1是)']
    const dataRows = items.map((item) => [item, 0])
    const excelData = [headers, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    return XLSX.write(wb, { bookType: 'xls', type: 'buffer' })
}

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, csgList, store, department, options
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
const execute = async (context, sessionData) => {
    const { skus: skuLifecycles, store, department, updateFn } = context
    let itemsToProcess = []
    const mode = context.scope

    if (!sessionData || !sessionData.jdCookies) {
        const error = new Error('缺少会话信息')
        updateFn(error.message, 'error')
        throw error
    }

    // 根据 mode 决定执行路径
    if (mode === 'whole_store') {
        // 模式1：整店模式
        updateFn(`执行整店取消京配打标模式...`)
        try {
            itemsToProcess = await jdApiService.getJpEnabledCsgsForStore(context, sessionData)
            updateFn(`查询到 ${itemsToProcess.length} 个已开启京配的商品。`)
        } catch (error) {
            updateFn(`查询全店已开启京配商品时出错: ${error.message}`, 'error')
            throw new Error(`查询全店已开启京配商品时出错: ${error.message}`)
        }
    } else {
        // 模式2：按SKU列表模式
        if (!skuLifecycles || skuLifecycles.length === 0) {
            updateFn('按SKU模式下未提供SKU列表，任务结束。')
            return { success: true, message: '按SKU模式下未提供SKU列表，任务结束。' }
        }

        // 优化：检查是否为SKU生命周期对象
        if (
            skuLifecycles[0] &&
            typeof skuLifecycles[0] === 'object' &&
            skuLifecycles[0].data &&
            skuLifecycles[0].data.shopGoodsNo
        ) {
            updateFn('检测到SKU生命周期对象，直接提取CSG编码...')
            itemsToProcess = skuLifecycles.map((item) => item.data.shopGoodsNo).filter(Boolean)
            updateFn(`成功从生命周期对象中提取了 ${itemsToProcess.length} 个CSG编码。`)
        } else {
            // 如果数据不符合预期，直接抛出错误，因为前置任务应该已经保证了数据格式的正确性
            throw new Error(
                '输入数据格式不正确，期望获得SKU生命周期对象数组，但未能获取。工作流可能配置不当。'
            )
        }
    }

    if (itemsToProcess.length === 0) {
        updateFn('没有需要取消京配打标的商品。')
        return { success: true, message: '没有需要取消京配打标的商品。' }
    }

    const uniqueItems = [...new Set(itemsToProcess)]
    updateFn(
        `"取消京配打标" 开始，店铺 [${store.shopName}], 共 ${uniqueItems.length} 个独立商品。`
    )

    try {
        const batchFn = async (batchItems) => {
            try {
                updateFn(`正在为 ${batchItems.length} 个商品创建批处理文件...`)
                const fileBuffer = createJpSearchExcelBuffer(batchItems)

                // 保存文件到本地
                const filePath = await saveExcelFile(fileBuffer, {
                    dirName: TEMP_DIR_NAME,
                    store: store,
                    extension: 'xls'
                })

                if (filePath) {
                    updateFn(`批处理文件已保存: ${filePath}`)
                }

                const response = await jdApiService.uploadJpSearchFile(fileBuffer, sessionData)
                updateFn(`取消京配打标=======> response ${JSON.stringify(response)}`)

                if (response && response.resultCode === 1) {
                    return {
                        success: true,
                        message: `${response.resultData || '取消京配打标任务提交成功。'
                            } (处理了 ${batchItems.length} 个商品)`
                    }
                }

                // 检查频率限制错误
                if (response && response.message && response.message.includes('频繁操作')) {
                    return { success: false, message: response.message }
                }

                const errorMessage = response?.message || '取消京配打标时发生未知错误'
                return { success: false, message: errorMessage }
            } catch (error) {
                updateFn(`批处理执行时发生严重错误: ${error.message}`, 'error')
                return { success: false, message: `批处理失败: ${error.message}` }
            }
        }
        const batchResults = await executeInBatches({
            items: uniqueItems,
            batchSize: BATCH_SIZE,
            delay: BATCH_DELAY,
            batchFn,
            log: (message, level = 'info') => updateFn(message, level),
            isRunning: { value: true }
        })
        if (!batchResults.success) {
            throw new Error(`任务有失败的批次: ${batchResults.message}`)
        }
        return { success: true, message: `所有批次成功完成。 ${batchResults.message}` }
    } catch (error) {
        updateFn(`任务执行失败: ${error.message}`, 'error')
        throw new Error(`取消京配打标失败: ${error.message}`)
    }
}

export default {
    name: 'cancelJpSearch',
    description: '取消京配打标',
    execute: execute
}
