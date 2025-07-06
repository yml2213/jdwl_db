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
  getWorkflows,
  taskDependencies // 导入新的依赖关系定义
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
  const skuInput = (form.skus || '').trim()
  if (!skuInput) {
    return alert('请输入有效的SKU！')
  }

  // --- 2. 准备用于显示和后端的SKU ---
  const skusAsArray = skuInput.split(/[\n,，\\s]+/).filter((s) => s.trim())
  const skuForDisplay =
    skusAsArray.length > 1 ? `批量任务 (${skusAsArray.length}个SKU)` : skusAsArray[0]

  // --- 3. 准备初始上下文 (Initial Context) ---
  const storeInfo = shopsList.value.find((s) => s.shopNo === selectedStore.value)
  const warehouseInfo = warehousesList.value.find((w) => w.warehouseNo === selectedWarehouse.value)
  const initialContext = {
    sku: skuInput, // 原始SKU字符串
    skus: skusAsArray, // 解析后的SKU数组，供需要数组的任务使用
    store: storeInfo,
    warehouse: warehouseInfo,
    vendor: getSelectedVendor(),
    department: getSelectedDepartment()
  }

  // --- 4. 构建工作流 (Workflow) ---
  // 新的编排器需要一个 `stages` 数组
  let stages = [];
  let taskNameForUI = '';

  if (form.quickSelect === 'manual') {
    const manualTaskKeys = getAllManualTaskKeys()
    const selectedOptions = Object.keys(form.options).filter(
      (key) => manualTaskKeys.includes(key) && form.options[key]
    )

    if (selectedOptions.length === 0) {
      return alert('请至少选择一个手动任务！')
    }

    // 检查并注入依赖
    const requiredDependencies = new Set();
    selectedOptions.forEach(option => {
        if (taskDependencies[option]) {
            requiredDependencies.add(taskDependencies[option]);
        }
    });

    const dependencyTasks = Array.from(requiredDependencies).map(depName => ({
        name: depName,
        context: {},
        source: 'initial'
    }));

    const manualTasks = selectedOptions.map(optionKey => {
      const taskContext = {};
      if (form.payloads && form.payloads[optionKey]) {
        Object.assign(taskContext, form.payloads[optionKey]);
      }
      if (optionKey === 'importLogisticsAttributes') {
        taskContext.logisticsOptions = { ...logisticsOptions };
      }
      if (optionKey === 'addInventory') {
        taskContext.inventoryAmount = form.inventoryAmount || 1000;
      }
      
      // 如果任务有依赖，将其 source 指向依赖项
      const source = taskDependencies[optionKey] || 'initial';
      return { name: optionKey, context: taskContext, source };
    });

    // 构建阶段
    if (dependencyTasks.length > 0) {
        stages.push({
            name: '阶段 1: 自动处理依赖项',
            tasks: dependencyTasks
        });
        stages.push({
            name: '阶段 2: 执行手动选择的任务',
            tasks: manualTasks
        });
    } else {
        stages.push({
            name: '手动执行的任务',
            tasks: manualTasks
        });
    }

    const taskOptionLabels = taskOptions.reduce((acc, opt) => {
        acc[opt.key] = opt.label;
        return acc;
    }, {});

    taskNameForUI = selectedOptions.map((key) => taskOptionLabels[key] || key).join(', ');
    if (taskNameForUI.length > 30) {
      taskNameForUI = `手动任务 (${selectedOptions.length}项)`;
    }
  } else {
    // 'workflow' mode, e.g., 'warehouseLabeling'
    const workflows = getWorkflows();
    const workflowConfig = workflows[form.quickSelect];
    if (!workflowConfig || !workflowConfig.stages) {
        return alert('选择的工作流配置无效或缺少阶段定义。');
    }
    taskNameForUI = workflowConfig.name || `工作流: ${form.quickSelect}`;

    // 深拷贝配置中的 stages，以避免修改原始对象
    stages = JSON.parse(JSON.stringify(workflowConfig.stages));

    // 遍历 stages 为需要动态上下文的任务注入数据
    stages.forEach(stage => {
        stage.tasks.forEach(task => {
            if (!task.context) task.context = {};
            if (task.name === 'importLogisticsAttributes') {
                task.context.logisticsOptions = { ...logisticsOptions };
            }
            if (task.name === 'addInventory') {
                task.context.inventoryAmount = form.inventoryAmount || 1000;
            }
        });
    });
  }

  // --- 5. 添加到任务列表 ---
  addTaskToTaskList({
    sku: skuForDisplay, // 用于UI显示
    name: taskNameForUI,
    type: form.quickSelect,
    store: storeInfo,
    warehouse: warehouseInfo,
    // executionData 现在是后端期待的格式
    executionData: {
      stages,
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
  height: calc(100vh - 120px);
  padding: 10px;
  gap: 10px;
  background-color: #f0f2f5;
  overflow: hidden;
}
</style>
