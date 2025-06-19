<script setup>
import { ref, computed, watch, onMounted, provide, onUnmounted } from 'vue'
import {
  saveSelectedShop,
  getSelectedShop,
  saveShopsList,
  getShopsList
} from '../utils/storageHelper'
import { getShopList } from '../services/apiService'

// 导入任务执行器和工具函数
import { executeOneTask, executeTasks } from '../features/warehouseLabeling/taskExecutor'
import { getStatusClass } from '../features/warehouseLabeling/utils/taskUtils'

// 导入拆分的组件
import ClearStorageOperationArea from './warehouse/ClearStorageOperationArea.vue'
import TaskArea from './warehouse/TaskArea.vue'

const props = defineProps({
  isLoggedIn: Boolean
})

const emit = defineEmits(['shop-change', 'add-task', 'execute-task', 'clear-tasks'])

// 表单数据
const form = ref({
  inputType: 'single', // 'single' 或 'store'
  sku: '',
  options: {
    clearStockAllocation: true,
    cancelJdDeliveryTag: false
  },
  selectedStore: '',
  autoStart: false,
  enableAutoUpload: false,
  fileImport: {
    file: null,
    fileName: '',
    importing: false,
    importError: '',
    importSuccess: false
  }
})

// 任务列表
const taskList = ref([])

// 店铺列表
const shopsList = ref([])
// 是否正在加载店铺列表
const isLoadingShops = ref(false)
// 店铺加载错误信息
const shopLoadError = ref('')

// 当前选中的店铺信息
const currentShopInfo = computed(() => {
  if (!form.value.selectedStore || !shopsList.value.length) return null
  return shopsList.value.find((shop) => shop.shopNo === form.value.selectedStore)
})

// 加载店铺列表
const loadShops = async () => {
  // 尝试从本地存储获取店铺列表
  const cachedShops = getShopsList()
  if (cachedShops && cachedShops.length > 0) {
    shopsList.value = cachedShops

    // 设置默认选中的店铺（如果有缓存的选择）
    const selectedShop = getSelectedShop()
    if (selectedShop) {
      form.value.selectedStore = selectedShop.shopNo
    } else if (shopsList.value.length > 0) {
      form.value.selectedStore = shopsList.value[0].shopNo
    }

    return
  }

  // 从服务器获取店铺列表
  isLoadingShops.value = true
  shopLoadError.value = ''

  try {
    // 获取店铺列表逻辑
    const shops = await getShopList()

    if (shops && shops.length > 0) {
      shopsList.value = shops
      saveShopsList(shops)

      // 默认选中第一个店铺
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

// 清空任务列表
const clearTasks = () => {
  taskList.value = []
  emit('clear-tasks')
}

// 处理店铺选择变化
const handleStoreChange = (shopNo) => {
  if (!shopNo) return

  const selectedShop = shopsList.value.find((shop) => shop.shopNo === shopNo)
  if (selectedShop) {
    saveSelectedShop(selectedShop)
    emit('shop-change', selectedShop)
  }
}

// 监听店铺选择变化
watch(
  () => form.value.selectedStore,
  (newVal) => {
    handleStoreChange(newVal)
  }
)

// 监听登录状态变化
watch(
  () => props.isLoggedIn,
  (newVal) => {
    if (newVal) {
      loadShops()
    }
  },
  { immediate: true }
)

// 组件挂载时，如果已登录则加载数据
onMounted(() => {
  // 暴露taskList到window对象，供其他模块访问
  window.clearStorageTaskList = taskList.value

  // 暴露addTaskToList方法到window对象，供批次处理使用
  window.addClearStorageTaskToList = addTaskToList

  // 加载店铺列表
  if (props.isLoggedIn) {
    loadShops()
  }
})

// 确保在组件卸载时清理全局引用
onUnmounted(() => {
  window.clearStorageTaskList = null
  window.addClearStorageTaskToList = null
})

// 执行单个任务
const handleExecuteOneTask = async (task) => {
  if (!task) return

  // 获取店铺信息
  const shopInfo = currentShopInfo.value

  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 获取任务中存储的选项
  const options = task.选项
    ? JSON.parse(JSON.stringify(task.选项))
    : JSON.parse(JSON.stringify(form.value.options))

  // 使用任务执行器模块执行任务
  try {
    await executeOneTask(task, shopInfo, options)
  } catch (error) {
    console.error('执行任务失败:', error)
    alert(`执行任务失败: ${error.message || '未知错误'}`)
  }
}

// 添加任务到任务列表 - 用于批次任务
const addTaskToList = (task) => {
  if (!task) return
  console.log('添加批次任务到任务列表:', task)

  // 检查是否是更新现有任务
  const existingTaskIndex = taskList.value.findIndex((t) => t.id === task.id)
  if (existingTaskIndex >= 0) {
    // 更新现有任务
    taskList.value[existingTaskIndex] = task
  } else {
    // 添加新任务
    taskList.value.push(task)
  }

  // 更新window.taskList
  window.clearStorageTaskList = taskList.value

  // 触发添加任务事件
  emit('add-task', task)
}

// 执行任务按钮点击处理
const executeTask = async () => {
  // 过滤出所有等待中或暂存的任务
  const tasksToExecute = taskList.value.filter(
    (task) => task.状态 === '等待中' || task.状态 === '暂存'
  )
  if (tasksToExecute.length === 0) {
    alert('没有等待中或暂存的任务')
    return
  }

  // 获取店铺信息
  const shopInfo = currentShopInfo.value
  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 使用任务执行器执行所有任务
  try {
    const result = await executeTasks(
      tasksToExecute,
      shopInfo,
      0, // 没有等待时间
      null, // 没有禁用产品
      form.value.options
    )

    // 显示执行结果
    alert(result.message)
  } catch (error) {
    console.error('批量执行任务失败:', error)
    alert(`批量执行任务失败: ${error.message || '未知错误'}`)
  }
}

// 添加任务的处理函数
const handleAddTask = () => {
  // 获取当前店铺信息
  const shopInfo = currentShopInfo.value

  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 创建日期时间标记
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })

  // 根据输入类型处理
  if (form.value.inputType === 'single') {
    // 单个SKU输入模式
    // 检查是否有输入的SKU
    if (!form.value.sku.trim()) {
      alert('请输入SKU')
      return
    }

    const skuList = form.value.sku.split(/[\n,，\s]+/).filter((sku) => sku.trim())
    if (skuList.length === 0) {
      alert('请输入有效的SKU')
      return
    }

    // 将SKU列表按2000个一组进行分割
    const BATCH_SIZE = 2000
    const skuGroups = []
    for (let i = 0; i < skuList.length; i += BATCH_SIZE) {
      skuGroups.push(skuList.slice(i, i + BATCH_SIZE))
    }

    // 为每个组创建一个任务
    skuGroups.forEach((group, index) => {
      const groupNumber = index + 1
      const task = {
        sku: `批次${groupNumber}/${skuGroups.length}(${group.length}个SKU)`,
        skuList: group, // 存储该组的所有SKU
        店铺: shopInfo ? shopInfo.shopName : '未选择',
        创建时间: timestamp,
        状态: '等待中',
        结果: '',
        选项: JSON.parse(JSON.stringify(form.value.options)),
        importLogs: [
          {
            type: 'batch-info',
            message: `批次${groupNumber}/${skuGroups.length} - 包含${group.length}个SKU`,
            timestamp: new Date().toLocaleString()
          }
        ]
      }

      // 添加任务到任务列表
      addTaskToList(task)
    })
  } else {
    // 整店SKU模式
    const task = {
      sku: `整店操作 - ${shopInfo.shopName}`,
      isWholeStore: true, // 标记为整店操作
      店铺: shopInfo.shopName,
      创建时间: timestamp,
      状态: '等待中',
      结果: '',
      选项: JSON.parse(JSON.stringify(form.value.options)),
      importLogs: [
        {
          type: 'batch-info',
          message: `整店操作 - ${shopInfo.shopName}`,
          timestamp: new Date().toLocaleString()
        }
      ]
    }

    // 添加任务到任务列表
    addTaskToList(task)
  }

  // 如果启用了自动开始，自动执行任务
  if (form.value.autoStart) {
    executeTask()
  }
}

// 处理文件变更的函数
const handleFileChange = (file) => {
  console.log('文件已变更', file.name)

  if (!file || !file.name.endsWith('.txt')) {
    alert('请选择有效的.txt文件')
    return
  }

  // 读取txt文件内容
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target.result
    // 获取文件内容，按行分割并移除空行
    const skuList = content.split(/\r?\n/).filter((line) => line.trim())
    if (skuList.length > 0) {
      // 将SKU列表设置到表单中
      form.value.sku = skuList.join('\n')
    } else {
      alert('文件内容为空或格式不正确')
    }
  }
  reader.onerror = () => {
    alert('读取文件失败')
  }
  reader.readAsText(file)
}

// 清除文件选择的函数
const handleClearFile = () => {
  // 清除文件的实现
  console.log('清除文件选择')
}

// 删除任务
const handleDeleteTask = (index) => {
  taskList.value.splice(index, 1)
}

// 使用provide向子组件提供数据和方法
provide('form', form)
provide('taskList', taskList)
provide('shopsList', shopsList)
provide('isLoadingShops', isLoadingShops)
provide('shopLoadError', shopLoadError)
provide('currentShopInfo', currentShopInfo)

// 提供方法
provide('handleAddTask', handleAddTask)
provide('handleStoreChange', handleStoreChange)
provide('handleFileChange', handleFileChange)
provide('handleClearFile', handleClearFile)
provide('executeTask', executeTask)
provide('clearTasks', clearTasks)
provide('handleExecuteOneTask', handleExecuteOneTask)
provide('handleDeleteTask', handleDeleteTask)
provide('getStatusClass', getStatusClass)
</script>

<template>
  <div class="clear-storage" v-if="props.isLoggedIn">
    <div class="content-wrapper">
      <!-- 左侧操作区域 -->
      <clear-storage-operation-area />

      <!-- 右侧任务列表区域 -->
      <task-area
        @execute="executeTask"
        @clear="clearTasks"
        @open-web="executeTask"
        @execute-one="handleExecuteOneTask"
        @delete-task="handleDeleteTask"
      />
    </div>
  </div>
  <div v-else class="login-required">请先登录</div>
</template>

<style scoped>
/* 主内容布局 */
.content-wrapper {
  display: flex;
  padding: 0;
  height: calc(100vh - 120px);
}
</style>
