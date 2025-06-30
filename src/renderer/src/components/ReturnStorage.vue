<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import { useTaskList } from '@/composables/useTaskList'
import TaskArea from './warehouse/TaskArea.vue'
import StoreSelector from './warehouse/StoreSelector.vue'
import { ElButton } from 'element-plus'

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
const {
  shopsList,
  isLoadingShops,
  shopLoadError,
  selectedStore,
  loadShops,
  persistSelectedShop,
  selectedVendor,
  selectedDepartment
} = useShopAndWarehouse()

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
        store: currentShopInfo.value,
        vendor: selectedVendor.value,
        department: selectedDepartment.value
      }
    })
  }
}

const pasteFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      form.value.orderNumber = text
    }
  } catch (err) {
    console.error('无法从剪贴板读取内容: ', err)
    alert('无法从剪贴板读取内容，请检查浏览器权限设置。')
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
      <div class="form-content">
        <div class="form-item">
          <label for="order-number">京东订单号</label>
          <div class="input-with-button">
            <input
              id="order-number"
              v-model.trim="form.orderNumber"
              type="text"
              placeholder="输入或粘贴订单号"
            />
            <el-button type="primary" @click="pasteFromClipboard">从剪贴板导入</el-button>
          </div>
        </div>

        <div class="form-item">
          <label for="year">订单年份</label>
          <input id="year" v-model="form.year" type="text" />
          <small class="form-item-desc">默认为当前年份，如果订单是去年的，请手动修改。</small>
        </div>

        <div class="form-item">
          <label for="return-reason">退货原因</label>
          <input id="return-reason" v-model="form.returnReason" type="text" />
          <small class="form-item-desc">此项为选填。</small>
        </div>

        <div class="form-item">
          <StoreSelector
            v-model="selectedStore"
            :shops="shopsList"
            :loading="isLoadingShops"
            :error="shopLoadError"
          />
        </div>

        <div class="form-item">
          <button class="add-task-btn" @click="handleAddTask">添加到任务列表</button>
        </div>
      </div>
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
  background: #f7f8fa;
  overflow-y: auto;
}
.operation-panel h3 {
  margin-bottom: 15px;
  color: #333;
}
.form-content {
  overflow-y: auto;
  padding: 0 4px;
}
.form-item {
  display: flex;
  flex-direction: column;
  margin-bottom: 15px;
}
label {
  margin-bottom: 5px;
  font-weight: bold;
  color: #333;
}
input,
textarea,
select {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 100%;
}
.form-actions {
  margin-top: auto;
  padding-top: 15px;
  border-top: 1px solid #e8e8e8;
}
.add-task-btn {
  padding: 10px 15px;
  background-color: #16a34a;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  width: 100%;
}
.add-task-btn:hover {
  background-color: #15803d;
}
.error-text {
  color: red;
  font-size: 12px;
}
.input-with-button {
  display: flex;
  gap: 10px;
  align-items: center;
}
.paste-btn {
  padding: 8px 12px;
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.paste-btn:hover {
  background-color: #e0e0e0;
}
.form-item-desc {
  font-size: 12px;
  color: #6c757d;
  margin-top: 4px;
}
</style>
