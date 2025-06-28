<div class="form-group">
  <StoreSelector
    v-model="storeVModel"
    :shops="shopsList"
    :loading="isLoadingShops"
    :error="shopLoadError"
  />
</div>

<div class="form-group">
  <WarehouseSelector
    v-model="warehouseVModel"
    :warehouses="warehousesList"
    :loading="isLoadingWarehouses"
    :error="warehouseLoadError"
  />
</div>

<div class="form-actions"></div>
