# Masters Module — Comprehensive QA Test Plan

## How to Use This Prompt
Copy the section(s) you want to test and run them against the application. Each test case includes the action, expected result, and edge cases.

---

## 1. CUSTOMERS

### 1.1 List Page
- [ ] Navigate to `/masters/customers` — page loads with DataTable, search bar, status filter
- [ ] Verify default pagination: page 1, limit 50
- [ ] Verify columns: Customer Code, Name, GSTIN, Status, Contact, Phone
- [ ] Click a row — navigates to customer detail/edit page
- [ ] Press `Ctrl+N` — navigates to new customer form

### 1.2 Search & Filters
- [ ] Type a customer name in search — results filter after debounce (300ms)
- [ ] Search by customer_code (e.g., "CUST-0001") — finds match
- [ ] Search by GSTIN — finds match
- [ ] Search by display_name — finds match
- [ ] Clear search — full list returns
- [ ] Filter by Status = "active" — only active customers shown
- [ ] Filter by Status = "inactive" — only inactive shown
- [ ] Filter by Status = "blocked" — only blocked shown
- [ ] Combine search + status filter — both applied simultaneously
- [ ] Search with no results — shows empty state message
- [ ] **Edge**: Search with special characters (`%`, `_`, `'`, `"`) — no SQL injection, handles gracefully
- [ ] **Edge**: Search with only whitespace — treated as empty, shows all records

### 1.3 Create Customer — Happy Path
- [ ] Click "New Customer" — form loads with empty fields
- [ ] Verify auto-generated customer code (CUST-XXXX format)
- [ ] Fill: Name = "Test Customer", Type = "company", GSTIN, PAN, Payment Terms = 30
- [ ] Save — success toast, redirects to detail page
- [ ] Verify customer appears in list with correct data

### 1.4 Create Customer — Validations
- [ ] Submit with empty Name — error: "Customer name is required"
- [ ] Submit without selecting any required fields — all validation errors shown
- [ ] Enter GSTIN with less than 15 chars (e.g., "29ABCDE") — error on GSTIN format
- [ ] Enter GSTIN with exactly 15 chars — accepted
- [ ] Enter PAN with less than 10 chars — error on PAN format
- [ ] Enter PAN with exactly 10 chars — accepted
- [ ] **Edge**: Enter GSTIN in lowercase — should auto-convert to uppercase
- [ ] **Edge**: Enter PAN in lowercase — should auto-convert to uppercase
- [ ] **Edge**: Enter credit_limit as negative — should reject or default to 0
- [ ] **Edge**: Enter payment_terms_days as 0 — should accept
- [ ] **Edge**: Enter payment_terms_days as negative — should reject
- [ ] **Edge**: Enter extremely long name (500+ chars) — should truncate or reject (DB max 255)
- [ ] **Edge**: Enter duplicate customer_code — error: unique constraint violation
- [ ] **Edge**: Rapid double-click Save — should not create duplicate records

### 1.5 Edit Customer
- [ ] Open existing customer — all fields pre-populated correctly
- [ ] Change name — save — name updated
- [ ] Change status from active to inactive — save — status updates
- [ ] Change status to blocked — save — status updates
- [ ] **Edge**: Edit customer that has linked Sales Orders — should still allow edits
- [ ] **Edge**: Edit customer opened in two tabs — second save should handle version conflict

### 1.6 Delete Customer
- [ ] Delete a customer with no linked transactions — soft deleted, removed from list
- [ ] **Edge**: Delete customer with linked Sales Orders/Invoices — should show warning or prevent
- [ ] **Edge**: Try to find deleted customer by searching — should NOT appear
- [ ] **Edge**: Delete already deleted customer — should handle gracefully (404 or no-op)

### 1.7 Contact Persons (Nested)
- [ ] Add contact: Name, Designation, Phone, Mobile, Email, is_primary = true — saved
- [ ] Add second contact with is_primary = true — first should become non-primary (only one primary)
- [ ] Edit existing contact — changes saved
- [ ] Delete a contact — removed from list
- [ ] **Edge**: Add contact with empty name — should reject (name required)
- [ ] **Edge**: Add contact with invalid email format — should show validation error
- [ ] **Edge**: Add contact with phone containing letters — should accept or reject per validation rules
- [ ] **Edge**: Delete the only contact — should allow (contacts are optional)
- [ ] **Edge**: Add more than 10 contacts — should handle gracefully

### 1.8 Addresses (Nested)
- [ ] Add billing address: Line1, City, State (from dropdown), Pincode, Country — saved
- [ ] Add shipping address — saved, both visible
- [ ] Set one address as default — verified as default
- [ ] Edit existing address — changes saved
- [ ] Delete an address — removed from list
- [ ] **Edge**: Add address with empty address_line1 — should reject (required)
- [ ] **Edge**: Add address with empty city — should reject (required)
- [ ] **Edge**: Add address with empty state — should reject (required)
- [ ] **Edge**: Add address with empty pincode — should reject (required)
- [ ] **Edge**: Enter pincode with letters — should reject or allow per rules
- [ ] **Edge**: Set two addresses as default — only last one should be default
- [ ] **Edge**: Delete default address — should handle gracefully

### 1.9 Customer — Opening Balance
- [ ] Set opening_balance = 50000, type = "debit" — saved
- [ ] Set opening_balance = 25000, type = "credit" — saved
- [ ] **Edge**: Set opening_balance as negative — should reject
- [ ] **Edge**: Set opening_balance = 0 — should accept

### 1.10 Customer — TDS Configuration
- [ ] Set tds_applicable = true, tds_section = "194C", tds_rate = 2.00 — saved
- [ ] Set tds_applicable = false — tds fields should clear or be ignored
- [ ] **Edge**: Set tds_rate > 100 — should reject
- [ ] **Edge**: Set tds_rate as negative — should reject
- [ ] **Edge**: Set tds_applicable = true but no section/rate — should warn or reject

---

## 2. VENDORS

### 2.1 List Page
- [ ] Navigate to `/masters/vendors` — page loads with DataTable
- [ ] Verify columns: Vendor Code, Name, GSTIN, Status, Preferred star, Contact
- [ ] Click row — navigates to vendor detail/edit
- [ ] Press `Ctrl+N` — navigates to new vendor form

### 2.2 Search & Filters
- [ ] Search by vendor name — filters correctly
- [ ] Search by vendor_code — finds match
- [ ] Search by GSTIN — finds match
- [ ] Filter by Status = "active" / "inactive" / "blocked" — filters correctly
- [ ] **Edge**: Search with very long string (200+ chars) — no crash

### 2.3 Create Vendor — Happy Path
- [ ] Fill: Name, Type = "company", GSTIN, PAN, Payment Terms, MSME details — save
- [ ] Verify auto-generated vendor_code
- [ ] Verify is_preferred toggle (star icon)
- [ ] Verify reliability_score defaults to 100.00
- [ ] Verify average_lead_days defaults to 7

### 2.4 Create Vendor — Validations
- [ ] Submit with empty name — error
- [ ] Duplicate vendor_code — error
- [ ] Invalid GSTIN format — error
- [ ] **Edge**: Set reliability_score > 100 — should reject or cap
- [ ] **Edge**: Set reliability_score < 0 — should reject
- [ ] **Edge**: Set average_lead_days as negative — should reject
- [ ] **Edge**: Set credit_limit as very large number (9999999999999) — should handle DB precision limit

### 2.5 MSME Fields
- [ ] Set msme_registered = true, enter msme_number — saved
- [ ] Set msme_registered = false — msme_number should be cleared/ignored
- [ ] **Edge**: Set msme_registered = true with empty msme_number — should warn

### 2.6 Vendor Contacts & Addresses
- [ ] Same test cases as Customer Contacts (1.7) and Addresses (1.8)
- [ ] Verify entity_type = 'vendor' in database

### 2.7 Item-Vendor Mapping
- [ ] Navigate to vendor detail — see "Supplied Items" section
- [ ] Add item mapping: select item, vendor_item_code, vendor_price, lead_time, min_order_qty, priority
- [ ] Edit item mapping — changes saved
- [ ] Delete item mapping — removed
- [ ] **Edge**: Map same item twice to same vendor — should reject (duplicate)
- [ ] **Edge**: Set vendor_price as negative — should reject
- [ ] **Edge**: Set minimum_order_qty as 0 — should accept
- [ ] **Edge**: Set priority as 0 or negative — should handle gracefully
- [ ] **Edge**: Delete an item that is mapped to vendor — check cascade behavior

### 2.8 Vendor — TDS Configuration
- [ ] Same test cases as Customer TDS (1.10)

### 2.9 Vendor — Opening Balance
- [ ] Same test cases as Customer Opening Balance (1.9)

---

## 3. ITEMS (Raw Materials / Components)

### 3.1 List Page
- [ ] Navigate to `/masters/items` — page loads
- [ ] Verify columns: Item Code, Name, Type, Category, UOM, Purchase Price, Status
- [ ] Filter by item_type = "raw_material" — only raw materials shown
- [ ] Filter by item_type = "component" — only components shown
- [ ] Filter by item_type = "consumable" — only consumables shown
- [ ] Filter by item_type = "packing" — only packing items shown
- [ ] Filter by category_id — only items in that category shown
- [ ] Combine type + category + status + search — all filters applied simultaneously

### 3.2 Create Item — Happy Path
- [ ] Fill: item_code, name, item_type = "raw_material", primary_uom_id (select from dropdown)
- [ ] Set: hsn_code, gst_rate, purchase_price, selling_price
- [ ] Set: min_stock_threshold, reorder_quantity, max_stock_level
- [ ] Set: costing_method = "weighted_avg"
- [ ] Set: batch_tracking = true, serial_tracking = false
- [ ] Save — success, item created

### 3.3 Create Item — Validations
- [ ] Submit without item_code — error: required
- [ ] Submit without name — error: required
- [ ] Submit without primary_uom_id — error: required
- [ ] Duplicate item_code — error: unique constraint
- [ ] **Edge**: item_code with special characters (`/`, `\`, `@`) — should accept or reject per rules
- [ ] **Edge**: item_code with spaces — should trim or reject
- [ ] **Edge**: Set purchase_price = 0 — should accept
- [ ] **Edge**: Set purchase_price as negative — should reject
- [ ] **Edge**: Set gst_rate = 0 — should accept (exempt goods)
- [ ] **Edge**: Set gst_rate > 100 — should reject
- [ ] **Edge**: Set min_stock > max_stock — should warn (logical inconsistency)
- [ ] **Edge**: Set reorder_quantity > max_stock — should warn
- [ ] **Edge**: Set shelf_life_days = 0 — should accept or reject
- [ ] **Edge**: Set lead_time_days = 0 — should accept
- [ ] **Edge**: Set weight as negative — should reject

### 3.4 Item — Costing Methods
- [ ] Create item with costing_method = "fifo" — saved
- [ ] Create item with costing_method = "weighted_avg" — saved
- [ ] Create item with costing_method = "standard" — saved, standard_cost field becomes relevant
- [ ] **Edge**: Change costing_method on item with existing stock — should warn (impacts valuation)

### 3.5 Item — Batch & Serial Tracking
- [ ] Enable batch_tracking — saved
- [ ] Enable serial_tracking — saved
- [ ] Enable both — saved
- [ ] **Edge**: Disable batch_tracking on item with existing batches in stock — should warn

### 3.6 Item Alternatives
- [ ] Add alternative item with conversion_factor = 1.0, priority = 1 — saved
- [ ] Add second alternative with priority = 2 — saved
- [ ] Edit alternative — changes saved
- [ ] Delete alternative — removed
- [ ] **Edge**: Set item as its own alternative — should reject (self-reference)
- [ ] **Edge**: Set conversion_factor = 0 — should reject
- [ ] **Edge**: Set conversion_factor as negative — should reject
- [ ] **Edge**: Add duplicate alternative (same item pair) — should reject

### 3.7 Edit & Delete Item
- [ ] Edit all fields — save — all changes persisted
- [ ] Delete item with no stock or transactions — soft deleted
- [ ] **Edge**: Delete item used in a BOM — should warn or prevent
- [ ] **Edge**: Delete item with stock in warehouse — should warn or prevent
- [ ] **Edge**: Delete item mapped to a vendor — check cascade behavior

---

## 4. PRODUCTS (Finished Goods / Semi-Finished)

### 4.1 List Page
- [ ] Navigate to `/masters/products` — page loads
- [ ] Verify columns: Product Code, Name, Type, Category, UOM, Selling Price, Status
- [ ] Filter by product_type = "finished_goods" — filters correctly
- [ ] Filter by product_type = "semi_finished" — filters correctly
- [ ] Filter by category_id — filters correctly
- [ ] Combine all filters + search — works correctly

### 4.2 Create Product — Happy Path
- [ ] Fill: product_code, name, product_type, primary_uom_id, hsn_code, gst_rate, selling_price
- [ ] Set: standard_cost, min_stock, reorder_qty, max_stock
- [ ] Set: batch_tracking, warranty_months, weight, weight_uom
- [ ] Save — success

### 4.3 Create Product — Validations
- [ ] Submit without product_code — error
- [ ] Submit without name — error
- [ ] Submit without primary_uom_id — error
- [ ] Duplicate product_code — error
- [ ] **Edge**: Same validation edge cases as Items (3.3)
- [ ] **Edge**: Set warranty_months = 0 — should accept (no warranty)
- [ ] **Edge**: Set warranty_months as negative — should reject

### 4.4 Product Detail — BOM Integration
- [ ] View product detail — shows active BOM, BOM lines, BOM versions
- [ ] Verify total_material_cost is calculated from BOM lines
- [ ] Verify BOM versions listed with status (draft, active, obsolete)
- [ ] **Edge**: Product with no BOM — shows "No BOM defined" message

### 4.5 Delete Product
- [ ] Delete product with no BOM or stock — soft deleted
- [ ] **Edge**: Delete product with active BOM — should warn or prevent
- [ ] **Edge**: Delete product with stock in warehouse — should warn or prevent
- [ ] **Edge**: Delete product linked to Work Orders — should warn or prevent

---

## 5. BILL OF MATERIALS (BOM)

### 5.1 List Page
- [ ] Navigate to `/masters/boms` — page loads
- [ ] Verify columns: BOM Code, Product, Version, Output Qty, Status
- [ ] Filter by status = "draft" / "active" / "obsolete"
- [ ] Filter by product_id — shows BOMs for specific product
- [ ] Search by BOM code or product name

### 5.2 Create BOM — Happy Path
- [ ] Select product, set output_quantity, output_uom, expected_yield_pct
- [ ] Add line 1: component_type = "item", select item, quantity, uom, wastage_pct
- [ ] Add line 2: component_type = "product" (sub-assembly), select product, quantity
- [ ] Save as draft — success, BOM created with status "draft"
- [ ] Verify total_material_cost calculated correctly

### 5.3 Create BOM — Validations
- [ ] Submit without selecting product — error
- [ ] Submit with no lines — error: "At least one component required"
- [ ] Submit line without component (no item or product selected) — should skip empty lines
- [ ] Submit line with quantity = 0 — should reject
- [ ] Submit line with quantity negative — should reject
- [ ] **Edge**: Set wastage_pct > 100 — should reject
- [ ] **Edge**: Set wastage_pct negative — should reject
- [ ] **Edge**: Set expected_yield_pct = 0 — should reject or warn (no output)
- [ ] **Edge**: Set output_quantity = 0 — should reject
- [ ] **Edge**: Add the finished product as its own component — should reject (circular reference)
- [ ] **Edge**: Add same component twice — should warn or allow (may be valid for different line purposes)

### 5.4 BOM Status Transitions
- [ ] Draft -> Activate: POST /boms/:id/activate — status becomes "active"
- [ ] Active -> Obsolete: POST /boms/:id/obsolete — status becomes "obsolete"
- [ ] **Edge**: Activate BOM with no lines — should reject
- [ ] **Edge**: Activate when another active BOM exists for same product — should mark old one obsolete automatically or reject
- [ ] **Edge**: Try to edit an active BOM — should be read-only (create new version instead)
- [ ] **Edge**: Try to delete an active BOM — should prevent

### 5.5 BOM Versioning
- [ ] Create BOM v1 for product, activate
- [ ] Create BOM v2 for same product — version auto-increments
- [ ] Activate v2 — v1 should become obsolete
- [ ] Verify version history shown on product detail page

### 5.6 BOM Lines — Update
- [ ] PUT /boms/:id/lines — replaces all lines (soft deletes old, inserts new)
- [ ] Verify old lines are soft-deleted (is_deleted = true)
- [ ] Verify new lines have correct line_number ordering
- [ ] **Edge**: Update lines on non-draft BOM — should reject

### 5.7 BOM Cost Calculation
- [ ] Verify total cost = SUM(component_cost * quantity * (1 + wastage_pct/100))
- [ ] For item components: cost = item.purchase_price
- [ ] For product components: cost = product.standard_cost
- [ ] **Edge**: Component with NULL cost — should default to 0
- [ ] **Edge**: BOM with 0 lines after filtering empties — should handle gracefully

---

## 6. UNITS OF MEASUREMENT (UOM)

### 6.1 List & Create
- [ ] Navigate to UOM settings — list of all UOMs shown
- [ ] Create: code = "BOX", name = "Box", category = "count", decimal_places = 0 — saved
- [ ] Create: code = "KG", name = "Kilogram", category = "weight", decimal_places = 3 — saved
- [ ] **Edge**: Duplicate code — error
- [ ] **Edge**: Empty code — error
- [ ] **Edge**: Empty name — error
- [ ] **Edge**: code with spaces — should trim or reject
- [ ] **Edge**: decimal_places negative — should reject
- [ ] **Edge**: decimal_places > 6 — should handle (DB stores as integer)

### 6.2 UOM Conversions
- [ ] Create conversion: KG -> G, factor = 1000 — saved
- [ ] Create conversion: BOX -> PCS, factor = 12 — saved
- [ ] **Edge**: conversion_factor = 0 — should reject (division by zero risk)
- [ ] **Edge**: conversion_factor negative — should reject
- [ ] **Edge**: Create A->B and B->A conversions — both should exist (different directions)
- [ ] **Edge**: Create duplicate conversion (same from/to pair) — should reject

### 6.3 UOM Deletion
- [ ] Delete UOM not used anywhere — deleted
- [ ] **Edge**: Delete UOM used as primary_uom on items — should prevent
- [ ] **Edge**: Delete UOM used in BOM lines — should prevent
- [ ] **Edge**: Deactivate UOM — should still allow existing records but prevent new usage

---

## 7. ITEM CATEGORIES

### 7.1 CRUD
- [ ] Create root category: "Electronics" — saved
- [ ] Create child category: "Resistors" with parent = "Electronics" — saved
- [ ] Create grandchild: "SMD Resistors" with parent = "Resistors" — saved (3 levels)
- [ ] Edit category name — updated
- [ ] Delete leaf category — deleted
- [ ] **Edge**: Delete category with child categories — should prevent or cascade
- [ ] **Edge**: Delete category with items linked — should prevent
- [ ] **Edge**: Create category with empty name — error
- [ ] **Edge**: Set parent_id to itself — should reject (circular reference)
- [ ] **Edge**: Create deep nesting (10+ levels) — should handle gracefully

### 7.2 Category Hierarchy Display
- [ ] Verify tree structure renders correctly in UI
- [ ] Verify parent-child relationships shown with indentation
- [ ] Verify category dropdown in Items/Products form shows hierarchy

---

## 8. TAX MASTERS

### 8.1 GST Tax Rates
- [ ] Create GST tax: rate = 18%, cgst = 9%, sgst = 9%, igst = 18% — saved
- [ ] Create GST exempt: rate = 0%, all components = 0% — saved
- [ ] Create 28% GST with cess: rate = 28%, cess_rate = 12% — saved
- [ ] Verify cgst + sgst = rate (intra-state)
- [ ] Verify igst = rate (inter-state)
- [ ] **Edge**: cgst + sgst != rate — should warn or auto-calculate
- [ ] **Edge**: rate negative — should reject
- [ ] **Edge**: rate > 100 — should reject
- [ ] **Edge**: Set effective_to before effective_from — should reject

### 8.2 TDS Tax Rates
- [ ] Create TDS: section 194C, rate = 2% — saved
- [ ] Create TDS: section 194J, rate = 10% — saved
- [ ] **Edge**: Duplicate section+rate combination — should handle

### 8.3 Tax Effective Dates
- [ ] Create tax effective from today — active
- [ ] Create tax with future effective_from — should be valid but not yet applicable
- [ ] Create tax with past effective_to — should be expired/inactive
- [ ] **Edge**: Overlapping effective dates for same tax type — should warn

---

## 9. BRANDS

### 9.1 CRUD
- [ ] Create brand: name = "Bosch", code = "BOSCH" — saved
- [ ] Create brand with manufacturer link — saved
- [ ] Edit brand name — updated
- [ ] Delete brand not used on any items — deleted
- [ ] **Edge**: Delete brand used on items — should prevent or unlink
- [ ] **Edge**: Empty name — error
- [ ] **Edge**: Duplicate code — error

---

## 10. MANUFACTURERS

### 10.1 CRUD
- [ ] Create manufacturer: name, code, country, website — saved
- [ ] Edit — updated
- [ ] Delete unused manufacturer — deleted
- [ ] **Edge**: Delete manufacturer linked to brands — should prevent or unlink
- [ ] **Edge**: Empty name — error
- [ ] **Edge**: Invalid website URL format — should accept (no strict validation) or reject

---

## 11. BRANCHES

### 11.1 CRUD
- [ ] Create branch: code = "BR02", name = "Mumbai Branch", address, GSTIN — saved
- [ ] Verify unique constraint on (company_id, code)
- [ ] Edit branch details — updated
- [ ] **Edge**: Delete main branch (is_main_branch = true) — should prevent
- [ ] **Edge**: Delete branch with warehouses — should prevent
- [ ] **Edge**: Delete branch with transactions — should prevent
- [ ] **Edge**: Duplicate branch code — error
- [ ] **Edge**: Empty code — error
- [ ] **Edge**: Empty name — error
- [ ] **Edge**: GSTIN format validation (if applicable per branch)

---

## 12. WAREHOUSES

### 12.1 CRUD
- [ ] Create warehouse: code, name, branch_id, warehouse_type = "main" — saved
- [ ] Create: type = "raw_material" — saved
- [ ] Create: type = "finished_goods" — saved
- [ ] Create: type = "scrap" — saved
- [ ] Set is_default = true — saved (only one default per branch)
- [ ] **Edge**: Two warehouses set as default in same branch — only latest should be default
- [ ] **Edge**: Delete warehouse with stock — should prevent
- [ ] **Edge**: Delete warehouse used in stock_summary — should prevent
- [ ] **Edge**: Empty code — error
- [ ] **Edge**: Empty name — error
- [ ] **Edge**: Warehouse without branch — error (required)
- [ ] **Edge**: Duplicate (company_id, code) — error

---

## 13. DOCUMENT SEQUENCES

### 13.1 Configuration
- [ ] Create sequence: type = "sales_order", prefix = "SO-", pad_length = 4, reset = "yearly"
- [ ] Verify next number: SO-0001
- [ ] Create another document — number increments to SO-0002
- [ ] **Edge**: Set pad_length = 0 — numbers without zero-padding
- [ ] **Edge**: Set pad_length = 10 — very long numbers (SO-0000000001)
- [ ] **Edge**: Set prefix with special characters — should handle
- [ ] **Edge**: Concurrent document creation — should not generate duplicate numbers (atomic increment)
- [ ] **Edge**: Reset yearly — verify counter resets on financial year change
- [ ] **Edge**: Reset monthly — verify counter resets every month
- [ ] **Edge**: Reset never — counter never resets

### 13.2 All Document Types
- [ ] Verify sequences configurable for: quotation, sales_order, invoice, credit_note, po, grn, vendor_bill, debit_note, work_order, delivery_challan, payment_receipt, payment_made
- [ ] Each type generates numbers independently

---

## 14. LOCATION DEFINITIONS

### 14.1 CRUD
- [ ] Create location: code, name, branch_id — saved
- [ ] Edit — updated
- [ ] Delete unused location — deleted
- [ ] **Edge**: Delete location linked to products as manufacturing_location — should prevent
- [ ] **Edge**: Empty code — error
- [ ] **Edge**: Empty name — error

---

## 15. COMPANY SETUP

### 15.1 Initial Setup Flow
- [ ] POST /setup — creates company, admin user, main branch, financial year in one transaction
- [ ] Verify all entities created correctly
- [ ] **Edge**: Call setup twice — should prevent (company already exists)
- [ ] **Edge**: Setup with missing company name — error
- [ ] **Edge**: Setup with missing admin email — error
- [ ] **Edge**: Setup with invalid email format — error

### 15.2 Company Settings Edit
- [ ] Edit company name, display_name — saved
- [ ] Edit address, phone, email, website — saved
- [ ] Edit GSTIN, PAN, TAN, CIN — saved with format validation
- [ ] **Edge**: Change base_currency after transactions exist — should warn
- [ ] **Edge**: Change financial_year_start after transactions — should warn

---

## 16. CROSS-ENTITY INTEGRATION TESTS

### 16.1 Customer -> Sales Flow
- [ ] Create customer -> Create Sales Order for that customer -> Create Invoice
- [ ] Verify customer details propagate to SO and Invoice
- [ ] Block customer -> Try to create new SO — should prevent

### 16.2 Vendor -> Purchase Flow
- [ ] Create vendor -> Map items -> Create PO for vendor
- [ ] Verify vendor item prices auto-populate in PO lines
- [ ] Block vendor -> Try to create new PO — should prevent

### 16.3 Item -> Inventory Flow
- [ ] Create item -> Create GRN (receive stock) -> Check stock_summary
- [ ] Verify stock appears in Stock Summary page
- [ ] Verify item_code and item_name show correctly

### 16.4 Product -> Manufacturing Flow
- [ ] Create product -> Create BOM -> Activate BOM -> Create Work Order
- [ ] Verify BOM lines explode into WO lines correctly
- [ ] Product stock shows in Stock Summary after production

### 16.5 UOM -> Item -> BOM Chain
- [ ] Create UOM "Pack" -> Create item with primary_uom = "Pack"
- [ ] Use item in BOM with UOM = "Pack" and quantity = 5
- [ ] Verify UOM displays correctly throughout the chain

### 16.6 Category -> Item/Product Filter
- [ ] Create category hierarchy -> Assign items to categories
- [ ] Filter items by category — correct items shown
- [ ] Delete category — items retain category_id (may show orphaned) or get uncategorized

---

## 17. PAGINATION TESTS

### 17.1 All List Pages
- [ ] Create 60+ records in any master (e.g., items)
- [ ] Page 1 shows 50 records
- [ ] Navigate to page 2 — shows remaining records
- [ ] Total count in DataTable header is correct
- [ ] **Edge**: Page = 0 — should default to 1
- [ ] **Edge**: Page = 99999 (beyond total) — should show empty with correct total
- [ ] **Edge**: Limit = 0 — should default to 50
- [ ] **Edge**: Limit = -1 — should default to 50
- [ ] **Edge**: Limit = 10000 — should cap or handle (performance)

---

## 18. SOFT DELETE & AUDIT TRAIL

### 18.1 Soft Delete Behavior
- [ ] Delete any master record — `is_deleted` = true, `deleted_at` set, `deleted_by` set
- [ ] Deleted records do NOT appear in list queries
- [ ] Deleted records do NOT appear in search results
- [ ] Deleted records do NOT appear in dropdown selectors (e.g., item selection in BOM)
- [ ] **Edge**: API call to GET deleted record by ID — should return 404

### 18.2 Audit Fields
- [ ] Create record — verify `created_at`, `created_by` populated
- [ ] Update record — verify `updated_at` changes, `updated_by` set
- [ ] Verify `version` increments on each update (trigger-based)
- [ ] Verify `sync_status` set to 'pending' on update (trigger-based)

---

## 19. API EDGE CASES (Cross-Cutting)

### 19.1 Authentication & Authorization
- [ ] Call any master API without JWT token — 401 Unauthorized
- [ ] Call with expired JWT — 401, redirect to login
- [ ] Call with valid JWT but wrong company_id — should not return data from other companies
- [ ] **Edge**: Manipulate company_id in request body — should be overridden by JWT context

### 19.2 Multi-Company Isolation
- [ ] Create same item_code in two different companies — both succeed (unique per company, not global)
- [ ] User of Company A cannot see/edit records of Company B
- [ ] All list APIs filter by `company_id` from JWT

### 19.3 Concurrent Access
- [ ] Two users edit same customer simultaneously — last save wins, version incremented
- [ ] Two users create customers simultaneously — both get unique codes
- [ ] Document sequence under concurrent load — no duplicate numbers

### 19.4 Large Data Sets
- [ ] 10,000+ items — list page loads within 3 seconds
- [ ] Search across 10,000+ items — results return within 2 seconds
- [ ] Filters + search + pagination on large dataset — responsive

### 19.5 Invalid Inputs
- [ ] Send non-UUID as `:id` parameter — 400 or 500, not crash
- [ ] Send empty body on POST — proper validation errors
- [ ] Send extra unknown fields in body — ignored, no error
- [ ] Send null for required fields — validation error
- [ ] Send array where string expected — type error handled gracefully
- [ ] **Edge**: SQL injection in search: `'; DROP TABLE items;--` — sanitized, no effect
- [ ] **Edge**: XSS in name field: `<script>alert('xss')</script>` — stored but rendered safely

---

## 20. UI/UX TESTS

### 20.1 Keyboard Shortcuts
- [ ] `Ctrl+N` on list pages — navigates to create form
- [ ] `Ctrl+Enter` on form pages — saves the record
- [ ] `Escape` on form pages — navigates back to list

### 20.2 Loading States
- [ ] All list pages show skeleton/loading while fetching data
- [ ] Save button shows "Saving..." while in progress
- [ ] Save button disabled during save (prevents double-submit)

### 20.3 Toast Notifications
- [ ] Success: "Customer created", "Item updated", "BOM activated"
- [ ] Error: Validation errors shown as toast
- [ ] Error: Server errors shown as toast with message

### 20.4 Form Reset
- [ ] Navigate away from unsaved form — no stale data on return
- [ ] Create form → Save → Navigate to create again — form is fresh/empty

### 20.5 Responsive Behavior
- [ ] Forms render correctly on smaller screens
- [ ] DataTable scrolls horizontally on narrow screens
- [ ] Dropdowns don't overflow viewport

### 20.6 Empty States
- [ ] Fresh system with no data — each list page shows "No records found" message
- [ ] Filtered results with no matches — shows appropriate empty message

---

## 21. DATA INTEGRITY TESTS

### 21.1 Foreign Key Integrity
- [ ] Create item with valid category_id — success
- [ ] Create item with non-existent category_id — error (FK violation)
- [ ] Create item with valid primary_uom_id — success
- [ ] Create item with non-existent UOM ID — error
- [ ] Create BOM line with valid component_item_id — success
- [ ] Create BOM line with non-existent item_id — error
- [ ] Create warehouse with valid branch_id — success
- [ ] Create warehouse with non-existent branch_id — error

### 21.2 Unique Constraints
- [ ] (company_id, customer_code) — unique
- [ ] (company_id, vendor_code) — unique
- [ ] (company_id, item_code) — unique
- [ ] (company_id, product_code) — unique
- [ ] (company_id, branch code) — unique
- [ ] (company_id, warehouse code) — unique
- [ ] (company_id, uom code) — unique
- [ ] (company_id, bom_code) — unique

### 21.3 Check Constraints
- [ ] Item type must be: raw_material, component, consumable, packing
- [ ] Product type must be: finished_goods, semi_finished
- [ ] Warehouse type must be: main, raw_material, finished_goods, scrap
- [ ] Customer status must be: active, inactive, blocked
- [ ] BOM status must be: draft, active, obsolete
- [ ] Address type must be: billing, shipping
- [ ] Contact entity_type must be: customer, vendor
- [ ] Invalid values for any CHECK constraint — DB error
