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
  getSelectedVendor,
  saveLastWorkflow,
  getLastWorkflow,
  saveManualOptions,
  getManualOptions,
  saveLastSkuInput,
  getLastSkuInput
} from '../utils/storageHelper'
import { getShopList, getWarehouseList } from '../services/apiService'
import { useTask } from '@/composables/useTask.js'
import taskFlowExecutor from '@/features/warehouseLabeling/taskFlowExecutor'
import OperationArea from './warehouse/OperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'

const props = defineProps({
  isLoggedIn: Boolean
})

// === WORKFLOW DEFINITIONS ===
const workflows = {
  manual: {
    name: '手动选择',
    options: {
      importStore: false,
      useStore: false,
      importProps: false,
      useMainData: false,
      useWarehouse: false,
      useJdEffect: false,
      importProductNames: false,
      skipConfigErrors: true,
      useAddInventory: false,
      inventoryAmount: 1000
    }
  },
  warehouseLabeling: {
    name: '入仓打标',
    options: {
      importStore: true,
      useStore: false,
      importProps: true,
      useMainData: false,
      useWarehouse: true,
      useJdEffect: true,
      importProductNames: false,
      skipConfigErrors: true,
      useAddInventory: true,
      inventoryAmount: 1000
    }
  }
}

// === STATE MANAGEMENT ===
const form = ref({
  quickSelect: 'warehouseLabeling',
  sku: '',
  options: {}, // Initialize empty, will be populated on mount
  selectedStore: '',
  selectedWarehouse: ''
})

const taskList = ref([])
const shopsList = ref([])
const warehousesList = ref([])
const isLoadingShops = ref(false)
const isLoadingWarehouses = ref(false)
const shopLoadError = ref('')
const warehouseLoadError = ref('')
const isExecuting = ref(false) // 全局执行状态
const activeTab = ref('tasks') // 'tasks' or 'logs'

// === COMPUTED PROPERTIES ===
const isManualMode = computed(() => form.value.quickSelect === 'manual')

const currentShopInfo = computed(() =>
  shopsList.value.find((shop) => shop.shopNo === form.value.selectedStore)
)
const currentWarehouseInfo = computed(() =>
  warehousesList.value.find((w) => w.warehouseNo === form.value.selectedWarehouse)
)

// === API & DATA LOADING ===
const loadShops = async () => {
  isLoadingShops.value = true
  shopLoadError.value = ''
  try {
    const cachedShops = getShopsList()
    if (cachedShops && cachedShops.length > 0) {
      shopsList.value = cachedShops
    } else {
      const department = getSelectedDepartment()
      if (!department || !department.deptNo) throw new Error('未选择事业部')
      const deptId = department.deptNo.replace('CBU', '')
      const shops = await getShopList(deptId)
      shopsList.value = shops
      saveShopsList(shops)
    }
    const selected = getSelectedShop()
    form.value.selectedStore = selected?.shopNo || shopsList.value[0]?.shopNo
  } catch (error) {
    shopLoadError.value = `加载店铺失败: ${error.message}`
  } finally {
    isLoadingShops.value = false
  }
}

const loadWarehouses = async () => {
  isLoadingWarehouses.value = true
  warehouseLoadError.value = ''
  try {
    const cached = getWarehousesList()
    if (cached && cached.length > 0) {
      warehousesList.value = cached
    } else {
      const vendor = getSelectedVendor()
      const department = getSelectedDepartment()
      if (!vendor?.id || !department?.sellerId || !department?.deptNo)
        throw new Error('未选择供应商或事业部')
      const warehouses = await getWarehouseList(
        department.sellerId,
        department.deptNo.replace('CBU', '')
      )
      warehousesList.value = warehouses
      saveWarehousesList(warehouses)
    }
    const selected = getSelectedWarehouse()
    form.value.selectedWarehouse = selected?.warehouseNo || warehousesList.value[0]?.warehouseNo
  } catch (error) {
    warehouseLoadError.value = `加载仓库失败: ${error.message}`
  } finally {
    isLoadingWarehouses.value = false
  }
}

// === TASK EXECUTION LOGIC ===
const { execute: executeTaskFlow, ...taskFlowState } = useTask(taskFlowExecutor)

const featureNameMap = {
  importStore: '导入店铺商品',
  useStore: '启用店铺商品',
  importProps: '导入物流属性',
  useMainData: '启用库存分配',
  useWarehouse: '添加库存',
  useJdEffect: '京东打标生效',
  importProductNames: '导入商品简称',
  useAddInventory: '添加库存'
}

const handleAddTask = () => {
  const skus = form.value.sku.split(/[\n,，\s]+/).filter((sku) => sku.trim())
  if (skus.length === 0) return alert('请输入有效的SKU')
  if (!currentShopInfo.value) return alert('请选择店铺')

  let featureName = ''
  if (form.value.quickSelect === 'manual') {
    featureName = Object.entries(form.value.options)
      .filter(([, value]) => value === true)
      .map(([key]) => featureNameMap[key] || key)
      .join(' | ')
    if (!featureName) featureName = '手动任务'
  } else {
    featureName = workflows[form.value.quickSelect].name
  }

  const newTask = {
    id: `task-${Date.now()}`,
    // Properties for display in TaskListTable
    displaySku: `任务 (${skus.length}个SKU)`,
    featureName,
    storeName: currentShopInfo.value.shopName,
    warehouseName: currentWarehouseInfo.value?.warehouseName || '未指定',
    createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    status: '等待中',
    result: '',

    // Raw data for execution
    skus: skus,
    options: JSON.parse(JSON.stringify(form.value.options)),
    selectedStore: currentShopInfo.value,
    selectedWarehouse: currentWarehouseInfo.value
  }
  taskList.value.push(newTask)
}

const handleExecuteTask = async (taskToRun) => {
  isExecuting.value = true
  activeTab.value = 'logs'

  const task = taskList.value.find(t => t.id === taskToRun.id)
  if (!task) {
    isExecuting.value = false
    return
  }

  task.status = '运行中'
  try {
    const departmentInfo = getSelectedDepartment()
    const context = {
      skus: task.skus,
      options: task.options,
      store: { ...task.selectedStore, ...departmentInfo },
      warehouse: task.selectedWarehouse,
      taskName: task.featureName
    }
    
    await executeTaskFlow(context)

    if (taskFlowState.status.value === 'success') {
      task.status = '成功'
      task.result = '任务执行成功'
    } else {
      task.status = '失败'
      const errorLog = taskFlowState.logs.value.slice().reverse().find(l => l.type === 'error')
      task.result = errorLog ? errorLog.message : '执行失败，未知错误'
    }
  } catch (error) {
    console.error(`执行任务 ${task.id} 失败:`, error)
    task.status = '失败'
    task.result = error.message || '客户端执行异常'
  }

  isExecuting.value = false
}

const runAllTasks = async () => {
  isExecuting.value = true
  activeTab.value = 'logs'

  const tasksToRun = taskList.value.filter((task) => ['等待中', '失败'].includes(task.status))

  for (const task of tasksToRun) {
    task.status = '运行中'
    try {
      // Correctly construct context from the flattened task object
      const context = {
        skus: task.skus,
        options: task.options,
        store: task.selectedStore,
        warehouse: task.selectedWarehouse,
        taskName: task.featureName
      }
      
      await executeTaskFlow(context)

      if (taskFlowState.status.value === 'success') {
        task.status = '成功'
        task.result = '任务执行成功'
      } else {
        task.status = '失败'
        const errorLog = taskFlowState.logs.value.slice().reverse().find(l => l.type === 'error')
        task.result = errorLog ? errorLog.message : '执行失败，未知错误'
      }
    } catch (error) {
      console.error(`执行任务 ${task.id} 失败:`, error)
      task.status = '失败'
      task.result = error.message || '客户端执行异常'
    }
  }
  isExecuting.value = false
}

const handleClearTasks = () => {
  taskList.value = []
  taskFlowState.logs.value = []
}

const handleDeleteTask = (taskId) => {
  taskList.value = taskList.value.filter((task) => task.id !== taskId)
}

// === WATCHERS ===
watch(
  () => form.value.quickSelect,
  (newFlow) => {
    if (workflows[newFlow]) {
      form.value.options = { ...workflows[newFlow].options }
      saveLastWorkflow(newFlow)
    }
  },
  { deep: true }
)

watch(
  () => form.value.options,
  (newOptions) => {
    if (isManualMode.value) {
      saveManualOptions(newOptions)
    }
  },
  { deep: true }
)

watch(
  () => form.value.sku,
  (newSku) => {
    saveLastSkuInput(newSku)
  }
)

// === LIFECYCLE HOOKS ===
onMounted(() => {
  const lastWorkflow = getLastWorkflow() || 'warehouseLabeling'
  form.value.quickSelect = lastWorkflow

  if (lastWorkflow === 'manual') {
    const manualOptions = getManualOptions()
    if (manualOptions) {
      form.value.options = manualOptions
    } else {
      form.value.options = { ...workflows.manual.options }
    }
  } else {
    form.value.options = { ...workflows[lastWorkflow].options }
  }

  form.value.sku = getLastSkuInput()

  if (props.isLoggedIn) {
    loadShops()
    loadWarehouses()
  }
})

watch(() => props.isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    loadShops()
    loadWarehouses()
  }
})

watch(currentShopInfo, (newShop) => {
  if (newShop) saveSelectedShop(newShop)
})
watch(currentWarehouseInfo, (newWarehouse) => {
  if (newWarehouse) saveSelectedWarehouse(newWarehouse)
})

</script>

<template>
  <div v-if="isLoggedIn" class="warehouse-labeling-container">
    <div class="main-content">
      <OperationArea
        :form="form"
        :is-manual-mode="isManualMode"
        :workflows="workflows"
        :shops-list="shopsList"
        :warehouses-list="warehousesList"
        :is-loading-shops="isLoadingShops"
        :is-loading-warehouses="isLoadingWarehouses"
        :shop-load-error="shopLoadError"
        :warehouse-load-error="warehouseLoadError"
        :is-executing="isExecuting"
        @add-task="handleAddTask"
        @update:form="Object.assign(form, $event)"
      />
      <TaskArea
        :task-list="taskList"
        :logs="taskFlowState.logs.value"
        :is-running="isExecuting"
        :active-tab="activeTab"
        @execute-tasks="runAllTasks"
        @clear-tasks="handleClearTasks"
        @delete-task="handleDeleteTask"
        @execute-task="handleExecuteTask"
        @update:active-tab="activeTab = $event"
      />
    </div>
  </div>
  <div v-else class="login-prompt">
    <h2>请先登录</h2>
  </div>
</template>

<style scoped>
.warehouse-labeling-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 50px);
}

.main-content {
  display: flex;
  flex-grow: 1;
  overflow: hidden;
}

.login-prompt {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-size: 1.5rem;
}
</style>
