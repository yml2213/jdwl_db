<template>
  <div class="task-list-container">
    <table class="task-table">
      <thead>
        <tr>
          <th class="task-header-cell checkbox-cell"><input type="checkbox" /></th>
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
        <tr v-for="task in tasks" :key="task.id" class="task-row">
          <td class="task-cell checkbox-cell"><input type="checkbox" /></td>
          <td class="task-cell">{{ task.displaySku }}</td>
          <td class="task-cell">{{ task.featureName }}</td>
          <td class="task-cell">{{ task.storeName }}</td>
          <td class="task-cell">{{ task.warehouseName }}</td>
          <td class="task-cell">{{ task.createdAt }}</td>
          <td class="task-cell">
            <StatusTag :status="task.status" />
          </td>
          <td class="task-cell result-cell">{{ task.result }}</td>
          <td class="task-cell actions-cell">
            <button
              v-if="['等待中', '失败'].includes(task.status)"
              @click="$emit('execute-task', task)"
              class="action-btn execute-btn"
            >
              执行
            </button>
            <button @click="$emit('delete-task', task.id)" class="action-btn delete-btn">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import StatusTag from './StatusTag.vue'

defineProps({
  tasks: {
    type: Array,
    required: true
  }
})

defineEmits(['delete-task', 'execute-task'])
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
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
  white-space: nowrap;
  color: #374151;
}

.task-header-cell {
  background-color: #f9fafb;
  font-weight: 600;
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
  gap: 8px;
  justify-content: center;
  align-items: center;
}

.action-btn {
  border: none;
  padding: 4px 10px;
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

.delete-btn {
  background-color: #ef4444;
  color: white;
}

.delete-btn:hover {
  background-color: #dc2626;
}
</style>
