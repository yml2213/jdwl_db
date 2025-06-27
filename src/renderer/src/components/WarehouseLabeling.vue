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
import { getShopList, getWarehouseList } from '../services/apiService'
import { useTask } from '../composables/useTask'
import warehouseLabelingFlow from '../features/warehouseLabeling/taskFlowExecutor'
import OperationArea from './warehouse/OperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'

const props = defineProps({
  isLoggedIn: Boolean
})

// === STATE MANAGEMENT ===
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
  selectedWarehouse: ''
})

const taskList = ref([])
const shopsList = ref([])
const warehousesList = ref([])
const isLoadingShops = ref(false)
const isLoadingWarehouses = ref(false)
const shopLoadError = ref('')
const warehouseLoadError = ref('')

// === COMPUTED PROPERTIES ===
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
      const warehouses = await getWarehouseList(department.sellerId, department.deptNo.replace('CBU', ''))
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
const {
  execute,
  isRunning,
  logs,
  error: taskError,
  result: taskResult,
  cancel: cancelTask
} = useTask(warehouseLabelingFlow, {
  onLog: (log) => console.log(log.message)
})

const runTaskFlow = (taskContext) => {
  execute(taskContext)
}

// === EVENT HANDLERS ===
const handleAddTask = () => {
  const skuList = form.value.sku.split(/[\n,，\s]+/).filter((sku) => sku.trim())
  if (skuList.length === 0) return alert('请输入有效的SKU')
  if (!currentShopInfo.value) return alert('请选择店铺')

  const selectedOptions = Object.entries(form.value.options)
    .filter(([, value]) => value === true)
    .map(([key]) => {
      const optionMap = {
        importStore: '导入店铺商品',
        useStore: '启用店铺商品',
        importProps: '导入物流属性',
        useMainData: '启用库存分配',
        useWarehouse: '添加库存',
        useJdEffect: '京东打标生效',
        importProductNames: '导入商品简称'
      }
      return optionMap[key]
    })
    .filter(Boolean)
    .join(' | ')

  const newTask = {
    id: `task-${Date.now()}`,
    sku: `任务 (${skuList.length}个SKU)`,
    skuList,
    shopName: currentShopInfo.value.shopName,
    warehouseName: currentWarehouseInfo.value?.warehouseName || '未指定',
    creationTime: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    status: '等待中',
    result: '',
    featureName: selectedOptions,
    店铺: currentShopInfo.value.shopName,
    仓库: currentWarehouseInfo.value?.warehouseName || '未指定',
    创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    状态: '等待中',
    结果: '',
    功能: selectedOptions,
    options: JSON.parse(JSON.stringify(form.value.options)),
    shopInfo: currentShopInfo.value,
    warehouseInfo: currentWarehouseInfo.value,
    context: {
        skuList,
        shopInfo: currentShopInfo.value,
        departmentInfo: getSelectedDepartment(),
        options: form.value.options
    }
  }
  taskList.value.push(newTask)
}

const handleExecuteTask = (task) => {
  runTaskFlow(task.context)
}

const handleClearTasks = () => {
  taskList.value = []
}

// === LIFECYCLE HOOKS ===
onMounted(() => {
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
        :shops-list="shopsList"
        :is-loading-shops="isLoadingShops"
        :shop-load-error="shopLoadError"
        :warehouses-list="warehousesList"
        :is-loading-warehouses="isLoadingWarehouses"
        :warehouse-load-error="warehouseLoadError"
        @add-task="handleAddTask"
      />
      <TaskArea
        :task-list="taskList"
        :logs="logs"
        :is-running="isRunning"
        :task-error="taskError"
        :task-result="taskResult"
        @execute-task="handleExecuteTask"
        @clear-tasks="handleClearTasks"
      />
    </div>
    <!-- Log Panel -->
    <div v-if="logs.length > 0" class="log-panel-wrapper">
      <div class="log-panel-header">
        <h3>执行日志</h3>
        <button @click="logs = []" class="close-btn">&times;</button>
      </div>
      <div class="logs-container">
        <div v-if="isRunning">执行中...</div>
        <div v-if="taskError" class="log-error">错误: {{ taskError }}</div>
        <div v-if="taskResult" class="log-success">完成: {{ taskResult.message }}</div>
        <div v-for="(log, index) in logs" :key="index" :class="`log-${log.type}`">
          [{{ log.time }}] {{ log.message }}
        </div>
      </div>
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

/* Log Panel Styles */
.log-panel-wrapper {
  flex-shrink: 0;
  height: 200px;
  display: flex;
  flex-direction: column;
  background-color: #f7f7f7;
  border-top: 1px solid #ccc;
  padding: 10px;
  box-shadow: 0 -2px 5px rgba(0, 0, 0, 0.1);
}

.log-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.log-panel-header h3 {
  margin: 0;
  font-size: 1rem;
}

.log-panel-header .close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.logs-container {
  flex-grow: 1;
  overflow-y: auto;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  background-color: #fff;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.log-error {
  color: #d9534f;
}

.log-success {
  color: #5cb85c;
}

.log-info {
  color: #333;
}
</style>
