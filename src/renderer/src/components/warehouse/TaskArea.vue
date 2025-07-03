<template>
  <div class="task-area">
    <div class="actions-header">
      <button
        class="action-btn execute-btn"
        @click="$emit('execute-tasks')"
        :disabled="isRunning || taskList.length === 0"
      >
        {{ isRunning ? '执行中...' : '批量执行' }}
      </button>
      <button
        class="action-btn clear-btn"
        @click="$emit('clear-tasks')"
        :disabled="isRunning || taskList.length === 0"
      >
        清空列表
      </button>
    </div>
    <TabPanel
      :tasks="taskList"
      :logs="logs"
      :active-tab="activeTab"
      @update:active-tab="$emit('update:active-tab', $event)"
      @delete-task="$emit('delete-task', $event)"
      @execute-one="$emit('execute-one', $event)"
      @update:selected="updateSelectedTasks"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TabPanel from './TabPanel.vue'

defineProps({
  taskList: {
    type: Array,
    required: true
  },
  logs: {
    type: Array,
    default: () => []
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  activeTab: {
    type: String,
    default: 'tasks'
  }
})

defineEmits(['execute-tasks', 'clear-tasks', 'delete-task', 'update:active-tab', 'execute-one'])

const selectedTaskIds = ref([])

const updateSelectedTasks = (ids) => {
  selectedTaskIds.value = ids
  console.log('Selected tasks updated in TaskArea:', selectedTaskIds.value)
}
</script>

<style scoped>
.task-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 0 20px 20px 20px;
  background-color: #fff;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.actions-header {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 15px 0;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 15px;
}

.action-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.execute-btn {
  background-color: #16a34a;
  color: white;
}
.execute-btn:not(:disabled):hover {
  background-color: #15803d;
}

.clear-btn {
  background-color: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}
.clear-btn:not(:disabled):hover {
  background-color: #fee2e2;
}

.task-area > :deep(.tab-container) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
