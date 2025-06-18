import { app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * 保存文件到本地
 * @param {Object} params - 保存文件参数
 * @param {string} params.fileName - 文件名
 * @param {Array} params.data - 文件数据（Uint8Array形式）
 * @returns {Promise<Object>} 保存结果
 */
export async function saveFile(params) {
  try {
    const { fileName, data } = params
    
    // 默认保存到下载目录
    const downloadsPath = app.getPath('downloads')
    const defaultFilePath = path.join(downloadsPath, fileName)
    
    // 打开保存对话框
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '保存文件',
      defaultPath: defaultFilePath,
      filters: [
        { name: 'Excel文件', extensions: ['xls', 'xlsx'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    
    if (canceled || !filePath) {
      console.log('用户取消了保存操作')
      return { saved: false, path: null, message: '用户取消了保存操作' }
    }
    
    // 将数组转换回Uint8Array
    const buffer = Buffer.from(new Uint8Array(data))
    
    // 写入文件
    await fs.promises.writeFile(filePath, buffer)
    
    console.log('文件保存成功:', filePath)
    return { saved: true, path: filePath, message: '文件保存成功' }
  } catch (error) {
    console.error('保存文件失败:', error)
    return { saved: false, path: null, message: `保存文件失败: ${error.message}` }
  }
} 