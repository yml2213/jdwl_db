<template>
  <div class="operation-area">
    <div class="scrollable-content">
      <div class="form-group">
        <label class="form-label">快捷选择</label>
        <div class="select-wrapper">
          <select v-model="form.quickSelect" class="form-select">
            <option value="manual">手动选择</option>
            <option value="warehouseLabeling">任务流 -- 入仓打标</option>
          </select>
        </div>
      </div>

      <div class="form-group sku-input-container">
        <div class="sku-header">
          <label class="form-label">输入SKU</label>
          <FileUploader @file-change="handleFileChange" />
        </div>
        <div class="textarea-wrapper">
          <textarea
            v-model="form.sku"
            placeholder="请输入SKU (多个SKU请每行一个)"
            class="sku-textarea"
          ></textarea>
          <el-button v-if="form.sku" class="clear-sku-btn" type="danger" link @click="form.sku = ''"
            >清空</el-button
          >
        </div>
      </div>

      <!-- Manual Options Section -->
      <div v-if="form.quickSelect === 'manual'" class="manual-options-container">
        <div class="manual-options-grid">
          <div class="option-item">
            <input type="checkbox" id="importStore" v-model="form.options.importStore" />
            <label for="importStore">导入店铺商品</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="useStore" v-model="form.options.useStore" />
            <label for="useStore">启用店铺商品</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="importProps" v-model="form.options.importProps" />
            <label for="importProps">导入物流属性(参数)</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="useMainData" v-model="form.options.useMainData" />
            <label for="useMainData">启用库存商品分配</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="useJPEffect" v-model="form.options.useJPEffect" />
            <label for="useJPEffect">启用京配打标生效</label>
          </div>
          <div class="option-item">
            <input type="checkbox" id="useAddInventory" v-model="form.options.useAddInventory" />
            <label for="useAddInventory">添加库存</label>
          </div>
          <div class="option-item">
            <input
              type="checkbox"
              id="importProductNames"
              v-model="form.options.importProductNames"
            />
            <label for="importProductNames">导入商品简称</label>
          </div>
        </div>
        <!-- Logistics & Inventory Sub-options -->
        <div v-if="form.options.importProps" class="sub-options-container logistics-options">
          <div class="logistics-input-group">
            <label>长(mm):</label>
            <input type="text" v-model="logisticsOptions.length" />
          </div>
          <div class="logistics-input-group">
            <label>宽(mm):</label>
            <input type="text" v-model="logisticsOptions.width" />
          </div>
          <div class="logistics-input-group">
            <label>高(mm):</label>
            <input type="text" v-model="logisticsOptions.height" />
          </div>
          <div class="logistics-input-group">
            <label>毛重(kg):</label>
            <input type="text" v-model="logisticsOptions.grossWeight" />
          </div>
        </div>
        <div v-if="form.options.useAddInventory" class="sub-options-container inventory-container">
          <label class="inventory-label">库存数量：</label>
          <input type="number" v-model="form.options.inventoryAmount" class="inventory-input" />
        </div>
        <!-- Product Name Importer Sub-options -->
        <!-- <ProductNameImporter
          v-model="form.options.importProductNames"
          v-model:payload="form.payloads.importProductNames"
        /> -->
      </div>

      <div class="form-group">
        <StoreSelector
          v-model="storeVModel"
          :shops="shopsList"
          :loading="isLoadingShops"
          :error="shopLoadError"
        >
        </StoreSelector>
      </div>

      <div class="form-group">
        <WarehouseSelector
          v-model="warehouseVModel"
          :warehouses="warehousesList"
          :loading="isLoadingWarehouses"
          :error="warehouseLoadError"
        >
        </WarehouseSelector>
      </div>
    </div>

    <div class="form-actions">
      <button class="btn btn-primary">添加至快捷</button>
      <button class="btn btn-success" @click="$emit('addTask')">添加任务</button>
    </div>

    <el-dialog
      v-model="form.options.importProductNames"
      title="导入商品简称"
      width="600px"
      :modal="false"
      draggable
      @close="form.options.importProductNames = false"
    >
      <ProductNameImporter
        v-if="form.options.importProductNames"
        v-model:payload="form.payloads.importProductNames"
        @cancel="form.options.importProductNames = false"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ElButton, ElDialog } from 'element-plus'
import StoreSelector from './StoreSelector.vue'
import WarehouseSelector from './WarehouseSelector.vue'
import FileUploader from './FileUploader.vue'
import ProductNameImporter from './feature/ProductNameImporter.vue'

const props = defineProps({
  form: Object,
  selectedStore: String,
  selectedWarehouse: String,
  shopsList: Array,
  warehousesList: Array,
  isLoadingShops: Boolean,
  shopLoadError: String,
  isLoadingWarehouses: Boolean,
  warehouseLoadError: String,
  logisticsOptions: Object
})

const emit = defineEmits([
  'update:form',
  'update:logisticsOptions',
  'addTask',
  'update:selectedStore',
  'update:selectedWarehouse'
])

const form = new Proxy(props.form, {
  set: (_target, key, value) => {
    emit('update:form', { ...props.form, [key]: value })
    return true
  }
})

const logisticsOptions = new Proxy(props.logisticsOptions, {
  set: (_target, key, value) => {
    emit('update:logisticsOptions', { ...props.logisticsOptions, [key]: value })
    return true
  }
})

const storeVModel = computed({
  get: () => props.selectedStore,
  set: (value) => emit('update:selectedStore', value)
})

const warehouseVModel = computed({
  get: () => props.selectedWarehouse,
  set: (value) => emit('update:selectedWarehouse', value)
})

const handleFileChange = (file) => {
  if (file && file.name.endsWith('.txt')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      form.sku = e.target.result
    }
    reader.readAsText(file)
  }
}
</script>

<style scoped>
.operation-area {
  flex: 0 0 380px;
  background: #f7f8fa;
  border-right: 1px solid #e8e8e8;
  color: #333;
  display: flex;
  flex-direction: column;
}

.scrollable-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
  font-size: 14px;
}

.select-wrapper {
  position: relative;
}

.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
  height: 36px;
  cursor: pointer;
  background-color: white;
}

.textarea-wrapper {
  position: relative;
}

.sku-textarea {
  width: 100%;
  min-height: 120px;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  resize: vertical;
}

.manual-options-container {
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 15px;
  margin-bottom: 15px;
  background-color: #fff;
}

.manual-options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.option-item {
  display: flex;
  align-items: center;
  font-size: 13px;
}

.option-item input[type='checkbox'] {
  margin-right: 4px;
}

.option-item label {
  white-space: nowrap;
}

.sub-options-container {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed #e8e8e8;
}

.logistics-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.logistics-input-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.logistics-input-group label {
  flex-shrink: 0;
  font-size: 13px;
}

.logistics-input-group input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}

.inventory-container {
  display: flex;
  align-items: center;
}

.inventory-label {
  margin-right: 8px;
}

.inventory-input {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}

.form-actions {
  flex-shrink: 0;
  padding: 20px;
  border-top: 1px solid #e8e8e8;
  display: flex;
  gap: 10px;
  background: #f7f8fa;
}

.form-actions .btn {
  flex: 1;
  padding: 10px;
  font-size: 14px;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
}

.btn-primary {
  background-color: #409eff;
}
.btn-primary:hover {
  background-color: #66b1ff;
}
.btn-success {
  background-color: #67c23a;
}
.btn-success:hover {
  background-color: #85ce61;
}

.sku-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.sku-header .form-label {
  margin-bottom: 0;
}

.clear-sku-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 0;
  min-height: auto;
  height: auto;
}
</style>
