<script setup>
import { ref, computed, watch, onMounted, provide, inject } from 'vue'
import {
  saveSelectedShop,
  getSelectedShop,
  saveShopsList,
  getShopsList,
  getSelectedDepartment
} from '../utils/storageHelper'
import { getShopList } from '../services/apiService'

import { useTask } from '../composables/useTask'
import stockAllocationClearanceFeature from '../features/warehouseLabeling/stockAllocationClearance'

import ClearStorageOperationArea from './warehouse/ClearStorageOperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'

const props = defineProps({
  isLoggedIn: Boolean
})

const emit = defineEmits(['shop-change'])

// 表单数据
const form = ref({
  mode: 'sku', // 'sku' or 'whole_store'
  sku: '',
  options: {
    clearStockAllocation: true,
    cancelJpSearch: false
  },
  selectedStore: '',
  autoStart: false // This might be obsolete now
})

// 全局任务列表
const globalTaskList = inject('globalTaskList', ref([]))
const taskList = computed({
  get: () => globalTaskList.value,
  set: (value) => {
    globalTaskList.value = value
  }
})

// 店铺列表
const shopsList = ref([])
const isLoadingShops = ref(false)
const shopLoadError = ref('')

// 日志和停用商品状态
const logs = ref([])
const disabledProducts = ref({
  items: [],
  checking: false,
  enabling: false,
  checkError: '',
  enableError: '',
  currentBatch: 0,
  totalBatches: 0,
  progress: '初始化...'
})

// 当前选中的店铺信息
const currentShopInfo = computed(() => {
  if (!form.value.selectedStore || !shopsList.value.length) return null
  return shopsList.value.find((shop) => shop.shopNo === form.value.selectedStore)
})

// 加载店铺列表
const loadShops = async () => {
  const cachedShops = getShopsList()
  if (cachedShops && cachedShops.length > 0) {
    shopsList.value = cachedShops
    const selectedShop = getSelectedShop()
    if (selectedShop) {
      form.value.selectedStore = selectedShop.shopNo
    } else if (shopsList.value.length > 0) {
      form.value.selectedStore = shopsList.value[0].shopNo
    }
    return
  }

  isLoadingShops.value = true
  shopLoadError.value = ''
  try {
    const department = getSelectedDepartment()
    if (!department || !department.deptNo) {
      shopLoadError.value = '未选择事业部，无法获取店铺列表'
      isLoadingShops.value = false
      return
    }
    const deptId = department.deptNo.replace('CBU', '')
    const shops = await getShopList(deptId)
    if (shops && shops.length > 0) {
      shopsList.value = shops
      saveShopsList(shops)
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

// 监听登录状态
watch(
  () => props.isLoggedIn,
  (newVal) => {
    if (newVal) {
      loadShops()
    }
  },
  { immediate: true }
)

// 挂载和卸载
onMounted(() => {
  if (props.isLoggedIn) {
    loadShops()
  }
})

// 监听店铺选择变化，并保存店铺信息
watch(
  () => form.value.selectedStore,
  (newShopNo) => {
    if (newShopNo) {
      const selectedShop = shopsList.value.find((shop) => shop.shopNo === newShopNo)
      if (selectedShop) {
        saveSelectedShop(selectedShop)
        emit('shop-change', selectedShop)
      }
    }
  }
)

const handleFileChange = (file) => {
  if (file && file.name.endsWith('.txt')) {
    const reader = new FileReader()
    reader.onload = (e) => (form.value.sku = e.target.result)
    reader.readAsText(file)
  }
}

const {
  isRunning: isClearanceRunning,
  status: clearanceStatus,
  logs: clearanceLogs,
  execute: executeClearance
} = useTask(stockAllocationClearanceFeature)

const handleAddTask = () => {
  const shopInfo = currentShopInfo.value
  if (!shopInfo) return alert('请选择店铺')
  if (!form.value.options.clearStockAllocation && !form.value.options.cancelJpSearch)
    return alert('请至少选择一个功能选项')

  const functionList = []
  if (form.value.options.clearStockAllocation) functionList.push('库存分配清零')
  if (form.value.options.cancelJpSearch) functionList.push('取消京配')
  const featureName = functionList.join('，')

  const skus = form.value.sku.split(/[\n,，\s]+/).filter((s) => s.trim())
  if (form.value.mode === 'sku' && skus.length === 0) return alert('请输入至少一个SKU')

  const isWholeStore = form.value.mode === 'whole_store'
  const task = {
    id: `task-${Date.now()}`,
    // Display properties
    displaySku: isWholeStore
      ? '整店操作'
      : skus.length > 1
        ? `批量任务 (${skus.length}个SKU)`
        : skus[0],
    featureName,
    storeName: shopInfo.shopName,
    warehouseName: 'N/A',
    createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    status: '等待中',
    result: '',
    // Execution properties
    executionData: {
      skuList: isWholeStore ? ['WHOLE_STORE'] : skus,
      shopInfo: JSON.parse(JSON.stringify(shopInfo)), // Crucial fix for cloning error
      options: JSON.parse(JSON.stringify(form.value.options))
    }
  }
  taskList.value.push(task)
}

const handleExecuteTask = async (task) => {
  task.status = '运行中...'
  task.result = ''
  clearanceLogs.value = [] // Clear previous logs

  // CRUCIAL FIX: Only pass serializable data. The `onLog` function was causing the clone error.
  const context = task.executionData

  await executeClearance(context)

  task.status = clearanceStatus.value
  const finalLog = clearanceLogs.value[clearanceLogs.value.length - 1]
  task.result = finalLog ? finalLog.message : '执行完毕'
}

const handleDeleteTask = (taskId) => {
  taskList.value = taskList.value.filter((t) => t.id !== taskId)
}

const clearTasks = () => {
  taskList.value = []
}

// 使用provide向子组件提供数据和方法
provide('form', form)
provide('shopsList', shopsList)
provide('isLoadingShops', isLoadingShops)
provide('shopLoadError', shopLoadError)
provide('handleFileChange', handleFileChange)
provide('handleAddTask', handleAddTask)
provide('logs', logs)
provide('disabledProducts', disabledProducts)
</script>

<template>
  <div v-if="isLoggedIn" class="inventory-clearance-container">
    <div class="clearance-container">
      <div class="operation-wrapper">
        <ClearStorageOperationArea
          v-model:mode="form.mode"
          v-model:sku="form.sku"
          v-model:options="form.options"
          v-model:selectedStore="form.selectedStore"
          :shopsList="shopsList"
          :isLoading="isLoadingShops"
          :error="shopLoadError"
        />
      </div>
      <TaskArea
        :task-list="taskList"
        :is-running="isClearanceRunning"
        :logs="clearanceLogs"
        @execute-one="handleExecuteTask"
        @delete-task="handleDeleteTask"
        @clear="clearTasks"
      />
    </div>
  </div>
  <div v-else class="login-required">请先登录</div>
</template>

<style scoped>
.inventory-clearance-container {
  display: flex;
  height: 100%;
  background-color: #fff;
}
.clearance-container {
  display: flex;
  flex: 1; /* 让容器填满可用空间 */
  height: calc(100vh - 120px);
  overflow: hidden;
}
.login-required {
  display: flex;
  justify-content: center;
  align-items: center;
  height: calc(100vh - 120px);
  font-size: 20px;
  color: #909399;
}

.operation-wrapper {
  flex: 0 0 400px;
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid #e0e0e0;
  background-color: #ffffff;
}

/* 让操作区内容可滚动 */
.operation-wrapper > :first-child {
  overflow-y: auto;
  padding: 20px;
  flex-grow: 1;
}
</style>

<style>
.form-label,
.radio-label,
.checkbox-label {
  color: #333 !important;
}

.form-label .required-tip {
  color: #999 !important;
  font-weight: normal;
}
</style>
