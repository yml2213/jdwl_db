<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import { useTaskList } from '@/composables/useTaskList'
import {
  saveInventoryClearanceForm,
  getInventoryClearanceForm
} from '@/utils/storageHelper'
import ClearStorageOperationArea from './warehouse/ClearStorageOperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'

const props = defineProps({
  isLoggedIn: Boolean
})

// --- 状态管理 ---
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
const { shopsList, isLoadingShops, shopLoadError, selectedStore, loadShops, persistSelectedShop } =
  useShopAndWarehouse()

// 任务列表管理 (全局共享)
const { taskList, addTask, executeTask, runAllTasks, clearAllTasks, deleteTask } = useTaskList()

// --- 计算属性 ---
const currentShopInfo = computed(() =>
  shopsList.value.find((shop) => shop.shopNo === selectedStore.value)
)

// --- 方法 ---
const handleAddTask = () => {
  if (!currentShopInfo.value) return alert('请选择店铺')
  if (!form.value.options.clearStockAllocation && !form.value.options.cancelJpSearch)
    return alert('请至少选择一个功能选项')

  const skus = form.value.sku.split(/[\n,，\\s]+/).filter((s) => s.trim())
  const isWholeStore = form.value.mode === 'whole_store'

  if (!isWholeStore && skus.length === 0) return alert('请输入至少一个SKU')

  // 构造要传递给执行器的数据
  const executionData = {
    skus: isWholeStore ? ['WHOLE_STORE'] : skus,
    store: currentShopInfo.value,
    options: { ...form.value.options }
  }

  // 计算任务显示名称
  let featureName = Object.entries(form.value.options)
    .filter(([, value]) => value === true)
    .map(([key]) => (key === 'clearStockAllocation' ? '库存清零' : '取消京配'))
    .join(' | ')

  // 添加到任务列表
  addTask({
    displaySku: isWholeStore
      ? '整店操作'
      : skus.length > 1
        ? `批量任务 (${skus.length}个SKU)`
        : skus[0],
    featureName,
    storeName: currentShopInfo.value.shopName,
    warehouseName: 'N/A',
    executionFeature: 'stockClearance', // 指定后端的 stockClearance 工作流
    executionData // 附加执行所需的数据
  })
}

// --- 侦听器和生命周期 ---
watch(form, (newForm) => {
  saveInventoryClearanceForm(newForm)
}, { deep: true })

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
      :task-list="taskList"
      :is-any-task-running="false"
      active-tab="tasks"
      @execute-tasks="runAllTasks"
      @clear-tasks="clearAllTasks"
      @delete-task="deleteTask"
      @execute-one="executeTask"
    />
  </div>
</template>

<style scoped>
.inventory-clearance-container {
  display: flex;
  height: 100%;
  background-color: #ffffff;
  padding: 20px;
  gap: 20px;
}
</style>
