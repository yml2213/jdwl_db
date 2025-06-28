<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  saveLastWorkflow,
  getLastWorkflow,
  saveManualOptions,
  getManualOptions,
  saveLastSkuInput,
  getLastSkuInput,
  getSelectedDepartment,
  getSelectedVendor
} from '../utils/storageHelper'
import { useTask } from '@/composables/useTask.js'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import taskFlowExecutor from '@/features/warehouseLabeling/taskFlowExecutor'
import OperationArea from './warehouse/OperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'
import ProductNameImporter from './warehouse/feature/ProductNameImporter.vue'

// 定义组件的 props
const props = defineProps({
  isLoggedIn: Boolean
})

// --- 工作流定义 ---
// 定义了不同的自动化任务流程，每个流程包含一组预设的配置选项
const workflows = {
  manual: {
    name: '手动选择',
    options: {
      importStore: false,
      useStore: false,
      importProps: false,
      useMainData: false,
      useWarehouse: false,
      useJPEffect: false,
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
      useMainData: true,
      useWarehouse: true,
      useJPEffect: true,
      importProductNames: false,
      skipConfigErrors: true,
      useAddInventory: true,
      inventoryAmount: 1000
    }
  }
}

// --- 核心状态管理 ---
// 表单和用户输入的核心响应式状态
const form = ref({
  quickSelect: 'warehouseLabeling', // 当前选择的快捷流程
  sku: '', // 用户输入的SKU
  options: {}, // 手动模式下的功能选项
  selectedStore: '', // 已选择的店铺，由 useShopAndWarehouse 管理
  selectedWarehouse: '' // 已选择的仓库，由 useShopAndWarehouse 管理
})

// 从组合式函数中引入店铺和仓库相关的功能和状态
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
  loadWarehouses,
  persistSelectedShop,
  persistSelectedWarehouse
} = useShopAndWarehouse()

// 将组合式函数中的 ref 直接赋值给 form 中对应的属性，以实现双向绑定
form.value.selectedStore = selectedStore
form.value.selectedWarehouse = selectedWarehouse

// 任务列表
const taskList = ref([])
// 当前激活的标签页 ('tasks' 或 'logs')
const activeTab = ref('tasks')

// 物流属性状态
const logisticsOptions = ref({
  length: '120.00',
  width: '60.00',
  height: '6.00',
  grossWeight: '0.1'
})

// --- 计算属性 ---
// 判断当前是否为手动模式
const isManualMode = computed(() => form.value.quickSelect === 'manual')

// 获取当前选中的店铺完整信息
const currentShopInfo = computed(() =>
  shopsList.value.find((shop) => shop.shopNo === form.value.selectedStore)
)
// 获取当前选中的仓库完整信息
const currentWarehouseInfo = computed(() =>
  warehousesList.value.find((w) => w.warehouseNo === form.value.selectedWarehouse)
)

// --- 任务执行逻辑 ---
// 从 useTask 组合式函数中获取任务执行器
const { execute: executeTaskFlow, ...taskFlowState } = useTask(taskFlowExecutor)

// 功能选项到中文名称的映射，用于在UI上显示任务名称
const featureNameMap = {
  importStore: '导入店铺商品',
  useStore: '启用店铺商品',
  importProps: '导入物流属性',
  useMainData: '启用库存商品分配',
  useWarehouse: '添加库存',
  useJPEffect: '启用京配打标生效',
  importProductNames: '导入商品简称',
  useAddInventory: '添加库存'
}

/**
 * @description 处理"添加到任务列表"按钮点击事件
 */
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
    // 用于在任务列表表格中显示的信息
    displaySku: `任务 (${skus.length}个SKU)`,
    featureName,
    storeName: currentShopInfo.value.shopName,
    warehouseName: currentWarehouseInfo.value?.warehouseName || '未指定',
    createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    status: '等待中',
    result: '',

    // 用于任务执行的原始数据
    skus: skus,
    options: {
      ...JSON.parse(JSON.stringify(form.value.options)),
      logistics: { ...logisticsOptions.value } // 添加物流属性
    },
    selectedStore: currentShopInfo.value,
    selectedWarehouse: currentWarehouseInfo.value
  }
  taskList.value.push(newTask)
}

/**
 * @description 执行单个任务
 * @param {object} taskToRun - 需要执行的任务对象
 */
const handleExecuteTask = async (taskToRun) => {
  activeTab.value = 'logs' // 切换到日志标签页

  const task = taskList.value.find((t) => t.id === taskToRun.id)
  if (!task) {
    return
  }

  task.status = '运行中'
  try {
    const departmentInfo = getSelectedDepartment()
    const vendorInfo = getSelectedVendor()
    // 构建任务执行器所需的上下文对象
    const context = {
      skus: task.skus,
      options: task.options,
      store: { ...task.selectedStore, ...departmentInfo },
      warehouse: task.selectedWarehouse,
      vendor: vendorInfo,
      taskName: task.featureName,
      quickSelect: form.value.quickSelect // 直接传递模式选择
    }

    await executeTaskFlow(context)

    // 根据任务流的最终状态更新UI
    if (taskFlowState.status.value === 'success') {
      task.status = '成功'
      task.result = '任务执行成功-1'
    } else {
      task.status = '失败'
      const errorLog = taskFlowState.logs.value
        .slice()
        .reverse()
        .find((l) => l.type === 'error')
      task.result = errorLog ? errorLog.message : '执行失败，未知错误'
    }
  } catch (error) {
    console.error(`执行任务 ${task.id} 失败:`, error)
    task.status = '失败'
    task.result = error.message || '客户端执行异常'
  }
}

/**
 * @description 按顺序执行所有待处理的任务
 */
const runAllTasks = async () => {
  for (const task of taskList.value) {
    if (task.status === '等待中') {
      await handleExecuteTask(task)
    }
  }
}

/**
 * @description 清除已完成或失败的任务
 */
const clearFinishedTasks = () => {
  taskList.value = taskList.value.filter((t) => t.status === '等待中' || t.status === '运行中')
}

/**
 * @description 清空所有任务
 */
const clearAllTasks = () => {
  taskList.value = []
}

// --- 生命周期与侦听器 ---

// 侦听快捷选择的变化，更新功能选项并保存状态
watch(
  () => form.value.quickSelect,
  (newVal) => {
    form.value.options = { ...workflows[newVal].options }
    saveLastWorkflow(newVal)
    if (newVal === 'manual') {
      const savedOptions = getManualOptions()
      if (savedOptions) form.value.options = savedOptions
    }
  }
)

// 深度侦听手动模式下的选项变化，并持久化
watch(
  () => form.value.options,
  (newOptions) => {
    if (isManualMode.value) {
      saveManualOptions(newOptions)
    }
  },
  { deep: true }
)

// 侦听SKU输入框的变化并保存
watch(
  () => form.value.sku,
  (newVal) => saveLastSkuInput(newVal)
)

// 侦听店铺选择变化并保存
watch(
  () => form.value.selectedStore,
  (newVal) => {
    if (newVal) persistSelectedShop(newVal)
  }
)

// 侦听仓库选择变化并保存
watch(
  () => form.value.selectedWarehouse,
  (newVal) => {
    if (newVal) persistSelectedWarehouse(newVal)
  }
)

// 组件挂载时，加载数据并恢复上次的状态
onMounted(() => {
  if (props.isLoggedIn) {
    loadShops()
    loadWarehouses()
    // 恢复上次的工作流选择
    form.value.quickSelect = getLastWorkflow() || 'warehouseLabeling'
    form.value.options = { ...workflows[form.value.quickSelect].options }
    // 如果是手动模式，则加载保存的选项
    if (form.value.quickSelect === 'manual') {
      const savedOptions = getManualOptions()
      if (savedOptions) form.value.options = savedOptions
    }
    // 恢复上次输入的SKU
    form.value.sku = getLastSkuInput() || ''
  }
})

watch(
  () => props.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      loadShops()
      loadWarehouses()
    }
  }
)
</script>

<template>
  <div v-if="isLoggedIn" class="warehouse-labeling-container">
    <div v-if="isLoadingShops || isLoadingWarehouses || shopLoadError || warehouseLoadError" />
    <div class="main-content">
      <OperationArea
        v-model:quick-select="form.quickSelect"
        v-model:sku="form.sku"
        v-model:options="form.options"
        v-model:selected-store="form.selectedStore"
        v-model:selected-warehouse="form.selectedWarehouse"
        v-model:logistics-options="logisticsOptions"
        :shops-list="shopsList"
        :warehouses-list="warehousesList"
        :is-manual-mode="isManualMode"
        :is-executing="taskFlowState.isRunning.value"
        @add-task="handleAddTask"
      >
        <div v-if="isManualMode" class="manual-options-grid">
          <div class="option-item">
            <input type="checkbox" id="importStore" v-model="form.options.importStore" />
            <label for="importStore">导入店铺商品</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="useStore" v-model="form.options.useStore" />
            <label for="useStore">启用店铺商品</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="importProps" v-model="form.options.importProps" />
            <label for="importProps">导入物流属性(参数)</label>
          </div>
          <!-- Logistics Attributes Inputs -->
          <div v-if="form.options.importProps" class="logistics-options">
            <div class="logistics-input-group">
              <label for="length">长(mm):</label>
              <input
                type="text"
                id="length"
                v-model="logisticsOptions.length"
                placeholder="例如: 120.00"
              />
            </div>
            <div class="logistics-input-group">
              <label for="width">宽(mm):</label>
              <input
                type="text"
                id="width"
                v-model="logisticsOptions.width"
                placeholder="例如: 60.00"
              />
            </div>
            <div class="logistics-input-group">
              <label for="height">高(mm):</label>
              <input
                type="text"
                id="height"
                v-model="logisticsOptions.height"
                placeholder="例如: 6.00"
              />
            </div>
            <div class="logistics-input-group">
              <label for="grossWeight">毛重(kg):</label>
              <input
                type="text"
                id="grossWeight"
                v-model="logisticsOptions.grossWeight"
                placeholder="例如: 0.05"
              />
            </div>
          </div>
          <div class="option-item">
            <input type="checkbox" id="useMainData" v-model="form.options.useMainData" />
            <label for="useMainData">启用库存商品分配</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="useJPEffect" v-model="form.options.useJPEffect" />
            <label for="useJPEffect">启用京配打标生效</label>
          </div>
          <div class="option-item">
            <input
              type="checkbox"
              id="importProductNames"
              v-model="form.options.importProductNames"
            />
            <label for="importProductNames">导入商品简称</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="useAddInventory" v-model="form.options.useAddInventory" />
            <label for="useAddInventory">添加库存</label>
          </div>
          <!-- Logistics Attributes Inputs -->
          <div v-if="form.options.useAddInventory" class="inventory-container">
            <label class="inventory-label">库存数量：</label>
            <input
              type="number"
              v-model="form.options.inventoryAmount"
              min="1"
              max="10000"
              class="inventory-input"
            />
          </div>
        </div>
        <ProductNameImporter v-if="form.options.importProductNames" />
      </OperationArea>
      <TaskArea
        :task-list="taskList"
        :logs="taskFlowState.logs.value"
        :is-running="taskFlowState.isRunning.value"
        :active-tab="activeTab"
        @execute-tasks="runAllTasks"
        @clear-tasks="clearAllTasks"
        @delete-task="clearFinishedTasks"
        @execute-one="handleExecuteTask"
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
  padding: 40px;
  text-align: center;
}

.manual-options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 15px;
  padding: 10px;
  background-color: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
}

.option-item {
  display: flex;
  align-items: center;
}

.option-item input[type='checkbox'] {
  margin-right: 8px;
}

.logistics-options {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e8e8e8;
}

.logistics-input-group {
  display: flex;
  flex-direction: column;
}

.logistics-input-group label {
  margin-bottom: 5px;
  font-size: 12px;
  color: #666;
}

.logistics-input-group input {
  padding: 6px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
}

.inventory-container {
  margin-top: 12px;
  padding: 10px;
  background-color: #f9f9f9;
  border-radius: 4px;
  border: 1px solid #eaeaea;
  display: flex;
  align-items: center;
  max-width: 250px;
}

.inventory-label {
  font-weight: 500;
  margin-right: 8px;
  color: #333;
}

.inventory-input {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

.inventory-input:focus {
  border-color: #1890ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}
</style>
