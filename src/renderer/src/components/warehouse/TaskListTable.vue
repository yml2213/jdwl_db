<template>
  <div class="task-list-container">
    <table class="task-table">
      <thead>
        <tr>
          <th class="task-header-cell checkbox-cell">
            <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
          </th>
          <th class="task-header-cell">SKU</th>
          <th class="task-header-cell">功能名称</th>
          <th class="task-header-cell">店铺</th>
          <th class="task-header-cell">仓库</th>
          <th class="task-header-cell">创建时间</th>
          <th class="task-header-cell">状态</th>
          <th class="task-header-cell">结果</th>
          <th class="task-header-cell actions-header-cell">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="tasks.length === 0">
          <td colspan="9" class="no-tasks-row">暂无任务</td>
        </tr>
        <tr
          v-for="task in tasks"
          :key="task.id"
          class="task-row"
          @click="$emit('select-task', task)"
        >
          <td class="task-cell checkbox-cell">
            <input type="checkbox" v-model="selectedTasks" :value="task.id" />
          </td>
          <td class="task-cell">{{ task.sku }}</td>
          <td class="task-cell">{{ task.name }}</td>
          <td class="task-cell">{{ task.store?.shopName }}</td>
          <td class="task-cell">{{ task.warehouse?.warehouseName }}</td>
          <td class="task-cell">{{ task.createdAt }}</td>
          <td class="task-cell status-cell">
            <div class="status-content">
              <el-icon v-if="task.isWaiting" class="is-loading" :size="14">
                <Loading />
              </el-icon>
              <StatusTag :status="task.status" :is-waiting="task.isWaiting" />
            </div>
          </td>
          <td class="task-cell result-cell">{{ task.result }}</td>
          <td class="task-cell actions-cell">
            <div class="action-group">
              <button
                v-if="['等待中', '失败'].includes(task.status)"
                @click.stop="$emit('execute-one', task)"
                class="action-btn execute-btn"
              >
                执行
              </button>
              <button @click.stop="$emit('delete-task', task.id)" class="action-btn delete-btn">
                删除
              </button>
            </div>
            <button
              v-if="['运行中'].includes(task.status) || task.isWaiting"
              @click.stop="$emit('cancel-task', task.id)"
              class="action-btn cancel-btn"
            >
              取消
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import StatusTag from './StatusTag.vue'
import { ElIcon } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'

const props = defineProps({
  tasks: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['delete-task', 'execute-one', 'update:selected', 'select-task', 'cancel-task'])

const selectedTasks = ref([])

const isAllSelected = computed(() => {
  return props.tasks.length > 0 && selectedTasks.value.length === props.tasks.length
})

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedTasks.value = []
  } else {
    selectedTasks.value = props.tasks.map((task) => task.id)
  }
}

watch(selectedTasks, (newSelection) => {
  emit('update:selected', newSelection)
})

watch(
  () => props.tasks,
  () => {
    // When tasks list changes (e.g., cleared), reset selection
    selectedTasks.value = []
  }
)
</script>

<style scoped>
.task-list-container {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.task-header-cell,
.task-cell {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
  white-space: nowrap;
  color: #374151;
}

.status-cell {
  width: 120px; /* 给状态列一个固定宽度 */
}

.status-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.el-icon.is-loading {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  flex-shrink: 0; /* Prevent spinner from shrinking */
}

.task-header-cell {
  background-color: #f9fafb;
  font-weight: 600;
  font-size: 12px;
}

.task-cell {
  font-size: 12px;
  user-select: text; /* 允许单元格内的文本被选中 */
}

.actions-header-cell {
  text-align: center;
}

.task-row:last-child .task-cell {
  border-bottom: none;
}

.task-row:hover {
  background-color: #f5f5f5;
}

.no-tasks-row {
  text-align: center;
  color: #9ca3af;
  padding: 20px;
}

.checkbox-cell {
  width: 40px;
  text-align: center;
}

.result-cell {
  max-width: 200px;
  white-space: normal;
  word-break: break-all;
}

.actions-cell {
  display: flex;
  gap: 6px;
  justify-content: space-between;
  align-items: center;
}

.action-group {
  display: flex;
  gap: 6px;
}

.action-btn {
  border: none;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}

.execute-btn {
  background-color: #3b82f6;
  color: white;
}
.execute-btn:hover {
  background-color: #2563eb;
}

.cancel-btn {
  background-color: #f97316;
  color: white;
}
.cancel-btn:hover {
  background-color: #ea580c;
}

.delete-btn {
  background-color: #ef4444;
  color: white;
}

.delete-btn:hover {
  background-color: #dc2626;
}
</style>
