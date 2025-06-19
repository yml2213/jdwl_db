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
      <tr
        v-for="(task, index) in tasks"
        :key="index"
        :class="{ expanded: expandedTasks.includes(index) }"
      >
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
          <span v-else-if="task.状态 === '暂存'" class="result-text">{{
            task.结果 || '等待批量处理'
          }}</span>
          <span v-else-if="task.状态 === '成功'" class="result-text">{{
            task.结果 || '成功'
          }}</span>
          <span v-else-if="task.状态 === '失败'" class="error-text result-text">{{
            task.结果 || '失败'
          }}</span>
          <span v-else-if="task.状态 === '部分成功'" class="warning-text result-text">{{
            task.结果 || '部分成功'
          }}</span>
          <button
            v-if="task.importLogs && task.importLogs.length > 0"
            @click="toggleTaskLogs(index)"
            class="btn-link"
          >
            {{ expandedTasks.includes(index) ? '收起日志' : '查看日志' }}
          </button>
        </td>
        <td>
          <button
            class="btn btn-small btn-primary"
            @click="executeOneTask(task, index)"
            v-if="task.状态 === '等待中' || task.状态 === '失败' || task.状态 === '暂存'"
          >
            执行
          </button>
          <button class="btn btn-small btn-danger" @click="deleteTask(index)">删除</button>
        </td>
      </tr>
      <!-- 日志展示行 -->
      <tr v-for="taskIndex in tasksWithExpandedLogs" :key="`log-${taskIndex}`">
        <td colspan="8" class="logs-container">
          <div class="task-logs">
            <h4>批次处理日志明细</h4>

            <!-- 统计信息 -->
            <div class="batch-summary">
              <div v-if="getBatchCount(tasks[taskIndex].importLogs) > 0">
                总共
                <span class="highlight">{{ getBatchCount(tasks[taskIndex].importLogs) }}</span>
                个批次， 每批最多 <span class="highlight">2000</span> 个SKU
              </div>
              <div v-if="getSummaryLog(tasks[taskIndex].importLogs)">
                总结: {{ getSummaryLog(tasks[taskIndex].importLogs).message }}
              </div>
            </div>

            <!-- 按批次分组显示日志 -->
            <div class="batch-groups">
              <template
                v-for="batchIndex in getBatchCount(tasks[taskIndex].importLogs)"
                :key="batchIndex"
              >
                <!-- 批次标题 -->
                <div class="batch-header">
                  <div class="batch-title">批次 {{ batchIndex }}</div>
                  <div
                    v-if="getBatchStatus(tasks[taskIndex].importLogs, batchIndex)"
                    :class="[
                      'batch-status',
                      getBatchStatus(tasks[taskIndex].importLogs, batchIndex)
                    ]"
                  >
                    {{ getBatchStatusText(tasks[taskIndex].importLogs, batchIndex) }}
                  </div>
                </div>

                <!-- 批次内的日志 -->
                <div class="batch-logs">
                  <div
                    v-for="(log, logIndex) in getLogsForBatch(
                      tasks[taskIndex].importLogs,
                      batchIndex
                    )"
                    :key="logIndex"
                    :class="['log-item', `log-${log.type}`]"
                  >
                    <div class="log-header">
                      <span class="log-time">{{ log.timestamp }}</span>
                      <span class="log-type-badge" :class="log.type">{{
                        getLogTypeText(log.type)
                      }}</span>
                    </div>
                    <div class="log-content">
                      <div class="log-message">{{ log.message }}</div>

                      <!-- 批次开始信息 -->
                      <div v-if="log.type === 'batch-start'" class="log-details">
                        <div class="detail-item">
                          <span class="detail-label">批次序号:</span>
                          <span class="detail-value"
                            >{{ log.batchIndex }}/{{ log.totalBatches }}</span
                          >
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">SKU数量:</span>
                          <span class="detail-value highlight">{{ log.batchSize }}个</span>
                        </div>
                      </div>

                      <!-- 批次等待信息 -->
                      <div v-if="log.type === 'batch-wait'" class="log-details">
                        <div class="detail-item">
                          <span class="detail-label">已处理:</span>
                          <span class="detail-value success">{{ log.processedCount }}个成功</span>,
                          <span class="detail-value error">{{ log.failedCount }}个失败</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">剩余SKU:</span>
                          <span class="detail-value">{{ log.remainingCount }}个</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">等待时间:</span>
                          <span class="detail-value">{{ log.waitTime }}秒</span>
                        </div>
                      </div>

                      <!-- 成功信息 -->
                      <div v-if="log.type === 'success'" class="log-details success">
                        <div class="detail-item">
                          <span class="detail-label">成功导入:</span>
                          <span class="detail-value highlight">{{ log.batchSize }}个SKU</span>
                        </div>
                        <div v-if="log.logFile" class="detail-item">
                          <span class="detail-label">日志文件:</span>
                          <span class="detail-value log-file">{{ log.logFile }}</span>
                        </div>
                      </div>

                      <!-- 错误信息 -->
                      <div v-if="log.type === 'error'" class="log-details error">
                        <div class="detail-item">
                          <span class="detail-label">错误原因:</span>
                          <span class="detail-value">{{ log.message }}</span>
                        </div>
                      </div>

                      <!-- 批次等待进行中 -->
                      <div v-if="log.type === 'batch-waiting'" class="log-details waiting">
                        <div class="detail-item">
                          <span class="detail-label">等待状态:</span>
                          <span class="detail-value">剩余{{ log.remainingTime }}秒</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="!hasLogsForBatch(tasks[taskIndex].importLogs, batchIndex)"
                    class="no-logs-message"
                  >
                    此批次尚无详细日志
                  </div>
                </div>
              </template>
            </div>

            <!-- 总结信息 -->
            <div v-if="getSummaryLog(tasks[taskIndex].importLogs)" class="summary-section">
              <div class="summary-header">处理结果总结</div>
              <div class="summary-content">
                <div class="detail-item">
                  <span class="detail-label">总SKU数:</span>
                  <span class="detail-value"
                    >{{ getSummaryLog(tasks[taskIndex].importLogs).totalCount }}个</span
                  >
                </div>
                <div class="detail-item">
                  <span class="detail-label">成功处理:</span>
                  <span class="detail-value success"
                    >{{ getSummaryLog(tasks[taskIndex].importLogs).processedCount }}个</span
                  >
                </div>
                <div class="detail-item">
                  <span class="detail-label">失败处理:</span>
                  <span class="detail-value error"
                    >{{ getSummaryLog(tasks[taskIndex].importLogs).failedCount }}个</span
                  >
                </div>
                <div
                  v-if="getSummaryLog(tasks[taskIndex].importLogs).failedReasons"
                  class="detail-item failed-reasons"
                >
                  <span class="detail-label">失败原因:</span>
                  <span class="detail-value">{{
                    getSummaryLog(tasks[taskIndex].importLogs).failedReasons
                  }}</span>
                </div>
              </div>
            </div>
          </div>
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

const emit = defineEmits(['execute-one', 'delete-task'])

const selectedTasks = ref([])
const expandedTasks = ref([]) // 跟踪展开的任务

// 计算属性：获取需要展示日志的任务索引
const tasksWithExpandedLogs = computed(() => {
  return expandedTasks.value.filter(
    (index) => index < props.tasks.length && props.tasks[index].importLogs
  )
})

// 切换任务日志显示
const toggleTaskLogs = (index) => {
  const position = expandedTasks.value.indexOf(index)
  if (position > -1) {
    expandedTasks.value.splice(position, 1)
  } else {
    expandedTasks.value.push(index)
  }
}

// 获取批次总数
const getBatchCount = (logs) => {
  if (!logs || !Array.isArray(logs)) return 0
  const batchStartLogs = logs.filter((log) => log.type === 'batch-start')
  return batchStartLogs.length > 0 ? Math.max(...batchStartLogs.map((log) => log.batchIndex)) : 0
}

// 获取指定批次的所有日志
const getLogsForBatch = (logs, batchIndex) => {
  if (!logs || !Array.isArray(logs)) return []
  return logs.filter(
    (log) =>
      (log.type === 'batch-start' && log.batchIndex === batchIndex) ||
      (log.type === 'batch-wait' && log.batchIndex === batchIndex) ||
      (log.type === 'batch-waiting' && log.batchIndex === batchIndex) ||
      ((log.type === 'success' || log.type === 'error') &&
        logs.some(
          (l) =>
            l.type === 'batch-start' && l.batchIndex === batchIndex && l.batchSize === log.batchSize
        ))
  )
}

// 判断指定批次是否有日志
const hasLogsForBatch = (logs, batchIndex) => {
  return getLogsForBatch(logs, batchIndex).length > 0
}

// 获取批次状态
const getBatchStatus = (logs, batchIndex) => {
  const batchLogs = getLogsForBatch(logs, batchIndex)
  if (batchLogs.some((log) => log.type === 'success')) return 'success'
  if (batchLogs.some((log) => log.type === 'error')) return 'error'
  if (batchLogs.some((log) => log.type === 'batch-waiting')) return 'waiting'
  if (batchLogs.some((log) => log.type === 'batch-wait')) return 'completed'
  if (batchLogs.some((log) => log.type === 'batch-start')) return 'processing'
  return ''
}

// 获取批次状态文本
const getBatchStatusText = (logs, batchIndex) => {
  const status = getBatchStatus(logs, batchIndex)
  switch (status) {
    case 'success':
      return '成功'
    case 'error':
      return '失败'
    case 'waiting':
      return '等待中'
    case 'completed':
      return '已完成'
    case 'processing':
      return '处理中'
    default:
      return ''
  }
}

// 获取日志类型文本
const getLogTypeText = (type) => {
  switch (type) {
    case 'info':
      return '信息'
    case 'batch-start':
      return '批次开始'
    case 'batch-wait':
      return '批次完成'
    case 'batch-waiting':
      return '等待中'
    case 'success':
      return '成功'
    case 'error':
      return '错误'
    case 'summary':
      return '总结'
    default:
      return type
  }
}

// 获取总结日志
const getSummaryLog = (logs) => {
  if (!logs || !Array.isArray(logs)) return null
  return logs.find((log) => log.type === 'summary')
}

const selectAll = computed({
  get: () => {
    return selectedTasks.value.length > 0 && selectedTasks.value.length === props.tasks.length
  },
  set: (value) => {
    selectedTasks.value = value ? Array.from({ length: props.tasks.length }, (_, i) => i) : []
  }
})

// 执行单个任务
const executeOneTask = (task, index) => {
  console.log('执行任务:', index, task)
  emit('execute-one', task, index)
}

// 删除单个任务
const deleteTask = (index) => {
  console.log('删除任务:', index)
  emit('delete-task', index)
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

.error-text {
  color: #e53935;
}

.warning-text {
  color: #ff9800;
}

/* 为长文本优化显示 */
.result-text {
  max-width: 320px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
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

/* 日志相关样式 */
.btn-link {
  background: none;
  border: none;
  color: #1976d2;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
  padding: 0 5px;
}

.logs-container {
  padding: 0 !important;
  background-color: #f5f7fa;
}

.task-logs {
  padding: 10px 20px;
  max-height: 400px;
  overflow-y: auto;
}

.task-logs h4 {
  margin-top: 5px;
  margin-bottom: 10px;
  font-weight: bold;
  color: #333;
  font-size: 16px;
}

.batch-summary {
  background-color: #e8f5e9;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
  font-size: 13px;
}

.highlight {
  font-weight: bold;
  color: #2196f3;
}

.batch-groups {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.batch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 5px;
  border-bottom: 1px solid #e0e0e0;
}

.batch-title {
  font-size: 14px;
  font-weight: bold;
  color: #333;
}

.batch-status {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  color: white;
}

.batch-status.success {
  background-color: #4caf50;
}

.batch-status.error {
  background-color: #f44336;
}

.batch-status.waiting {
  background-color: #ff9800;
  animation: pulsate 1.5s infinite alternate;
}

.batch-status.completed {
  background-color: #2196f3;
}

.batch-status.processing {
  background-color: #9c27b0;
  animation: pulsate 1.5s infinite alternate;
}

.batch-logs {
  padding-left: 10px;
  border-left: 3px solid #e0e0e0;
}

.log-item {
  margin-bottom: 8px;
  padding: 10px;
  border-radius: 4px;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.log-header {
  display: flex;
  margin-bottom: 5px;
}

.log-time {
  color: #606266;
  font-size: 12px;
  margin-right: 10px;
}

.log-type-badge {
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 10px;
  background-color: #e0e0e0;
  color: #333;
}

.log-type-badge.success {
  background-color: #4caf50;
  color: white;
}

.log-type-badge.error {
  background-color: #f44336;
  color: white;
}

.log-type-badge.batch-start {
  background-color: #2196f3;
  color: white;
}

.log-type-badge.batch-wait {
  background-color: #9c27b0;
  color: white;
}

.log-type-badge.batch-waiting {
  background-color: #ff9800;
  color: white;
}

.log-content {
  padding-left: 5px;
}

.log-message {
  font-weight: bold;
  margin-bottom: 5px;
}

.log-details {
  margin-top: 8px;
  font-size: 12px;
  color: #606266;
  background-color: #f9f9f9;
  padding: 8px;
  border-radius: 4px;
}

.detail-item {
  margin-bottom: 5px;
}

.detail-label {
  color: #909399;
  margin-right: 5px;
}

.detail-value {
  font-weight: bold;
}

.detail-value.success {
  color: #4caf50;
}

.detail-value.error {
  color: #f44336;
}

.log-file {
  font-style: italic;
  color: #1976d2;
}

.no-logs-message {
  color: #909399;
  font-style: italic;
  padding: 10px;
}

.summary-section {
  margin-top: 20px;
  background-color: #e3f2fd;
  border-radius: 4px;
  overflow: hidden;
}

.summary-header {
  background-color: #2196f3;
  color: white;
  padding: 8px 12px;
  font-weight: bold;
}

.summary-content {
  padding: 10px;
}

.failed-reasons {
  margin-top: 5px;
  max-height: 60px;
  overflow-y: auto;
  background-color: #ffebee;
  padding: 5px;
  border-radius: 3px;
  font-size: 11px;
  border-left: 3px solid #f44336;
}

@keyframes pulsate {
  0% {
    opacity: 0.8;
  }
  100% {
    opacity: 1;
  }
}
</style>
