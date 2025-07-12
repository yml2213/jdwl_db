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
          <td class="task-cell result-cell">
            <span v-if="countdownTimers[task.id] !== undefined">
              将在 {{ countdownTimers[task.id] }} 秒后重试...
            </span>
            <span v-else>{{ task.result }}</span>
          </td>
          <td class="task-cell actions-cell">
            <div class="action-group">
              <button
                v-if="['待执行', '失败'].includes(task.status)"
                @click.stop="$emit('execute-one', task)"
                class="action-btn execute-btn"
                :disabled="task.status === '等待中'"
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
import { ref, computed, watch, onUnmounted } from 'vue'
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
const countdownTimers = ref({})
const intervals = {}

// 解析重试时间
const parseRetryAfter = (resultText) => {
  if (!resultText) return null
  const match = resultText.match(/将在 (\d+) 秒后重试/)
  return match ? parseInt(match[1], 10) : null
}

// 监控任务列表变化以设置或清除计时器
watch(
  () => props.tasks,
  (newTasks) => {
    // 清理不再存在的任务的计时器
    Object.keys(intervals).forEach((taskId) => {
      if (!newTasks.some((task) => task.id === taskId)) {
        clearInterval(intervals[taskId])
        delete intervals[taskId]
        delete countdownTimers.value[taskId]
      }
    })

    newTasks.forEach((task) => {
      const retryAfter = parseRetryAfter(task.result)
      if (task.status === '等待中' && retryAfter !== null && !intervals[task.id]) {
        countdownTimers.value[task.id] = retryAfter
        intervals[task.id] = setInterval(() => {
          if (countdownTimers.value[task.id] > 0) {
            countdownTimers.value[task.id]--
          } else {
            clearInterval(intervals[task.id])
            delete intervals[task.id]
            // 可选：当倒计时结束时，可以发送一个事件来自动重试或更新状态
            // emit('retry-task', task.id)
          }
        }, 1000)
      } else if (task.status !== '等待中' && intervals[task.id]) {
        // 如果任务状态不再是等待中，清除计时器
        clearInterval(intervals[task.id])
        delete intervals[task.id]
        delete countdownTimers.value[task.id]
      }
    })
  },
  { deep: true, immediate: true }
)

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
  (newTasks, oldTasks) => {
    // 当任务列表变化 (例如，被清除) 时，重置选择
    if (newTasks.length === 0 && oldTasks.length > 0) {
      selectedTasks.value = []
    }
  }
)

// 组件卸载时清除所有计时器
onUnmounted(() => {
  Object.values(intervals).forEach(clearInterval)
})
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
.execute-btn:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
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
