import { app, dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * 保存文件到本地
 * @param {Object} params - 保存文件参数
 * @param {string} [params.fileName] - 文件名
 * @param {Array} params.data - 文件数据（Uint8Array形式）
 * @param {string} [params.targetDir] - 目标目录，相对于应用根目录
 * @param {string} [params.filePath] - 直接指定的文件路径（优先级最高）
 * @returns {Promise<Object>} 保存结果
 */
export async function saveFile(params) {
  try {
    const { fileName, data, targetDir, filePath } = params

    // 如果直接提供了文件路径，优先使用
    if (filePath) {
      // 确保目录存在
      const dirPath = path.dirname(filePath)
      await fs.promises.mkdir(dirPath, { recursive: true })

      // 将数组转换回Uint8Array
      const buffer = Buffer.from(new Uint8Array(data))

      // 写入文件
      await fs.promises.writeFile(filePath, buffer)

      console.log('文件保存成功:', filePath)
      return { saved: true, path: filePath, message: '文件保存成功' }
    }
    // 如果指定了目标目录，使用目标目录
    else if (targetDir) {
      // 获取应用根目录
      const appPath = app.getAppPath()
      const dirPath = path.join(appPath, targetDir)

      // 确保目录存在
      await fs.promises.mkdir(dirPath, { recursive: true })

      // 构建文件路径
      const filePath = path.join(dirPath, fileName)

      // 将数组转换回Uint8Array
      const buffer = Buffer.from(new Uint8Array(data))

      // 写入文件
      await fs.promises.writeFile(filePath, buffer)

      console.log('文件保存成功:', filePath)
      return { saved: true, path: filePath, message: '文件保存成功' }
    } else {
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

      try {
        // 检查文件是否存在
        await fs.promises.access(filePath)

        // 文件存在，询问是否覆盖
        const confirm = await dialog.showMessageBox({
          type: 'question',
          title: '文件已存在',
          message: '文件已存在，是否覆盖？',
          buttons: ['是', '否']
        })

        if (confirm.response === 1) {
          console.log('用户取消了保存操作')
          return { saved: false, path: null, message: '用户取消了保存操作' }
        }
      } catch {
        // 文件不存在，可以直接写入
      }

      // 将数组转换回Uint8Array
      const buffer = Buffer.from(new Uint8Array(data))

      // 写入文件
      await fs.promises.writeFile(filePath, buffer)

      console.log('文件保存成功:', filePath)
      return { saved: true, path: filePath, message: '文件保存成功' }
    }
  } catch (error) {
    console.error('保存文件失败:', error)
    return { saved: false, path: null, message: `保存文件失败: ${error.message}` }
  }
}

export function setupFileHandlers() {
  ipcMain.handle('saveFile', async (event, params) => {
    return await saveFile(params)
  })

  ipcMain.handle('save-excel-and-get-path', async (event, { base64Data, fileName }) => {
    try {
      const tempDir = app.getPath('temp')
      const filePath = path.join(tempDir, fileName)
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(filePath, buffer)
      console.log(`临时文件已保存到: ${filePath}`)
      return filePath
    } catch (error) {
      console.error('保存临时Excel文件失败:', error)
      return null
    }
  })

  ipcMain.handle('saveFileToDownloads', async (event, data, fileName) => {
    try {
      const downloadsPath = app.getPath('downloads');
      const filePath = path.join(downloadsPath, fileName);
      const buffer = Buffer.from(new Uint8Array(data));

      await fs.promises.writeFile(filePath, buffer);

      console.log(`文件已成功保存到下载文件夹: ${filePath}`);
      return { success: true, path: filePath };
    } catch (error) {
      console.error('直接保存文件到下载文件夹失败:', error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * 将Buffer直接保存到用户的下载文件夹
 * @param {Buffer} buffer - 要保存的数据缓冲区
 * @param {string} fileName - 默认保存的文件名
 * @returns {Promise<string>} - 保存的文件路径
 */
export async function saveBufferToDownloads(buffer, fileName) {
  try {
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, fileName);
    await fs.promises.writeFile(filePath, buffer);
    console.log(`文件已成功保存到下载文件夹: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('直接保存文件到下载文件夹失败:', error);
    throw error; // 重新抛出错误，以便调用者可以捕获
  }
} 