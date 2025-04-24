<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  shopsList: Array,
  warehousesList: Array,
  isLoadingShops: Boolean,
  isLoadingWarehouses: Boolean,
  shopLoadError: String,
  warehouseLoadError: String
})

const emit = defineEmits([
  'shop-change',
  'warehouse-change',
  'add-task',
  'execute-task',
  'clear-tasks'
])

// 表单数据
const form = ref({
  quickSelect: '',
  sku: '',
  waitTime: 3,
  options: {
    useMainData: true,
    useStore: true
  },
  selectedStore: '',
  selectedWarehouse: '',
  autoStart: false
})

// 任务列表
const taskList = ref([])

// 当前选中的店铺信息
const currentShopInfo = computed(() => {
  if (!form.value.selectedStore || !props.shopsList.length) return null
  return props.shopsList.find((shop) => shop.shopNo === form.value.selectedStore)
})

// 当前选中的仓库信息
const currentWarehouseInfo = computed(() => {
  if (!form.value.selectedWarehouse || !props.warehousesList.length) return null
  return props.warehousesList.find(
    (warehouse) => warehouse.warehouseNo === form.value.selectedWarehouse
  )
})

// 添加任务方法
const addTask = () => {
  if (!form.value.sku) {
    alert('请输入SKU')
    return
  }

  if (!form.value.selectedStore) {
    alert('请选择店铺')
    return
  }

  if (!form.value.selectedWarehouse) {
    alert('请选择仓库')
    return
  }

  const shopInfo = currentShopInfo.value
  const warehouseInfo = currentWarehouseInfo.value

  taskList.value.push({
    sku: form.value.sku,
    店铺: shopInfo ? shopInfo.shopName : form.value.selectedStore,
    仓库: warehouseInfo ? warehouseInfo.warehouseName : form.value.selectedWarehouse,
    创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    状态: '等待中'
  })

  // 清空SKU输入
  form.value.sku = ''

  // 通知父组件
  emit('add-task')
}

// 导入方法
const handleImport = () => {
  if (!form.value.sku) {
    alert('请输入SKU')
    return
  }

  if (!form.value.selectedStore) {
    alert('请选择店铺')
    return
  }

  addTask()
}

// 执行任务
const executeTask = () => {
  emit('execute-task')
}

// 清空任务列表
const clearTasks = () => {
  taskList.value = []
  emit('clear-tasks')
}

// 监听店铺选择变化
watch(
  () => form.value.selectedStore,
  (newVal) => {
    emit('shop-change', newVal)
  }
)

// 监听仓库选择变化
watch(
  () => form.value.selectedWarehouse,
  (newVal) => {
    emit('warehouse-change', newVal)
  }
)

// 初始化店铺和仓库选择
watch(
  () => props.shopsList,
  (newList) => {
    if (newList && newList.length > 0 && !form.value.selectedStore) {
      form.value.selectedStore = newList[0].shopNo
    }
  },
  { immediate: true }
)

watch(
  () => props.warehousesList,
  (newList) => {
    if (newList && newList.length > 0 && !form.value.selectedWarehouse) {
      form.value.selectedWarehouse = newList[0].warehouseNo
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="content-wrapper">
    <!-- 左侧操作区域 -->
    <div class="operation-area">
      <div class="form-group">
        <label class="form-label">快捷选择</label>
        <div class="select-wrapper">
          <select v-model="form.quickSelect" class="form-select">
            <option value="">请选择快捷方式</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">输入SKU</label>
        <div class="input-group">
          <input
            v-model="form.sku"
            placeholder="请输入sku或导入sku"
            class="form-input"
            @keyup.enter="handleImport"
          />
          <button class="btn btn-primary" @click="handleImport">导入</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">等待时间</label>
        <div class="input-number-group">
          <button class="btn-dec" @click="form.waitTime > 1 ? form.waitTime-- : 1">-</button>
          <input type="number" v-model="form.waitTime" min="1" class="form-input-number" />
          <button class="btn-inc" @click="form.waitTime++">+</button>
          <span class="unit">秒</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">功能选项</label>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useMainData" />
            <span>启用商品主数据</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useStore" />
            <span>启用店铺商品</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">选择店铺</label>
        <div class="select-wrapper">
          <select v-model="form.selectedStore" class="form-select" :disabled="isLoadingShops">
            <option value="" disabled>请选择店铺</option>
            <option v-for="shop in shopsList" :key="shop.shopNo" :value="shop.shopNo">
              {{ shop.shopName }}
            </option>
          </select>
          <div v-if="isLoadingShops" class="loading-indicator">加载中...</div>
          <div v-if="shopLoadError" class="error-message">{{ shopLoadError }}</div>
          <div v-if="currentShopInfo" class="shop-info">
            <small>店铺编号: {{ currentShopInfo.shopNo }}</small>
            <small>类型: {{ currentShopInfo.typeName }} - {{ currentShopInfo.bizTypeName }}</small>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">选择仓库</label>
        <div class="select-wrapper">
          <select
            v-model="form.selectedWarehouse"
            class="form-select"
            :disabled="isLoadingWarehouses"
          >
            <option value="" disabled>请选择仓库</option>
            <option
              v-for="warehouse in warehousesList"
              :key="warehouse.warehouseNo"
              :value="warehouse.warehouseNo"
            >
              {{ warehouse.warehouseName }}
            </option>
          </select>
          <div v-if="isLoadingWarehouses" class="loading-indicator">加载中...</div>
          <div v-if="warehouseLoadError" class="error-message">{{ warehouseLoadError }}</div>
          <div v-if="currentWarehouseInfo" class="warehouse-info">
            <small>仓库编号: {{ currentWarehouseInfo.warehouseNo }}</small>
            <small>类型: {{ currentWarehouseInfo.warehouseTypeStr }}</small>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-default">保存快捷</button>
        <button class="btn btn-success" @click="addTask">添加任务</button>
      </div>
    </div>

    <!-- 右侧任务列表区域 -->
    <div class="task-area">
      <div class="task-header">
        <div class="task-title">清库下标任务列表</div>
        <div class="task-actions">
          <label class="checkbox-label timing-checkbox">
            <input type="checkbox" v-model="form.autoStart" />
            <span>定时</span>
          </label>
          <button class="btn btn-primary" @click="executeTask">打开网页</button>
          <button class="btn btn-success" @click="executeTask">执行任务</button>
          <button class="btn btn-danger" @click="clearTasks">清空列表</button>
        </div>
      </div>

      <div class="task-table-container">
        <table class="task-table">
          <thead>
            <tr>
              <th style="width: 40px"><input type="checkbox" /></th>
              <th>SKU</th>
              <th>店铺</th>
              <th>仓库</th>
              <th>创建时间</th>
              <th>状态</th>
              <th>结果</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(task, index) in taskList" :key="index">
              <td><input type="checkbox" /></td>
              <td>{{ task.sku }}</td>
              <td>{{ task.店铺 }}</td>
              <td>{{ task.仓库 }}</td>
              <td>{{ task.创建时间 }}</td>
              <td>
                <span class="status-tag">{{ task.状态 }}</span>
              </td>
              <td>
                <span v-if="task.状态 === '等待中'">等待执行...</span>
              </td>
              <td>
                <button class="btn btn-small btn-danger" @click="taskList.splice(index, 1)">
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="taskList.length === 0">
              <td colspan="8" class="no-data">No Data</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
