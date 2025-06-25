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
import { executeTasks, executeOneTask } from '../features/warehouseLabeling/taskExecutor'
import { getStatusClass } from '../features/warehouseLabeling/utils/taskUtils'

import TaskArea from './warehouse/TaskArea.vue'
import ClearStorageOperationArea from './warehouse/ClearStorageOperationArea.vue'

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
      handleExecuteTasks()
    }
    return
  }

  // 以下是SKU模式的处理
  const skuList = form.value.sku.split(/[\n,，\s]+/).filter((sku) => sku.trim())
  if (skuList.length === 0) {
    alert('请输入有效的SKU')
    return
  }

  console.log('处理SKU列表, 数量:', skuList.length, '前5个SKU:', skuList.slice(0, 5))

  const BATCH_SIZE = 2000
  for (let i = 0; i < skuList.length; i += BATCH_SIZE) {
    const batch = skuList.slice(i, i + BATCH_SIZE)
    const task = {
      id: `batch-${Date.now()}-${i / BATCH_SIZE}`,
      sku: `批次 ${i / BATCH_SIZE + 1} (${batch.length}个SKU)`,
      skuList: batch,
      店铺: shopInfo.shopName,
      创建时间: timestamp,
      状态: '等待中',
      结果: '',
      功能: featureName,
      选项: JSON.parse(JSON.stringify(form.value.options)),
      店铺信息: shopInfo,
      事业部信息: deptInfo
    }
    addTaskToList(task)
    console.log(`添加批次${i / BATCH_SIZE + 1}任务成功, 包含${batch.length}个SKU`)
  }

  if (form.value.autoStart) {
    handleExecuteTasks()
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

const handleExecuteOneTask = async (task) => {
  const shopInfo = currentShopInfo.value
  if (!shopInfo) {
    alert('请选择店铺')
    return
  }
  await executeOneTask(task, shopInfo, task.选项)
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

// 处理店铺选择变更事件
const handleShopChange = (selectedShop) => {
  if (selectedShop && selectedShop.shopNo) {
    form.value.selectedStore = selectedShop.shopNo
    saveSelectedShop(selectedShop)
    emit('shop-change', selectedShop)
  }
}

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
</script>

<template>
  <div class="inventory-clearance" v-if="props.isLoggedIn">
    <div class="clearance-container">
      <ClearStorageOperationArea @shop-change="handleShopChange" />
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
</style>
