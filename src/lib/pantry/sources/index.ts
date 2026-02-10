export type {
  ExternalProduct,
  ProductLookupResult,
  ProductSearchResult,
  ProductSourceId,
} from './product-source.types';
export {
  getOpenFoodFactsProductByBarcode,
  searchOpenFoodFactsProducts,
} from './open-food-facts.adapter';
export {
  getAlbertHeijnProductByBarcode,
  testAlbertHeijnConnection,
} from './albert-heijn.adapter';
export { lookupProductByBarcode } from './lookup';
export { searchProducts } from './search';
export {
  getProductSourceConfig,
  getProductSourceConfigForAdmin,
  type ProductSourceConfigEntry,
  type ProductSourceConfigForAdmin,
} from './product-source-config';
