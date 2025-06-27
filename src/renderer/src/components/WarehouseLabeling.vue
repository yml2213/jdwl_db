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

  const newTask = {
    id: `task-${Date.now()}`,
    sku: `任务 (${skuList.length}个SKU)`,
    skuList,
    shopName: currentShopInfo.value.shopName,
    warehouseName: currentWarehouseInfo.value?.warehouseName || '未指定',
    creationTime: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    status: '等待中',
    result: '',
    featureName: '任务流 - 入仓打标',
    店铺: currentShopInfo.value.shopName,
    仓库: currentWarehouseInfo.value?.warehouseName || '未指定',
    创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    状态: '等待中',
    结果: '',
    功能: '任务流 - 入仓打标',
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
  flex: 1;
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
