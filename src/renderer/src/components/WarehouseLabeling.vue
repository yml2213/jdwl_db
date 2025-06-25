<script setup>
import { ref, computed, watch, onMounted, provide, onUnmounted, inject } from 'vue'
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
import ProductNameImporter from './warehouse/feature/ProductNameImporter.vue'

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

// 获取全局任务列表
const globalTaskList = inject('globalTaskList', ref([]))

// 表单数据
const form = ref({
  quickSelect: '',
  sku: '',
  options: {
    importStore: true,
    useStore: true,
    importProps: false,
    useMainData: false,
    useWarehouse: false,
    useJdEffect: false,
    importTitle: false,
    importProductNames: false,
    skipConfigErrors: true
  },
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

// 任务列表 - 使用全局任务列表
const taskList = computed({
  get: () => globalTaskList.value,
  set: (value) => {
    globalTaskList.value = value
  }
})

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
  const shopInfo = shopsList.value.find((shop) => shop.shopNo === form.value.selectedStore)
  // 保存当前店铺信息到全局变量，供其他模块使用
  if (shopInfo) {
    window.currentShopInfo = shopInfo
  }
  return shopInfo
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
  // 暴露taskList到window对象，供其他模块访问
  window.taskList = taskList.value

  // 暴露addTaskToList方法到window对象，供批次处理使用
  window.addTaskToList = addTaskToList

  // 加载店铺和仓库列表
  if (props.isLoggedIn) {
    loadShops()
    loadWarehouses()
  }
})

// 确保在组件卸载时清理全局引用
onUnmounted(() => {
  window.taskList = null
  window.addTaskToList = null
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

// 添加任务到任务列表 - 用于批次任务
const addTaskToList = (task) => {
  if (!task) return
  console.log('添加批次任务到任务列表:', task)

  try {
    // 检查是否是更新现有任务
    const existingTaskIndex = taskList.value.findIndex((t) => t.id === task.id)
    if (existingTaskIndex >= 0) {
      // 更新现有任务
      taskList.value[existingTaskIndex] = task
      console.log('更新现有任务成功，索引:', existingTaskIndex)
    } else {
      // 添加新任务
      taskList.value.push(task)
      console.log('添加新任务成功，当前任务数量:', taskList.value.length)
      console.log(
        '当前任务列表状态:',
        JSON.stringify({
          type: typeof taskList.value,
          isArray: Array.isArray(taskList.value),
          length: taskList.value.length,
          firstTask: taskList.value.length > 0 ? taskList.value[0].id : 'none'
        })
      )
    }

    // 强制更新任务列表引用，以确保变更被检测到
    taskList.value = [...taskList.value]
  } catch (error) {
    console.error('添加任务到列表时出错:', error)
  }

  // 更新window.taskList
  window.taskList = taskList.value

  // 触发添加任务事件
  emit('add-task', task)
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
  console.log('添加任务按钮被点击')

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

  // 创建日期时间标记
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })

  // 将SKU列表按2000个一组进行分割
  const BATCH_SIZE = 2000
  const skuGroups = []
  for (let i = 0; i < skuList.length; i += BATCH_SIZE) {
    skuGroups.push(skuList.slice(i, i + BATCH_SIZE))
  }

  // 记录任务选项
  console.log('添加任务时的表单选项:', JSON.stringify(form.value.options))

  // 确定功能名称
  let featureName = ''
  const options = form.value.options
  const functionList = []

  // 收集所有选择的功能
  if (options.importStore) functionList.push('导入店铺商品')
  if (options.useStore) functionList.push('启用店铺商品')
  if (options.importProps) functionList.push('导入物流属性')
  if (options.useMainData || options.useAddInventory) functionList.push('添加库存')
  if (options.useWarehouse) functionList.push('启用商品库存分配')
  if (options.useJdEffect) functionList.push('启用京配')
  if (options.importProductNames) functionList.push('导入商品简称')

  // 将所有功能用逗号连接
  featureName = functionList.length > 0 ? functionList.join('，') : '未知功能'

  // 为每个组创建一个任务
  skuGroups.forEach((group, index) => {
    const groupNumber = index + 1
    const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const task = {
      id: taskId, // 添加唯一ID
      sku: `批次${groupNumber}/${skuGroups.length}(${group.length}个SKU)`,
      skuList: group, // 存储该组的所有SKU
      店铺: shopInfo ? shopInfo.shopName : '未选择',
      仓库: warehouseInfo ? warehouseInfo.warehouseName : '未选择',
      创建时间: timestamp,
      状态: '等待中',
      结果: '',
      功能: featureName, // 添加功能名称
      选项: JSON.parse(JSON.stringify(form.value.options)), // 确保是深拷贝
      店铺信息: shopInfo, // 存储完整的店铺信息对象
      importLogs: [
        {
          type: 'batch-info',
          message: `批次${groupNumber}/${skuGroups.length} - 包含${group.length}个SKU`,
          timestamp: new Date().toLocaleString()
        }
      ]
    }

    // 添加任务到任务列表
    addTaskToList(task)
  })

  // 不再自动清空输入框，改为手动清空
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
        :task-list="taskList.value"
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

    <!-- 商品简称导入组件 -->
    <div v-if="form.options.importProductNames" class="product-names-container">
      <product-name-importer />
    </div>
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

.product-names-container {
  position: fixed;
  top: 120px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  max-width: 800px;
  z-index: 1000;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
