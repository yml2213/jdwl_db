<template>
  <table class="task-table">
    <thead>
      <tr>
        <th>时间</th>
        <th>批次</th>
        <th>SKU数量</th>
        <th>状态</th>
        <th>处理时间</th>
        <th>结果</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(log, index) in logs"
        :key="index"
        :class="{ expandable: log.message }"
        @click="toggleDetails(index)"
      >
        <td>{{ log.time }}</td>
        <td>{{ log.batchNumber }}/{{ log.totalBatches }}</td>
        <td>{{ log.skuCount }}</td>
        <td>
          <status-tag :status="log.status" />
        </td>
        <td>{{ log.processingTime ? log.processingTime + '秒' : '-' }}</td>
        <td>{{ log.result }}</td>
      </tr>
      <tr v-if="selectedLogIndex !== null && logs[selectedLogIndex].message" class="details-row">
        <td colspan="6" class="details-cell">
          <div class="details-content">
            <div class="details-label">详细信息:</div>
            <div class="details-message">{{ logs[selectedLogIndex].message }}</div>
          </div>
        </td>
      </tr>
      <tr v-if="logs.length === 0">
        <td colspan="6" class="no-data">暂无提交日志</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import StatusTag from './StatusTag.vue'
import { ref } from 'vue'

defineProps({
  logs: {
    type: Array,
    default: () => []
  }
})

const selectedLogIndex = ref(null)

const toggleDetails = (index) => {
  if (selectedLogIndex.value === index) {
    selectedLogIndex.value = null
  } else {
    selectedLogIndex.value = index
  }
}
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

.expandable {
  cursor: pointer;
}

.expandable:hover {
  background-color: #f5f7fa;
}

.details-row {
  background-color: #f5f7fa;
}

.details-cell {
  padding: 15px !important;
}

.details-content {
  display: flex;
  flex-direction: column;
}

.details-label {
  font-weight: bold;
  margin-bottom: 5px;
}

.details-message {
  white-space: pre-wrap;
  word-break: break-word;
  color: #606266;
  font-family: monospace;
  padding: 8px;
  background-color: #ffffff;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}
</style>
