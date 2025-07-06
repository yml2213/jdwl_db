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

function addTask() {
  const skusAsArray = form.skus.split(/[\n,，\s]+/).filter((sku) => sku.trim())
  if (
    skusAsArray.length === 0 &&
    form.quickSelect !== 'manual' &&
    !form.options.importProductNames
  ) {
    return alert('请输入有效的SKU')
  }

  const storeInfo = shopsList.value.find((s) => s.shopNo === selectedStore.value)
  const warehouseInfo = warehousesList.value.find((w) => w.warehouseNo === selectedWarehouse.value)
  const vendorInfo = getSelectedVendor()
  const departmentInfo = getSelectedDepartment()

  if (!storeInfo) return alert('请选择店铺')
  if (!warehouseInfo) return alert('请选择仓库')
  if (!vendorInfo) return alert('缺少供应商信息，请重新登录')
  if (!departmentInfo) return alert('缺少事业部信息，请重新登录')

  const vendor = {
    ...vendorInfo,
    id: vendorInfo.id || vendorInfo.supplierNo
  }

  const baseExecutionData = {
    store: {
      ...storeInfo,
      name: storeInfo.shopName,
      spShopNo: storeInfo.spShopNo || storeInfo.shopNo
    },
    warehouse: warehouseInfo,
    skus: skusAsArray,
    vendor: vendor,
    department: departmentInfo
  }

  const displaySku = skusAsArray.length > 1 ? `批量(${skusAsArray.length})` : skusAsArray[0]

  if (form.quickSelect === 'manual') {
    const selectedOptions = Object.keys(form.options).filter(
      (key) => manualTaskKeys.includes(key) && form.options[key]
    )

    if (selectedOptions.length === 0) {
      return alert('请至少选择一个手动任务！')
    }

    selectedOptions.forEach((optionKey) => {
      const stepPayload = { ...baseExecutionData }
      if (form.payloads && form.payloads[optionKey]) {
        Object.assign(stepPayload, form.payloads[optionKey])
      }
      if (optionKey === 'importLogisticsAttributes') {
        stepPayload.logistics = { ...logisticsOptions }
      }
      if (optionKey === 'addInventory') {
        stepPayload.inventoryAmount = form.options.inventoryAmount || 0
      }

      addTaskToTaskList({
        sku: displaySku,
        name: manualTaskLabels[optionKey] || optionKey,
        type: 'manual',
        store: storeInfo,
        warehouse: warehouseInfo,
        executionType: 'task',
        executionFeature: optionKey,
        executionData: stepPayload
      })
    })
  } else {
    // For workflow, we need to pass the options and logistics data
    const workflowExecutionData = {
      ...baseExecutionData,
      options: { ...form.options },
      logistics: { ...logisticsOptions }
    }

    addTaskToTaskList({
      sku: displaySku,
      name: '工作流: 入仓打标',
      type: 'workflow',
      store: storeInfo,
      warehouse: warehouseInfo,
      executionType: 'flow',
      executionFeature: 'warehouseLabeling',
      executionData: workflowExecutionData
    })
  }
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
