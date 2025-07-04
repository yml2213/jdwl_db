<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useShopAndWarehouse } from '@/composables/useShopAndWarehouse'
import { useTaskList } from '@/composables/useTaskList'
import { saveReturnStorageForm, getReturnStorageForm } from '@/utils/storageHelper'
import TaskArea from './warehouse/TaskArea.vue'
import { ElButton } from 'element-plus'

// --- 状态管理 ---
const activeTab = ref('tasks')
const form = ref({
  orderNumber: '',
  year: new Date().getFullYear().toString(),
  returnReason: ''
})

// --- 组合式函数 ---
const { selectedStore, selectedVendor, selectedDepartment, loadShops, loadWarehouses } =
  useShopAndWarehouse()
const {
  taskList,
  addTask,
  executeTask,
  runAllTasks,
  clearAllTasks,
  deleteTask,
  setSelectedTask,
  activeTaskLogs
} = useTaskList()

// --- 计算属性 ---

// --- 方法 ---
const handleAddTask = () => {
  if (!form.value.orderNumber) return alert('请输入订单号')

  const orderNumbers = form.value.orderNumber.split(/[\n,，\\s]+/).filter((s) => s.trim())
  if (orderNumbers.length === 0) return alert('请输入有效的订单号')

  for (const orderNum of orderNumbers) {
    addTask({
      sku: `订单: ${orderNum}`,
      name: '退货入库',
      warehouse: { warehouseName: 'N/A' },
      executionFeature: 'returnStorage',
      executionType: 'task',
      executionData: {
        orderNumber: orderNum,
        year: form.value.year,
        returnReason: form.value.returnReason,
        store: selectedStore.value,
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
onMounted(() => {
  const savedForm = getReturnStorageForm()
  if (savedForm) {
    form.value = savedForm
  }
  loadShops()
  loadWarehouses()
})
</script>

<template>
  <div class="return-storage-container">
    <div class="operation-area">
      <div class="scrollable-content">
        <div class="form-group">
          <label class="form-label" for="order-number">京东订单号</label>
          <div class="textarea-wrapper">
            <textarea
              id="order-number"
              v-model.trim="form.orderNumber"
              placeholder="输入或粘贴订单号，支持多个，每行一个"
              class="order-textarea"
            ></textarea>
            <button class="paste-btn" @click="pasteFromClipboard">粘贴</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="year">订单年份</label>
          <input id="year" v-model="form.year" type="text" class="form-input" />
          <p class="form-item-desc">默认为当前年份，如果订单是去年的，请手动修改。</p>
        </div>

        <div class="form-group">
          <label class="form-label" for="return-reason">退货原因 (选填)</label>
          <input id="return-reason" v-model="form.returnReason" type="text" class="form-input" />
        </div>
      </div>

      <div class="form-actions">
        <button class="action-btn add-task-btn" @click="handleAddTask">添加到任务列表</button>
      </div>
    </div>

    <TaskArea
      v-model:active-tab="activeTab"
      :task-list="taskList"
      :logs="activeTaskLogs"
      :is-any-task-running="false"
      @execute-tasks="runAllTasks"
      @clear-tasks="clearAllTasks"
      @execute-one="executeTask"
      @delete-task="deleteTask"
      @select-task="setSelectedTask"
    />
  </div>
</template>

<style scoped>
.return-storage-container {
  display: flex;
  height: 100%;
}
.operation-area {
  flex: 0 0 380px;
  background: #ffffff;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
}

.scrollable-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-weight: 600;
  margin-bottom: 10px;
  color: #333;
  font-size: 14px;
}

.textarea-wrapper {
  position: relative;
}

.order-textarea {
  width: 100%;
  min-height: 120px;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  resize: vertical;
  line-height: 1.6;
  font-size: 14px;
  background-color: #f9fafb;
}
.order-textarea:focus {
  outline: none;
  border-color: #409eff;
  background-color: #fff;
}

.paste-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 12px;
  background: #e9ecef;
  border: 1px solid #ced4da;
  border-radius: 4px;
  color: #495057;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}
.paste-btn:hover {
  background-color: #dee2e6;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 14px;
}

.form-item-desc {
  font-size: 12px;
  color: #6c757d;
  margin-top: 6px;
  padding-left: 2px;
}

.form-actions {
  margin-top: auto;
  padding: 20px;
  border-top: 1px solid #e8e8e8;
}

.action-btn {
  width: 100%;
  padding: 10px 15px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.add-task-btn {
  background-color: #2563eb;
  color: white;
}
.add-task-btn:hover {
  background-color: #1d4ed8;
}
</style>
