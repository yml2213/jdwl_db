import { fetchApi } from '../../services/apiService'
import { getSelectedDepartment, getSelectedVendor } from '../../utils/storageHelper'
import { wait } from './utils/taskUtils'
import * as XLSX from 'xlsx'
import { getAllCookies } from '../../utils/cookieHelper'

const BASE_URL = 'https://o.jdl.com'

async function getCsrfToken() {
    const cookies = (await getAllCookies()) || []
    const tokenCookie = cookies.find((cookie) => cookie.name === 'csrfToken')
    return tokenCookie ? tokenCookie.value : ''
}

export default {
    name: 'importStore',
    label: '导入店铺商品',

    async execute(skuList, task) {
        const shopInfo = task.店铺信息
        if (!shopInfo || !shopInfo.spShopNo) {
            throw new Error('任务对象中缺少有效的店铺信息或spShopNo')
        }

        console.log('执行[导入店铺商品]功能，SKU列表:', skuList)
        console.log('使用店铺信息:', shopInfo.shopName)

        const department = getSelectedDepartment()
        if (!department) {
            throw new Error('未选择事业部，无法导入商品')
        }
        console.log('使用事业部信息:', department)

        const BATCH_SIZE = 2000
        const totalBatches = Math.ceil(skuList.length / BATCH_SIZE)
        let totalProcessed = 0
        let totalFailed = 0
        const errorMessages = []

        for (let i = 0; i < totalBatches; i++) {
            const batchSkus = skuList.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
            console.log(`处理批次 ${i + 1}/${totalBatches}，包含 ${batchSkus.length} 个SKU`)

            try {
                const result = await this._processSingleBatch(batchSkus, shopInfo, department)
                if (result.success) {
                    totalProcessed += result.processedCount || batchSkus.length
                } else {
                    totalFailed += result.failedCount || batchSkus.length
                    errorMessages.push(result.message || '一个批次处理失败')
                }
            } catch (error) {
                totalFailed += batchSkus.length
                errorMessages.push(error.message || `批次 ${i + 1} 处理时发生未知错误`)
            }

            if (i < totalBatches - 1) {
                console.log('等待1分钟后继续下一个批次...')
                await wait(60000)
            }
        }

        if (totalFailed > 0) {
            return {
                success: false,
                message: `批量处理完成，但有 ${totalFailed} 个失败。错误: ${errorMessages.join('; ')}`,
                processedCount: totalProcessed,
                failedCount: totalFailed
            }
        }

        return {
            success: true,
            message: `成功处理所有 ${totalProcessed} 个SKU。`,
            processedCount: totalProcessed,
            failedCount: 0
        }
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
