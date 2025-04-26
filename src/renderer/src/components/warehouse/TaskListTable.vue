<template>
  <table class="task-table">
    <thead>
      <tr>
        <th style="width: 40px"><input type="checkbox" v-model="selectAll" /></th>
        <th>SKU</th>
        <th>店铺</th>
        <th>仓库</th>
        <th>创建时间</th>
        <th>状态</th>
        <th>结果</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(task, index) in tasks" :key="index">
        <td><input type="checkbox" v-model="selectedTasks" :value="index" /></td>
        <td>{{ task.sku }}</td>
        <td>{{ task.店铺 }}</td>
        <td>{{ task.仓库 }}</td>
        <td>{{ task.创建时间 }}</td>
        <td>
          <status-tag :status="task.状态" />
        </td>
        <td>
          <span v-if="task.状态 === '等待中'">等待执行...</span>
          <span v-else-if="task.状态 === '执行中'">处理中...</span>
          <span v-else-if="task.状态 === '暂存'">{{ task.结果 || '等待批量处理' }}</span>
          <span v-else-if="task.状态 === '成功'">{{ task.结果 || '成功' }}</span>
          <span v-else-if="task.状态 === '失败'" class="error-text">{{ task.结果 || '失败' }}</span>
        </td>
        <td>
          <button
            class="btn btn-small btn-primary"
            @click="$emit('execute-one', task, index)"
            v-if="task.状态 === '等待中' || task.状态 === '失败' || task.状态 === '暂存'"
          >
            执行
          </button>
          <button class="btn btn-small btn-danger" @click="$emit('delete-task', index)">
            删除
          </button>
        </td>
      </tr>
      <tr v-if="tasks.length === 0">
        <td colspan="8" class="no-data">没有任务</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import { ref, computed } from 'vue'
import StatusTag from './StatusTag.vue'

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  }
})

defineEmits(['execute-one', 'delete-task'])

const selectedTasks = ref([])

const selectAll = computed({
  get: () => {
    return selectedTasks.value.length > 0 && selectedTasks.value.length === props.tasks.length
  },
  set: (value) => {
    selectedTasks.value = value ? Array.from({ length: props.tasks.length }, (_, i) => i) : []
  }
})
</script>

<style scoped>
.task-table {
  width: 100%;
  border-collapse: collapse;
}

.task-table th,
.task-table td {
  border-bottom: 1px solid #ebeef5;
  padding: 12px 0;
  text-align: left;
}

.task-table th {
  color: #909399;
  font-weight: 500;
  padding-bottom: 8px;
}

.no-data {
  text-align: center;
  color: #909399;
  padding: 30px 0;
}

.error-text {
  color: #e53935;
}

.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-danger {
  background-color: #ff4d4f;
  border-color: #ff4d4f;
  color: white;
}

.btn:hover {
  opacity: 0.9;
}
</style>
