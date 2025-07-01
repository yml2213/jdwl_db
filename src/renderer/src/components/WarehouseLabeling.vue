<script setup>
import { ref, computed, watch, onMounted, reactive } from 'vue'
import {
  saveLastWorkflow,
  getLastWorkflow,
  saveManualOptions,
  getManualOptions,
  saveLastSkuInput,
  getLastSkuInput
} from '../utils/storageHelper'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import { useTaskList } from '@/composables/useTaskList'
import OperationArea from './warehouse/OperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'

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
const form = reactive({
  quickSelect: 'warehouseLabeling', // 当前选择的快捷流程
  sku: '', // 用户输入的SKU
  options: {}, // 手动模式下的功能选项
  payloads: {} // 用于存储与特定功能相关的额外数据，例如文件
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
  selectedDepartment,
  selectedVendor,
  loadShops,
  loadWarehouses,
  persistSelectedShop,
  persistSelectedWarehouse
} = useShopAndWarehouse()

// 任务列表管理 - 现在使用通用的组合式函数
const { taskList, addTask, executeTask, runAllTasks, clearAllTasks, deleteTask } = useTaskList()

// 当前激活的标签页 ('tasks' 或 'logs')
const activeTab = ref('tasks')

// 物流属性状态
const logisticsOptions = reactive({
  length: '120.00',
  width: '60.00',
  height: '6.00',
  grossWeight: '0.1'
})

// --- 计算属性 ---
// 判断当前是否为手动模式
const isManualMode = computed(() => form.quickSelect === 'manual')

// 获取当前选中的店铺完整信息
const currentShopInfo = computed(() =>
  shopsList.value.find((shop) => shop.shopNo === selectedStore.value)
)
// 获取当前选中的仓库完整信息
const currentWarehouseInfo = computed(() =>
  warehousesList.value.find((w) => w.warehouseNo === selectedWarehouse.value)
)

// 功能选项到中文名称的映射
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
  // --- 导入商品简称任务 ---
  if (isManualMode.value && form.options.importProductNames) {
    const payload = form.payloads?.importProductNames
    if (!payload || !payload.file) {
      return alert('请选择要上传的商品简称Excel文件')
    }
    if (!currentShopInfo.value) return alert('请选择店铺')

    addTask({
      displaySku: `文件: ${payload.file.name}`,
      featureName: featureNameMap.importProductNames,
      storeName: currentShopInfo.value.shopName,
      warehouseName: 'N/A',
      executionFeature: 'importProductNames',
      executionData: {
        file: {
          name: payload.file.name,
          path: payload.file.path,
          size: payload.file.size,
          type: payload.file.type,
          data: payload.file.data // 确保文件内容被传递
        },
        store: { ...currentShopInfo.value, ...selectedDepartment.value }
      }
    })
    // 重置，避免影响下一个任务
    form.payloads.importProductNames = null
    return // 单独处理，不继续执行下面的逻辑
  }

  // --- 原有的SKU任务 ---
  const skus = form.sku.split(/[\n,，\s]+/).filter((sku) => sku.trim())
  if (skus.length === 0) return alert('请输入有效的SKU')
  if (!currentShopInfo.value) return alert('请选择店铺')

  let featureName = ''
  if (isManualMode.value) {
    featureName = Object.entries(form.options)
      .filter(([, value]) => value === true)
      .map(([key]) => featureNameMap[key] || key)
      .join(' | ')
    if (!featureName) featureName = '手动任务'
  } else {
    featureName = workflows[form.quickSelect].name
  }

  // 使用 addTask 添加一个标准化的任务对象
  addTask({
    // 用于显示
    displaySku: `任务 (${skus.length}个SKU)`,
    featureName,
    storeName: currentShopInfo.value.shopName,
    warehouseName: currentWarehouseInfo.value?.warehouseName || '未指定',

    // 用于执行
    executionFeature: 'warehouseLabeling',
    executionData: {
      skus,
      options: {
        ...JSON.parse(JSON.stringify(form.options)),
        logistics: { ...logisticsOptions }
      },
      store: { ...currentShopInfo.value, ...selectedDepartment.value },
      warehouse: currentWarehouseInfo.value,
      vendor: selectedVendor.value,
      quickSelect: form.quickSelect
    }
  })
}

// --- 生命周期与侦听器 ---

// 侦听快捷选择的变化，更新功能选项并保存状态
watch(
  () => form.quickSelect,
  (newVal) => {
    form.options = { ...workflows[newVal].options }
    saveLastWorkflow(newVal)
    if (newVal === 'manual') {
      const savedOptions = getManualOptions()
      if (savedOptions) form.options = savedOptions
    }
    // 重置payloads确保切换后不会残留文件等信息
    form.payloads = {}
  }
)

// 深度侦听手动模式下的选项变化，并持久化
watch(
  () => form.options,
  (newOptions) => {
    if (isManualMode.value) {
      saveManualOptions(newOptions)
    }
  },
  { deep: true }
)

// 侦听SKU输入框的变化并保存
watch(
  () => form.sku,
  (newVal) => saveLastSkuInput(newVal)
)

// 侦听店铺选择变化并保存
watch(selectedStore, (newVal) => {
  if (newVal) persistSelectedShop(newVal)
})

// 侦听仓库选择变化并保存
watch(selectedWarehouse, (newVal) => {
  if (newVal) persistSelectedWarehouse(newVal)
})

// 组件挂载时，加载数据并恢复上次的状态
onMounted(() => {
  if (props.isLoggedIn) {
    loadShops()
    loadWarehouses()
    // 恢复上次的工作流选择
    form.quickSelect = getLastWorkflow() || 'warehouseLabeling'
    form.options = { ...workflows[form.quickSelect].options }
    // 如果是手动模式，则加载保存的选项
    if (form.quickSelect === 'manual') {
      const savedOptions = getManualOptions()
      if (savedOptions) form.options = savedOptions
    }
    // 恢复上次输入的SKU
    form.sku = getLastSkuInput() || ''
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
        :form="form"
        :shops-list="shopsList"
        :warehouses-list="warehousesList"
        :is-loading-shops="isLoadingShops"
        :shop-load-error="shopLoadError"
        :is-loading-warehouses="isLoadingWarehouses"
        :warehouse-load-error="warehouseLoadError"
        :logistics-options="logisticsOptions"
        v-model:selected-store="selectedStore"
        v-model:selected-warehouse="selectedWarehouse"
        @update:form="Object.assign(form, $event)"
        @update:logistics-options="Object.assign(logisticsOptions, $event)"
        @add-task="handleAddTask"
      />
      <TaskArea
        :task-list="taskList"
        :active-tab="activeTab"
        @execute-tasks="runAllTasks"
        @clear-tasks="clearAllTasks"
        @delete-task="deleteTask"
        @execute-one="executeTask"
        @update:active-tab="activeTab = $event"
      />
    </div>
  </div>
  <div v-else class="login-required">请先登录</div>
</template>

<style scoped>
.warehouse-labeling-container {
  display: flex;
  flex-direction: column;
  height: 100%;
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
