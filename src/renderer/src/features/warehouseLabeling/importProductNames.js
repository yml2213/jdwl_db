/**
 * @description 导入商品简称的前端功能模块
 * 该模块现在只负责准备任务描述，而不直接调用API
 */

/**
 * 准备导入商品简称的任务对象
 * @param {File} file - 用户通过文件上传器选择的Excel文件对象
 * @returns {object} 一个标准的任务对象，可以被 useTaskList 消费
 */
function prepareTask(file) {
    if (!file || !file.path) {
        throw new Error('无效的文件或文件路径')
    }

    // 构建传递给后端任务的载荷
    const payload = {
        filePath: file.path
    }

    // 返回一个任务描述对象，而不是直接执行
    return {
        name: '导入商品简称',
        executionType: 'task',
        executionFeature: 'importProductNames',
        executionData: payload,
        sku: file.name // 使用文件名作为显示标识
    }
}

export default {
    prepareTask
} 