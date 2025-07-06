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
    cancelJpSearch: false
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
  if (!form.value.options.clearStockAllocation && !form.value.options.cancelJpSearch)
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

  // 当选择“库存分配清零”时
  if (form.value.options.clearStockAllocation) {
    addTask({
      sku: skuDisplayName,
      name: '库存清零',
      store: currentShopInfo.value,
      warehouse: { warehouseName: 'N/A' },
      // 使用新的工作流编排器格式
      executionData: {
        initialContext: { ...commonData },
        stages: [
          {
            name: '库存分配清零阶段',
            tasks: [{ name: 'clearStockAllocation', context: {} }]
          }
        ]
      }
    })
  }

  // 当选择“取消京配打标”时
  if (form.value.options.cancelJpSearch) {
    addTask({
      sku: skuDisplayName,
      name: '取消京配打标',
      store: currentShopInfo.value,
      warehouse: { warehouseName: 'N/A' },
      executionData: {
        initialContext: {
          ...commonData,
          scope: form.value.mode === 'whole_store' ? 'all' : 'selected'
        },
        stages: [
          {
            name: '查询商品信息阶段',
            tasks: [{ name: 'getProductData', context: {} }]
          },
          {
            name: '取消京配打标阶段',
            tasks: [{ name: 'cancelJpSearch', context: {} }]
          }
        ]
      }
    })
  }
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
