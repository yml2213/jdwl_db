<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import { useTaskList } from '@/composables/useTaskList'
import { saveInventoryClearanceForm, getInventoryClearanceForm } from '@/utils/storageHelper'
import ClearStorageOperationArea from './warehouse/ClearStorageOperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'

// --- 状态管理 ---
const activeTab = ref('tasks')
const form = ref({
  mode: 'sku', // 'sku' or 'whole_store'
  sku: '',
  options: {
    clearStockAllocation: true,
    cancelJpSearch: false,
    disableStoreProducts: false,
    disableProductMasterData: false
  }
})

// --- 组合式函数 ---
// 店铺和仓库管理
const {
  shopsList,
  isLoadingShops,
  shopLoadError,
  selectedStore,
  loadShops,
  persistSelectedShop,
  selectedVendor,
  selectedDepartment,
  loadWarehouses
} = useShopAndWarehouse()

// 任务列表管理 (全局共享)
const {
  taskList,
  addTask,
  executeTask,
  runAllTasks,
  clearAllTasks,
  deleteTask,
  setSelectedTask,
  activeTaskLogs
} = useTaskList()

// --- 计算属性 ---
const currentShopInfo = computed(() =>
  shopsList.value.find((shop) => shop.shopNo === selectedStore.value)
)

// --- 方法 ---
const handleFormUpdate = (newForm) => {
  console.log('父组件接收到表单更新事件:', newForm)

  // 如果切换到整店模式，清空SKU
  if (newForm.mode === 'whole_store' && form.value.mode !== 'whole_store') {
    newForm.sku = ''
  }

  form.value = newForm
}

const handleStoreUpdate = (newStore) => {
  selectedStore.value = newStore
}

const handleAddTask = () => {
  if (!currentShopInfo.value) return alert('请选择店铺')
  if (
    !form.value.options.clearStockAllocation &&
    !form.value.options.cancelJpSearch &&
    !form.value.options.disableStoreProducts &&
    !form.value.options.disableProductMasterData
  )
    return alert('请至少选择一个功能选项')

  const isWholeStore = form.value.mode === 'whole_store'
  let skus = []

  if (isWholeStore) {
    // 整店模式，skus 列表应为空
    skus = []
  } else {
    skus = form.value.sku.split(/[\n,，\\s]+/).filter((s) => s.trim())
    if (skus.length === 0) {
      return alert('请输入至少一个SKU')
    }
  }

  const commonData = {
    scope: form.value.mode,
    skus,
    store: currentShopInfo.value,
    vendor: selectedVendor.value,
    department: selectedDepartment.value
  }

  const skuDisplayName = isWholeStore
    ? '整店操作'
    : skus.length > 1
      ? `批量任务 (${skus.length}个SKU)`
      : skus[0]

  // 收集所有选中的功能，创建一个综合任务
  const stages = []
  const selectedTaskNames = []

  // 按照指定顺序收集任务：停用店铺商品 - 停用商品主数据 - 库存分配清零 - 取消京配打标

  // 1. 停用店铺商品
  if (form.value.options.disableStoreProducts) {
    stages.push({
      name: '停用店铺商品阶段',
      tasks: [{ name: 'disableStoreProducts', context: {} }]
    })
    selectedTaskNames.push('停用店铺商品')
  }

  // 2. 停用商品主数据
  if (form.value.options.disableProductMasterData) {
    stages.push({
      name: '停用商品主数据阶段',
      tasks: [{ name: 'disableProductMasterData', context: {} }]
    })
    selectedTaskNames.push('停用商品主数据')
  }

  // 3. 库存分配清零
  if (form.value.options.clearStockAllocation) {
    stages.push({
      name: '库存分配清零阶段',
      tasks: [{ name: 'clearStockAllocation', context: {} }]
    })
    selectedTaskNames.push('库存分配清零')
  }

  // 4. 取消京配打标
  if (form.value.options.cancelJpSearch) {
    // 取消京配打标需要先查询商品信息，分为两个连续的阶段
    stages.push({
      name: '查询商品信息阶段',
      tasks: [{ name: 'getProductData', context: {} }]
    })
    stages.push({
      name: '取消京配打标阶段',
      tasks: [{ name: 'cancelJpSearch', context: {} }]
    })
    selectedTaskNames.push('取消京配打标')
  }

  // 创建一个综合任务，包含所有选中的子任务，每个子任务为独立的stage确保顺序执行
  const taskName = selectedTaskNames.length > 1 
    ? `清库下架 (${selectedTaskNames.join(' + ')})` 
    : selectedTaskNames[0]

  addTask({
    sku: skuDisplayName,
    name: taskName,
    store: currentShopInfo.value,
    warehouse: { warehouseName: 'N/A' },
    executionData: {
      initialContext: { ...commonData },
      stages: stages
    }
  })
}

// --- 侦听器和生命周期 ---
watch(
  form,
  (newForm) => {
    saveInventoryClearanceForm(newForm)
  },
  { deep: true }
)

watch(selectedStore, (newShopNo) => {
  if (newShopNo) persistSelectedShop(newShopNo)
})

onMounted(() => {
  const savedForm = getInventoryClearanceForm()
  if (savedForm) {
    form.value = savedForm
  }
  loadShops()
  loadWarehouses()
})
</script>

<template>
  <div class="inventory-clearance-container">
    <ClearStorageOperationArea
      :form="form"
      :shops-list="shopsList"
      :is-loading-shops="isLoadingShops"
      :shop-load-error="shopLoadError"
      :selected-store="selectedStore"
      @update:form="handleFormUpdate"
      @update:selected-store="handleStoreUpdate"
      @add-task="handleAddTask"
    />
    <TaskArea
      v-model:active-tab="activeTab"
      :task-list="taskList"
      :logs="activeTaskLogs"
      :is-any-task-running="false"
      @execute-tasks="runAllTasks"
      @clear-tasks="clearAllTasks"
      @delete-task="deleteTask"
      @execute-one="executeTask"
      @select-task="setSelectedTask"
    />
  </div>
</template>

<style scoped>
.inventory-clearance-container {
  display: flex;
  height: 100%;
  background-color: #ffffff;
}
</style>
