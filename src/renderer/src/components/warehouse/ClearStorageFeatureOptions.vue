<template>
  <div class="form-group">
    <label class="form-label">功能选项</label>
    <div class="checkbox-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.clearStockAllocation" />
        <span>库存分配清零</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.cancelJpSearch" />
        <span>取消京配打标</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      clearStockAllocation: true,
      cancelJpSearch: false
    })
  }
})

const emit = defineEmits(['update:modelValue'])

const options = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
</script>

<style scoped>
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-right: 6px;
}
</style>
