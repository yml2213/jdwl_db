<template>
  <div class="tab-container">
    <div class="tab-header">
      <div :class="['tab', { active: activeTab === 'tasks' }]" @click="activeTab = 'tasks'">
        任务列表
      </div>
      <div :class="['tab', { active: activeTab === 'logs' }]" @click="activeTab = 'logs'">
        提交日志
      </div>
      <div
        :class="['tab', { active: activeTab === 'products' }]"
        @click="activeTab = 'products'"
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
          @delete-task="$emit('delete-task', $event)"
          @execute-one="$emit('execute-one', $event)"
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
import { ref, defineProps, defineEmits, watch } from 'vue'
import TaskListTable from './TaskListTable.vue'
import LogsTable from './LogsTable.vue'
import DisabledProducts from './feature/DisabledProducts.vue'

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  },
  logs: {
    type: Array,
    default: () => []
  },
  disabledProducts: {
    type: Object,
    default: () => ({
      items: [],
      checking: false,
      enabling: false,
      checkError: '',
      enableError: '',
      currentBatch: 0,
      totalBatches: 0,
      progress: '初始化...'
    })
  },
  isRunning: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:active-tab', 'delete-task', 'execute-one', 'enable-products'])

const activeTab = ref('tasks')

watch(
  () => props.isRunning,
  (running, wasRunning) => {
    if (running) {
      activeTab.value = 'logs'
    } else if (wasRunning && !running) {
      // 任务完成，延迟1秒后切回任务列表
      setTimeout(() => {
        activeTab.value = 'tasks'
      }, 1000)
    }
  }
)

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
}

.tab-pane {
  display: none;
  height: 100%;
}

.tab-pane.active {
  display: block;
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
