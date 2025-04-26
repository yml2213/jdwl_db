<template>
  <div class="task-header">
    <div class="task-title">任务列表</div>
    <div class="task-actions">
      <label class="checkbox-label timing-checkbox">
        <input type="checkbox" v-model="autoStart" />
        <span>定时</span>
      </label>
      <button class="btn btn-primary" @click="$emit('open-web')">打开网页</button>
      <button class="btn btn-success" @click="$emit('execute')">批量执行</button>
      <button class="btn btn-danger" @click="$emit('clear')">清空列表</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  form: {
    type: Object,
    required: true
  }
})

// 定义计算属性
const autoStart = computed({
  get: () => props.form.autoStart,
  set: (value) => {
    emit('update:autoStart', value)
  }
})

const emit = defineEmits(['execute', 'clear', 'open-web', 'update:autoStart'])
</script>

<style scoped>
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

.timing-checkbox {
  margin-right: 5px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-right: 6px;
}

.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-success {
  background-color: #52c41a;
  color: white;
}

.btn-danger {
  background-color: #ff4d4f;
  color: white;
}

.btn:hover {
  opacity: 0.9;
}
</style>
