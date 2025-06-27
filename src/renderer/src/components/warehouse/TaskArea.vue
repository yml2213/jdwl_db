<template>
  <div class="task-area">
    <div class="task-header">
      <div class="task-title">任务列表</div>
      <div class="task-actions">
        <button class="btn btn-success" @click="emit('executeTask', null)">批量执行</button>
        <button class="btn btn-danger" @click="emit('clearTasks')">清空列表</button>
      </div>
    </div>

    <div class="task-table-container">
      <tab-panel
        v-if="props.taskList.length > 0"
        :tasks="props.taskList"
        @execute-one="(task) => emit('executeTask', task)"
      />
      <div v-else class="no-tasks">
        <p>无任务数据，请先添加任务</p>
      </div>
    </div>

    <div class="task-footer">
      <!-- 页脚内容可以根据需要添加回来 -->
    </div>
  </div>
</template>

<script setup>
import TabPanel from './TabPanel.vue'

const props = defineProps({
  taskList: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['executeTask', 'clearTasks'])
</script>

<style scoped>
.task-area {
  flex: 1;
  background: #fff;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.task-title {
  font-size: 16px;
  font-weight: bold;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.task-table-container {
  flex: 1;
  overflow: auto;
}

.task-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid #ebeef5;
}

.no-tasks {
  padding: 20px;
  text-align: center;
  color: #909399;
  font-size: 14px;
}
</style>
