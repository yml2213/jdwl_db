import { getSelectedDepartment } from '../../utils/storageHelper'
import * as XLSX from 'xlsx'
import { getAllCookies } from '../../utils/cookieHelper'

export default {
  name: 'importProductNames',
  label: '导入商品简称',

  /**
   * 执行导入商品简称功能
   * @param {File} file - Excel文件
   * @returns {Promise<Object>} 执行结果
   */
  async execute(file) {
    console.log('执行[导入商品简称]功能，文件:', file.name)

    // 获取事业部信息
    const department = getSelectedDepartment()
    if (!department) {
      throw new Error('未选择事业部，无法导入商品简称')
    }

    try {
      // 读取Excel文件内容
      const data = await this.readExcelFile(file)
      if (!data || data.length < 2) {
        throw new Error('Excel文件内容为空或格式不正确')
      }

      console.log('读取到Excel数据:', data.length, '行')

      // 创建新的Excel文件
      const newExcelData = this.createNewExcelData(data, department)
      
      // 将数据转换为Excel文件
      const newFile = await this.convertToExcelFile(newExcelData)
      
      // 上传数据到服务器
      const result = await this.uploadProductNamesData(newFile)

      return {
        success: result.success,
        message: result.message,
        data: result.data
      }
    } catch (error) {
      console.error('导入商品简称失败:', error)
      return {
        success: false,
        message: `导入失败: ${error.message || '未知错误'}`,
        error
      }
    }
  },

  /**
   * 读取Excel文件内容
   * @param {File} file - Excel文件
   * @returns {Promise<Array>} Excel数据
   */
  async readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const data = e.target.result
          const workbook = XLSX.read(data, { type: 'array' })
          
          // 获取第一个工作表
          const firstSheetName = workbook.SheetNames[0]
          console.log('Excel工作表名称:', firstSheetName)
          
          const worksheet = workbook.Sheets[firstSheetName]
          
          // 将工作表转换为数组
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
          
          // 打印前几行数据用于调试
          console.log('Excel前5行数据:')
          for (let i = 0; i < Math.min(5, jsonData.length); i++) {
            console.log(`行${i}:`, JSON.stringify(jsonData[i]))
          }
          
          console.log('Excel解析结果:', jsonData.length, '行')
          resolve(jsonData)
        } catch (error) {
          console.error('解析Excel文件失败:', error)
          reject(new Error(`解析Excel文件失败: ${error.message}`))
        }
      }
      
      reader.onerror = (error) => {
        console.error('读取Excel文件失败:', error)
        reject(new Error('读取Excel文件失败'))
      }
      
      reader.readAsArrayBuffer(file)
    })
  },

  /**
   * 创建新的Excel数据结构
   * @param {Array} originalData - 原始Excel数据
   * @param {Object} department - 事业部信息
   * @returns {Array} 新的Excel数据
   */
  createNewExcelData(originalData, department) {
    console.log('开始创建新Excel数据，原始数据行数:', originalData.length)
    console.log('使用事业部编码:', department.deptNo)
    
    // 表头行 - 中文
    const chineseHeaders = ['事业部编码', '商家商品标识', '商品名称']
    
    // 表头行 - 英文（第二行）
    const englishHeaders = ['deptNo', 'sellerGoodsSign', 'goodsName']
    
    // 数据行
    const rows = []
    
    // 跳过表头行，处理数据行
    for (let i = 1; i < originalData.length; i++) {
      const row = originalData[i]
      if (row && row.length >= 2) {
        // 确保SKU是字符串格式
        const sku = String(row[0] || '').trim()
        // 确保商品名称是字符串格式
        const name = String(row[1] || '').trim()
        
        if (sku && name) {
          // 原始数据的第一列是SKU，第二列是商品名称
          rows.push([
            department.deptNo, // 事业部编码
            sku,              // 商家商品标识（SKU）
            name              // 商品名称
          ])
        } else {
          console.log(`跳过第${i+1}行: SKU或名称为空`, JSON.stringify(row))
        }
      } else {
        console.log(`跳过第${i+1}行: 列数不足`, JSON.stringify(row))
      }
    }
    
    console.log(`处理完成，生成${rows.length}行有效数据`)
    
    // 打印前几行生成的数据用于调试
    console.log('生成的Excel数据结构:')
    // 合并中文表头、英文表头和数据行
    const mergedData = [chineseHeaders, englishHeaders, ...rows]
    console.log(`第1行(中文表头): ${JSON.stringify(mergedData[0])}`)
    console.log(`第2行(英文字段): ${JSON.stringify(mergedData[1])}`)
    for (let i = 2; i < Math.min(7, mergedData.length); i++) {
      console.log(`第${i+1}行(数据): ${JSON.stringify(mergedData[i])}`)
    }
    
    return mergedData
  },

  /**
   * 将数据转换为Excel文件
   * @param {Array} data - Excel数据
   * @returns {Promise<File>} Excel文件对象
   */
  async convertToExcelFile(data) {
    try {
      console.log('开始转换数据为Excel文件...')
      
      // 生成工作表
      const ws = XLSX.utils.aoa_to_sheet(data)
      
      // 设置列宽
      const colWidths = [
        { wch: 20 }, // 事业部编码列宽
        { wch: 20 }, // 商家商品标识列宽
        { wch: 30 }  // 商品名称列宽
      ]
      ws['!cols'] = colWidths
      
      // 创建工作簿
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      
      // 添加一些元数据
      wb.Props = {
        Title: '商品批量修改自定义模板',
        Subject: '商品简称导入',
        Author: 'JDL系统',
        CreatedDate: new Date()
      }
      
      // 生成二进制数据
      console.log('生成Excel二进制数据...')
      const excelBinaryData = XLSX.write(wb, {
        bookType: 'xls',
        type: 'binary',
        compression: true,
        bookSST: false
      })
      
      // 将二进制字符串转换为ArrayBuffer
      const buf = new ArrayBuffer(excelBinaryData.length)
      const view = new Uint8Array(buf)
      for (let i = 0; i < excelBinaryData.length; i++) {
        view[i] = excelBinaryData.charCodeAt(i) & 0xff
      }
      
      // 创建文件对象
      console.log('创建Excel文件对象完成')
      return new File([buf], '商品批量修改自定义模板.xls', {
        type: 'application/vnd.ms-excel'
      })
    } catch (error) {
      console.error('生成Excel文件失败:', error)
      throw new Error(`生成Excel文件失败: ${error.message}`)
    }
  },



  /**
   * 上传商品简称数据到服务器
   * @param {File} file - Excel文件
   * @returns {Promise<Object>} 上传结果
   */
  async uploadProductNamesData(file) {
    try {
      console.log('准备上传商品简称数据，文件大小:', file.size, '字节')
      
      // 获取所有cookies并构建cookie字符串
      const cookies = await getAllCookies()
      const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
      
      console.log('获取到cookies:', cookieString ? '已获取' : '未获取')
      
      // 创建FormData
      const formData = new FormData()
      formData.append('importFile', file)
      
      // 打印FormData条目
      console.log('FormData条目:')
      for (const pair of formData.entries()) {
        console.log(`  ${pair[0]}: ${pair[1] instanceof File ? pair[1].name + ' (' + pair[1].size + '字节)' : pair[1]}`)
      }
      
      // 序列化FormData
      const serializedFormData = await this.serializeFormData(formData)
      console.log('FormData序列化完成')
      
      // 发送请求
      const url = 'https://o.jdl.com/goods/doUpdateCustomImportGoods.do?_r=' + Math.random()
      
      console.log('开始上传商品简称数据', url)
      const response = await window.api.sendRequest(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
          'cache-control': 'max-age=0',
          'origin': 'https://o.jdl.com',
          'priority': 'u=0, i',
          'referer': 'https://o.jdl.com/goToMainIframe.do',
          'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'iframe',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          'Content-Type': 'multipart/form-data',
          'Cookie': cookieString
        },
        body: serializedFormData
      })
      
      console.log('上传商品简称响应:', response)
      console.log('完整响应对象:', JSON.stringify(response, null, 2))
      
      
      // 解析响应结果
      if (response && response.resultCode === "1") {
        // 处理成功响应，但需要区分是否有成功导入的记录
        const totalCount = parseInt(response.totalNum) || 0;
        const successCount = parseInt(response.successNum) || 0;
        const failCount = parseInt(response.failNum) || 0;
        
        console.log(`导入统计 - 总数: ${totalCount}, 成功: ${successCount}, 失败: ${failCount}`);
        
        // 格式化结果消息，提取错误信息
        let formattedMsg = '';
        if (response.resultMsg) {
          // 保留原始消息
          formattedMsg = response.resultMsg;
          
          // 提取并格式化错误信息
          const lines = response.resultMsg.split('\n');
          if (lines.length > 2) {
            // 去掉开头和结尾的固定文本，只保留错误信息
            const errorLines = lines.slice(1, -1);
            if (errorLines.length > 0) {
              console.log(`检测到${errorLines.length}个错误信息`);
            }
          }
        }
        
        if (successCount > 0) {
          // 部分或全部成功
          const successRatio = Math.round((successCount / totalCount) * 100);
          console.log(`商品简称导入部分成功 (${successRatio}%)`);
          
          return {
            success: true,
            message: `导入完成: 共${totalCount}条，成功${successCount}条，失败${failCount}条`,
            data: response
          };
        } else {
          // 全部失败
          console.log('商品简称导入失败: 所有记录均导入失败');
          
          return {
            success: false,
            message: formattedMsg || `导入失败: 共${totalCount}条，全部导入失败`,
            data: response
          };
        }
      } else {
        // 解析失败或服务器错误
        console.error('商品简称导入失败:', response);
        
        return {
          success: false,
          message: response ? response.resultMsg || '导入商品简称失败' : '导入失败，无响应数据',
          data: response
        };
      }
    } catch (error) {
      console.error('上传商品简称数据失败:', error)
      throw new Error(`上传商品简称数据失败: ${error.message}`)
    }
  },

  /**
   * 序列化FormData以便传递给主进程
   * @param {FormData} formData - FormData对象
   * @returns {Promise<Object>} 序列化后的FormData
   */
  async serializeFormData(formData) {
    const entries = []
    
    // 处理FormData中的每一个条目
    for (const pair of formData.entries()) {
      const [key, value] = pair
      
      // 如果是文件对象，需要特殊处理
      if (value instanceof File) {
        try {
          // 读取文件内容为ArrayBuffer
          const arrayBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsArrayBuffer(value)
          })
          
          // 转换为Uint8Array，然后转为普通数组以便序列化
          const data = Array.from(new Uint8Array(arrayBuffer))
          
          // 将文件信息添加到entries
          entries.push([
            key,
            {
              _isFile: true,
              name: value.name,
              type: value.type,
              size: value.size,
              data: data
            }
          ])
        } catch (error) {
          console.error('序列化文件失败:', error)
          throw new Error(`序列化文件失败: ${error.message}`)
        }
      } else {
        // 非文件类型直接添加
        entries.push([key, value])
      }
    }
    
    // 返回可序列化的对象
    return {
      _isFormData: true,
      entries
    }
  }
} 