/**
 * 文件操作相关工具函数
 */
import fs from 'fs'
import path from 'path'
import { getFormattedChinaTime } from './timeUtils.js'

/**
 * 保存Excel文件到本地临时目录
 * @param {Buffer} fileBuffer - Excel文件的Buffer
 * @param {object} options - 配置选项
 * @param {string} options.dirName - 临时目录名称
 * @param {string} options.fileName - 文件名(可选，不包含扩展名)
 * @param {object} options.store - 店铺信息(可选)
 * @param {string} options.extension - 文件扩展名(默认为xls)
 * @returns {Promise<string>} 保存的文件路径
 */
export async function saveExcelFile(fileBuffer, options) {
    try {
        const {
            dirName,
            fileName = null,
            store = null,
            extension = 'xls'
        } = options

        if (!dirName) {
            throw new Error('必须提供目录名称')
        }

        // 创建临时目录
        const tempDir = path.resolve(process.cwd(), 'temp', dirName)
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
        }

        // 生成文件名
        const timestamp = getFormattedChinaTime()
        let finalFileName

        if (fileName) {
            finalFileName = `${timestamp}_${fileName}.${extension}`
        } else if (store && store.shopName) {
            const shopNameForFile = store.shopName.replace(/[\\/:"*?<>|]/g, '_')
            finalFileName = `${timestamp}_${shopNameForFile}.${extension}`
        } else {
            finalFileName = `${timestamp}_file.${extension}`
        }

        // 保存文件
        const filePath = path.join(tempDir, finalFileName)
        fs.writeFileSync(filePath, fileBuffer)
        console.log(`[FileUtils] 文件已保存到: ${filePath}`)

        return filePath
    } catch (error) {
        console.error(`[FileUtils] 保存文件失败:`, error)
        // 不中断流程，返回null表示保存失败
        return null
    }
}

/**
 * 确保目录存在，如不存在则创建
 * @param {string} dirPath - 目录路径
 * @returns {boolean} 是否成功确保目录存在
 */
export function ensureDirectoryExists(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }
        return true
    } catch (error) {
        console.error(`[FileUtils] 创建目录失败: ${dirPath}`, error)
        return false
    }
}

/**
 * 安全删除文件
 * @param {string} filePath - 文件路径
 * @returns {boolean} 是否成功删除
 */
export function safeDeleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
            return true
        }
        return false
    } catch (error) {
        console.error(`[FileUtils] 删除文件失败: ${filePath}`, error)
        return false
    }
} 