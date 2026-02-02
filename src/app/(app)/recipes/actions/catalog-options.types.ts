/** Sort mode for catalog picker: display order (sort_order) or A–Z by label. */
export const CATALOG_PICKER_SORT = ['display_order', 'label_az'] as const;
export type CatalogPickerSort = (typeof CATALOG_PICKER_SORT)[number];
