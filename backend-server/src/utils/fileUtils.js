/**
 * 文件操作相关工具函数
 */
import fs from 'fs'
import path from 'path'
import fsPromises from 'fs/promises'
import { fileURLToPath } from 'url'

// --- 基本路径设置 ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// 构建一个指向 backend-server/ 目录的绝对路径
const backendServerDir = path.resolve(__dirname, '..', '..')

/**
 * 获取当前时间的格式化字符串 (YYYY-MM-DD_HH-mm-ss)
 * @returns {string} 格式化后的时间字符串
 */
function getFormattedTimestamp() {
    const now = new Date()
    const year = now.getFullYear()
    const month = (now.getMonth() + 1).toString().padStart(2, '0')
    const day = now.getDate().toString().padStart(2, '0')
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const seconds = now.getSeconds().toString().padStart(2, '0')
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

/**
 * 将Excel文件Buffer保存到服务器的临时目录中
 * @param {Buffer} buffer - 要保存的文件Buffer
 * @param {object} options - 选项
 * @property {string} dirName - 要在temp下创建的子目录名
 * @property {object} store - 店铺信息
 * @property {object} warehouse - 仓库信息
 * @property {string} extension - 文件扩展名 (例如 'xlsx')
 * @returns {Promise<string|null>} 保存的文件路径，如果失败则返回null
 */
export async function saveExcelFile(
    buffer,
    { dirName = 'default', store = {}, warehouse = {}, extension = 'xlsx' }
) {
    try {
        const timestamp = getFormattedTimestamp()
        const safeShopName = store.shopName ? store.shopName.replace(/[\\/]/g, '_') : 'N_A'
        const fileName = `${timestamp}_${safeShopName}.${extension}`
        const tempDir = path.join(backendServerDir, 'temp', dirName)

        await fsPromises.mkdir(tempDir, { recursive: true })
        const filePath = path.join(tempDir, fileName)

        await fsPromises.writeFile(filePath, buffer)
        console.log(`[FileUtils] 文件已保存到: ${filePath}`)
        return filePath
    } catch (error) {
        console.error(`[FileUtils] 保存Excel文件时出错:`, error)
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