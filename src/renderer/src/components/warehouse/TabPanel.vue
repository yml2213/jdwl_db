<template>
  <div class="tab-container">
    <div class="tab-header">
      <div
        :class="['tab', { active: activeTab === 'tasks' }]"
        @click="$emit('update:active-tab', 'tasks')"
      >
        任务列表
      </div>
      <div
        :class="['tab', { active: activeTab === 'logs' }]"
        @click="$emit('update:active-tab', 'logs')"
      >
        提交日志
      </div>
      <div
        :class="['tab', { active: activeTab === 'products' }]"
        @click="$emit('update:active-tab', 'products')"
        v-if="disabledProducts.items.length > 0 || disabledProducts.checking"
      >
        停用商品
        <span v-if="disabledProducts.items.length > 0" class="badge">
          {{ disabledProducts.items.length }}
        </span>
      </div>
    </div>
    <div class="tab-content">
      <div :class="['tab-pane', { active: activeTab === 'tasks' }]">
        <task-list-table
          v-if="activeTab === 'tasks'"
          :tasks="tasks"
          :countdown-timers="countdownTimers"
          @delete-task="$emit('delete-task', $event)"
          @execute-one="$emit('execute-one', $event)"
          @update:selected="$emit('update:selected', $event)"
          @select-task="$emit('select-task', $event)"
          @cancel-task="$emit('cancel-task', $event)"
        />
      </div>
      <div :class="['tab-pane', { active: activeTab === 'logs' }]">
        <logs-table :logs="logs" />
      </div>
      <div :class="['tab-pane', { active: activeTab === 'products' }]">
        <disabled-products v-bind="disabledProducts" @enable-products="onEnableProducts" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import TaskListTable from './TaskListTable.vue'
import LogsTable from './LogsTable.vue'
import DisabledProducts from './feature/DisabledProducts.vue'

defineProps({
  tasks: Array,
  logs: Array,
  disabledProducts: {
    type: Object,
    default: () => ({
      items: [],
      checking: false,
      enabling: false,
      checkError: '',
      enableError: ''
    })
  },
  activeTab: String,
  countdownTimers: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits([
  'update:active-tab',
  'delete-task',
  'execute-one',
  'enable-products',
  'update:selected',
  'select-task',
  'cancel-task'
])

const onEnableProducts = (products) => {
  emit('enable-products', products)
}
</script>

<style scoped>
.tab-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-header {
  display: flex;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 10px;
}

.tab {
  padding: 8px 16px;
  cursor: pointer;
  color: #606266;
  font-size: 14px;
  position: relative;
}

.tab.active {
  color: #2196f3;
  border-bottom: 2px solid #2196f3;
  margin-bottom: -1px;
}

.tab-content {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.tab-pane {
  display: none;
  height: 100%;
  overflow: hidden;
}

.tab-pane.active {
  display: block;
  display: flex;
  flex-direction: column;
}

/* 确保日志面板占满可用空间 */
.tab-pane.active > .logs-container {
  flex: 1;
  min-height: 0; /* 重要：允许flex子项收缩 */
  max-height: calc(100vh - 160px);
}

.badge {
  background-color: #f56c6c;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 12px;
  margin-left: 5px;
}
</style>
