<template>
  <div class="task-content">
    <TabsPanel v-model="activeTab">
      <TabPanelItem label="任务" name="task">
        <div>
          <div class="task-table">
            <table>
              <thead>
                <tr>
                  <th>序号</th>
                  <th>订单号</th>
                  <th>平台</th>
                  <th>地区</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in tasks" :key="index">
                  <td>{{ index + 1 }}</td>
                  <td>{{ item.orders }}</td>
                  <td>{{ item.platform }}</td>
                  <td>{{ item.region }}</td>
                  <td :class="getStatusClass(item.status)">{{ getStatusText(item.status) }}</td>
                  <td>
                    <button class="btn-action" @click="$emit('execute-task', item)">执行</button>
                    <button class="btn-action delete" @click="$emit('delete-task', item)">
                      删除
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </TabPanelItem>
      <TabPanelItem label="日志" name="log">
        <div class="logs-container">
          <div v-for="(log, index) in logs" :key="index" class="log-item">
            {{ log }}
          </div>
        </div>
      </TabPanelItem>
    </TabsPanel>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TabsPanel from '../../common/TabsPanel.vue'
import TabPanelItem from '../../common/TabPanelItem.vue'

defineProps({
  tasks: {
    type: Array,
    default: () => []
  },
  logs: {
    type: Array,
    default: () => []
  }
})

const activeTab = ref('task')

defineEmits(['execute-task', 'delete-task'])

// 状态相关方法
function getStatusClass(status) {
  switch (status) {
    case 0:
      return 'status-waiting'
    case 1:
      return 'status-processing'
    case 2:
      return 'status-success'
    case 3:
      return 'status-failed'
    default:
      return ''
  }
}

function getStatusText(status) {
  switch (status) {
    case 0:
      return '等待执行'
    case 1:
      return '执行中'
    case 2:
      return '执行成功'
    case 3:
      return '执行失败'
    default:
      return '未知状态'
  }
}
</script>

<style scoped>
.task-content {
  height: calc(100% - 60px);
}

.task-table {
  width: 100%;
  overflow-y: auto;
  max-height: 300px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid #e8e8e8;
  padding: 10px;
  text-align: center;
}

th {
  background-color: #f5f5f5;
  font-weight: 500;
}

.btn-action {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin: 0 4px;
  background-color: #1890ff;
  color: white;
}

.btn-action.delete {
  background-color: #ff4d4f;
}

.btn-action:hover {
  opacity: 0.9;
}

.status-waiting {
  color: #faad14;
}

.status-processing {
  color: #1890ff;
}

.status-success {
  color: #52c41a;
}

.status-failed {
  color: #ff4d4f;
}

.logs-container {
  height: 300px;
  overflow-y: auto;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 10px;
  background-color: #fafafa;
}

.log-item {
  padding: 5px 0;
  border-bottom: 1px solid #f0f0f0;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
