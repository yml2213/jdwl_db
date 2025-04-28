<script setup>
import { ref, computed, watch, onMounted, provide } from 'vue'
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
import { getShopList, getWarehouseList, enableShopProducts } from '../services/apiService'

// 导入任务执行器和工具函数
import { executeOneTask, executeTasks } from '../features/warehouseLabeling/taskExecutor'
import { getStatusClass } from '../features/warehouseLabeling/utils/taskUtils'
// 导入物流属性相关功能
import { useLogisticsAttributes } from '../features/warehouseLabeling/logisticsAttributes'

// 导入拆分的组件
import OperationArea from './warehouse/OperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'
import LogisticsAttributesImporter from './warehouse/LogisticsAttributesImporter.vue'

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
    useBatchManage: false,
    skipConfigErrors: true
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

// 使用物流属性相关功能
const { logisticsImport, openLogisticsImporter, closeLogisticsImporter, submitLogisticsData } =
  useLogisticsAttributes(taskList, currentShopInfo)

// 将物流属性状态添加到表单中
form.value.logisticsImport = logisticsImport.value

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
    // 调用API启用商品
    const enableResult = await enableShopProducts(disabledProducts)

    // 更新状态
    form.value.disabledProducts.enableSuccess = enableResult.success

    if (enableResult.success) {
      console.log(`成功启用${disabledProducts.length}个商品`)
    } else {
      console.warn(`启用失败：${enableResult.message}`)
      form.value.disabledProducts.enableError = enableResult.message
    }
  } catch (error) {
    console.error('启用商品失败:', error)
    form.value.disabledProducts.enableError = error.message || '启用商品时出错'
  } finally {
    form.value.disabledProducts.enabling = false
  }
}

// 执行单个任务
const handleExecuteOneTask = async (task) => {
  if (!task) return

  // 获取店铺信息
  const shopInfo = currentShopInfo.value

  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 获取任务中存储的选项
  const options = task.选项
    ? JSON.parse(JSON.stringify(task.选项))
    : JSON.parse(JSON.stringify(form.value.options))

  // 使用任务执行器模块执行任务
  try {
    await executeOneTask(task, shopInfo, options)
  } catch (error) {
    console.error('执行任务失败:', error)
    alert(`执行任务失败: ${error.message || '未知错误'}`)
  }
}

// 执行任务按钮点击处理
const executeTask = async () => {
  // 过滤出所有等待中或暂存的任务
  const tasksToExecute = taskList.value.filter(
    (task) => task.状态 === '等待中' || task.状态 === '暂存'
  )
  if (tasksToExecute.length === 0) {
    alert('没有等待中或暂存的任务')
    return
  }

  // 获取店铺信息
  const shopInfo = currentShopInfo.value
  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 使用任务执行器执行所有任务
  try {
    const result = await executeTasks(
      tasksToExecute,
      shopInfo,
      form.value.waitTime,
      form.value.disabledProducts,
      form.value.options
    )

    // 显示执行结果
    alert(result.message)
  } catch (error) {
    console.error('批量执行任务失败:', error)
    alert(`批量执行任务失败: ${error.message || '未知错误'}`)
  }
}

// 添加任务的处理函数
const handleAddTask = () => {
  // 检查是否有输入的SKU
  if (!form.value.sku.trim()) {
    alert('请输入SKU')
    return
  }

  const skuList = form.value.sku.split(/[\n,，\s]+/).filter((sku) => sku.trim())
  if (skuList.length === 0) {
    alert('请输入有效的SKU')
    return
  }

  // 获取当前店铺和仓库信息
  const shopInfo = currentShopInfo.value
  const warehouseInfo = currentWarehouseInfo.value

  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 如果只有一个SKU，添加单个任务
  if (skuList.length === 1) {
    taskList.value.push({
      sku: skuList[0].trim(),
      店铺: shopInfo ? shopInfo.shopName : '未选择',
      仓库: warehouseInfo ? warehouseInfo.warehouseName : '未选择',
      创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      状态: '等待中',
      结果: '',
      选项: JSON.parse(JSON.stringify(form.value.options))
    })
  }
  // 如果有多个SKU，添加批量任务
  else {
    const batchName = `批量任务 (${skuList.length}个SKU) - ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`

    taskList.value.push({
      sku: batchName,
      skuList: skuList.map((sku) => sku.trim()),
      店铺: shopInfo ? shopInfo.shopName : '未选择',
      仓库: warehouseInfo ? warehouseInfo.warehouseName : '未选择',
      创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      状态: '等待中',
      结果: '',
      选项: JSON.parse(JSON.stringify(form.value.options))
    })
  }

  // 清空输入框
  form.value.sku = ''

  // 触发添加任务事件
  emit('add-task', taskList.value[taskList.value.length - 1])

  // 如果启用了自动开始，自动执行任务
  if (form.value.autoStart) {
    executeTask()
  }
}

// 处理文件变更的函数
const handleFileChange = (file) => {
  console.log('文件已变更', file.name)

  if (!file || !file.name.endsWith('.txt')) {
    alert('请选择有效的.txt文件')
    return
  }

  // 读取txt文件内容
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target.result
    // 获取文件内容，按行分割并移除空行
    const skuList = content.split(/\r?\n/).filter((line) => line.trim())
    if (skuList.length > 0) {
      // 将SKU列表设置到表单中
      form.value.sku = skuList.join('\n')
    } else {
      alert('文件内容为空或格式不正确')
    }
  }
  reader.onerror = () => {
    alert('读取文件失败')
  }
  reader.readAsText(file)
}

// 清除文件选择的函数
const handleClearFile = () => {
  // 清除文件的实现
  console.log('清除文件选择')
}

// 删除任务
const handleDeleteTask = (index) => {
  taskList.value.splice(index, 1)
}

// 打开物流属性导入对话框的封装方法
const handleOpenLogisticsImporter = () => {
  openLogisticsImporter(form.value.sku)
}

// 使用provide向子组件提供数据和方法
provide('form', form)
provide('taskList', taskList)
provide('shopsList', shopsList)
provide('isLoadingShops', isLoadingShops)
provide('shopLoadError', shopLoadError)
provide('warehousesList', warehousesList)
provide('isLoadingWarehouses', isLoadingWarehouses)
provide('warehouseLoadError', warehouseLoadError)
provide('currentShopInfo', currentShopInfo)
provide('currentWarehouseInfo', currentWarehouseInfo)
provide(
  'logs',
  computed(() => form.value.uploadLogs)
)
provide(
  'disabledProducts',
  computed(() => form.value.disabledProducts)
)

// 提供方法
provide('handleAddTask', handleAddTask)
provide('handleStoreChange', handleStoreChange)
provide('handleWarehouseChange', handleWarehouseChange)
provide('handleFileChange', handleFileChange)
provide('handleClearFile', handleClearFile)
provide('executeTask', executeTask)
provide('clearTasks', clearTasks)
provide('handleExecuteOneTask', handleExecuteOneTask)
provide('handleDeleteTask', handleDeleteTask)
provide('enableDisabledProducts', enableDisabledProducts)
provide('getStatusClass', getStatusClass)
provide('openLogisticsImporter', handleOpenLogisticsImporter)
</script>

<template>
  <div class="warehouse-labeling" v-if="props.isLoggedIn">
    <div class="content-wrapper">
      <!-- 左侧操作区域 -->
      <operation-area />

      <!-- 右侧任务列表区域 -->
      <task-area
        @execute="executeTask"
        @clear="clearTasks"
        @open-web="executeTask"
        @execute-one="handleExecuteOneTask"
        @delete-task="handleDeleteTask"
        @enable-products="enableDisabledProducts"
      />
    </div>

    <!-- 物流属性导入对话框 -->
    <logistics-attributes-importer
      v-if="form.logisticsImport.showDialog"
      :skuList="form.sku.split(/\r?\n/).filter((line) => line.trim())"
      :waitTime="form.waitTime"
      @close="closeLogisticsImporter"
      @submit="submitLogisticsData"
    />
  </div>
  <div v-else class="login-required">请先登录</div>
</template>

<style scoped>
/* 主内容布局 */
.content-wrapper {
  display: flex;
  padding: 0;
  height: calc(100vh - 120px);
}
</style>
