<template>
  <div class="logs-container">
    <div v-if="isRunning" class="log-status">执行中...</div>
    <div v-if="taskError" class="log-status log-error">错误: {{ taskError }}</div>
    <div v-if="taskResult" class="log-status log-success">完成: {{ taskResult.message }}</div>
    <div v-for="(log, index) in logs" :key="index" :class="`log-entry log-${log.type}`">
      <span class="log-time">[{{ log.time }}]</span>
      <span class="log-message">{{ log.message }}</span>
    </div>
    <div v-if="logs.length === 0 && !isRunning" class="no-logs">
      <p>暂无日志</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  logs: {
    type: Array,
    default: () => []
  },
  isRunning: Boolean,
  taskError: String,
  taskResult: Object
})
</script>

<style scoped>
.logs-container {
  height: 100%;
  overflow-y: auto;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  background-color: #f8f9fa;
  padding: 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  color: #343a40;
}

.log-status {
  padding: 8px;
  margin-bottom: 10px;
  border-radius: 4px;
  font-weight: bold;
}

.log-entry {
  padding: 4px 8px;
  margin-bottom: 2px;
  border-radius: 3px;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-time {
  color: #6c757d;
  margin-right: 10px;
}

.log-message {
  color: #212529;
}

.log-info {
  /* Default style is fine */
}

.log-error {
  color: #dc3545;
  background-color: #f8d7da;
  border-color: #f5c6cb;
}

.log-success {
  color: #28a745;
  background-color: #d4edda;
  border-color: #c3e6cb;
}

.no-logs {
  text-align: center;
  padding-top: 20px;
  color: #6c757d;
}
</style>
