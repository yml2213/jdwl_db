import * as XLSX from 'xlsx'
import * as jdApiService from '../services/jdApiService.js'
import { getFormattedChinaTime } from '../utils/timeUtils.js'
import { saveExcelFile } from '../utils/fileUtils.js'
import fs from 'fs'

// 配置常量
const TEMP_DIR_NAME = '导入商品简称'

async function readExcelFile(filePath) {
    const workbook = XLSX.readFile(filePath, { cellNF: false, cellText: true })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
}

function createNewExcelData(originalData, department) {
    const headers1 = ['说明', '事业部编码', '商品编码', '商家SKU', '商品名称', '商品简称', '商品简称2', '商品简称3', '商品简称4']
    const headers2 = ['必填', '必填', '二选一', '二选一', '必填', '非必填', '非必填', '非必填', '非必填']
    const transformedRows = originalData.slice(1).map(row => [
        '',
        department.deptNo,
        row[0] || '', // 商品编码
        row[1] || '', // 商家SKU
        row[2] || '', // 商品名称
        row[3] || '', // 商品简称
        '', '', ''
    ])
    return [headers1, headers2, ...transformedRows]
}

async function convertToExcelFile(data, fileName, session) {
    const worksheet = XLSX.utils.aoa_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'sheet1')
    const buffer = XLSX.write(workbook, { bookType: 'xls', type: 'buffer' })
    await saveExcelFile(buffer, {
        dirName: TEMP_DIR_NAME,
        store: { shopName: session.store?.name || '通用' },
        extension: 'xls',
        customName: fileName
    })
    return { buffer, fileName }
}

async function execute(payload, updateFn, sessionData) {
    const { filePath } = payload
    if (!filePath) throw new Error('未提供文件路径')

    const department = sessionData.departmentInfo || { deptNo: '10' }

    try {
        updateFn({ status: 'processing', message: '正在读取Excel文件...' })
        const excelData = await readExcelFile(filePath)

        if (!excelData || excelData.length < 2) {
            throw new Error('Excel文件内容为空或格式不正确')
        }
        updateFn({ message: `成功读取 ${excelData.length - 1} 行数据。` })

        const newExcelData = createNewExcelData(excelData, department)
        const rowCount = newExcelData.length - 2

        const BATCH_SIZE = 2000

        if (rowCount <= BATCH_SIZE) {
            updateFn({ message: '数据量较小，开始直接上传...' })
            const excelFile = await convertToExcelFile(
                newExcelData,
                '商品批量修改自定义模板.xls',
                sessionData
            )
            const result = await jdApiService.uploadProductNames(excelFile.buffer, excelFile.fileName, sessionData)
            updateFn({
                status: result.success ? 'completed' : 'failed',
                message: result.message,
                data: result.data,
            })
            return result
        } else {
            // Batch processing logic
            updateFn({ message: `数据量大 (${rowCount}行)，将分批上传...` })
            const headers = newExcelData.slice(0, 2)
            const dataRows = newExcelData.slice(2)
            const totalBatches = Math.ceil(dataRows.length / BATCH_SIZE)
            let allSuccess = true
            let finalMessage = '分批导入完成摘要:\n'

            for (let i = 0; i < totalBatches; i++) {
                const start = i * BATCH_SIZE
                const end = Math.min(start + BATCH_SIZE, dataRows.length)
                const currentBatchRows = dataRows.slice(start, end)
                const batchData = [...headers, ...currentBatchRows]
                const timestamp = getFormattedChinaTime()
                const batchFileName = `${timestamp}_商品批量修改自定义模板_批次${i + 1}.xls`

                updateFn({
                    message: `正在处理批次 ${i + 1}/${totalBatches} (${currentBatchRows.length}行)...`,
                })

                const excelFile = await convertToExcelFile(batchData, batchFileName, sessionData)
                const result = await jdApiService.uploadProductNames(excelFile.buffer, excelFile.fileName, sessionData)

                finalMessage += `批次 ${i + 1}: ${result.message}\n`
                if (!result.success) allSuccess = false

                updateFn({ message: `批次 ${i + 1} 处理完成。` })

                if (i < totalBatches - 1) {
                    updateFn({ message: '等待5分钟后处理下一批...' })
                    await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000))
                }
            }
            updateFn({
                status: allSuccess ? 'completed' : 'failed',
                message: finalMessage,
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
    execute,
} 