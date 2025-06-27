import { getAllCookies } from '../../utils/cookieHelper'
import { getCMGBySkuList } from '../../services/apiService'
import { getSelectedDepartment, getSelectedWarehouse, getSelectedVendor } from '../../utils/storageHelper'
import { wait } from './utils/taskUtils'

export default {
    name: 'addInventory',
    label: '添加库存',

    /**
     * 执行添加库存功能
     * @param {Array} skuList SKU列表
     * @param {Object} task 任务对象
     * @param {Function} createBatchTask 创建批次任务的回调函数
     * @param {Number} inventoryAmount 库存数量，默认为1000
     * @returns {Object} 执行结果
     */
    async execute(skuList, task, createBatchTask, inventoryAmount) {
        // 如果inventoryAmount未定义，则从任务选项中获取
        if (inventoryAmount === undefined && task && task.选项 && task.选项.inventoryAmount) {
            inventoryAmount = task.选项.inventoryAmount
        } else if (inventoryAmount === undefined) {
            inventoryAmount = 1000 // 默认值
        }

        const BATCH_SIZE = 500
        const totalBatches = Math.ceil(skuList.length / BATCH_SIZE)
        let processedCount = 0
        let failedCount = 0
        const errorMessages = []

        for (let i = 0; i < totalBatches; i++) {
            const batchSkus = skuList.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)

            try {
                const batchResult = await this._processBatch(batchSkus, task, inventoryAmount)
                if (batchResult.success) {
                    processedCount += batchSkus.length
                } else {
                    failedCount += batchSkus.length
                    errorMessages.push(batchResult.message || '一个批次处理失败')
                }
            } catch (error) {
                failedCount += batchSkus.length
                errorMessages.push(error.message || '一个批次处理时发生未知错误')
            }

            // 如果不是最后一个批次，等待30秒
            if (i < totalBatches - 1) {
                await wait(30000) // 等待30秒
            }
        }

        if (failedCount > 0) {
            return {
                success: false,
                message: `添加库存完成，但有 ${failedCount} 个失败。错误: ${errorMessages.join('; ')}`,
                processedCount,
                failedCount
            }
        }

        return {
            success: true,
            message: `成功添加 ${processedCount} 个SKU的库存。`,
            processedCount,
            failedCount
        }
    },

    /**
     * 处理一个批次的SKU
     * @param {Array} skuList 批次中的SKU列表
     * @param {Object} task 任务对象
     * @param {Number} inventoryAmount 库存数量
     * @returns {Object} 处理结果
     */
    async _processBatch(skuList, task, inventoryAmount) {
        const result = {
            success: false,
            message: '',
            importLogs: [],
            results: []
        }

        try {
            // 记录批次开始时间
            const startTime = new Date()

            // 计算批次号和总批次数
            let batchNumber = 1
            let totalBatches = 1

            // 如果是分批任务，尝试从任务信息中获取批次信息
            if (task && task.批次编号 && task.总批次数) {
                batchNumber = task.批次编号
                totalBatches = task.总批次数
            }

            // 添加批次开始日志
            result.importLogs.push({
                type: 'batch-start',
                message: `开始处理第${batchNumber}/${totalBatches}批，共${skuList.length}个SKU`,
                time: startTime.toLocaleString(),
                timestamp: startTime.toLocaleTimeString(),
                batchIndex: batchNumber,
                totalBatches: totalBatches,
                batchSize: skuList.length
            })

            // 更新任务状态为处理中
            if (task) {
                task.状态 = '处理中'
                task.结果 = [`正在处理${skuList.length}个SKU`]
            }

            // 首先获取CMG商品列表
            const goodsList = await getCMGBySkuList(skuList, inventoryAmount)
            if (!goodsList || goodsList.length === 0) {
                throw new Error('获取商品列表失败')
            }

            console.log('获取到的商品列表:', goodsList)

            // 实际处理SKU - 调用上传方法
            const uploadResult = await this.uploadInventoryData(goodsList)

            // 记录处理结果
            const endTime = new Date()
            const processingTime = (endTime - startTime) / 1000 // 秒

            // 根据上传结果设置成功/失败状态
            result.success = uploadResult.success
            result.message = uploadResult.message
            result.results.push(result.message)

            // 添加处理结果日志
            result.importLogs.push({
                type: uploadResult.success ? 'success' : 'error',
                message: result.message,
                time: endTime.toLocaleString(),
                timestamp: endTime.toLocaleTimeString(),
                successCount: uploadResult.processedCount || 0,
                failedCount: uploadResult.failedCount || 0,
                processingTime,
                batchSize: skuList.length,
                batchIndex: batchNumber,
                totalBatches: totalBatches,
                poNumber: uploadResult.poNumber || null,
                fullMessage: uploadResult.message
            })

            // 添加批次完成日志
            result.importLogs.push({
                type: 'batch-wait',
                message: `批次${batchNumber}/${totalBatches}处理完成，${uploadResult.success ? '成功' : '失败'}`,
                time: endTime.toLocaleString(),
                timestamp: endTime.toLocaleTimeString(),
                batchIndex: batchNumber,
                totalBatches: totalBatches,
                processedCount: uploadResult.processedCount || 0,
                failedCount: uploadResult.failedCount || 0,
                remainingCount: 0,
                waitTime: 0
            })

            // 更新任务状态 - 只使用成功或失败两种状态
            if (task) {
                // 如果服务器返回resultCode为1，就是成功
                task.状态 = uploadResult.success ? '成功' : '失败'
                task.结果 = result.results
                task.importLogs = result.importLogs
            }

            return result
        } catch (error) {
            console.error('处理批次出错:', error)

            result.success = false
            result.message = `批次处理失败: ${error.message || '未知错误'}`
            result.importLogs.push({
                type: 'error',
                message: result.message,
                time: new Date().toLocaleString()
            })
            result.results.push(result.message)

            // 更新任务状态
            if (task) {
                task.状态 = '失败'
                task.结果 = result.results
                task.importLogs = result.importLogs
            }

            return result
        }
    },

    /**
     * 上传库存数据
     * @param {Array} goodsList - 商品列表数据
     * @returns {Promise<Object>} 上传结果
     */
    async uploadInventoryData(goodsList) {
        try {
            // 记录接收到的商品批次信息
            console.log(`处理批次商品数量: ${goodsList.length}`)

            // 获取当前选择的事业部信息
            const deptInfo = getSelectedDepartment()
            if (!deptInfo) {
                throw new Error('未选择事业部，无法添加库存')
            }

            console.log('事业部信息:', deptInfo)

            // 获取当前选择的仓库信息
            const warehouseInfo = getSelectedWarehouse()
            if (!warehouseInfo) {
                throw new Error('未选择仓库，无法添加库存')
            }

            console.log('仓库信息:', warehouseInfo)

            // 获取当前选择的供应商信息
            const vendorInfo = getSelectedVendor()
            if (!vendorInfo) {
                throw new Error('未选择供应商，无法添加库存')
            }

            console.log('供应商信息:', vendorInfo)

            // 获取所有cookies并构建cookie字符串
            const cookies = await getAllCookies()
            const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')


            console.log('获取到cookies:', cookieString ? '已获取' : '未获取')

            // 将商品列表转换为JSON字符串
            const goodsJson = JSON.stringify(goodsList)
            console.log('商品JSON:', goodsJson.length)

            // 处理供应商ID - 去除前缀，只保留数字部分
            let supplierIdValue = vendorInfo.id
            if (typeof supplierIdValue === 'string' && supplierIdValue.match(/^[A-Za-z]+\d+$/)) {
                // 如果ID格式为字母+数字，则只保留数字部分
                supplierIdValue = supplierIdValue.replace(/^[A-Za-z]+/, '')
            }
            console.log('处理后的供应商ID:', supplierIdValue)

            // 创建FormData
            const formData = new FormData()
            formData.append('id', '')
            formData.append('poNo', '')
            formData.append('goods', goodsJson)
            formData.append('deptId', deptInfo.id)
            formData.append('deptName', deptInfo.name)
            formData.append('supplierId', supplierIdValue)     // 使用处理后的供应商ID
            formData.append('warehouseId', warehouseInfo.id.toString()) // 使用动态获取的仓库ID
            formData.append('billOfLading', '')
            formData.append('qualityCheckFlag', '')
            formData.append('sidChange', '0')
            formData.append('poType', '1')
            formData.append('address.senderName', '')
            formData.append('address.senderMobile', '')
            formData.append('address.senderPhone', '')
            formData.append('address.senderProvinceName', '-请选择-')
            formData.append('address.senderCityName', '-请选择-')
            formData.append('address.senderCountyName', '-请选择-')
            formData.append('address.senderTownName', '')
            formData.append('address.senderProvinceCode', '')
            formData.append('address.senderCityCode', '')
            formData.append('address.senderCountyCode', '')
            formData.append('address.senderTownCode', '')
            formData.append('address.senderAddress', '')
            formData.append('pickUpFlag', '0')
            formData.append('outPoNo', '')
            formData.append('crossDockingFlag', '0')
            formData.append('crossDockingSoNos', '')
            formData.append('isPorterTeam', '0')
            formData.append('orderType', 'CGRK')
            formData.append('poReturnMode', '1')
            formData.append('importFiles', '')

            // 将FormData转换为适合IPC传输的对象
            const formDataEntries = []
            for (const [key, value] of formData.entries()) {
                formDataEntries.push([key, value])
                // console.log(`FormData字段: ${key} = ${value}`)
            }

            // 创建特殊标记对象，让requestHandler知道这是FormData
            const formDataObj = {
                _isFormData: true,
                entries: formDataEntries
            }

            console.log(`已创建FormData对象，包含${formDataEntries.length}个字段，准备通过IPC传递`)

            // 发送请求
            const url = 'https://o.jdl.com/poMain/downPoMain.do'

            console.log('发送添加库存请求:', url)
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
                    'Cookie': cookieString
                    // 不要在这里设置Content-Type，让form-data自动设置
                },
                body: formDataObj
            })

            console.log('添加库存响应:', response)

            // 解析响应结果
            if (response && response.resultCode == 1) {
                // 成功响应 - resultCode为1表示成功
                console.log('添加库存成功==========')
                console.log('生成单号:', response.resultMessage)

                // 提取单号信息
                const poNumber = response.resultMessage.match(/CPL\d+/) ? response.resultMessage.match(/CPL\d+/)[0] : '未知单号'

                // 将日志信息添加到window上下文，使UI可以访问
                if (!window.importLogs) {
                    window.importLogs = []
                }
                window.importLogs.push({
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'success',
                    batchSize: goodsList.length,
                    message: `成功处理${goodsList.length}个SKU，单号：${poNumber}`,
                    poNumber: poNumber,
                    fullMessage: response.resultMessage
                })

                return {
                    success: true,
                    message: `添加库存成功，单号：${poNumber}`,
                    processedCount: goodsList.length,
                    failedCount: 0,
                    skippedCount: 0,
                    data: response.resultData,
                    poNumber: poNumber
                }
            } else {
                // 失败响应
                let errorMessage = response?.resultMessage || response?.message || '添加库存失败，未知原因'

                console.error('添加库存失败:', errorMessage)

                // 将错误信息添加到window上下文，使UI可以访问
                if (!window.importLogs) {
                    window.importLogs = []
                }
                window.importLogs.push({
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'error',
                    batchSize: goodsList.length,
                    message: `失败：${errorMessage}`,
                    fullMessage: errorMessage
                })

                return {
                    success: false,
                    message: errorMessage,
                    processedCount: 0,
                    failedCount: goodsList.length,
                    skippedCount: 0,
                    data: response
                }
            }
        } catch (error) {
            console.error('添加库存失败:', error)
            return {
                success: false,
                message: `添加库存失败: ${error.message || '未知错误'}`,
                processedCount: 0,
                failedCount: goodsList.length,
                skippedCount: 0,
                error
            }
        }
    }
} 