<template>
  <table class="task-table">
    <thead>
      <tr>
        <th>时间</th>
        <th>批次</th>
        <th>SKU数量</th>
        <th>状态</th>
        <th>结果</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(log, index) in logs" :key="index">
        <td>{{ log.time }}</td>
        <td>{{ log.batchNumber }}/{{ log.totalBatches }}</td>
        <td>{{ log.skuCount }}</td>
        <td>
          <status-tag :status="log.status" />
        </td>
        <td>{{ log.result }}</td>
      </tr>
      <tr v-if="logs.length === 0">
        <td colspan="5" class="no-data">暂无提交日志</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import StatusTag from './StatusTag.vue'

defineProps({
  logs: {
    type: Array,
    default: () => []
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
</style>
