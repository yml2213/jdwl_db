import * as XLSX from 'xlsx'

/**
 * 创建Excel文件
 * @param {Object} options - Excel文件选项
 * @param {string} options.fileName - 文件名
 * @param {string} options.sheetName - 工作表名称
 * @param {Array<Array<string>>} options.data - 表格数据
 * @returns {Buffer} Excel文件的二进制数据
 */
export async function createExcelFile(options) {
  try {
    const { fileName, sheetName = 'Sheet1', data } = options

    // 创建工作簿
    const workbook = XLSX.utils.book_new()

    // 将数据转换为工作表
    const worksheet = XLSX.utils.aoa_to_sheet(data)

    // 添加工作表到工作簿，并设置自定义sheet名称
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

    // 生成Excel文件的二进制数据
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    console.log(`Excel文件 "${fileName}" 创建成功，sheet名称: "${sheetName}"`)

    return excelBuffer
  } catch (error) {
    console.error('创建Excel文件失败:', error)
    throw error
  }
}
