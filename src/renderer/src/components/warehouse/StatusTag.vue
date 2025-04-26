<template>
  <span :class="['status-tag', statusClass]">{{ status }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { getStatusClass } from '../../features/warehouseLabeling/utils/taskUtils'

const props = defineProps({
  status: {
    type: String,
    required: true
  }
})

const statusClass = computed(() => getStatusClass(props.status))
</script>

<style scoped>
.status-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 2px;
  background-color: #e1f5fe;
  color: #039be5;
}

.status-tag.waiting {
  background-color: #e8f5e9;
  color: #43a047;
}

.status-tag.processing {
  background-color: #fff8e1;
  color: #ffa000;
  animation: pulse 1.5s infinite;
}

.status-tag.success {
  background-color: #e8f5e9;
  color: #43a047;
}

.status-tag.failure {
  background-color: #ffebee;
  color: #e53935;
}

.status-tag.temp-saved {
  background-color: #e3f2fd;
  color: #1976d2;
  border: 1px dashed #2196f3;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
  100% {
    opacity: 1;
  }
}
</style>
