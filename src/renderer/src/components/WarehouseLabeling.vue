<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  saveSelectedShop,
  getSelectedShop,
  saveShopsList,
  getShopsList,
  saveSelectedWarehouse,
  getSelectedWarehouse,
  saveWarehousesList,
  getWarehousesList,
  getSelectedDepartment,
  getSelectedVendor
} from '../utils/storageHelper'
import { getShopList, getWarehouseList } from '../services/apiService'

const props = defineProps({
  isLoggedIn: Boolean
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
  waitTime: 5,
  options: {
    importStore: true,
    useStore: true,
    importProps: false,
    useMainData: false,
    useWarehouse: false,
    useJdEffect: false,
    importTitle: false,
    useBatchManage: false
  },
  enablePurchase: false,
  purchaseQuantity: 1,
  selectedStore: '',
  selectedWarehouse: '',
  autoStart: false,
  enableAutoUpload: false
})

// 任务列表
const taskList = ref([])

// 店铺列表
const shopsList = ref([])
// 是否正在加载店铺列表
const isLoadingShops = ref(false)
// 店铺加载错误信息
const shopLoadError = ref('')

// 仓库列表
const warehousesList = ref([])
// 是否正在加载仓库列表
const isLoadingWarehouses = ref(false)
// 仓库加载错误信息
const warehouseLoadError = ref('')

// 当前选中的店铺信息
const currentShopInfo = computed(() => {
  if (!form.value.selectedStore || !shopsList.value.length) return null
  return shopsList.value.find((shop) => shop.shopNo === form.value.selectedStore)
})

// 当前选中的仓库信息
const currentWarehouseInfo = computed(() => {
  if (!form.value.selectedWarehouse || !warehousesList.value.length) return null
  return warehousesList.value.find(
    (warehouse) => warehouse.warehouseNo === form.value.selectedWarehouse
  )
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
    // 获取当前选择的事业部ID
    const department = getSelectedDepartment()
    if (!department || !department.deptNo) {
      shopLoadError.value = '未选择事业部，无法获取店铺列表'
      isLoadingShops.value = false
      return
    }

    // 使用事业部ID获取店铺列表
    const deptId = department.deptNo.replace('CBU', '')
    const shops = await getShopList(deptId)

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

// 加载仓库列表
const loadWarehouses = async () => {
  // 尝试从本地存储获取仓库列表
  const cachedWarehouses = getWarehousesList()
  if (cachedWarehouses && cachedWarehouses.length > 0) {
    warehousesList.value = cachedWarehouses

    // 设置默认选中的仓库（如果有缓存的选择）
    const selectedWarehouse = getSelectedWarehouse()
    if (selectedWarehouse) {
      form.value.selectedWarehouse = selectedWarehouse.warehouseNo
    } else if (warehousesList.value.length > 0) {
      form.value.selectedWarehouse = warehousesList.value[0].warehouseNo
    }

    return
  }

  // 从服务器获取仓库列表
  isLoadingWarehouses.value = true
  warehouseLoadError.value = ''

  try {
    // 获取当前选择的供应商和事业部ID
    const vendor = getSelectedVendor()
    const department = getSelectedDepartment()

    if (!vendor || !vendor.id || !department || !department.sellerId || !department.deptNo) {
      warehouseLoadError.value = '未选择供应商或事业部，无法获取仓库列表'
      isLoadingWarehouses.value = false
      return
    }

    // 获取sellerId和deptId
    const sellerId = department.sellerId
    const deptId = department.deptNo.replace('CBU', '')

    // 使用sellerId和deptId获取仓库列表
    const warehouses = await getWarehouseList(sellerId, deptId)

    if (warehouses && warehouses.length > 0) {
      warehousesList.value = warehouses
      saveWarehousesList(warehouses)

      // 默认选中第一个仓库
      form.value.selectedWarehouse = warehouses[0].warehouseNo
      saveSelectedWarehouse(warehouses[0])
    } else {
      warehouseLoadError.value = '未找到任何仓库'
    }
  } catch (error) {
    console.error('加载仓库失败:', error)
    warehouseLoadError.value = `加载仓库失败: ${error.message || '未知错误'}`
  } finally {
    isLoadingWarehouses.value = false
  }
}

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

  if (!form.value.selectedWarehouse) {
    alert('请选择仓库')
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

// 处理店铺选择变化
const handleStoreChange = (shopNo) => {
  if (!shopNo) return

  const selectedShop = shopsList.value.find((shop) => shop.shopNo === shopNo)
  if (selectedShop) {
    saveSelectedShop(selectedShop)
    emit('shop-change', selectedShop)
  }
}

// 处理仓库选择变化
const handleWarehouseChange = (warehouseNo) => {
  if (!warehouseNo) return

  const selectedWarehouse = warehousesList.value.find(
    (warehouse) => warehouse.warehouseNo === warehouseNo
  )
  if (selectedWarehouse) {
    saveSelectedWarehouse(selectedWarehouse)
    emit('warehouse-change', selectedWarehouse)
  }
}

// 监听店铺选择变化
watch(
  () => form.value.selectedStore,
  (newVal) => {
    handleStoreChange(newVal)
  }
)

// 监听仓库选择变化
watch(
  () => form.value.selectedWarehouse,
  (newVal) => {
    handleWarehouseChange(newVal)
  }
)

// 监听登录状态变化
watch(
  () => props.isLoggedIn,
  (newVal) => {
    if (newVal) {
      loadShops()
      loadWarehouses()
    }
  },
  { immediate: true }
)

// 组件挂载时，如果已登录则加载数据
onMounted(() => {
  if (props.isLoggedIn) {
    loadShops()
    loadWarehouses()
  }
})
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
            <input type="checkbox" v-model="form.options.importStore" />
            <span>导入店铺商品</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useStore" />
            <span>启用店铺商品</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.importProps" />
            <span>导入物流属性</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useMainData" />
            <span>启用商品主数据</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useWarehouse" />
            <span>启用库存商品分配</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useJdEffect" />
            <span>启用京配打标生效</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.importTitle" />
            <span>导入商品简称</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.options.useBatchManage" />
            <span>启用批次管理</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">采购入库</label>
        <div class="purchase-input-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.enablePurchase" />
            <span>启用采购入库</span>
          </label>
          <div class="number-input">
            <input
              type="number"
              v-model="form.purchaseQuantity"
              min="1"
              :disabled="!form.enablePurchase"
              class="form-input-number"
            />
          </div>
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
        <div class="task-title">任务列表</div>
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

      <div class="task-footer">
        <label class="checkbox-label">
          <input type="checkbox" v-model="form.enableAutoUpload" />
          <span>启用自动验收与纸单上架</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style>
/* 主内容布局 */
.content-wrapper {
  display: flex;
  padding: 0;
  height: calc(100vh - 120px);
}

/* 操作区域 */
.operation-area {
  flex: 0 0 380px;
  background: #fff;
  padding: 20px;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  color: #606266;
  font-weight: 500;
}

.form-select {
  width: 100%;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
  color: #606266;
}

.select-wrapper {
  position: relative;
}

.loading-indicator {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.error-message {
  font-size: 12px;
  color: #f56c6c;
  margin-top: 5px;
}

.shop-info,
.warehouse-info {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  display: flex;
  flex-direction: column;
}

.input-group {
  display: flex;
  gap: 10px;
}

.form-input {
  flex: 1;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
}

.input-number-group {
  display: flex;
  align-items: center;
}

.form-input-number {
  width: 80px;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
  text-align: center;
}

.btn-dec,
.btn-inc {
  width: 36px;
  height: 36px;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
  font-size: 16px;
  cursor: pointer;
}

.btn-dec {
  border-radius: 4px 0 0 4px;
}

.btn-inc {
  border-radius: 0 4px 4px 0;
}

.unit {
  margin-left: 8px;
  color: #606266;
}

.checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-right: 6px;
}

.purchase-input-group {
  display: flex;
  align-items: center;
  gap: 20px;
}

.number-input {
  flex: 0 0 120px;
}

.form-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

/* 任务区域 */
.task-area {
  flex: 1;
  background: #fff;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.task-title {
  font-size: 16px;
  font-weight: bold;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.timing-checkbox {
  margin-right: 5px;
}

.task-table-container {
  flex: 1;
  overflow: auto;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
}

.task-table th,
.task-table td {
  border-bottom: 1px solid #ebeef5;
  padding: 12px 0;
  text-align: left;
}

.task-table th {
  color: #909399;
  font-weight: 500;
  padding-bottom: 8px;
}

.status-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 2px;
  background-color: #e1f5fe;
  color: #039be5;
}

.no-data {
  text-align: center;
  color: #909399;
  padding: 30px 0;
}

.task-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid #ebeef5;
}

/* 按钮样式 */
.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-success {
  background-color: #4caf50;
  color: white;
}

.btn-danger {
  background-color: #f44336;
  color: white;
}

.btn-default {
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  color: #606266;
}

.btn:hover {
  opacity: 0.9;
}
</style>
