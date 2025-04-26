<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  saveSelectedShop,
  getSelectedShop,
  saveShopsList,
  getShopsList,
  saveSelectedWarehouse,
  getSelectedWarehouse,
  saveWarehousesList,
  getWarehousesList,
  getSelectedDepartment,
  getSelectedVendor
} from '../utils/storageHelper'
import {
  getShopList,
  getWarehouseList,
  batchProcessSKUs,
  queryProductStatus,
  enableShopProducts
} from '../services/apiService'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

const props = defineProps({
  isLoggedIn: Boolean
})

const emit = defineEmits([
  'shop-change',
  'warehouse-change',
  'add-task',
  'execute-task',
  'clear-tasks'
])

// 表单数据
const form = ref({
  quickSelect: '',
  sku: '',
  waitTime: 5,
  options: {
    importStore: true,
    useStore: true,
    importProps: false,
    useMainData: false,
    useWarehouse: false,
    useJdEffect: false,
    importTitle: false,
    useBatchManage: false
  },
  enablePurchase: false,
  purchaseQuantity: 1,
  selectedStore: '',
  selectedWarehouse: '',
  autoStart: false,
  enableAutoUpload: false,
  fileImport: {
    file: null,
    fileName: '',
    importing: false,
    importError: '',
    importSuccess: false
  },
  uploadLogs: [],
  disabledProducts: {
    items: [],
    checking: false,
    enabling: false,
    checkError: '',
    enableError: '',
    checkSuccess: false,
    enableSuccess: false,
    currentBatch: 0,
    totalBatches: 0,
    progress: '初始化...'
  }
})

// 任务列表
const taskList = ref([])

// 当前活动的选项卡
const activeTab = ref('tasks') // tasks 或 logs

// 店铺列表
const shopsList = ref([])
// 是否正在加载店铺列表
const isLoadingShops = ref(false)
// 店铺加载错误信息
const shopLoadError = ref('')

// 仓库列表
const warehousesList = ref([])
// 是否正在加载仓库列表
const isLoadingWarehouses = ref(false)
// 仓库加载错误信息
const warehouseLoadError = ref('')

// 当前选中的店铺信息
const currentShopInfo = computed(() => {
  if (!form.value.selectedStore || !shopsList.value.length) return null
  return shopsList.value.find((shop) => shop.shopNo === form.value.selectedStore)
})

// 当前选中的仓库信息
const currentWarehouseInfo = computed(() => {
  if (!form.value.selectedWarehouse || !warehousesList.value.length) return null
  return warehousesList.value.find(
    (warehouse) => warehouse.warehouseNo === form.value.selectedWarehouse
  )
})

// 加载店铺列表
const loadShops = async () => {
  // 尝试从本地存储获取店铺列表
  const cachedShops = getShopsList()
  if (cachedShops && cachedShops.length > 0) {
    shopsList.value = cachedShops

    // 设置默认选中的店铺（如果有缓存的选择）
    const selectedShop = getSelectedShop()
    if (selectedShop) {
      form.value.selectedStore = selectedShop.shopNo
    } else if (shopsList.value.length > 0) {
      form.value.selectedStore = shopsList.value[0].shopNo
    }

    return
  }

  // 从服务器获取店铺列表
  isLoadingShops.value = true
  shopLoadError.value = ''

  try {
    // 获取当前选择的事业部ID
    const department = getSelectedDepartment()
    if (!department || !department.deptNo) {
      shopLoadError.value = '未选择事业部，无法获取店铺列表'
      isLoadingShops.value = false
      return
    }

    // 使用事业部ID获取店铺列表
    const deptId = department.deptNo.replace('CBU', '')
    const shops = await getShopList(deptId)

    if (shops && shops.length > 0) {
      shopsList.value = shops
      saveShopsList(shops)

      // 默认选中第一个店铺
      form.value.selectedStore = shops[0].shopNo
      saveSelectedShop(shops[0])
    } else {
      shopLoadError.value = '未找到任何店铺'
    }
  } catch (error) {
    console.error('加载店铺失败:', error)
    shopLoadError.value = `加载店铺失败: ${error.message || '未知错误'}`
  } finally {
    isLoadingShops.value = false
  }
}

// 加载仓库列表
const loadWarehouses = async () => {
  // 尝试从本地存储获取仓库列表
  const cachedWarehouses = getWarehousesList()
  if (cachedWarehouses && cachedWarehouses.length > 0) {
    warehousesList.value = cachedWarehouses

    // 设置默认选中的仓库（如果有缓存的选择）
    const selectedWarehouse = getSelectedWarehouse()
    if (selectedWarehouse) {
      form.value.selectedWarehouse = selectedWarehouse.warehouseNo
    } else if (warehousesList.value.length > 0) {
      form.value.selectedWarehouse = warehousesList.value[0].warehouseNo
    }

    return
  }

  // 从服务器获取仓库列表
  isLoadingWarehouses.value = true
  warehouseLoadError.value = ''

  try {
    // 获取当前选择的供应商和事业部ID
    const vendor = getSelectedVendor()
    const department = getSelectedDepartment()

    if (!vendor || !vendor.id || !department || !department.sellerId || !department.deptNo) {
      warehouseLoadError.value = '未选择供应商或事业部，无法获取仓库列表'
      isLoadingWarehouses.value = false
      return
    }

    // 获取sellerId和deptId
    const sellerId = department.sellerId
    const deptId = department.deptNo.replace('CBU', '')

    // 使用sellerId和deptId获取仓库列表
    const warehouses = await getWarehouseList(sellerId, deptId)

    if (warehouses && warehouses.length > 0) {
      warehousesList.value = warehouses
      saveWarehousesList(warehouses)

      // 默认选中第一个仓库
      form.value.selectedWarehouse = warehouses[0].warehouseNo
      saveSelectedWarehouse(warehouses[0])
    } else {
      warehouseLoadError.value = '未找到任何仓库'
    }
  } catch (error) {
    console.error('加载仓库失败:', error)
    warehouseLoadError.value = `加载仓库失败: ${error.message || '未知错误'}`
  } finally {
    isLoadingWarehouses.value = false
  }
}

// 清空任务列表
const clearTasks = () => {
  taskList.value = []
  emit('clear-tasks')
}

// 处理店铺选择变化
const handleStoreChange = (shopNo) => {
  if (!shopNo) return

  const selectedShop = shopsList.value.find((shop) => shop.shopNo === shopNo)
  if (selectedShop) {
    saveSelectedShop(selectedShop)
    emit('shop-change', selectedShop)
  }
}

// 处理仓库选择变化
const handleWarehouseChange = (warehouseNo) => {
  if (!warehouseNo) return

  const selectedWarehouse = warehousesList.value.find(
    (warehouse) => warehouse.warehouseNo === warehouseNo
  )
  if (selectedWarehouse) {
    saveSelectedWarehouse(selectedWarehouse)
    emit('warehouse-change', selectedWarehouse)
  }
}

// 监听店铺选择变化
watch(
  () => form.value.selectedStore,
  (newVal) => {
    handleStoreChange(newVal)
  }
)

// 监听仓库选择变化
watch(
  () => form.value.selectedWarehouse,
  (newVal) => {
    handleWarehouseChange(newVal)
  }
)

// 监听登录状态变化
watch(
  () => props.isLoggedIn,
  (newVal) => {
    if (newVal) {
      loadShops()
      loadWarehouses()
    }
  },
  { immediate: true }
)

// 组件挂载时，如果已登录则加载数据
onMounted(() => {
  if (props.isLoggedIn) {
    loadShops()
    loadWarehouses()
  }
})

/**
 * 检查批次中商品的状态，找出停用的商品
 * @param {Array} batchSkus - 当前批次的SKU列表
 * @param {Number} currentBatch - 当前批次索引
 * @param {Number} totalBatches - 总批次数
 * @param {Array} allDisabledProducts - 所有批次中的停用商品
 */
const checkProductStatus = async (batchSkus, currentBatch, totalBatches, allDisabledProducts) => {
  if (!form.value.options.useStore) return

  // 重置状态
  form.value.disabledProducts.checking = true
  form.value.disabledProducts.currentBatch = currentBatch
  form.value.disabledProducts.totalBatches = totalBatches
  form.value.disabledProducts.checkError = ''
  form.value.disabledProducts.progress = '初始化...'

  console.log(`开始检查批次 ${currentBatch}/${totalBatches} 的商品状态`)

  try {
    // 获取事业部和店铺信息
    const department = getSelectedDepartment()
    const shopInfo = currentShopInfo.value

    if (!department || !shopInfo) {
      throw new Error('缺少事业部或店铺信息')
    }

    // 将SKU按1000个一组进行分割
    const QUERY_BATCH_SIZE = 1000
    const skuGroups = []

    for (let i = 0; i < batchSkus.length; i += QUERY_BATCH_SIZE) {
      skuGroups.push(batchSkus.slice(i, i + QUERY_BATCH_SIZE))
    }

    console.log(`将${batchSkus.length}个SKU分成${skuGroups.length}组进行状态查询`)
    form.value.disabledProducts.progress = `准备查询 ${skuGroups.length}组 SKU`

    // 遍历每个SKU组，查询状态
    for (let groupIndex = 0; groupIndex < skuGroups.length; groupIndex++) {
      const skuGroup = skuGroups[groupIndex]
      console.log(
        `查询第${groupIndex + 1}/${skuGroups.length}组SKU状态，包含${skuGroup.length}个SKU`
      )
      form.value.disabledProducts.progress = `查询第${groupIndex + 1}/${skuGroups.length}组 SKU`

      // 调用API查询商品状态
      const statusResult = await queryProductStatus(skuGroup, shopInfo, department)

      if (statusResult.success) {
        if (statusResult.disabledItems.length > 0) {
          console.log(`发现${statusResult.disabledItems.length}个停用商品`)
          form.value.disabledProducts.progress = `第${groupIndex + 1}组: 发现${statusResult.disabledItems.length}个停用商品`

          // 将找到的停用商品添加到全局列表
          allDisabledProducts.push(...statusResult.disabledItems)

          // 更新UI状态
          form.value.disabledProducts.items = allDisabledProducts
          form.value.disabledProducts.checkSuccess = true
        } else {
          form.value.disabledProducts.progress = `第${groupIndex + 1}组: 未发现停用商品`
        }
      } else {
        form.value.disabledProducts.checkError = statusResult.message
        form.value.disabledProducts.progress = `第${groupIndex + 1}组: 查询出错`
        console.warn(`查询商品状态出错: ${statusResult.message}`)
      }

      // 如果不是最后一组，添加短暂延迟避免频繁请求
      if (groupIndex < skuGroups.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    console.log(
      `批次${currentBatch}/${totalBatches}状态检查完成，累计发现${allDisabledProducts.length}个停用商品`
    )
    form.value.disabledProducts.progress = `批次${currentBatch}/${totalBatches}完成, 累计${allDisabledProducts.length}个停用商品`
  } catch (error) {
    console.error('检查商品状态失败:', error)
    form.value.disabledProducts.checkError = error.message || '检查商品状态时出错'
    form.value.disabledProducts.progress = '检查失败'
    throw error
  } finally {
    // 如果这是最后一个批次，结束检查状态
    if (currentBatch === totalBatches) {
      form.value.disabledProducts.checking = false
      form.value.disabledProducts.progress = `全部完成, 共${allDisabledProducts.length}个停用商品`
    }
  }
}

/**
 * 启用停用状态的商品
 * @param {Array} disabledProducts - 停用商品列表
 */
const enableDisabledProducts = async (disabledProducts) => {
  if (!disabledProducts || disabledProducts.length === 0) {
    console.log('没有需要启用的商品')
    return
  }

  form.value.disabledProducts.enabling = true
  form.value.disabledProducts.enableError = ''

  console.log(`开始启用${disabledProducts.length}个停用商品`)

  try {
    // 将商品分批启用，每批最多50个
    const ENABLE_BATCH_SIZE = 50
    const batches = []

    for (let i = 0; i < disabledProducts.length; i += ENABLE_BATCH_SIZE) {
      batches.push(disabledProducts.slice(i, i + ENABLE_BATCH_SIZE))
    }

    let enabledCount = 0
    let failedCount = 0

    // 循环处理每个批次
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      console.log(`启用批次${batchIndex + 1}/${batches.length}，包含${batch.length}个商品`)

      try {
        // 调用API启用商品
        const enableResult = await enableShopProducts(batch)

        if (enableResult.success) {
          enabledCount += batch.length
          console.log(
            `成功启用${batch.length}个商品，总计: ${enabledCount}/${disabledProducts.length}`
          )
        } else {
          failedCount += batch.length
          console.warn(`启用失败：${enableResult.message}`)
          form.value.disabledProducts.enableError = enableResult.message
        }
      } catch (error) {
        failedCount += batch.length
        console.error(`启用批次${batchIndex + 1}出错:`, error)
        form.value.disabledProducts.enableError = error.message || '启用商品时出错'
      }

      // 如果不是最后一批，添加短暂延迟避免频繁请求
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // 更新状态
    form.value.disabledProducts.enableSuccess = enabledCount > 0

    // 添加一条启用商品的任务记录
    if (enabledCount > 0) {
      taskList.value.push({
        sku: `启用商品操作 (${enabledCount}/${disabledProducts.length}个商品)`,
        店铺: currentShopInfo.value ? currentShopInfo.value.shopName : form.value.selectedStore,
        仓库: currentWarehouseInfo.value
          ? currentWarehouseInfo.value.warehouseName
          : form.value.selectedWarehouse,
        创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        状态: failedCount > 0 ? '部分成功' : '成功',
        结果:
          failedCount > 0
            ? `成功启用${enabledCount}个商品，${failedCount}个失败`
            : `成功启用${enabledCount}个商品`
      })

      emit('add-task')
    }

    console.log(`启用商品操作完成，成功: ${enabledCount}，失败: ${failedCount}`)

    // 如果有启用失败的商品，显示提示
    if (failedCount > 0) {
      alert(
        `部分商品启用失败：成功启用${enabledCount}个，${failedCount}个失败。\n${form.value.disabledProducts.enableError}`
      )
    } else if (enabledCount > 0) {
      alert(`成功启用所有${enabledCount}个停用商品。`)
    }
  } catch (error) {
    console.error('启用商品失败:', error)
    form.value.disabledProducts.enableError = error.message || '启用商品过程中出错'
    alert(`启用商品失败: ${error.message || '未知错误'}`)
  } finally {
    form.value.disabledProducts.enabling = false
    // 清空商品列表
    form.value.disabledProducts.items = []
  }
}

// 获取状态类
const getStatusClass = (status) => {
  switch (status) {
    case '等待中':
      return 'status-tag waiting'
    case '执行中':
      return 'status-tag processing'
    case '成功':
      return 'status-tag success'
    case '失败':
      return 'status-tag failure'
    default:
      return 'status-tag'
  }
}

// 执行单个任务
const executeOneTask = async (index) => {
  const task = taskList.value[index]
  if (!task) return

  // 获取店铺信息
  const shopInfo = currentShopInfo.value

  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 确保店铺信息包含spShopNo属性
  if (!shopInfo.spShopNo) {
    console.log('注意: 店铺信息中缺少spShopNo属性，将使用shopNo代替')
  } else {
    console.log('使用店铺spShopNo:', shopInfo.spShopNo)
  }

  // 标记为执行中
  task.状态 = '执行中'

  // 获取任务中存储的选项
  const options = task.选项
    ? JSON.parse(JSON.stringify(task.选项))
    : JSON.parse(JSON.stringify(form.value.options))
  // 打印当前任务的选项设置，帮助调试
  console.log('===== 执行单个任务的选项设置 =====')
  Object.keys(options).forEach((key) => {
    console.log(`${key}: ${options[key]}`)
  })

  try {
    // 存储功能执行结果
    const functionResults = []
    let hasFailures = false

    // =============================================
    // 独立执行每个功能选项，互不干扰，严格按照选中的功能执行
    // =============================================

    // 启用店铺商品功能 - 独立执行，不受其他功能影响
    if (options.useStore === true) {
      try {
        console.log('执行[启用店铺商品]功能，单个SKU:', task.sku)
        console.log('选项状态 (useStore):', options.useStore)
        console.log('选项状态 (importStore):', options.importStore)

        // 获取事业部信息
        const department = getSelectedDepartment()
        if (!department) {
          throw new Error('未选择事业部，无法检查商品状态')
        }

        // 调用商品状态检查API
        const allDisabledProducts = []
        await checkProductStatus([task.sku], 1, 1, allDisabledProducts)

        functionResults.push(`启用店铺商品: 成功 - 已检查商品状态`)
        console.log('商品状态检查完成')

        // 如果找到了停用商品，尝试启用它们
        if (allDisabledProducts.length > 0) {
          console.log(`找到${allDisabledProducts.length}个停用商品，准备启用它们`)
          await enableDisabledProducts(allDisabledProducts)
          functionResults.push(`启用停用商品: 成功 - 已启用${allDisabledProducts.length}个商品`)
        }
      } catch (checkError) {
        functionResults.push(`启用店铺商品: 失败 - ${checkError.message || '未知错误'}`)
        console.error('启用店铺商品失败:', checkError)
        hasFailures = true
      }
    }

    // 导入店铺商品功能 - 独立执行
    if (options.importStore === true) {
      try {
        console.log('执行[导入店铺商品]功能，单个SKU:', task.sku)
        console.log('选项状态 (importStore):', options.importStore)
        console.log('选项状态 (useStore):', options.useStore)

        // 调用批量处理SKU的API
        const importResult = await batchProcessSKUs([task.sku], shopInfo)

        if (importResult.success) {
          functionResults.push(`导入店铺商品: 成功`)
          console.log('导入店铺商品成功:', importResult.message)
        } else {
          functionResults.push(`导入店铺商品: 失败 - ${importResult.message}`)
          console.error('导入店铺商品失败:', importResult.message)
          hasFailures = true
        }
      } catch (importError) {
        functionResults.push(`导入店铺商品: 错误 - ${importError.message || '未知错误'}`)
        console.error('导入店铺商品出错:', importError)
        hasFailures = true
      }
    }

    // 更新任务状态
    if (functionResults.length === 0) {
      task.状态 = '失败'
      task.结果 = '没有执行任何功能'
    } else if (hasFailures) {
      task.状态 = '部分成功'
      task.结果 = functionResults.join('; ')
    } else {
      task.状态 = '成功'
      task.结果 = functionResults.join('; ')
    }
  } catch (error) {
    console.error('执行任务失败:', error)
    task.状态 = '失败'
    task.结果 = error.message || '执行出错'
  }
}

// 下载测试Excel文件
const downloadTestExcel = async () => {
  if (!form.value.sku) {
    alert('请先输入SKU')
    return
  }

  // 分割多行输入，处理每个SKU
  const skuList = form.value.sku
    .split('\n')
    .filter((sku) => sku.trim() !== '')
    .map((sku) => sku.trim())

  if (skuList.length === 0) {
    alert('请输入有效的SKU')
    return
  }

  try {
    // 获取当前选择的供应商
    const selectedVendor = getSelectedVendor()
    const cmgCode =
      selectedVendor && selectedVendor.supplierNo
        ? `CMS${selectedVendor.supplierNo}`
        : 'CMS4418047112894'
    console.log('获取供应商编码:', cmgCode)

    // 检查是否需要分批处理
    const BATCH_SIZE = 2000 // 每批最大SKU数量
    const batches = []

    // 分批处理
    for (let i = 0; i < skuList.length; i += BATCH_SIZE) {
      batches.push(skuList.slice(i, i + BATCH_SIZE))
    }

    console.log(`SKU总数: ${skuList.length}, 分成${batches.length}批处理`)

    // 如果超过一个批次，先提示用户
    if (batches.length > 1) {
      const confirmMessage = `检测到${skuList.length}个SKU，将分成${batches.length}批。\n所有文件将打包为一个zip文件下载。`
      if (!confirm(confirmMessage)) {
        return
      }
    }

    // 显示加载指示器
    const statusDiv = document.createElement('div')
    statusDiv.className = 'batch-processing-status'
    statusDiv.innerHTML = `<div class="status-content">
      <div class="status-spinner"></div>
      <div class="status-text">正在生成Excel文件，请稍候...</div>
    </div>`
    document.body.appendChild(statusDiv)

    try {
      // 创建一个JSZip实例
      const zip = new JSZip()

      // 处理每一批
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchSkus = batches[batchIndex]

        // 更新状态显示
        if (batches.length > 1) {
          statusDiv.querySelector('.status-text').textContent =
            `正在生成Excel文件 ${batchIndex + 1}/${batches.length}...`
        }

        // 字段名
        const header = [
          'POP店铺商品编号（SKU编码）',
          '商家商品标识',
          '商品条码',
          '是否代销（0-否，1-是）',
          '供应商CMG编码'
        ]

        // 实际表格内容
        const data = batchSkus.map((sku) => [sku, sku, sku, '0', cmgCode])

        // 合成数据（首行为 header）
        const sheetData = [header, ...data]

        // 生成 worksheet
        const ws = XLSX.utils.aoa_to_sheet(sheetData)

        // 创建 workbook 并追加 worksheet
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'POP商品导入')

        // 生成Excel二进制数据
        const excelBinaryData = XLSX.write(wb, { bookType: 'xls', type: 'binary' })

        // 将二进制字符串转换为ArrayBuffer
        const buf = new ArrayBuffer(excelBinaryData.length)
        const view = new Uint8Array(buf)
        for (let i = 0; i < excelBinaryData.length; i++) {
          view[i] = excelBinaryData.charCodeAt(i) & 0xff
        }

        // 文件名
        const fileName =
          batches.length > 1
            ? `PopGoodsImportTemplate_batch${batchIndex + 1}_of_${batches.length}.xls`
            : 'PopGoodsImportTemplate.xls'

        // 添加到zip
        if (batches.length > 1) {
          zip.file(fileName, buf)
        } else {
          // 单个文件直接下载
          const blob = new Blob([buf], { type: 'application/vnd.ms-excel' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.setAttribute('download', fileName)
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
        }

        // 添加短暂延迟以避免UI卡顿
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // 如果有多个批次，生成并下载zip文件
      if (batches.length > 1) {
        statusDiv.querySelector('.status-text').textContent = `正在打包文件，请稍候...`

        // 生成zip文件
        const zipContent = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        })

        // 下载zip文件
        const zipUrl = URL.createObjectURL(zipContent)
        const link = document.createElement('a')
        link.href = zipUrl
        link.setAttribute('download', `PopGoodsImportTemplate_${skuList.length}SKUs.zip`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(zipUrl)

        console.log(`已打包${batches.length}个Excel文件为zip下载`)
      } else {
        console.log('Excel文件下载成功')
      }
    } finally {
      // 移除状态指示器
      document.body.removeChild(statusDiv)
    }
  } catch (error) {
    console.error('创建Excel文件失败:', error)
    alert(`创建Excel文件失败: ${error.message || '未知错误'}`)
  }
}

// 处理文件上传
const handleFileUpload = (event) => {
  const file = event.target.files[0]
  if (file) {
    form.value.fileImport.file = file
    form.value.fileImport.fileName = file.name
    form.value.fileImport.importing = true
    form.value.fileImport.importError = ''
    form.value.fileImport.importSuccess = false

    // 读取文件内容
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      form.value.sku = text
      form.value.fileImport.importing = false
      form.value.fileImport.importSuccess = true
    }
    reader.onerror = (e) => {
      form.value.fileImport.importing = false
      form.value.fileImport.importError = e.target.error.message
    }
    reader.readAsText(file)
  }
}

// 清除文件输入
const clearFileInput = () => {
  if (form.value.fileImport) {
    form.value.fileImport.file = null
    form.value.fileImport.fileName = ''
    form.value.fileImport.importing = false
    form.value.fileImport.importError = ''
    form.value.fileImport.importSuccess = false
    form.value.sku = ''
  }
}

// 切换选项卡
const switchTab = (tab) => {
  activeTab.value = tab
}

const selectedFile = ref(null)

// 消息提示相关变量
const loading = ref(false)
const message = ref('')

// 任务名称和功能选择
const taskName = ref('')
const selectedFeatures = ref([])

// 文件输入引用
const fileInput = ref(null)

// 任务相关
const tasks = ref([])

// 消息提示函数
const warningMessage = (msg) => {
  alert(msg)
}

const successMessage = (msg) => {
  alert(msg)
}

const errorMessage = (msg) => {
  alert(msg)
}

// 读取Excel文件
const readExcelFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target.result
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })

        // 跳过标题行，提取SKU数据
        const skuList = jsonData
          .slice(1)
          .map((row) => row[0] || '')
          .filter((sku) => sku.trim() !== '')
        resolve(skuList)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = (error) => reject(error)
    reader.readAsArrayBuffer(file)
  })
}

// 创建产品对象
const createProductObject = (productInfo, selectedFeatures) => {
  return {
    sku: productInfo.sku || '',
    name: productInfo.name || '',
    featuresApplied: selectedFeatures,
    status: 'success'
  }
}

// 更新任务产品列表
const updateTaskProducts = (taskId, products) => {
  const taskIndex = tasks.value.findIndex((task) => task.id === taskId)
  if (taskIndex !== -1) {
    tasks.value[taskIndex].products = [...tasks.value[taskIndex].products, ...products]
  }
}

// 更新任务状态
const updateTaskStatus = (taskId, status) => {
  const taskIndex = tasks.value.findIndex((task) => task.id === taskId)
  if (taskIndex !== -1) {
    tasks.value[taskIndex].status = status
  }
}

// 处理任务添加
const handleAddTask = async () => {
  if (!form.value.sku && !selectedFile.value) {
    warningMessage('请输入SKU或选择文件')
    return
  }

  if (!form.value.selectedStore) {
    warningMessage('请选择店铺')
    return
  }

  if (!form.value.selectedWarehouse) {
    warningMessage('请选择仓库')
    return
  }

  // 检查是否有功能选择
  const hasFeatureSelected = Object.values(form.value.options).some((value) => value === true)
  if (!hasFeatureSelected) {
    warningMessage('请至少选择一个功能')
    return
  }

  // 添加调试日志
  console.log('===== 添加任务时的功能选项 =====')
  Object.keys(form.value.options).forEach((key) => {
    console.log(`${key}: ${form.value.options[key]}`)
  })

  if (selectedFile.value) {
    // 如果有选择文件，则执行导入和处理逻辑
    await handleBatchImport()
    // 文件处理后，重置文件选择
    selectedFile.value = null
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  } else {
    // 处理文本输入的SKUs
    // 分割多行输入，处理每个SKU
    const skuList = form.value.sku
      .split('\n')
      .filter((sku) => sku.trim() !== '')
      .map((sku) => sku.trim())

    if (skuList.length === 0) {
      warningMessage('请输入有效的SKU')
      return
    }

    const shopInfo = currentShopInfo.value
    const warehouseInfo = currentWarehouseInfo.value

    // 创建新任务
    const taskData = {
      id: Date.now().toString(),
      name: `批量处理 (${skuList.length}个SKU)`,
      features: Object.keys(form.value.options).filter((key) => form.value.options[key]),
      status: 'pending',
      createTime: new Date().toLocaleString(),
      products: skuList.map((sku) => ({
        sku: sku,
        店铺: shopInfo ? shopInfo.shopName : form.value.selectedStore,
        仓库: warehouseInfo ? warehouseInfo.warehouseName : form.value.selectedWarehouse,
        status: '等待中',
        选项: { ...form.value.options },
        采购: form.value.enablePurchase ? form.value.purchaseQuantity : 0
      }))
    }

    // 添加到任务列表
    tasks.value.push(taskData)

    // 添加到任务界面显示列表
    taskList.value.push({
      sku: `批量任务 (${skuList.length}个SKU)`,
      店铺: shopInfo ? shopInfo.shopName : form.value.selectedStore,
      仓库: warehouseInfo ? warehouseInfo.warehouseName : form.value.selectedWarehouse,
      创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      状态: '等待中',
      选项: { ...form.value.options },
      采购: form.value.enablePurchase ? form.value.purchaseQuantity : 0,
      skuList: skuList
    })

    // 通知父组件
    emit('add-task')

    // 清空SKU输入
    form.value.sku = ''

    // 如果设置了自动开始，可以在这里处理自动执行
    if (form.value.autoStart && typeof checkProductStatus === 'function') {
      // 这里可以添加自动执行的逻辑
      console.log('自动执行模式已启用，准备处理任务...')
    }
  }
}

// 处理文件选择
const handleFileChange = (event) => {
  const input = event.target
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]
    // 调用handleFileUpload处理文件上传状态
    handleFileUpload(event)
  }
}

// 给上传按钮添加清除功能
const handleClearFile = () => {
  selectedFile.value = null
  clearFileInput()
}

// 处理批量导入
const handleBatchImport = async () => {
  if (!selectedFile.value) {
    warningMessage('请先选择Excel文件')
    return
  }

  if (!selectedFeatures.value.length) {
    warningMessage('请选择至少一个功能')
    return
  }

  if (!taskName.value) {
    warningMessage('请输入任务名称')
    return
  }

  loading.value = true
  message.value = '正在读取Excel文件...'

  try {
    const fileData = await readExcelFile(selectedFile.value)

    if (!fileData || fileData.length === 0) {
      warningMessage('Excel文件为空或格式不正确')
      loading.value = false
      return
    }

    // 创建新任务
    const newTask = {
      id: Date.now().toString(),
      name: taskName.value,
      features: [...selectedFeatures.value],
      status: 'processing',
      createTime: new Date().toLocaleString(),
      products: []
    }

    tasks.value.push(newTask)

    // 批量处理商品
    const batchSize = 100
    const totalBatches = Math.ceil(fileData.length / batchSize)

    message.value = `正在处理商品数据 (0/${fileData.length})...`

    for (let i = 0; i < fileData.length; i += batchSize) {
      const batch = fileData.slice(i, i + batchSize)
      const currentBatch = Math.floor(i / batchSize) + 1

      message.value = `正在处理第 ${currentBatch}/${totalBatches} 批商品 (${i}/${fileData.length})...`

      const processedProducts = await Promise.all(
        batch.map(async (sku) => {
          try {
            const productInfo = await window.api.fetchProductInfo(sku.toString().trim())
            const product = createProductObject(productInfo, selectedFeatures.value)
            return product
          } catch (error) {
            console.error(`处理SKU ${sku} 时出错:`, error)
            return {
              sku: sku.toString().trim(),
              error: error.message || '未知错误',
              status: 'error'
            }
          }
        })
      )

      // 更新任务中的商品
      updateTaskProducts(newTask.id, processedProducts)

      // 更新进度
      message.value = `已处理 ${Math.min(i + batchSize, fileData.length)}/${fileData.length} 个商品...`
    }

    // 完成处理
    updateTaskStatus(newTask.id, 'completed')
    successMessage(`成功处理 ${fileData.length} 个商品`)

    // 重置表单
    taskName.value = ''
    selectedFeatures.value = []
  } catch (error) {
    console.error('批量导入出错:', error)
    errorMessage(`批量导入出错: ${error.message || '未知错误'}`)
  } finally {
    loading.value = false
    message.value = ''
  }
}

// 执行任务按钮点击处理
const executeTask = async () => {
  // 过滤出所有等待中的任务
  const waitingTasks = taskList.value.filter((task) => task.状态 === '等待中')
  if (waitingTasks.length === 0) {
    warningMessage('没有等待中的任务')
    return
  }

  // 显示操作状态指示器
  const statusDiv = document.createElement('div')
  statusDiv.className = 'batch-processing-status'
  statusDiv.innerHTML = `<div class="status-content">
    <div class="status-spinner"></div>
    <div class="status-text">正在处理任务，请稍候...</div>
    <div class="status-countdown"></div>
  </div>`
  document.body.appendChild(statusDiv)

  try {
    // 处理每一个任务
    let successCount = 0
    let failureCount = 0
    const allDisabledProducts = [] // 用于存储所有任务中的停用商品

    // 循环处理每个任务
    for (let taskIndex = 0; taskIndex < waitingTasks.length; taskIndex++) {
      const task = waitingTasks[taskIndex]

      // 获取任务中存储的选项，如果没有则使用当前表单中的选项
      // 确保使用深拷贝，避免任务间共享选项对象
      const options = task.选项
        ? JSON.parse(JSON.stringify(task.选项))
        : JSON.parse(JSON.stringify(form.value.options))

      // 打印当前任务的选项设置，帮助调试
      console.log('===== 执行任务的选项设置 =====')
      Object.keys(options).forEach((key) => {
        console.log(`${key}: ${options[key]}`)
      })
      console.log('===== 任务信息 =====')
      console.log('任务类型:', task.sku && task.sku.includes('批量任务') ? '批量任务' : '单个任务')
      console.log('任务SKU:', task.sku)
      console.log('任务skuList:', task.skuList ? `包含${task.skuList.length}个SKU` : '无')

      // 正确获取SKU列表 - 检查是否是批量任务
      let skuList = []
      if (task.skuList && Array.isArray(task.skuList)) {
        // 如果是批量任务，使用存储的SKU列表
        skuList = [...task.skuList] // 使用数组拷贝，避免引用问题
        console.log(`批量任务，使用skuList数组，包含${skuList.length}个SKU`)
      } else {
        // 如果是单个任务，将任务的SKU作为数组元素
        // 确保sku不是任务名称（不含"批量任务"字样）
        const sku = task.sku
        if (sku && !sku.includes('批量任务')) {
          skuList = [sku]
          console.log(`单个任务，SKU: ${sku}`)
        } else {
          console.warn(`任务SKU格式不正确: ${sku}，此任务将被跳过`)
          task.状态 = '失败'
          task.结果 = 'SKU格式不正确'
          failureCount++
          continue
        }
      }

      // 过滤掉无效的SKU
      skuList = skuList.filter((sku) => {
        const isValid =
          sku && typeof sku === 'string' && sku.trim() !== '' && !sku.includes('批量任务')
        if (!isValid) {
          console.warn(`过滤无效SKU: ${sku}`)
        }
        return isValid
      })

      if (skuList.length === 0) {
        console.warn('任务中没有有效的SKU，将跳过此任务')
        task.状态 = '失败'
        task.结果 = '没有有效的SKU'
        failureCount++
        continue
      }

      console.log(
        `处理任务 ${taskIndex + 1}/${waitingTasks.length}, 包含${skuList.length}个SKU`,
        skuList
      )
      statusDiv.querySelector('.status-text').textContent =
        `正在处理任务: ${taskIndex + 1}/${waitingTasks.length} (${skuList.length}个SKU)`

      // 处理状态
      task.状态 = '执行中'

      // 存储功能执行结果
      const functionResults = []
      let hasFailures = false

      try {
        // 获取店铺信息
        const shopInfo = currentShopInfo.value

        if (!shopInfo) {
          throw new Error('请选择店铺')
        }

        // 确保店铺信息包含spShopNo属性
        if (!shopInfo.spShopNo) {
          console.log('注意: 店铺信息中缺少spShopNo属性，将使用shopNo代替')
        } else {
          console.log('使用店铺spShopNo:', shopInfo.spShopNo)
        }

        // =============================================
        // 独立执行每个功能选项，互不干扰，严格按照选中的功能执行
        // =============================================

        // 启用店铺商品功能 - 独立执行，不受其他功能影响
        if (options.useStore === true) {
          try {
            console.log('执行[启用店铺商品]功能，SKU列表:', skuList)
            console.log('选项状态 (useStore):', options.useStore)
            console.log('选项状态 (importStore):', options.importStore)

            // 获取事业部信息
            const department = getSelectedDepartment()
            if (!department) {
              throw new Error('未选择事业部，无法检查商品状态')
            }

            // 调用商品状态检查API
            await checkProductStatus(
              skuList,
              taskIndex + 1,
              waitingTasks.length,
              allDisabledProducts
            )

            functionResults.push(`启用店铺商品: 成功 - 已检查${skuList.length}个商品`)
            console.log('商品状态检查完成')
          } catch (checkError) {
            functionResults.push(`启用店铺商品: 失败 - ${checkError.message || '未知错误'}`)
            console.error('启用店铺商品失败:', checkError)
            hasFailures = true
          }
        } else {
          console.log('跳过[启用店铺商品]功能，未选择此功能')
        }

        // 导入店铺商品功能 - 独立执行，不受其他功能影响
        if (options.importStore === true) {
          try {
            console.log('执行[导入店铺商品]功能，SKU列表:', skuList)
            console.log('选项状态 (importStore):', options.importStore)
            console.log('选项状态 (useStore):', options.useStore)

            // 调用批量处理SKU的API
            const importResult = await batchProcessSKUs(skuList, shopInfo)

            if (importResult.success) {
              functionResults.push(`导入店铺商品: 成功`)
              console.log('导入店铺商品成功:', importResult.message)
            } else {
              functionResults.push(`导入店铺商品: 失败 - ${importResult.message}`)
              console.error('导入店铺商品失败:', importResult.message)
              hasFailures = true
            }
          } catch (importError) {
            functionResults.push(`导入店铺商品: 错误 - ${importError.message || '未知错误'}`)
            console.error('导入店铺商品出错:', importError)
            hasFailures = true
          }
        } else {
          console.log('跳过[导入店铺商品]功能，未选择此功能')
        }

        // 导入物流属性功能
        if (options.importProps === true) {
          try {
            console.log('执行[导入物流属性]功能')
            // TODO: 实现导入物流属性的逻辑
            functionResults.push('导入物流属性: 未实现')
          } catch (error) {
            functionResults.push(`导入物流属性: 失败 - ${error.message || '未知错误'}`)
            hasFailures = true
          }
        } else {
          console.log('跳过[导入物流属性]功能，未选择此功能')
        }

        // 启用商品主数据功能
        if (options.useMainData === true) {
          try {
            console.log('执行[启用商品主数据]功能')
            // TODO: 实现启用商品主数据的逻辑
            functionResults.push('启用商品主数据: 未实现')
          } catch (error) {
            functionResults.push(`启用商品主数据: 失败 - ${error.message || '未知错误'}`)
            hasFailures = true
          }
        } else {
          console.log('跳过[启用商品主数据]功能，未选择此功能')
        }

        // 启用库存商品分配功能
        if (options.useWarehouse === true) {
          try {
            console.log('执行[启用库存商品分配]功能')
            // TODO: 实现启用库存商品分配的逻辑
            functionResults.push('启用库存商品分配: 未实现')
          } catch (error) {
            functionResults.push(`启用库存商品分配: 失败 - ${error.message || '未知错误'}`)
            hasFailures = true
          }
        } else {
          console.log('跳过[启用库存商品分配]功能，未选择此功能')
        }

        // 启用京配打标生效功能
        if (options.useJdEffect === true) {
          try {
            console.log('执行[启用京配打标生效]功能')
            // TODO: 实现启用京配打标生效的逻辑
            functionResults.push('启用京配打标生效: 未实现')
          } catch (error) {
            functionResults.push(`启用京配打标生效: 失败 - ${error.message || '未知错误'}`)
            hasFailures = true
          }
        } else {
          console.log('跳过[启用京配打标生效]功能，未选择此功能')
        }

        // 导入商品简称功能
        if (options.importTitle === true) {
          try {
            console.log('执行[导入商品简称]功能')
            // TODO: 实现导入商品简称的逻辑
            functionResults.push('导入商品简称: 未实现')
          } catch (error) {
            functionResults.push(`导入商品简称: 失败 - ${error.message || '未知错误'}`)
            hasFailures = true
          }
        } else {
          console.log('跳过[导入商品简称]功能，未选择此功能')
        }

        // 启用批次管理功能
        if (options.useBatchManage === true) {
          try {
            console.log('执行[启用批次管理]功能')
            // TODO: 实现启用批次管理的逻辑
            functionResults.push('启用批次管理: 未实现')
          } catch (error) {
            functionResults.push(`启用批次管理: 失败 - ${error.message || '未知错误'}`)
            hasFailures = true
          }
        } else {
          console.log('跳过[启用批次管理]功能，未选择此功能')
        }

        // 基于所有功能的执行结果，更新任务状态
        if (functionResults.length === 0) {
          task.状态 = '失败'
          task.结果 = '没有执行任何功能'
          failureCount++
        } else if (hasFailures) {
          task.状态 = '部分成功'
          task.结果 = functionResults.join('; ')
          // 部分成功也计入成功数
          successCount++
        } else {
          task.状态 = '成功'
          task.结果 = functionResults.join('; ')
          successCount++
        }
      } catch (error) {
        console.error(`任务执行失败:`, error)

        // 更新任务状态
        task.状态 = '失败'
        task.结果 = error.message || '执行出错'
        failureCount++

        // 如果是致命错误，中断后续任务处理
        if (
          error.message &&
          (error.message.includes('登录') ||
            error.message.includes('权限') ||
            error.message.includes('会话'))
        ) {
          alert(`任务执行失败: ${error.message}。\n将停止后续任务处理。`)
          break
        }
      }

      // 如果不是最后一个任务，添加等待时间
      if (taskIndex < waitingTasks.length - 1) {
        const waitTimeMs = form.value.waitTime * 1000

        // 倒计时显示
        const countdownElement = statusDiv.querySelector('.status-countdown')
        if (countdownElement) {
          countdownElement.style.marginTop = '10px'
          countdownElement.style.fontSize = '14px'

          // 启动倒计时
          let remainingTime = waitTimeMs
          const countdownInterval = setInterval(() => {
            remainingTime -= 1000
            if (remainingTime <= 0) {
              clearInterval(countdownInterval)
              countdownElement.textContent = '准备处理下一个任务...'
            } else {
              const seconds = Math.ceil(remainingTime / 1000)
              countdownElement.textContent = `等待处理下一个任务: ${seconds}秒`
            }
          }, 1000)

          // 显示初始倒计时
          countdownElement.textContent = `等待处理下一个任务: ${form.value.waitTime}秒`

          // 等待指定时间
          await new Promise((resolve) => setTimeout(resolve, waitTimeMs))
        }
      }
    }

    // 如果启用了"启用店铺商品"选项并找到了停用商品，则尝试启用它们
    if (form.value.options.useStore === true && allDisabledProducts.length > 0) {
      console.log(`找到${allDisabledProducts.length}个停用商品，准备启用它们`)
      try {
        await enableDisabledProducts(allDisabledProducts)
        console.log(`成功启用${allDisabledProducts.length}个停用商品`)

        // 添加启用成功的消息到任务记录
        taskList.value.push({
          sku: `启用停用商品 (${allDisabledProducts.length}个)`,
          店铺: currentShopInfo.value ? currentShopInfo.value.shopName : '未知店铺',
          创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          状态: '成功',
          结果: `已启用${allDisabledProducts.length}个停用商品`
        })
      } catch (error) {
        console.error('启用停用商品失败:', error)

        // 添加启用失败的消息到任务记录
        taskList.value.push({
          sku: `启用停用商品 (${allDisabledProducts.length}个)`,
          店铺: currentShopInfo.value ? currentShopInfo.value.shopName : '未知店铺',
          创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          状态: '失败',
          结果: error.message || '启用商品时出错'
        })
      }
    }

    // 显示执行总结果
    if (successCount > 0 && failureCount > 0) {
      alert(`处理完成，部分成功：\n成功: ${successCount}个任务\n失败: ${failureCount}个任务`)
    } else if (failureCount > 0) {
      alert(`处理失败：所有${failureCount}个任务均未成功完成`)
    } else {
      alert(`处理成功：全部${successCount}个任务已成功完成`)
    }
  } finally {
    // 移除状态指示器
    document.body.removeChild(statusDiv)
  }
}
</script>

<template>
  <div class="content-wrapper">
    <!-- 左侧操作区域 -->
    <div class="operation-area">
      <div class="form-group">
        <label class="form-label">快捷选择</label>
        <div class="select-wrapper">
          <select v-model="form.quickSelect" class="form-select">
            <option value="">请选择快捷方式</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">输入SKU</label>
        <div class="input-group">
          <textarea
            v-model="form.sku"
            placeholder="请输入SKU（多个SKU请每行一个）"
            class="form-input sku-textarea"
            rows="5"
          ></textarea>
        </div>
        <div class="file-upload-container">
          <div class="file-upload">
            <input
              type="file"
              ref="fileInput"
              @change="handleFileChange"
              accept=".xls, .xlsx"
              style="display: none"
            />
            <span class="btn btn-primary" @click="$refs.fileInput.click()">选择文件</span>
            <span v-if="selectedFile" class="selected-file-name">
              已选：{{ selectedFile.name }}
              <button class="btn-link" @click="handleClearFile">清除</button>
            </span>
            <span v-else class="selected-file-name">未选择文件</span>
          </div>
          <div class="batch-import"></div>
        </div>
        <div class="import-actions">
          <button class="btn btn-primary" @click="downloadTestExcel">下载Excel</button>
          <small class="import-tip"
            >每行一个SKU，使用"添加任务"按钮添加并处理。系统会根据功能选项执行相应操作。</small
          >
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">等待时间</label>
        <div class="input-number-group">
          <button class="btn-dec" @click="form.waitTime > 1 ? form.waitTime-- : 1">-</button>
          <input type="number" v-model="form.waitTime" min="1" class="form-input-number" />
          <button class="btn-inc" @click="form.waitTime++">+</button>
          <span class="unit">秒</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">功能选项</label>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.importStore" />
            <span>导入店铺商品</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useStore" />
            <span>启用店铺商品</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.importProps" />
            <span>导入物流属性</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useMainData" />
            <span>启用商品主数据</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useWarehouse" />
            <span>启用库存商品分配</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useJdEffect" />
            <span>启用京配打标生效</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.importTitle" />
            <span>导入商品简称</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useBatchManage" />
            <span>启用批次管理</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">采购入库</label>
        <div class="purchase-input-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.enablePurchase" />
            <span>启用采购入库</span>
          </label>
          <div class="number-input">
            <input
              type="number"
              v-model="form.purchaseQuantity"
              min="1"
              :disabled="!form.enablePurchase"
              class="form-input-number"
            />
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">选择店铺</label>
        <div class="select-wrapper">
          <select v-model="form.selectedStore" class="form-select" :disabled="isLoadingShops">
            <option value="" disabled>请选择店铺</option>
            <option v-for="shop in shopsList" :key="shop.shopNo" :value="shop.shopNo">
              {{ shop.shopName }}
            </option>
          </select>
          <div v-if="isLoadingShops" class="loading-indicator">加载中...</div>
          <div v-if="shopLoadError" class="error-message">{{ shopLoadError }}</div>
          <div v-if="currentShopInfo" class="shop-info">
            <small>店铺编号: {{ currentShopInfo.shopNo }}</small>
            <small>类型: {{ currentShopInfo.typeName }} - {{ currentShopInfo.bizTypeName }}</small>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">选择仓库</label>
        <div class="select-wrapper">
          <select
            v-model="form.selectedWarehouse"
            class="form-select"
            :disabled="isLoadingWarehouses"
          >
            <option value="" disabled>请选择仓库</option>
            <option
              v-for="warehouse in warehousesList"
              :key="warehouse.warehouseNo"
              :value="warehouse.warehouseNo"
            >
              {{ warehouse.warehouseName }}
            </option>
          </select>
          <div v-if="isLoadingWarehouses" class="loading-indicator">加载中...</div>
          <div v-if="warehouseLoadError" class="error-message">{{ warehouseLoadError }}</div>
          <div v-if="currentWarehouseInfo" class="warehouse-info">
            <small>仓库编号: {{ currentWarehouseInfo.warehouseNo }}</small>
            <small>类型: {{ currentWarehouseInfo.warehouseTypeStr }}</small>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-default">保存快捷</button>
        <button class="btn btn-success" @click="handleAddTask">添加任务</button>
      </div>
    </div>

    <!-- 右侧任务列表区域 -->
    <div class="task-area">
      <div class="task-header">
        <div class="task-title">任务列表</div>
        <div class="task-actions">
          <label class="checkbox-label timing-checkbox">
            <input type="checkbox" v-model="form.autoStart" />
            <span>定时</span>
          </label>
          <button class="btn btn-primary" @click="executeTask">打开网页</button>
          <button class="btn btn-success" @click="executeTask">批量执行</button>
          <button class="btn btn-danger" @click="clearTasks">清空列表</button>
        </div>
      </div>

      <div class="task-table-container">
        <div class="tab-container">
          <div class="tab-header">
            <div :class="['tab', { active: activeTab === 'tasks' }]" @click="switchTab('tasks')">
              任务列表
            </div>
            <div :class="['tab', { active: activeTab === 'logs' }]" @click="switchTab('logs')">
              提交日志
            </div>
            <div
              :class="['tab', { active: activeTab === 'products' }]"
              @click="switchTab('products')"
              v-if="form.disabledProducts.items.length > 0 || form.disabledProducts.checking"
            >
              停用商品
              <span v-if="form.disabledProducts.items.length > 0" class="badge">{{
                form.disabledProducts.items.length
              }}</span>
            </div>
          </div>
          <div class="tab-content">
            <div :class="['tab-pane', { active: activeTab === 'tasks' }]">
              <table class="task-table">
                <thead>
                  <tr>
                    <th style="width: 40px"><input type="checkbox" /></th>
                    <th>SKU</th>
                    <th>店铺</th>
                    <th>仓库</th>
                    <th>创建时间</th>
                    <th>状态</th>
                    <th>结果</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(task, index) in taskList" :key="index">
                    <td><input type="checkbox" /></td>
                    <td>{{ task.sku }}</td>
                    <td>{{ task.店铺 }}</td>
                    <td>{{ task.仓库 }}</td>
                    <td>{{ task.创建时间 }}</td>
                    <td>
                      <span :class="['status-tag', getStatusClass(task.状态)]">{{
                        task.状态
                      }}</span>
                    </td>
                    <td>
                      <span v-if="task.状态 === '等待中'">等待执行...</span>
                      <span v-else-if="task.状态 === '执行中'">处理中...</span>
                      <span v-else-if="task.状态 === '成功'">{{ task.结果 || '成功' }}</span>
                      <span v-else-if="task.状态 === '失败'" class="error-text">{{
                        task.结果 || '失败'
                      }}</span>
                    </td>
                    <td>
                      <button
                        class="btn btn-small btn-primary"
                        @click="executeOneTask(index)"
                        v-if="task.状态 === '等待中' || task.状态 === '失败'"
                      >
                        执行
                      </button>
                      <button class="btn btn-small btn-danger" @click="taskList.splice(index, 1)">
                        删除
                      </button>
                    </td>
                  </tr>
                  <tr v-if="taskList.length === 0">
                    <td colspan="8" class="no-data">No Data</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div :class="['tab-pane', { active: activeTab === 'logs' }]">
              <table class="task-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>批次</th>
                    <th>SKU数量</th>
                    <th>状态</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(log, index) in form.uploadLogs" :key="index">
                    <td>{{ log.time }}</td>
                    <td>{{ log.batchNumber }}/{{ log.totalBatches }}</td>
                    <td>{{ log.skuCount }}</td>
                    <td>
                      <span :class="['status-tag', getStatusClass(log.status)]">{{
                        log.status
                      }}</span>
                    </td>
                    <td>{{ log.result }}</td>
                  </tr>
                  <tr v-if="form.uploadLogs.length === 0">
                    <td colspan="5" class="no-data">暂无提交日志</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div :class="['tab-pane', { active: activeTab === 'products' }]">
              <div v-if="form.disabledProducts.checking" class="status-checking">
                <div class="spinner"></div>
                <div>
                  <div>
                    正在检查商品状态 (批次 {{ form.disabledProducts.currentBatch }}/{{
                      form.disabledProducts.totalBatches
                    }})...
                  </div>
                  <div class="progress-text">{{ form.disabledProducts.progress }}</div>
                </div>
              </div>

              <div v-if="form.disabledProducts.checkError" class="error-message">
                {{ form.disabledProducts.checkError }}
              </div>

              <div v-if="form.disabledProducts.items.length > 0" class="disabled-products-actions">
                <button
                  class="btn btn-primary"
                  @click="enableDisabledProducts(form.disabledProducts.items)"
                  :disabled="form.disabledProducts.enabling"
                >
                  {{ form.disabledProducts.enabling ? '正在启用...' : '启用所有停用商品' }}
                </button>
                <span>共发现 {{ form.disabledProducts.items.length }} 个停用商品</span>
              </div>

              <div v-if="form.disabledProducts.items.length > 0" class="status-summary">
                <div class="status-detail">
                  <i class="status-icon"></i>
                  有
                  <span class="status-count">{{ form.disabledProducts.items.length }}</span>
                  个商品处于停用状态，需要启用后才能正常销售
                </div>
                <div class="status-description">
                  系统会自动收集所有停用商品，点击"启用所有停用商品"按钮可一键启用
                </div>
              </div>

              <table class="task-table" v-if="form.disabledProducts.items.length > 0">
                <thead>
                  <tr>
                    <th style="width: 40px"><input type="checkbox" /></th>
                    <th>商品编号</th>
                    <th>商品名称</th>
                    <th>系统编号</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in form.disabledProducts.items" :key="index">
                    <td><input type="checkbox" /></td>
                    <td>{{ item.sellerGoodsSign || item.isvGoodsNo }}</td>
                    <td>{{ item.shopGoodsName }}</td>
                    <td>{{ item.shopGoodsNo }}</td>
                    <td>
                      <span class="status-tag failure">停用</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-else-if="!form.disabledProducts.checking" class="no-data">
                没有发现停用商品
              </div>

              <div v-if="form.disabledProducts.enableError" class="error-message">
                启用错误: {{ form.disabledProducts.enableError }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="task-footer">
        <label class="checkbox-label">
          <input type="checkbox" v-model="form.enableAutoUpload" />
          <span>启用自动验收与纸单上架</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style>
/* 主内容布局 */
.content-wrapper {
  display: flex;
  padding: 0;
  height: calc(100vh - 120px);
}

/* 操作区域 */
.operation-area {
  flex: 0 0 380px;
  background: #fff;
  padding: 20px;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.form-input,
.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
}

.form-input:focus,
.form-select:focus {
  border-color: #2196f3;
}

.sku-textarea {
  resize: vertical;
  min-height: 120px;
  padding: 12px;
  font-family: monospace;
}

.import-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.import-tip {
  color: #909399;
  margin-top: 5px;
  flex-basis: 100%;
  font-size: 12px;
}

.select-wrapper {
  position: relative;
}

.loading-indicator {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.error-message {
  font-size: 12px;
  color: #f56c6c;
  margin-top: 5px;
}

.shop-info,
.warehouse-info {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  display: flex;
  flex-direction: column;
}

.input-group {
  display: flex;
  gap: 10px;
}

.form-input {
  flex: 1;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
}

.input-number-group {
  display: flex;
  align-items: center;
}

.form-input-number {
  width: 80px;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
  text-align: center;
}

.btn-dec,
.btn-inc {
  width: 36px;
  height: 36px;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
  font-size: 16px;
  cursor: pointer;
}

.btn-dec {
  border-radius: 4px 0 0 4px;
}

.btn-inc {
  border-radius: 0 4px 4px 0;
}

.unit {
  margin-left: 8px;
  color: #606266;
}

.checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-right: 6px;
}

.purchase-input-group {
  display: flex;
  align-items: center;
  gap: 20px;
}

.number-input {
  flex: 0 0 120px;
}

.form-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

/* 任务区域 */
.task-area {
  flex: 1;
  background: #fff;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.task-title {
  font-size: 16px;
  font-weight: bold;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.timing-checkbox {
  margin-right: 5px;
}

.task-table-container {
  flex: 1;
  overflow: auto;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
}

.task-table th,
.task-table td {
  border-bottom: 1px solid #ebeef5;
  padding: 12px 0;
  text-align: left;
}

.task-table th {
  color: #909399;
  font-weight: 500;
  padding-bottom: 8px;
}

.status-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 2px;
  background-color: #e1f5fe;
  color: #039be5;
}

.status-tag.waiting {
  background-color: #e8f5e9;
  color: #43a047;
}

.status-tag.processing {
  background-color: #fff8e1;
  color: #ffa000;
  animation: pulse 1.5s infinite;
}

.status-tag.success {
  background-color: #e8f5e9;
  color: #43a047;
}

.status-tag.failure {
  background-color: #ffebee;
  color: #e53935;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
  100% {
    opacity: 1;
  }
}

.error-text {
  color: #e53935;
}

.no-data {
  text-align: center;
  color: #909399;
  padding: 30px 0;
}

.task-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid #ebeef5;
}

/* 按钮样式 */
.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-success {
  background-color: #52c41a;
  border-color: #52c41a;
}

.btn-danger {
  background-color: #ff4d4f;
  border-color: #ff4d4f;
}

.btn-default {
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  color: #606266;
}

.btn:hover {
  opacity: 0.9;
}

.btn-link {
  background: none;
  border: none;
  color: #1890ff;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.btn-link:hover {
  color: #40a9ff;
}

/* 文件导入相关样式 */
.file-import-container {
  margin-bottom: 10px;
}

.file-input-group {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.file-input {
  width: 0.1px;
  height: 0.1px;
  opacity: 0;
  overflow: hidden;
  position: absolute;
  z-index: -1;
}

.file-label {
  display: inline-block;
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px 12px;
  margin-right: 10px;
  cursor: pointer;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.file-label:hover {
  background-color: #e9ecef;
}

.import-template {
  margin: 5px 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.import-template small {
  color: #999;
}

.import-error {
  color: #ff4d4f;
  margin-top: 5px;
}

.import-success {
  color: #52c41a;
  margin-top: 5px;
}

.import-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.import-tip {
  color: #909399;
  margin-top: 5px;
  flex-basis: 100%;
  font-size: 12px;
}

.file-upload-container {
  margin: 10px 0;
  position: relative;
}

.file-upload-label {
  display: inline-block;
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px 12px;
  margin-right: 10px;
  cursor: pointer;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.file-upload-label:hover {
  background-color: #e9ecef;
}

.file-name {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.file-remove {
  cursor: pointer;
  color: #ff4d4f;
}

.upload-icon {
  margin-right: 5px;
}

/* 批处理状态指示器样式 */
.batch-processing-status {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.status-content {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.status-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #2196f3;
  border-radius: 50%;
  margin-bottom: 15px;
  animation: spin 1s linear infinite;
}

.status-text {
  font-size: 16px;
  color: #333;
  font-weight: 500;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.tab-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-header {
  display: flex;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 10px;
}

.tab {
  padding: 8px 16px;
  cursor: pointer;
  color: #606266;
  font-size: 14px;
}

.tab.active {
  color: #2196f3;
  border-bottom: 2px solid #2196f3;
  margin-bottom: -1px;
}

.tab-content {
  flex: 1;
  overflow: auto;
}

.tab-pane {
  display: none;
  height: 100%;
}

.tab-pane.active {
  display: block;
}

.status-countdown {
  color: #ff9800;
  font-weight: 500;
}

/* 停用商品相关样式 */
.status-checking {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 15px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #2196f3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
  margin-top: 2px;
}

.progress-text {
  font-size: 12px;
  color: #606266;
  margin-top: 5px;
}

.error-message {
  color: #f56c6c;
  padding: 10px;
  background-color: #fef0f0;
  border-radius: 4px;
  margin-bottom: 15px;
}

.disabled-products-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.status-summary {
  background-color: #fef9e7;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 15px;
  border-left: 4px solid #f39c12;
}

.status-detail {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  margin-bottom: 5px;
}

.status-count {
  font-weight: bold;
  color: #e67e22;
}

.status-description {
  font-size: 12px;
  color: #7f8c8d;
}

.status-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  background-color: #f39c12;
  border-radius: 50%;
  position: relative;
}

.status-icon:after {
  content: '!';
  position: absolute;
  color: white;
  font-weight: bold;
  font-size: 12px;
  top: 0;
  left: 5px;
  line-height: 16px;
}

.badge {
  background-color: #f56c6c;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 12px;
  margin-left: 5px;
}
</style>
