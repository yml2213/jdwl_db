import * as XLSX from 'xlsx'
import { uploadProductNames } from '../services/jdApiService.js'
import fs from 'fs'
import path from 'path'

async function readExcelFile(filePath) {
    try {
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`)
        }

        // 从文件路径读取
        const workbook = XLSX.readFile(filePath)
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        return XLSX.utils.sheet_to_json(worksheet, { header: 1 })
    } catch (error) {
        console.error('解析Excel文件失败:', error)
        throw new Error(`解析Excel文件失败: ${error.message}`)
    }
}

function createNewExcelData(originalData, department) {
    const chineseHeaders = ['事业部编码', '商家商品标识', '商品名称']
    const englishHeaders = ['deptNo', 'sellerGoodsSign', 'goodsName']
    const rows = originalData
        .slice(1) // 跳过表头
        .map((row) => {
            if (row && row.length >= 2) {
                const sku = String(row[0] || '').trim()
                const name = String(row[1] || '').trim()
                if (sku && name) {
                    return [department.deptNo, sku, name]
                }
            }
            return null
        })
        .filter(Boolean)

    return [chineseHeaders, englishHeaders, ...rows]
}

async function convertToExcelFile(data, fileName) {
    try {
        const ws = XLSX.utils.aoa_to_sheet(data)
        ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 30 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xls' })
        return { buffer, fileName }
    } catch (error) {
        console.error('生成Excel文件失败:', error)
        throw new Error(`生成Excel文件失败: ${error.message}`)
    }
}

async function execute(payload, updateFn, sessionData) {
    const { filePath } = payload
    if (!filePath) throw new Error('未提供文件路径')

    // 从会话中获取事业部信息
    const department = sessionData?.department || { deptNo: '10' }  // 默认值

    try {
        updateFn({ status: 'processing', message: '正在读取Excel文件...' })
        const excelData = await readExcelFile(filePath)

        if (!excelData || excelData.length < 2) {
            throw new Error('Excel文件内容为空或格式不正确')
        }
        updateFn({ message: `成功读取 ${excelData.length - 1} 行数据。` })

        const newExcelData = createNewExcelData(excelData, department)
        const rowCount = newExcelData.length - 2 // 减去表头

        const BATCH_SIZE = 2000
        // 不再使用 JdService 类，直接使用导出的函数

        if (rowCount <= BATCH_SIZE) {
            updateFn({ message: '数据量较小，开始直接上传...' })
            const excelFile = await convertToExcelFile(newExcelData, '商品批量修改自定义模板.xls')
            const result = await uploadProductNames(excelFile.buffer, excelFile.fileName, sessionData)

            updateFn({
                status: result.success ? 'completed' : 'failed',
                message: result.message
            })
            return result
        } else {
            // 分批处理
            updateFn({ message: `数据量大 (${rowCount}行)，将分批上传...` })
            const headers = newExcelData.slice(0, 2)
            const dataRows = newExcelData.slice(2)
            const totalBatches = Math.ceil(dataRows.length / BATCH_SIZE)
            let allSuccess = true
            let finalMessage = '分批导入完成摘要:\\n'

            for (let i = 0; i < totalBatches; i++) {
                const start = i * BATCH_SIZE
                const end = Math.min(start + BATCH_SIZE, dataRows.length)
                const currentBatchRows = dataRows.slice(start, end)
                const batchData = [...headers, ...currentBatchRows]
                const batchFileName = `商品批量修改自定义模板_批次${i + 1}.xls`

                updateFn({
                    message: `正在处理批次 ${i + 1}/${totalBatches} (${currentBatchRows.length}行)...`
                })

                const excelFile = await convertToExcelFile(batchData, batchFileName)
                const result = await uploadProductNames(excelFile.buffer, excelFile.fileName, sessionData)

                finalMessage += `批次 ${i + 1}: ${result.message}\\n`
                if (!result.success) allSuccess = false

                updateFn({ message: `批次 ${i + 1} 处理完成。` })

                if (i < totalBatches - 1) {
                    updateFn({ message: '等待5分钟后处理下一批...' })
                    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000))
                }
            }

            updateFn({
                status: allSuccess ? 'completed' : 'failed',
                message: finalMessage
            })

            return { success: allSuccess, message: finalMessage }
        }
    } catch (error) {
        console.error('导入商品简称失败:', error)
        updateFn({ status: 'failed', message: `导入失败: ${error.message}` })
        return { success: false, message: `导入失败: ${error.message}` }
    }
}

export default {
    name: '导入商品简称',
    description: '通过Excel文件批量导入商品简称。',
    execute
} 