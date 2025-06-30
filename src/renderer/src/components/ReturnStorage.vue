<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import { useTaskList } from '@/composables/useTaskList'
import TaskArea from './warehouse/TaskArea.vue'

const props = defineProps({
  isLoggedIn: Boolean
})

// --- 状态管理 ---
const form = ref({
  orderNumber: '',
  year: new Date().getFullYear().toString(),
  returnReason: ''
})

// --- 组合式函数 ---
const { shopsList, isLoadingShops, shopLoadError, selectedStore, loadShops, persistSelectedShop } =
  useShopAndWarehouse()

const { taskList, addTask, executeTask, runAllTasks, clearAllTasks } = useTaskList()

// --- 计算属性 ---
const currentShopInfo = computed(() =>
  shopsList.value.find((shop) => shop.shopNo === selectedStore.value)
)

// --- 方法 ---
const handleAddTask = () => {
  if (!currentShopInfo.value) return alert('请选择店铺')
  if (!form.value.orderNumber) return alert('请输入订单号')

  const orderNumbers = form.value.orderNumber.split(/[\n,，\\s]+/).filter((s) => s.trim())
  if (orderNumbers.length === 0) return alert('请输入有效的订单号')

  for (const orderNum of orderNumbers) {
    addTask({
      displaySku: `订单: ${orderNum}`,
      featureName: '退货入库',
      storeName: currentShopInfo.value.shopName,
      warehouseName: 'N/A',
      executionFeature: 'returnStorage',
      executionData: {
        orderNumber: orderNum,
        year: form.value.year,
        returnReason: form.value.returnReason,
        store: currentShopInfo.value
      }
    })
  }
}

// --- 侦听器和生命周期 ---
watch(
  () => props.isLoggedIn,
  (newVal) => {
    if (newVal) loadShops()
  },
  { immediate: true }
)

watch(selectedStore, (newShopNo) => {
  if (newShopNo) persistSelectedShop(newShopNo)
})

onMounted(() => {
  if (props.isLoggedIn) {
    loadShops()
  }
})
</script>

<template>
  <div v-if="isLoggedIn" class="return-storage-container">
    <div class="operation-panel">
      <h3>退货入库操作</h3>

      <div class="form-item">
        <label for="order-number">京东订单号 (可多个,换行隔开)</label>
        <textarea
          id="order-number"
          v-model="form.orderNumber"
          rows="5"
          placeholder="输入一个或多个订单号"
        ></textarea>
      </div>

      <div class="form-item">
        <label for="year">订单年份</label>
        <input id="year" v-model="form.year" type="text" />
      </div>

      <div class="form-item">
        <label for="return-reason">退货原因 (可选)</label>
        <input id="return-reason" v-model="form.returnReason" type="text" />
      </div>

      <div class="form-item">
        <label for="store-selector">选择店铺</label>
        <select id="store-selector" v-model="selectedStore">
          <option v-if="isLoadingShops" value="">加载中...</option>
          <option v-for="shop in shopsList" :key="shop.shopNo" :value="shop.shopNo">
            {{ shop.shopName }}
          </option>
        </select>
        <p v-if="shopLoadError" class="error-text">{{ shopLoadError }}</p>
      </div>

      <button class="add-task-btn" @click="handleAddTask">添加到任务列表</button>
    </div>

    <TaskArea
      :task-list="taskList"
      :is-any-task-running="false"
      active-tab="tasks"
      @execute-tasks="runAllTasks"
      @clear-tasks="clearAllTasks"
      @execute-one="executeTask"
    />
  </div>
</template>

<style scoped>
.return-storage-container {
  display: flex;
  height: 100%;
}
.operation-panel {
  flex: 0 0 380px;
  padding: 20px;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 15px;
  background: #f7f8fa;
  overflow-y: auto;
}
.form-item {
  display: flex;
  flex-direction: column;
}
label {
  margin-bottom: 5px;
  font-weight: bold;
}
input,
textarea,
select {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 100%;
}
.add-task-btn {
  padding: 10px 15px;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  align-self: flex-start;
}
.add-task-btn:hover {
  background-color: #218838;
}
.error-text {
  color: red;
  font-size: 12px;
}
</style>
