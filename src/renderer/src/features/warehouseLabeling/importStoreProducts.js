/**
 * 功能定义: 导入店铺商品
 * 职责:
 * 1. 从上下文(context)中提取数据。
 * 2. 构建一个纯净的、可序列化的数据对象。
 * 3. 通过 IPC 调用主进程的 'import-store-products' 事件来执行核心业务逻辑。
 * 4. 处理主进程返回的结果或错误。
 */

import { getAllCookies } from '../../utils/cookieHelper'

export default {
  name: 'importStore',
  label: '导入店铺商品',

  /**
   * @param {object} context - The context object.
   * @param {string[]} context.skuList - The list of SKUs.
   * @param {object} context.shopInfo - The shop information proxy.
   * @param {object} context.departmentInfo - The department information proxy.
   * @param {object} helpers - The helpers object.
   * @param {function} helpers.log - The logging function.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async execute(context, helpers) {
    const { skuList, shopInfo, departmentInfo } = context
    const { log } = helpers

    if (!shopInfo || !shopInfo.spShopNo) {
      throw new Error('缺少有效的店铺信息或spShopNo')
    }
    if (!departmentInfo || !departmentInfo.deptNo) {
      throw new Error('缺少有效的事业部信息')
    }

    log(`[IPC] 请求主进程导入 ${skuList.length} 个商品到店铺 [${shopInfo.shopName}]...`, 'info')

    return new Promise(async (resolve, reject) => {
      // 1. 从渲染器进程获取所有 cookies
      const cookies = await getAllCookies()
      if (!cookies || cookies.length === 0) {
        return reject(new Error('在渲染器进程中无法获取到任何Cookies'))
      }

      // 监听一次性的回复事件
      window.electron.ipcRenderer.once('import-store-products-reply', (event, result) => {
        log(`[IPC] 收到主进程回复`, 'info')
        if (result && result.success) {
          log(`主进程返回导入成功: ${result.message}`, 'success')
          resolve(result)
        } else {
          const errorMessage = `主进程返回错误: ${result.message || '未知错误'}`
          log(errorMessage, 'error')
          reject(new Error(errorMessage))
        }
      })

      // 发送请求到主进程
      try {
        const payload = {
          skuList,
          cookies, // 2. 将 cookies 作为 payload 的一部分传递
          shopInfo: {
            spShopNo: shopInfo.spShopNo,
            deptId: shopInfo.deptId,
            shopName: shopInfo.shopName,
            shopNo: shopInfo.shopNo,
            sellerId: shopInfo.sellerId
          },
          departmentInfo: {
            deptNo: departmentInfo.deptNo
          }
        }
        // **决定性修复**: 对整个 payload进行净化，以处理包括 skuList 在内的所有潜在 Proxy
        const cleanPayload = JSON.parse(JSON.stringify(payload))
        window.electron.ipcRenderer.send('import-store-products', cleanPayload)
      } catch (error) {
        // 如果发送本身就失败了（虽然不太可能），直接拒绝Promise
        const errorMessage = `IPC发送 'import-store-products' 失败: ${error.message}`
        log(errorMessage, 'error')
        reject(new Error(errorMessage))
      }
    })
  },

  async _processSingleBatch(skuList, storeInfo, department) {
    const spShopNo = storeInfo.spShopNo
    const importUrl = `${BASE_URL}/shopGoods/importPopSG.do?spShopNo=${spShopNo}&_r=${Math.random()}`
    console.log('导入接口URL:', importUrl)

    const csrfToken = await getCsrfToken()
    if (!csrfToken) {
      return { success: false, message: '无法获取csrfToken' }
    }

    const vendorInfo = getSelectedVendor()
    if (!vendorInfo) {
      return { success: false, message: '未选择供应商' }
    }

    const excelData = [
      ['商家商品编号', '商品名称', '事业部商品编码'],
      ...skuList.map((sku) => [sku, `商品-${sku}`, department.deptNo])
    ]
    const worksheet = XLSX.utils.aoa_to_sheet(excelData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
    const base64Data = XLSX.write(workbook, { bookType: 'xls', type: 'base64' })

    const filePath = await window.api.saveExcelAndGetPath({
      base64Data,
      fileName: 'PopGoodsImportTemplate.xls'
    })

    if (!filePath) {
      return { success: false, message: '无法在主进程中创建临时Excel文件' }
    }

    const payload = {
      csrfToken,
      filePath,
      fileName: 'PopGoodsImportTemplate.xls',
      formFields: {
        csrfToken: csrfToken
      },
      fileUploadKey: 'shopGoodsPopGoodsListFile'
    }

    const MAX_RETRIES = 3
    let attempt = 0

    while (attempt < MAX_RETRIES) {
      attempt++
      try {
        const response = await fetchApi(importUrl, {
          method: 'POST',
          headers: {
            Referer: `https://o.jdl.com/shopGoods/showImportPopSG.do?spShopNo=${spShopNo}&deptId=${storeInfo.deptId}`
          },
          body: payload,
          useFormData: true
        })

        console.log(`批量处理响应 (尝试 ${attempt}):`, response)

        if (response && response.result) {
          const successMatch = response.msg.match(/成功(\d+)条/)
          const failureMatch = response.msg.match(/失败(\d+)条/)
          const processedCount = successMatch ? parseInt(successMatch[1], 10) : 0
          const failedCount = failureMatch ? parseInt(failureMatch[1], 10) : 0
          return { success: true, message: response.msg, processedCount, failedCount }
        }

        if (response && response.msg && response.msg.includes('频繁操作')) {
          if (attempt < MAX_RETRIES) {
            console.warn(`检测到频繁操作，将在65秒后重试... (尝试 ${attempt}/${MAX_RETRIES})`)
            await wait(65000) // 等待65秒
            continue // 继续下一次循环
          } else {
            return {
              success: false,
              message: `达到最大重试次数，最后错误: ${response.msg}`,
              failedCount: skuList.length
            }
          }
        }

        return {
          success: false,
          message: response.msg || '导入失败，未知原因',
          failedCount: skuList.length
        }
      } catch (error) {
        console.error(`批量处理请求失败 (尝试 ${attempt}):`, error)
        if (attempt >= MAX_RETRIES) {
          return {
            success: false,
            message: `请求失败: ${error.message}`,
            failedCount: skuList.length
          }
        }
        // 如果不是因为频繁操作，也可以选择等待后重试
        await wait(5000) // 等待5秒后重试
      }
    }
  },

  handleResult() {
    return null
  }
}
