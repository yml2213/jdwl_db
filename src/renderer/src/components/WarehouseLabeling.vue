<template>
  <div class="warehouse-labeling-container">
    <OperationArea
      :form="form"
      :selected-store="selectedStore"
      :selected-warehouse="selectedWarehouse"
      :shops-list="shopsList"
      :warehouses-list="warehousesList"
      :is-loading-shops="isLoadingShops"
      :shop-load-error="shopLoadError"
      :is-loading-warehouses="isLoadingWarehouses"
      :warehouse-load-error="warehouseLoadError"
      :logistics-options="logisticsOptions"
      @update:form="updateForm"
      @update:logisticsOptions="updateLogisticsOptions"
      @update:selectedStore="selectedStore = $event"
      @update:selectedWarehouse="selectedWarehouse = $event"
      @add-task="addTask"
    />
    <TaskArea
      :task-list="tasks"
      :logs="activeTaskLogs"
      :activeTab="state.activeTab"
      @update:activeTab="(newTab) => (state.activeTab = newTab)"
      @execute-tasks="runAllTasks"
      @clear-tasks="clearAllTasks"
      @delete-task="deleteTask"
      @execute-one="executeTask"
      @row-click="handleRowClick"
      @cancel-task="cancelTask"
    />
  </div>
</template>

<script setup>
import { reactive, watch, ref, onMounted } from 'vue'
import OperationArea from './warehouse/OperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'
import { useTaskList } from '../composables/useTaskList'
import { useShopAndWarehouse } from '../composables/useShopAndWarehouse'
import {
  getInitialFormState,
  getAllManualTaskKeys,
  getWorkflows
} from '../features/warehouseLabeling/taskConfiguration'
import {
  getSelectedVendor,
  getSelectedDepartment,
  saveWarehouseLabelingForm,
  getWarehouseLabelingForm
} from '../utils/storageHelper'

const {
  taskList: tasks,
  selectedTask,
  activeTaskLogs,
  addTask: addTaskToTaskList,
  executeTask,
  deleteTask,
  runAllTasks,
  clearAllTasks,
  cancelTask
} = useTaskList()
const {
  shopsList,
  warehousesList,
  selectedStore,
  selectedWarehouse,
  isLoadingShops,
  shopLoadError,
  isLoadingWarehouses,
  warehouseLoadError,
  shopAndWarehouseState,
  onDepartmentChange
} = useShopAndWarehouse()

// Re-create the useFormLogic composable directly inside the component
function useFormLogic() {
  const form = reactive({
    quickSelect: 'manual',
    skus: '',
    inventoryAmount: 1000,
    options: {
      importStoreProducts: false,
      enableStoreProducts: false,
      importLogisticsAttributes: false,
      enableInventoryAllocation: false,
      addInventory: false,
      enableJpSearch: false,
      importProductNames: false
    },
    payloads: {}
  })

  const logisticsOptions = reactive({
    length: '120.00',
    width: '60.00',
    height: '6.00',
    grossWeight: '0.1'
  })

  const taskOptions = [
    { key: 'importStoreProducts', label: '导入店铺商品' },
    { key: 'enableStoreProducts', label: '启用店铺商品' },
    { key: 'importLogisticsAttributes', label: '导入物流属性(参数)' },
    { key: 'enableInventoryAllocation', label: '启用库存商品分配' },
    { key: 'addInventory', label: '添加库存' },
    { key: 'enableJpSearch', label: '启用京配打标生效' },
    { key: 'importProductNames', label: '导入商品简称' }
  ]

  const initialOptionsState = JSON.parse(JSON.stringify(form.options))

  const resetOptions = () => {
    Object.assign(form.options, initialOptionsState)
  }

  return { form, logisticsOptions, taskOptions, resetOptions }
}

const { form, logisticsOptions, taskOptions, resetOptions } = useFormLogic()

const state = reactive({
  activeTab: 'tasks' // 'tasks' or 'logs'
})

// Load saved form state on component mount
onMounted(() => {
  const savedState = getWarehouseLabelingForm()
  if (savedState) {
    Object.assign(form, savedState.form)
  }
})

// Watch for changes and save them
watch(
  () => ({ form: { ...form } }),
  (newState) => {
    saveWarehouseLabelingForm({ form: newState.form })
  },
  { deep: true }
)

function updateForm(newFormState) {
  Object.assign(form, newFormState)
}

function updateLogisticsOptions(newLogisticsOptions) {
  Object.assign(logisticsOptions, newLogisticsOptions)
}

const manualTaskKeys = getAllManualTaskKeys()

const addTask = () => {
  // --- 1. 数据校验 ---
  if (!selectedStore.value || !selectedWarehouse.value) {
    return alert('请先选择店铺和仓库！')
  }
  const displaySku = form.sku.trim()
  if (!displaySku) {
    return alert('请输入有效的SKU！')
  }

  // --- 2. 准备初始上下文 (Initial Context) ---
  const storeInfo = shopsList.value.find((s) => s.shopNo === selectedStore.value)
  const warehouseInfo = warehousesList.value.find((w) => w.warehouseNo === selectedWarehouse.value)
  const initialContext = {
    sku: displaySku,
    store: storeInfo,
    warehouse: warehouseInfo,
    vendor: getSelectedVendor(),
    department: getSelectedDepartment()
  }

  // --- 3. 构建工作流 (Workflow) ---
  const workflow = []
  let taskName = ''

  if (form.quickSelect === 'manual') {
    const manualTaskKeys = getAllManualTaskKeys()
    const selectedOptions = Object.keys(form.options).filter(
      (key) => manualTaskKeys.includes(key) && form.options[key]
    )

    if (selectedOptions.length === 0) {
      return alert('请至少选择一个手动任务！')
    }

    selectedOptions.forEach((optionKey) => {
      const taskContext = {}
      if (form.payloads && form.payloads[optionKey]) {
        Object.assign(taskContext, form.payloads[optionKey])
      }
      if (optionKey === 'importLogisticsAttributes') {
        taskContext.logistics = { ...logisticsOptions }
      }
      if (optionKey === 'addInventory') {
        taskContext.inventoryAmount = form.options.inventoryAmount || 0
      }
      workflow.push({ name: optionKey, context: taskContext })
    })
    
    taskName = selectedOptions.map(key => manualTaskLabels[key] || key).join(', ')
    if (taskName.length > 30) {
        taskName = `手动任务 (${selectedOptions.length}项)`
    }

  } else { // 'workflow' mode
    const workflows = getWorkflows()
    const workflowConfig = workflows.warehouseLabeling
    taskName = '工作流: 入仓打标'
    
    workflowConfig.tasks.forEach(taskDef => {
        const taskContext = { ...taskDef.context } // 从配置中获取基础上下文
        // 特殊逻辑：根据UI状态覆盖或添加上下文
        if (taskDef.name === 'importLogisticsAttributes') {
            taskContext.logistics = { ...logisticsOptions }
        }
         if (taskDef.name === 'addInventory') {
            taskContext.inventoryAmount = form.options.inventoryAmount || 0
        }
        workflow.push({ name: taskDef.name, context: taskContext });
    });
  }

  // --- 4. 添加到任务列表 ---
  addTaskToTaskList({
    sku: displaySku,
    name: taskName,
    type: form.quickSelect,
    store: storeInfo,
    warehouse: warehouseInfo,
    // executionData 现在是后端期待的格式
    executionData: {
      workflow,
      initialContext
    }
  })
}

watch(
  () => form.quickSelect,
  (newValue) => {
    resetOptions()
    if (newValue === 'workflow') {
      const workflows = getWorkflows()
      const workflowOptions = workflows.warehouseLabeling.options
      Object.keys(form.options).forEach((key) => {
        if (workflowOptions.hasOwnProperty(key)) {
          form.options[key] = workflowOptions[key]
        }
      })
    }
  }
)

const manualTaskLabels = {
  importStoreProducts: '导入店铺商品',
  enableStoreProducts: '启用店铺商品',
  importLogisticsAttributes: '导入物流属性',
  enableInventoryAllocation: '启用库存分配',
  enableJpSearch: '启用京配打标',
  addInventory: '添加库存',
  importProductNames: '导入商品简称'
}

function handleRowClick(task) {
  selectedTask.value = task
  state.activeTab = 'logs'
}
</script>

<style scoped>
.warehouse-labeling-container {
  display: flex;
  height: 100%;
  overflow: hidden; /* 防止内容溢出 */
}
</style>
