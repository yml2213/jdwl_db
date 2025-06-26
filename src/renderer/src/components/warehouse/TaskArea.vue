<template>
  <div class="task-area">
    <div class="task-header">
      <div class="task-title">任务列表</div>
      <div class="task-actions">
        <button class="btn btn-info" @click="$emit('toggle-logs')">查看任务流日志</button>
        <label class="checkbox-label timing-checkbox">
          <input type="checkbox" v-model="autoStart" />
          <span>定时</span>
        </label>
        <button class="btn btn-primary" @click="$emit('open-web')">打开网页</button>
        <button class="btn btn-success" @click="$emit('execute')">批量执行</button>
        <button class="btn btn-danger" @click="$emit('clear')">清空列表</button>
      </div>
    </div>

    <div class="task-table-container">
      <tab-panel
        :tasks="props.taskList"
        :logs="logs"
        :disabled-products="disabledProducts"
        @execute-one="(task, index) => $emit('execute-one', task, index)"
        @delete-task="(index) => $emit('delete-task', index)"
        @enable-products="(products) => $emit('enable-products', products)"
      />
      <div v-if="!props.taskList || props.taskList.length === 0" class="no-tasks">
        <p>无任务数据，请先添加任务</p>
      </div>
    </div>

    <div class="task-footer">
      <label class="checkbox-label">
        <input type="checkbox" v-model="enableAutoUpload" />
        <span>启用自动验收与纸单上架</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { inject, computed } from 'vue'
import TabPanel from './TabPanel.vue'

// 只通过 props 接收任务列表，这是清晰的单向数据流
const props = defineProps({
  taskList: {
    type: Array,
    required: true
  },
  getStatusClass: {
    type: Function,
    default: () => ''
  }
})

// 注入其他需要的数据
const logs = inject('logs', [])
const disabledProducts = inject('disabledProducts', { items: [], checking: false })
const form = inject('form')

// 从表单数据中提取需要的值
const autoStart = computed({
  get: () => form.value.autoStart,
  set: (value) => (form.value.autoStart = value)
})

const enableAutoUpload = computed({
  get: () => form.value.enableAutoUpload,
  set: (value) => (form.value.enableAutoUpload = value)
})

defineEmits(['execute', 'clear', 'open-web', 'execute-one', 'delete-task', 'enable-products', 'toggle-logs'])
</script>

<style scoped>
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

.task-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid #ebeef5;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-right: 6px;
}

.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-success {
  background-color: #52c41a;
  color: white;
}

.btn-danger {
  background-color: #ff4d4f;
  color: white;
}

.btn-info {
  background-color: #17a2b8;
  color: white;
}

.btn:hover {
  opacity: 0.9;
}

.no-tasks {
  padding: 20px;
  text-align: center;
  color: #909399;
  font-size: 14px;
}
</style>
