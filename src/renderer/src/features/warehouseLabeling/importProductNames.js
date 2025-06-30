/**
 * @description 导入商品简称的前端功能模块
 * 该模块负责调用后端API来执行实际的导入任务
 */
import { executeTask } from '../../services/apiService'

/**
 * 执行导入商品简称的操作
 * @param {File} file - 用户通过文件上传器选择的Excel文件对象
 * @returns {Promise<any>} 后端任务的执行结果
 */
async function execute(file) {
    if (!file || !file.path) {
        throw new Error('无效的文件或文件路径')
    }

    // 构建传递给后端任务的载荷
    const payload = {
        filePath: file.path
    }

    try {
        // 调用通用任务执行接口
        const result = await executeTask('importProductNames', payload)
        return result
    } catch (error) {
        console.error('导入商品简称功能执行失败:', error)
        // 将错误向上层抛出，以便UI组件可以捕获并显示
        throw error
    }
}

export default {
    execute
} 