// أشكال الصفوف اللي بترجع من السيرفر (نفس أسماء الأعمدة)

export type Perm =
  | 'sell'
  | 'discount'
  | 'credit'
  | 'returns'
  | 'customers'
  | 'products'
  | 'stock'
  | 'purchases'
  | 'used'
  | 'expenses'
  | 'drawer'
  | 'reports'
  | 'log'
  | 'undo'
  | 'settings'
  | 'salaries'

export interface Profile {
  id: string
  shop_id: string
  name: string
  username: string
  role: 'owner' | 'staff'
  perms: Partial<Record<Perm, boolean>>
  active: boolean
  created_at?: string
}

export interface Category {
  id: number
  name: string
  icon: string
  sort_order: number
  archived: boolean
}

export interface Product {
  id: number
  category_id: number
  name: string
  cost_price: number
  sell_price: number
  min_sell_price: number
  image_url: string | null
  min_stock: number
  is_used: boolean
  imei: string | null
  notes: string | null
  archived: boolean
  created_at: string
}

export interface Variant {
  id: number
  product_id: number
  name: string | null
  stock: number
  uncounted: boolean
  archived: boolean
}

export interface ProductView {
  p: Product
  vs: Variant[]
  stock: number // مجموع المتجرد بس
  outOfStock: boolean
  uncounted: boolean
  allUncounted: boolean
  isLow: boolean
  hasVariants: boolean
  key: string // نص البحث بعد التوحيد
}

export interface CompatGroup {
  id: number
  name: string
  base_product_id: number | null
  notes: string | null
  archived: boolean
  devices: string[]
}

export interface Offer {
  id: number
  name: string
  price: number
  archived: boolean
  items: { product_id: number; qty: number }[]
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  notes: string | null
  archived: boolean
  balance: number
  last_move: string | null
  created_at: string
}

export interface CustomerTxn {
  id: number
  customer_id: number
  amount: number
  kind: 'credit_sale' | 'payment' | 'return_offset' | 'adjust' | 'opening'
  invoice_id: number | null
  note: string | null
  voided: boolean
  created_at: string
}

export interface InvoiceItem {
  id: number
  invoice_id: number
  variant_id: number
  product_id: number
  product_name: string
  variant_name: string | null
  cost_price: number
  base_price: number
  min_price: number
  unit_price: number
  qty: number
}

export interface AdjustmentItem {
  id: number
  adjustment_id: number
  invoice_item_id: number | null
  variant_id: number
  product_id: number
  product_name: string
  variant_name: string | null
  direction: 'in' | 'out'
  qty: number
  unit_price: number
  cost_price: number
  damaged: boolean
}

export interface Adjustment {
  id: number
  invoice_id: number
  kind: 'return' | 'exchange'
  in_total: number
  out_total: number
  cash_delta: number
  debt_delta: number
  note: string | null
  voided: boolean
  created_at: string
  adjustment_items: AdjustmentItem[]
}

export interface Invoice {
  id: number
  no: number
  customer_id: number | null
  customer_name: string | null
  subtotal: number
  discount: number
  total: number
  paid: number
  note: string | null
  user_name: string | null
  voided: boolean
  created_at: string
  invoice_items: InvoiceItem[]
  adjustments: Adjustment[]
}

export interface HeldCart {
  id: number
  label: string | null
  data: { lines: CartLine[]; discount: number; customerId: number | null }
  total: number
  items_count: number
  user_name: string | null
  created_at: string
}

/** سطر في السلة. نفس شكل البرنامج القديم عشان الفواتير المعلقة تشتغل بين الاتنين */
export interface CartLine {
  variantId: number
  productId: number
  productName: string
  variantName: string | null
  imagePath: string | null
  categoryName: string | null
  costPrice: number
  basePrice: number
  minPrice: number
  unitPrice: number
  qty: number
  offerName?: string | null
}

export interface CashMove {
  id: number
  amount: number
  kind: string
  note: string | null
  voided: boolean
  created_at: string
}

export interface Settlement {
  id: number
  expected_before: number
  counted: number | null
  amount: number
  note: string | null
  voided: boolean
  created_at: string
}

export interface Expense {
  id: number
  title: string
  category: string
  amount: number
  note: string | null
  date: string
  voided: boolean
  created_at: string
}

export interface Loss {
  id: number
  variant_id: number | null
  product_id: number | null
  product_name: string
  qty: number
  unit_cost: number
  reason: string
  note: string | null
  source: string
  voided: boolean
  created_at: string
}

export interface Supplier {
  id: number
  name: string
  phone: string | null
  notes: string | null
  balance: number
  total_purchases: number
  last_move: string | null
}

export interface SupplierTxn {
  id: number
  supplier_id: number
  amount: number
  kind: 'purchase' | 'payment' | 'opening'
  purchase_id: number | null
  note: string | null
  voided: boolean
  created_at: string
}

export interface PurchaseItem {
  id: number
  purchase_id: number
  variant_id: number
  product_id: number
  product_name: string
  variant_name: string | null
  qty: number
  unit_cost: number
  old_cost: number
}

export interface Purchase {
  id: number
  no: number
  supplier_id: number | null
  supplier_name: string | null
  total: number
  paid: number
  note: string | null
  voided: boolean
  created_at: string
  purchase_items: PurchaseItem[]
}

export interface ActivityLog {
  id: number
  action: string
  section: string
  title: string
  description: string
  details: [string, string][] | null
  undoable: boolean
  status: 'done' | 'undone'
  undone_at: string | null
  undo_of: number | null
  user_name: string | null
  created_at: string
}

export interface UsedPurchase {
  id: number
  product_id: number
  seller_name: string
  seller_phone: string | null
  seller_id_number: string | null
  imei: string | null
  condition: string | null
  price: number
  created_at: string
}

export interface ProfitReport {
  revenue: number
  cost: number
  discounts: number
  returns_value: number
  expenses: number
  losses: number
  invoices: number
  items_sold: number
  products: { name: string; qty: number; revenue: number; cost: number }[]
  expenses_by_category: Record<string, number>
  days: { day: string; revenue: number; cost: number; invoices: number; expenses: number; losses: number }[]
}
