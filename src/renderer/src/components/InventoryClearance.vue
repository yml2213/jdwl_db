<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import { useTaskList } from '@/composables/useTaskList'
import { saveInventoryClearanceForm, getInventoryClearanceForm } from '@/utils/storageHelper'
import ClearStorageOperationArea from './warehouse/ClearStorageOperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'
import { taskDependencies } from '@/features/warehouseLabeling/taskConfiguration'

// --- 状态管理 ---
const activeTab = ref('tasks')
const form = ref({
  mode: 'sku', // 'sku' or 'whole_store'
  sku: '',
  options: {
    clearStockAllocation: true,
    cancelJpSearch: false,
    disableStoreProducts: false,
    disableProductMasterData: false,
    returnToVendor: false
  }
})

// --- 组合式函数 ---
// 店铺和仓库管理
const {
  shopsList,
  warehousesList,
  isLoadingShops,
  isLoadingWarehouses,
  shopLoadError,
  warehouseLoadError,
  selectedStore,
  selectedWarehouse,
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

const currentWarehouseInfo = computed(() =>
  warehousesList.value.find((w) => w.warehouseNo === selectedWarehouse.value)
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

  // 动态检查是否有任何功能选项被选中
  const hasSelectedOption = Object.values(form.value.options).some((isSelected) => isSelected)
  if (!hasSelectedOption) {
    return alert('请至少选择一个功能选项')
  }

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
  if (form.value.options.returnToVendor && !currentWarehouseInfo.value) {
    return alert('请选择一个仓库以继续退供应商库存操作。')
  }

  const commonData = {
    scope: form.value.mode,
    skus,
    store: currentShopInfo.value,
    vendor: selectedVendor.value,
    department: selectedDepartment.value,
    warehouse: currentWarehouseInfo.value
  }

  const skuDisplayName = isWholeStore
    ? '整店操作'
    : skus.length > 1
      ? `批量任务 (${skus.length}个SKU)`
      : skus[0]

  // 收集所有选中的功能，创建一个综合任务
  const stages = []
  const selectedTaskNames = []
  const selectedOptions = Object.keys(form.value.options).filter((key) => form.value.options[key])

  // -- 依赖注入逻辑 --
  const requiredDependencies = new Set()
  if (!isWholeStore) {
    selectedOptions.forEach((option) => {
      if (taskDependencies[option]) {
        requiredDependencies.add(taskDependencies[option])
      }
    })
  }
  // -- 依赖注入逻辑结束 --

  // 任务执行顺序：退供应商库存 -> 停用店铺商品 -> 停用商品主数据 -> 库存分配清零 -> 取消京配打标

  // 阶段 0: 自动处理依赖项 (仅在SKU模式下)
  if (requiredDependencies.size > 0) {
    stages.push({
      name: '阶段 0: 自动处理依赖项',
      tasks: Array.from(requiredDependencies).map((depName) => ({
        name: depName,
        context: {},
        source: 'initial'
      }))
    })
  }

  // 阶段 1. 退供应商库存 (最高优先级)
  if (form.value.options.returnToVendor) {
    const source = taskDependencies.returnToVendor || 'initial'
    stages.push({
      name: '退供应商库存阶段',
      tasks: [{ name: 'returnToVendor', context: {}, source }]
    })
    selectedTaskNames.push('退供应商库存')
  }

  // 阶段 2. 停用店铺商品
  if (form.value.options.disableStoreProducts) {
    stages.push({
      name: '停用店铺商品阶段',
      tasks: [{ name: 'disableStoreProducts', context: {}, source: 'initial' }]
    })
    selectedTaskNames.push('停用店铺商品')
  }

  // 阶段 3. 停用商品主数据
  if (form.value.options.disableProductMasterData) {
    stages.push({
      name: '停用商品主数据阶段',
      tasks: [{ name: 'disableProductMasterData', context: {}, source: 'initial' }]
    })
    selectedTaskNames.push('停用商品主数据')
  }

  // 阶段 4. 库存分配清零
  if (form.value.options.clearStockAllocation) {
    const source = taskDependencies.clearStockAllocation || 'initial'
    stages.push({
      name: '库存分配清零阶段',
      tasks: [{ name: 'clearStockAllocation', context: {}, source }]
    })
    selectedTaskNames.push('库存分配清零')
  }

  // 阶段 5. 取消京配打标
  if (form.value.options.cancelJpSearch) {
    const source = taskDependencies.cancelJpSearch || 'initial'
    stages.push({
      name: '取消京配打标阶段',
      tasks: [{ name: 'cancelJpSearch', context: {}, source }]
    })
    selectedTaskNames.push('取消京配打标')
  }

  // 创建一个综合任务，包含所有选中的子任务，每个子任务为独立的stage确保顺序执行
  const taskName =
    selectedTaskNames.length > 1
      ? `清库下架 (${selectedTaskNames.join(' + ')})`
      : selectedTaskNames[0]

  addTask({
    sku: skuDisplayName,
    name: taskName,
    store: currentShopInfo.value,
    warehouse: currentWarehouseInfo.value || { warehouseName: 'N/A' },
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
    <!-- 操作区域 -->
    <ClearStorageOperationArea
      :form="form"
      :shops-list="shopsList"
      :warehouses-list="warehousesList"
      :is-loading-shops="isLoadingShops"
      :is-loading-warehouses="isLoadingWarehouses"
      :shop-load-error="shopLoadError"
      :warehouse-load-error="warehouseLoadError"
      :selected-store="selectedStore"
      :selected-warehouse="selectedWarehouse"
      @update:form="handleFormUpdate"
      @update:selected-store="handleStoreUpdate"
      @update:selected-warehouse="selectedWarehouse = $event"
      @add-task="handleAddTask"
    />

    <!-- 任务和日志区域 -->
    <TaskArea
      v-model:active-tab="activeTab"
      :task-list="taskList"
      :logs="activeTaskLogs"
      :is-any-task-running="false"
      @run-all-tasks="runAllTasks"
      @clear-all-tasks="clearAllTasks"
      @delete-task="deleteTask"
      @execute-one="executeTask"
      @set-selected-task="setSelectedTask"
    />
  </div>
</template>

<style scoped>
.inventory-clearance-container {
  display: flex;
  height: calc(100vh - 120px); /* Adjust based on your app's header/footer height */
  background-color: #f0f2f5;
}
</style>
