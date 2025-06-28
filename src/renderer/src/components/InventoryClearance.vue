<script setup>
import { ref, computed, watch, onMounted, provide, onUnmounted, inject } from 'vue'
import {
  saveSelectedShop,
  getSelectedShop,
  saveShopsList,
  getShopsList,
  getSelectedDepartment
} from '../utils/storageHelper'
import { getShopList } from '../services/apiService'
import { getStatusClass } from '../features/warehouseLabeling/utils/taskUtils'

import { useTask } from '../composables/useTask'
import stockAllocationClearanceFeature from '../features/warehouseLabeling/stockAllocationClearance'

import TaskArea from './warehouse/TaskArea.vue'
import ClearStorageOperationArea from './warehouse/ClearStorageOperationArea.vue'

// 重新导入 executeOneTask 以支持旧版任务列表
import { executeOneTask } from '../features/warehouseLabeling/taskExecutor'

const props = defineProps({
  isLoggedIn: Boolean
})

const emit = defineEmits(['shop-change', 'add-task', 'execute-task', 'clear-tasks'])

// 表单数据
const form = ref({
  mode: 'sku', // 'sku' or 'whole_store'
  sku: '',
  options: {
    clearStockAllocation: true,
    cancelJpSearch: false
  },
  selectedStore: '',
  autoStart: false
})

// 获取全局任务列表
const globalTaskList = inject('globalTaskList', ref([]))

// 任务列表 - 使用全局任务列表
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

// 添加任务到列表的公共方法
const addTaskToList = (task) => {
  console.log('添加任务到列表:', task)
  const existingTaskIndex = taskList.value.findIndex((t) => t.id === task.id)
  if (existingTaskIndex >= 0) {
    console.log('更新已存在的任务:', existingTaskIndex)
    taskList.value[existingTaskIndex] = task
  } else {
    console.log('添加新任务到列表')
    taskList.value.push(task)
  }
  console.log('当前任务列表长度:', taskList.value.length)
  window.taskList = taskList.value
  emit('add-task', task)
}

// 挂载和卸载
onMounted(() => {
  window.taskList = taskList.value
  window.addTaskToList = addTaskToList
  if (props.isLoggedIn) {
    loadShops()
  }
})

onUnmounted(() => {
  window.taskList = null
  window.addTaskToList = null
})

// 添加任务
const handleAddTask = () => {
  console.log('添加任务开始 - 当前状态:', {
    店铺: currentShopInfo.value?.shopName,
    SKU模式: form.value.mode,
    SKU内容: form.value.sku
      ? form.value.sku.length > 50
        ? form.value.sku.substring(0, 50) + '...'
        : form.value.sku
      : '空',
    功能选项: form.value.options,
    任务列表长度: taskList.value.length
  })

  const shopInfo = currentShopInfo.value
  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 获取事业部信息
  const deptInfo = getSelectedDepartment()
  if (!deptInfo) {
    alert('未找到事业部信息')
    return
  }

  if (!form.value.options.clearStockAllocation && !form.value.options.cancelJpSearch) {
    alert('请至少选择一个功能选项')
    return
  }

  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })

  // 确定功能名称
  let featureName = ''
  const options = form.value.options
  const functionList = []

  // 收集所有选择的功能
  if (options.clearStockAllocation) functionList.push('库存分配清零')
  if (options.cancelJpSearch) functionList.push('取消京配')

  // 整店操作模式
  if (form.value.mode === 'whole_store') {
    if (functionList.includes('库存分配清零')) {
      // 替换为整店版本
      const index = functionList.indexOf('库存分配清零')
      functionList[index] = '整店库存分配清零'
    }
    if (functionList.includes('取消京配')) {
      // 替换为整店版本
      const index = functionList.indexOf('取消京配')
      functionList[index] = '整店取消京配'
    }
  }

  // 将所有功能用逗号连接
  featureName = functionList.length > 0 ? functionList.join('，') : '未知功能'

  if (form.value.mode === 'whole_store') {
    // 为整店操作创建特殊的选项对象，将清零和取消京配打标转换为整店操作选项
    const wholeStoreOptions = {
      wholeStoreClearance: form.value.options.clearStockAllocation,
      wholeCancelJpSearch: form.value.options.cancelJpSearch
    }

    // 整店操作的功能名称
    if (wholeStoreOptions.wholeStoreClearance && wholeStoreOptions.wholeCancelJpSearch) {
      featureName = '整店清库+取消京配'
    } else if (wholeStoreOptions.wholeStoreClearance) {
      featureName = '整店清库'
    } else if (wholeStoreOptions.wholeCancelJpSearch) {
      featureName = '整店取消京配'
    }

    const task = {
      id: `whole-store-${Date.now()}`,
      displaySku: '整店操作',
      featureName,
      storeName: shopInfo.shopName,
      warehouseName: 'N/A',
      createdAt: timestamp,
      status: '等待中',
      result: '',

      // Raw data for execution
      sku: '整店操作',
      skuList: ['WHOLE_STORE'],
      店铺: shopInfo.shopName,
      创建时间: timestamp,
      状态: '等待中',
      结果: '',
      功能: featureName,
      选项: wholeStoreOptions,
      店铺信息: shopInfo,
      事业部信息: deptInfo
    }
    addTaskToList(task)
    console.log('添加整店任务成功:', task)

    // 整店模式下直接返回，不需要处理SKU列表
    if (form.value.autoStart) {
      handleExecuteTask(task)
    }
    return
  }

  const skus = form.value.sku.split(/[\n,，\s]+/).filter((s) => s.trim() !== '')

  if (skus.length === 0) {
    alert('请输入至少一个SKU')
    return
  }

  const task = {
    id: `task-${Date.now()}`,
    displaySku: skus.length > 1 ? `批量任务 (${skus.length}个SKU)` : skus[0],
    featureName,
    storeName: shopInfo.shopName,
    warehouseName: 'N/A', // 清库操作不涉及仓库
    createdAt: timestamp,
    status: '等待中',
    result: '',

    // Raw data for execution
    sku: skus.join(', '),
    skuList: skus,
    店铺: shopInfo.shopName,
    创建时间: timestamp,
    状态: '等待中',
    结果: '',
    功能: featureName,
    选项: form.value.options,
    店铺信息: shopInfo,
    事业部信息: deptInfo
  }
  addTaskToList(task)

  if (form.value.autoStart) {
    handleExecuteTask(task)
  }
}

// 执行任务
const handleExecuteTasks = async () => {
  if (taskList.value.length === 0) {
    alert('没有待执行的任务')
    return
  }

  const shopInfo = currentShopInfo.value
  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  console.log('开始执行任务列表, 数量:', taskList.value.length)

  // 过滤出等待中的任务
  const tasksToExecute = taskList.value.filter((task) => task.状态 === '等待中')
  if (tasksToExecute.length === 0) {
    alert('没有等待中的任务')
    return
  }

  try {
    // 执行任务
    await executeTasks(tasksToExecute, shopInfo, {}, form.value.options)
  } catch (error) {
    alert(`执行任务失败: ${error.message}`)
  }
}

// 修复后的旧版任务执行逻辑
const handleExecuteOneTask = async (task) => {
  console.log('Executing one task via old system:', task)
  try {
    await executeOneTask(task, currentShopInfo.value, task.选项)
    // 可以在这里更新任务状态，或者依赖 executeOneTask 内部的修改
  } catch (error) {
    console.error(`Failed to execute task ${task.id}:`, error)
    task.状态 = '失败'
    task.结果 = error.message
  }
}

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
    reader.onload = (e) => {
      form.value.sku = e.target.result
    }
    reader.readAsText(file)
  }
}

const clearTasks = () => {
  taskList.value = []
}

const handleDeleteTask = (index) => {
  taskList.value.splice(index, 1)
}

// 使用provide向子组件提供数据和方法
provide('taskList', taskList)
provide('form', form)
provide('shopsList', shopsList)
provide('isLoadingShops', isLoadingShops)
provide('shopLoadError', shopLoadError)
provide('handleAddTask', handleAddTask)
provide('handleFileChange', handleFileChange)
provide('logs', logs)
provide('disabledProducts', disabledProducts)

// 为"库存分配清零"功能实例化一个专用的任务执行器
const {
  isRunning: isClearanceRunning,
  status: clearanceStatus,
  logs: clearanceLogs,
  results: clearanceResults,
  execute: executeClearance
} = useTask(stockAllocationClearanceFeature)

// 创建一个新的、独立的执行函数
const handleRunClearanceImmediately = async () => {
  const shopInfo = currentShopInfo.value
  if (!shopInfo) {
    alert('请先选择一个店铺')
    return
  }

  let skuList = []
  if (form.value.mode === 'whole_store') {
    skuList = ['WHOLE_STORE']
  } else {
    skuList = form.value.sku
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (skuList.length === 0) {
      alert('请输入有效的SKU')
      return
    }
  }

  // 构建传递给 useTask 的上下文
  const context = {
    skuList,
    shopInfo
  }

  // 直接执行，无需创建和管理任务对象
  await executeClearance(context)
}

const handleExecuteTask = async (task) => {
  if (!task) return
  // ... existing code ...
}
</script>

<template>
  <div class="inventory-clearance" v-if="props.isLoggedIn">
    <div class="clearance-container">
      <div class="operation-wrapper">
        <ClearStorageOperationArea
          v-model:mode="form.mode"
          v-model:sku="form.sku"
          v-model:options="form.options"
          v-model:selectedStore="form.selectedStore"
          v-model:autoStart="form.autoStart"
          :shopsList="shopsList"
          :isLoading="isLoadingShops"
          :error="shopLoadError"
          @add-task="handleAddTask"
        >
          <template #extra-actions>
            <div class="new-feature-section">
              <button
                class="btn-execute-new"
                @click="handleRunClearanceImmediately"
                :disabled="isClearanceRunning || !form.options.clearStockAllocation"
              >
                <span v-if="!form.options.clearStockAllocation">请勾选上方清零选项</span>
                <span v-else-if="isClearanceRunning">执行中 ({{ clearanceStatus }})...</span>
                <span v-else>立即执行库存分配清零</span>
              </button>
              <p class="new-feature-desc">
                对于"库存分配清零"功能，请使用下方的"立即执行"按钮。
                <br />
                它将采用新版执行器，实时反馈日志，无需添加至任务列表。
              </p>
            </div>
          </template>
        </ClearStorageOperationArea>

        <div v-if="clearanceLogs.length > 0" class="new-logs-area">
          <h4 class="logs-header">
            执行日志 (状态: <span :class="`status-${clearanceStatus}`">{{ clearanceStatus }}</span
            >)
          </h4>
          <div class="logs-content">
            <div
              v-for="(log, index) in clearanceLogs"
              :key="index"
              :class="`log-item log-${log.type}`"
            >
              <span class="log-time">{{ log.time }}</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
          </div>
          <div
            v-if="clearanceStatus === 'success' && clearanceResults.length > 0"
            class="results-area"
          >
            <strong>处理结果:</strong>
            <ul>
              <li v-for="(res, i) in clearanceResults" :key="i">{{ res }}</li>
            </ul>
          </div>
        </div>
      </div>

      <TaskArea
        :task-list="taskList"
        @execute="handleExecuteTasks"
        @execute-one="handleExecuteOneTask"
        @delete-task="handleDeleteTask"
        @clear="clearTasks"
        :get-status-class="getStatusClass"
      />
    </div>
  </div>
  <div v-else class="login-required">请先登录</div>
</template>

<style scoped>
.inventory-clearance {
  height: 100%;
}
.clearance-container {
  display: flex;
  height: calc(100vh - 120px);
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

.operation-wrapper > div {
  overflow-y: auto;
  padding: 20px;
}

.new-feature-section {
  border-top: 1px solid #eee;
  padding-top: 15px;
  margin-top: 15px;
}

.btn-execute-new {
  background-color: #28a745;
  color: white;
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  width: 100%;
  transition: background-color 0.3s;
}

.btn-execute-new:disabled {
  background-color: #5a6268;
  cursor: not-allowed;
}

.btn-execute-new:hover:not(:disabled) {
  background-color: #218838;
}

.new-feature-desc {
  font-size: 12px;
  color: #888;
  margin-top: 8px;
  text-align: center;
}

.new-logs-area {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #444;
  border-radius: 4px;
  background-color: #2a2a2e;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.logs-header {
  margin-top: 0;
  margin-bottom: 10px;
  color: #eee;
  padding-bottom: 10px;
  border-bottom: 1px solid #444;
}

.logs-content {
  flex: 1;
  overflow-y: auto;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  line-height: 1.6;
}

.log-item {
  padding: 2px 5px;
  border-radius: 3px;
  margin-bottom: 2px;
}

.log-time {
  color: #888;
  margin-right: 10px;
}

.log-message {
  white-space: pre-wrap;
}

.log-info .log-message {
  color: #ccc;
}
.log-success .log-message {
  color: #28a745;
}
.log-error .log-message {
  color: #dc3545;
}
.log-warning .log-message {
  color: #ffc107;
}

.status-running {
  color: #007bff;
}
.status-success {
  color: #28a745;
}
.status-error {
  color: #dc3545;
}
.status-batching {
  color: #17a2b8;
}

.results-area {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #444;
  color: #eee;
}
.results-area ul {
  padding-left: 20px;
  margin: 0;
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
