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
import TaskArea from './warehouse/TaskArea.vue'

const props = defineProps({
  isLoggedIn: Boolean
})

const emit = defineEmits(['shop-change', 'add-task', 'execute-task', 'clear-tasks'])

// 表单数据
const form = ref({
  orderNumber: '',
  year: new Date().getFullYear().toString(),
  returnReason: '',
  selectedStore: '',
  autoStart: false
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
  window.returnStorageTaskList = taskList.value

  // 暴露addTaskToList方法到window对象，供批次处理使用
  window.addReturnStorageTaskToList = addTaskToList

  // 加载店铺列表
  if (props.isLoggedIn) {
    loadShops()
  }
})

// 确保在组件卸载时清理全局引用
onUnmounted(() => {
  window.returnStorageTaskList = null
  window.addReturnStorageTaskToList = null
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

  // 使用任务执行器模块执行任务
  try {
    await executeOneTask(task, shopInfo)
  } catch (error) {
    console.error('执行任务失败:', error)
    alert(`执行任务失败: ${error.message || '未知错误'}`)
  }
}

// 添加任务到任务列表
const addTaskToList = (task) => {
  if (!task) return
  console.log('添加任务到任务列表:', task)

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
  window.returnStorageTaskList = taskList.value

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
      shopInfo
    )

    // 显示执行结果
    alert(result.message)
  } catch (error) {
    console.error('批量执行任务失败:', error)
    alert(`批量执行任务失败: ${error.message || '未知错误'}`)
  }
}

// 从剪贴板导入
const importFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText();
    form.value.orderNumber = text.trim();
  } catch (err) {
    console.error('无法读取剪贴板内容:', err);
    alert('无法读取剪贴板内容');
  }
}

// 添加任务的处理函数
const handleAddTask = () => {
  // 验证必填项
  if (!form.value.orderNumber.trim()) {
    alert('请输入订单号');
    return;
  }

  if (!form.value.returnReason.trim()) {
    alert('请输入退货原因');
    return;
  }

  // 获取当前店铺信息
  const shopInfo = currentShopInfo.value
  if (!shopInfo) {
    alert('请选择店铺')
    return
  }

  // 创建日期时间标记
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })

  // 创建新任务
  const task = {
    id: `return-storage-${Date.now()}`,
    orderNumber: form.value.orderNumber.trim(),
    year: form.value.year,
    returnReason: form.value.returnReason,
    店铺: shopInfo.shopName,
    创建时间: timestamp,
    状态: '等待中',
    结果: '',
    店铺信息: shopInfo
  }

  // 添加任务到任务列表
  addTaskToList(task)

  // 清空表单
  form.value.orderNumber = '';
  form.value.returnReason = '';

  // 如果启用了自动开始，自动执行任务
  if (form.value.autoStart) {
    executeTask()
  }
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
provide('executeTask', executeTask)
provide('clearTasks', clearTasks)
provide('handleExecuteOneTask', handleExecuteOneTask)
provide('handleDeleteTask', handleDeleteTask)
provide('getStatusClass', getStatusClass)
provide('importFromClipboard', importFromClipboard)
</script>

<template>
  <div class="return-storage" v-if="props.isLoggedIn">
    <div class="content-wrapper">
      <!-- 左侧操作区域 -->
      <div class="operation-area">
        <div class="form-group">
          <label class="form-label">输入单号:</label>
          <div class="input-with-button">
            <input type="text" v-model="form.orderNumber" placeholder="请输入订单号或导入订单号" />
            <button class="btn btn-clipboard" @click="importFromClipboard">从剪贴板导入</button>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">年份:</label>
          <input type="text" v-model="form.year" class="year-input" />
        </div>
        
        <div class="form-group">
          <label class="form-label">退货原因:</label>
          <input type="text" v-model="form.returnReason" placeholder="请输入退货原因" class="reason-input" />
        </div>
        
        <div class="form-group">
          <button class="btn btn-add-task" @click="handleAddTask">添加任务</button>
        </div>
      </div>

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
.return-storage {
  height: 100%;
}

.content-wrapper {
  display: flex;
  height: calc(100vh - 120px);
}

.operation-area {
  flex: 0 0 350px;
  padding: 20px;
  background-color: #f8f9fa;
  overflow-y: auto;
  border-right: 1px solid #dee2e6;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
}

.input-with-button {
  display: flex;
}

.input-with-button input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px 0 0 4px;
  outline: none;
}

.btn-clipboard {
  background-color: #409eff;
  color: white;
  border: none;
  padding: 8px 15px;
  border-radius: 0 4px 4px 0;
  cursor: pointer;
}

.year-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
}

.reason-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
}

.btn-add-task {
  width: 100%;
  background-color: #67c23a;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.login-required {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-size: 18px;
  color: #909399;
}

/* 按钮悬停效果 */
.btn:hover {
  opacity: 0.9;
}
</style>
