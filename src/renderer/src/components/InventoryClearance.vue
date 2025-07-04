<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import { useTaskList } from '@/composables/useTaskList'
import { saveInventoryClearanceForm, getInventoryClearanceForm } from '@/utils/storageHelper'
import ClearStorageOperationArea from './warehouse/ClearStorageOperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'

const props = defineProps({
  isLoggedIn: Boolean
})

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
  selectedDepartment
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
const handleAddTask = () => {
  if (!currentShopInfo.value) return alert('请选择店铺')
  if (!form.value.options.clearStockAllocation && !form.value.options.cancelJpSearch)
    return alert('请至少选择一个功能选项')

  const isWholeStore = form.value.mode === 'whole_store'
  let skus = []

  if (isWholeStore) {
    // 整店模式使用特殊标识，但后端任务需要一个非空的sku列表来启动批处理
    // 使用一个明确的标识符，而不是空数组
    skus = ['WHOLE_STORE_IDENTIFIER']
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

  if (form.value.options.clearStockAllocation) {
    addTask({
      sku: skuDisplayName,
      name: '库存清零',
      store: currentShopInfo.value,
      warehouse: { warehouseName: 'N/A' },
      executionFeature: 'clearStockAllocation',
      executionType: 'task',
      executionData: {
        ...commonData,
        options: { clearStockAllocation: true }
      }
    })
  }

  if (form.value.options.cancelJpSearch) {
    addTask({
      sku: skuDisplayName,
      name: '取消京配打标',
      store: currentShopInfo.value,
      warehouse: { warehouseName: 'N/A' },
      executionFeature: 'cancelJpSearch',
      executionType: 'task',
      executionData: {
        ...commonData,
        options: {
          cancelJpSearch: true,
          cancelJpSearchScope: form.value.mode === 'whole_store' ? 'all' : 'selected'
        }
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

watch(
  () => props.isLoggedIn,
  (newVal) => {
    if (newVal) loadShops()
  },
  { immediate: true }
)

watch(selectedStore, (newShopNo) => {
  if (newShopNo) persistSelectedShop(newShopNo)
})

onMounted(() => {
  const savedForm = getInventoryClearanceForm()
  if (savedForm) {
    form.value = savedForm
  }
  if (props.isLoggedIn) {
    loadShops()
  }
})
</script>

<template>
  <div v-if="isLoggedIn" class="inventory-clearance-container">
    <ClearStorageOperationArea
      v-model:form="form"
      :shops-list="shopsList"
      :is-loading-shops="isLoadingShops"
      :shop-load-error="shopLoadError"
      v-model:selected-store="selectedStore"
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
