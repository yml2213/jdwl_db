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

        // 从文件路径读取二进制数据
        const fileData = fs.readFileSync(filePath)

        // 使用 XLSX.read 而不是 XLSX.readFile
        const workbook = XLSX.read(fileData, { type: 'buffer' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        return XLSX.utils.sheet_to_json(worksheet, { header: 1 })
    } catch (error) {
        console.error('解析Excel文件失败:', error)
        throw new Error(`解析Excel文件失败: ${error.message}`)
    }
}

function createNewExcelData(originalData, department) {
    // console.log('originalData--->', originalData)
    // console.log('department--->', department)
    const chineseHeaders = ['事业部编码', '商家商品标识', '商品名称']
    const englishHeaders = ['deptNo', 'sellerGoodsSign', 'goodsName']
    const rows = originalData
        .slice(2) // 跳过2行表头
        .map((row) => {
            if (row && row.length >= 3) {
                const sku = String(row[1] || '').trim() // 商家商品标识在第2列
                const name = String(row[2] || '').trim() // 商品名称在第3列
                if (sku && name) {
                    return [department.deptNo, sku, name]
                }
            }
            return null
        })
        .filter(Boolean)

    return [chineseHeaders, englishHeaders, ...rows]
}

/**
 * 将生成的Excel文件保存到临时目录，用于测试
 * @param {Buffer} buffer - Excel文件的Buffer
 * @param {string} fileName - 文件名
 * @returns {string} 保存的文件路径
 */
async function saveExcelForTesting(buffer, fileName) {
    try {
        // 创建临时目录（如果不存在）
        const tempDir = path.resolve(process.cwd(), 'temp', '导入商品简称')
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
        }
        // 生成唯一文件名，避免冲突
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filePath = path.join(tempDir, `${timestamp}_${fileName}`)

        // 写入文件
        fs.writeFileSync(filePath, buffer)
        console.log(`测试文件已保存到: ${filePath}`)

        return filePath
    } catch (error) {
        console.error('保存测试文件失败:', error)
        return null // 失败时返回null，但不中断主流程
    }
}

async function convertToExcelFile(data, fileName) {
    try {
        const ws = XLSX.utils.aoa_to_sheet(data)
        ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 30 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xls' })

        // 保存文件用于测试
        await saveExcelForTesting(buffer, fileName)

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
    const department = sessionData.departmentInfo || { deptNo: '10' }  // 默认值

    try {
        updateFn({ status: 'processing', message: '正在读取Excel文件...' })
        const excelData = await readExcelFile(filePath)

        if (!excelData || excelData.length < 2) {
            throw new Error('Excel文件内容为空或格式不正确')
        }
        updateFn({ message: `成功读取 ${excelData.length - 2} 行数据。` })

        const newExcelData = createNewExcelData(excelData, department)
        const rowCount = newExcelData.length - 2 // 减去表头

        const BATCH_SIZE = 2000
        // 不再使用 JdService 类，直接使用导出的函数

        if (rowCount <= BATCH_SIZE) {
            updateFn({ message: '数据量较小，开始直接上传...' })
            const excelFile = await convertToExcelFile(newExcelData, '商品批量修改自定义模板.xls')
            const result = await uploadProductNames(excelFile.buffer, excelFile.fileName, sessionData)

            // 检查是否是任务进行中的特殊情况
            if (result.status === 'pending') {
                updateFn({
                    status: 'pending',
                    message: result.message
                })
                return { ...result, status: 'pending' }
            }

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

                // 检查是否是任务进行中的特殊情况
                if (result.status === 'pending') {
                    finalMessage += `批次 ${i + 1}: ${result.message}\\n`
                    allSuccess = false // 标记为非完全成功，但不是硬失败
                    updateFn({
                        status: 'pending', // 将任务状态设置为pending
                        message: `批次 ${i + 1} 遇到重复任务，将停止后续操作。`
                    })
                    break // 遇到pending状态，中断后续批次
                }

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