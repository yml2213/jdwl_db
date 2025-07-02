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
      :logs="logs"
      @execute-tasks="runAllTasks"
      @clear-tasks="clearAllTasks"
      @delete-task="deleteTask"
      @execute-one="executeTask"
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
  getAllManualTaskKeys
} from '../features/warehouseLabeling/taskConfiguration'
import {
  getSelectedVendor,
  getSelectedDepartment,
  saveWarehouseLabelingForm,
  getWarehouseLabelingForm
} from '../utils/storageHelper'

const {
  taskList: tasks,
  addTask: addTaskToTaskList,
  executeTask,
  deleteTask,
  runAllTasks,
  clearAllTasks
} = useTaskList()
const logs = ref([])
const {
  shopsList,
  warehousesList,
  selectedStore,
  selectedWarehouse,
  isLoadingShops,
  shopLoadError,
  isLoadingWarehouses,
  warehouseLoadError
} = useShopAndWarehouse()

const form = reactive(getInitialFormState())
const logisticsOptions = reactive({
  length: '120.00',
  width: '60.00',
  height: '6.00',
  grossWeight: '0.1'
})

// Load saved form state on component mount
onMounted(() => {
  const savedState = getWarehouseLabelingForm()
  if (savedState) {
    Object.assign(form, savedState.form)
    Object.assign(logisticsOptions, savedState.logisticsOptions)
  }
})

// Watch for changes and save them
watch(
  () => ({ form: { ...form }, logisticsOptions: { ...logisticsOptions } }),
  (newState) => {
    saveWarehouseLabelingForm(newState)
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
  const skusAsArray = form.sku.split(/[\n,，\s]+/).filter((sku) => sku.trim())
  if (skusAsArray.length === 0 && form.quickSelect !== 'manual' && !form.options.importProductNames) {
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
    const selectedOptions = Object.keys(form.options)
      .filter((key) => manualTaskKeys.includes(key) && form.options[key])
      
    if (selectedOptions.length === 0) {
      return alert('请至少选择一个手动任务！')
    }

    selectedOptions.forEach(optionKey => {
      const stepPayload = { ...baseExecutionData };
      if (form.payloads[optionKey]) {
        Object.assign(stepPayload, form.payloads[optionKey]);
      }
      if (optionKey === 'importLogisticsAttributes') {
        Object.assign(stepPayload, logisticsOptions);
      }
      if (optionKey === 'addInventory') {
        stepPayload.inventoryAmount = form.options.inventoryAmount || 0;
      }

      addTaskToTaskList({
        sku: displaySku,
        name: manualTaskLabels[optionKey] || optionKey,
        type: 'manual',
        store: storeInfo,
        warehouse: warehouseInfo,
        executionType: 'task',
        executionFeature: optionKey,
        executionData: stepPayload,
      });
    });

  } else {
    addTaskToTaskList({
      sku: displaySku,
      name: '工作流: 入仓打标',
      type: 'workflow',
      store: storeInfo,
      warehouse: warehouseInfo,
      executionType: 'flow',
      executionFeature: 'warehouseLabeling',
      executionData: baseExecutionData
    })
  }
}

watch(
  () => form.quickSelect,
  (newValue) => {
    if (newValue !== 'manual') {
      const initialOptions = getInitialFormState().options
      Object.keys(form.options).forEach((key) => {
        form.options[key] = initialOptions[key] ?? false
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
</script>

<style scoped>
.warehouse-labeling-container {
  display: flex;
  height: 100%;
}
</style>
