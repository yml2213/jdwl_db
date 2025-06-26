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
import { useTask } from '../composables/useTask'
import warehouseLabelingFlow from '../features/warehouseLabeling/taskFlowExecutor'

const props = defineProps({
  isLoggedIn: Boolean
})

const showTaskFlowLogs = ref(false)

const toggleTaskFlowLogs = (visible) => {
  if (typeof visible === 'boolean') {
    showTaskFlowLogs.value = visible
  } else {
    showTaskFlowLogs.value = !showTaskFlowLogs.value
  }
}

const emit = defineEmits([
  'shop-change',
  'warehouse-change',
  'add-task',
  'execute-task',
  'clear-tasks'
])

// 直接在组件内部创建和管理 taskList
const taskList = ref([])

// 表单数据
const form = ref({
  quickSelect: 'warehouseLabelingFlow',
  sku: '',
  options: {
    importStore: true,
    useStore: false,
    importProps: true,
    useMainData: false,
    useWarehouse: true,
    useJdEffect: true,
    importTitle: false,
    importProductNames: false,
    skipConfigErrors: true,
    useAddInventory: true,
    inventoryAmount: 1000
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
  },
  taskFlowLogs: []
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

// 监听快捷选择变化
watch(
  () => form.value.quickSelect,
  (newValue) => {
    if (newValue === 'warehouseLabelingFlow') {
      form.value.options = {
        ...form.value.options,
        importStore: true,
        useStore: false,
        importProps: true,
        useAddInventory: true,
        useWarehouse: true,
        useJdEffect: true,
        importProductNames: false
      }
    }
  }
)

// --- 新的统一任务执行逻辑 ---

// 使用 useTask 创建一个可复用的任务执行器实例
const {
  execute: runWarehouseLabeling,
  isRunning: isWarehouseLabelingRunning,
  log: warehouseLabelingLog,
  logs: warehouseLabelingLogs,
  error: warehouseLabelingError,
  result: warehouseLabelingResult,
  cancel: cancelWarehouseLabeling,
  progress: warehouseLabelingProgress
} = useTask(warehouseLabelingFlow, {
  onSuccess: (res, task) => {
    if (task) {
      task.状态 = '成功'
      task.结果 = res.message || '执行成功'
    }
  },
  onError: (err, task) => {
    if (task) {
      task.状态 = '失败'
      task.结果 = err.message || '执行失败'
    }
  },
  onLog: (logEntry, task) => {
    // 允许将日志同步到旧的任务流日志窗口
    if (logEntry) {
      form.value.taskFlowLogs.push(logEntry)
    }
    // 同时也可以更新任务的实时结果
    if (task) {
      task.结果 = logEntry.message
    }
  }
})

// 新的、统一的执行入口 - 重命名以保持一致性
const runWarehouseLabelingFlow = (task) => {
  // 如果是从UI按钮直接触发（没有task参数），则从form中构建上下文
  const context = task
    ? {
        task, // 将整个task对象传入，以便在hook中更新
        skuList: task.skuList,
        shopInfo: task.店铺信息,
        options: task.选项,
        departmentInfo: getSelectedDepartment()
      }
    : {
        skuList: form.value.sku.split('\\n').filter((s) => s.trim()),
        shopInfo: currentShopInfo.value,
        departmentInfo: getSelectedDepartment(),
        options: form.value.options
      }
  
  // 清空旧日志并显示日志窗口
  form.value.taskFlowLogs = []
  toggleTaskFlowLogs(true)

  // 运行任务
  runWarehouseLabeling(context, task) // 传入task本身，用于回调
}

// 组件挂载时，如果已登录则加载数据
onMounted(() => {
  // 不再需要从 window 暴露 taskList，但保留 addTaskToList
  window.addTaskToList = addTaskToList

  // 加载店铺和仓库列表
  if (props.isLoggedIn) {
    loadShops()
    loadWarehouses()
  }
})

// 确保在组件卸载时清理全局引用
onUnmounted(() => {
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

  // 检查是否是任务流，如果是，则调用新的统一执行入口
  if (task.选项 && task.选项.quickSelect === 'warehouseLabelingFlow') {
    runWarehouseLabelingFlow(task)
    return
  }

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
  const existingTaskIndex = taskList.value.findIndex((t) => t.id === task.id)
  if (existingTaskIndex >= 0) {
    taskList.value[existingTaskIndex] = task
  } else {
    taskList.value.push(task)
  }
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

  // 检查是否有任务流任务
  const flowTask = tasksToExecute.find(
    (t) => t.选项.quickSelect === 'warehouseLabelingFlow'
  )
  if (flowTask) {
    // 调用新的统一执行入口
    runWarehouseLabelingFlow(flowTask)
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

  // 如果是任务流，功能名称特殊处理
  if (form.value.quickSelect === 'warehouseLabelingFlow') {
    featureName = '任务流 - 入仓打标'
  }

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
      选项: {
        ...JSON.parse(JSON.stringify(form.value.options)),
        quickSelect: form.value.quickSelect // 保存快捷选择的标识
      },
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
provide('toggleTaskFlowLogs', toggleTaskFlowLogs)
</script>

<template>
  <div class="warehouse-labeling" v-if="props.isLoggedIn">
    <div class="content-wrapper">
      <!-- 左侧操作区域 -->
      <operation-area />

      <!-- 右侧任务列表区域 -->
      <task-area
        :task-list="taskList"
        @execute="executeTask"
        @clear="clearTasks"
        @execute-one="handleExecuteOneTask"
        @delete-task="handleDeleteTask"
        @enable-products="enableDisabledProducts"
        @toggle-logs="toggleTaskFlowLogs"
      />
    </div>

    <!-- 任务流日志区域 -->
    <div v-if="form.taskFlowLogs.length > 0 && showTaskFlowLogs" class="task-flow-logs">
      <h4>
        <span>任务流执行日志</span>
        <button @click="toggleTaskFlowLogs(false)" class="close-btn">&times;</button>
      </h4>
      <div class="logs-container">
        <div
          v-for="(log, index) in warehouseLabelingLogs"
          :key="index"
          class="log-entry"
          :class="`log-${log.level}`"
        >
          [{{ log.level }}] {{ log.message }}
        </div>
      </div>
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

    <!-- 新版任务流执行区域 -->
    <div class="card bg-base-200 shadow-xl mt-6">
      <div class="card-body">
        <h2 class="card-title">入仓打标流程执行器</h2>
        <p>点击下方按钮，执行完整的入仓打标流程。</p>
        
        <div class="card-actions justify-start mt-4">
          <button
            class="btn btn-primary"
            @click="() => runWarehouseLabelingFlow()"
            :disabled="isWarehouseLabelingRunning"
          >
            <span v-if="isWarehouseLabelingRunning" class="loading loading-spinner"></span>
            {{ isWarehouseLabelingRunning ? '正在执行...' : '执行入仓打标' }}
          </button>
          <button
            class="btn btn-ghost"
            @click="cancelWarehouseLabeling"
            v-if="isWarehouseLabelingRunning"
          >
            取消
          </button>
        </div>

        <div v-if="warehouseLabelingError" class="alert alert-error mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>错误: {{ warehouseLabelingError }}</span>
        </div>

        <div v-if="warehouseLabelingResult" class="alert alert-success mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>完成: {{ warehouseLabelingResult.message }}</span>
        </div>
        
        <div v-if="warehouseLabelingLogs.length > 0" class="mt-4">
          <h3 class="font-bold">执行日志:</h3>
          <div class="mockup-code h-64 overflow-y-auto mt-2">
            <template v-for="(log, index) in warehouseLabelingLogs" :key="index">
              <pre :data-prefix="log.level.toUpperCase()"><code>[{{ log.timestamp }}] {{ log.message }}</code></pre>
            </template>
          </div>
        </div>
      </div>
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

.task-flow-logs {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 50%;
  max-width: 700px;
  height: 60%;
  max-height: 500px;
  background-color: #1e1e1e;
  color: #d4d4d4;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  padding: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  border: 1px solid #333;
}

.task-flow-logs h4 {
  margin: 0 0 15px 0;
  color: #569cd6;
  border-bottom: 1px solid #333;
  padding-bottom: 10px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.close-btn {
  background: none;
  border: none;
  color: #d4d4d4;
  font-size: 24px;
  cursor: pointer;
  padding: 0 5px;
  line-height: 1;
}

.close-btn:hover {
  color: #fff;
}

.logs-container {
  overflow-y: auto;
  font-family: 'Fira Code', 'Courier New', Courier, monospace;
  font-size: 14px;
  line-height: 1.6;
  flex-grow: 1;
  padding-right: 10px;
}

.logs-container::-webkit-scrollbar {
  width: 8px;
}

.logs-container::-webkit-scrollbar-track {
  background: #2a2a2a;
}

.logs-container::-webkit-scrollbar-thumb {
  background-color: #555;
  border-radius: 4px;
  border: 2px solid #2a2a2a;
}

.log-entry {
  padding: 2px 0;
  word-wrap: break-word;
}

.log-info {
  color: #d4d4d4; /* 默认颜色 */
}

.log-step {
  color: #569cd6;
  font-weight: bold;
  margin-top: 8px;
}

.log-success {
  color: #38a169; /* 绿色 */
}

.log-error {
  color: #e53e3e; /* 红色 */
}

.log-warning {
  color: #d69d29; /* 黄色 */
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

.log-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.log-modal-content {
  background-color: #2c2c2c;
  padding: 25px;
  border-radius: 10px;
  width: 60%;
  max-width: 800px;
  max-height: 70vh;
  overflow-y: auto;
  color: #e0e0e0;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
  border: 1px solid #444;
  position: relative;
}

.log-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #444;
}

.log-modal-title {
  font-size: 1.5em;
  color: #fff;
  margin: 0;
}

.close-log-modal-button {
  background: none;
  border: 1px solid #888;
  color: #ccc;
  font-size: 1.5em;
  cursor: pointer;
  padding: 0 10px;
  border-radius: 5px;
  transition: background-color 0.3s, color 0.3s;
}

.close-log-modal-button:hover {
  background-color: #555;
  color: #fff;
}
</style>
