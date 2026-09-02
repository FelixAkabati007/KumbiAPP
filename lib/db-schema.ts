
// Expected Database Schema Definition for Synchronization Checks
// This should match database/schema.sql

export interface ColumnDefinition {
  name: string;
  type: string; // Simplified SQL type (e.g., 'varchar', 'uuid', 'decimal', 'boolean')
  nullable: boolean;
  isPrimary?: boolean;
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
}

export const EXPECTED_SCHEMA: TableDefinition[] = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'email', type: 'character varying', nullable: false },
      { name: 'name', type: 'character varying', nullable: false },
      { name: 'role', type: 'user_role', nullable: true }, // enum
      { name: 'password_hash', type: 'character varying', nullable: true },
      { name: 'email_verified', type: 'boolean', nullable: false },
      { name: 'is_active', type: 'boolean', nullable: true },
      { name: 'last_login', type: 'timestamp with time zone', nullable: true },
      { name: 'created_at', type: 'timestamp with time zone', nullable: true },
      { name: 'updated_at', type: 'timestamp with time zone', nullable: true },
    ]
  },
  {
    name: 'categories',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'name', type: 'character varying', nullable: false },
      { name: 'slug', type: 'character varying', nullable: false },
      { name: 'description', type: 'text', nullable: true },
    ]
  },
  {
    name: 'menu_items',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'name', type: 'character varying', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'price', type: 'numeric', nullable: false }, // decimal is numeric in pg
      { name: 'category_id', type: 'uuid', nullable: true },
      { name: 'image_url', type: 'text', nullable: true },
      { name: 'barcode', type: 'character varying', nullable: true },
      { name: 'is_available', type: 'boolean', nullable: true },
    ]
  },
  {
    name: 'orders',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'order_number', type: 'character varying', nullable: false },
      { name: 'user_id', type: 'uuid', nullable: true },
      { name: 'customer_name', type: 'character varying', nullable: true },
      { name: 'status', type: 'order_status', nullable: true },
      { name: 'total_amount', type: 'numeric', nullable: false },
      { name: 'payment_status', type: 'payment_status', nullable: true },
    ]
  },
  // Add other critical tables here
  {
    name: 'transactions',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'order_id', type: 'uuid', nullable: true },
      { name: 'amount', type: 'numeric', nullable: false },
      { name: 'status', type: 'character varying', nullable: false },
    ]
  },
  {
    name: 'settings',
    columns: [
        { name: 'id', type: 'integer', nullable: false, isPrimary: true },
        { name: 'data', type: 'jsonb', nullable: false },
    ]
  },
  {
    name: 'room_types',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'name', type: 'character varying', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'base_price', type: 'numeric', nullable: false },
      { name: 'max_occupants', type: 'integer', nullable: false },
      { name: 'amenities', type: 'jsonb', nullable: true },
      { name: 'is_active', type: 'boolean', nullable: true },
    ]
  },
  {
    name: 'rooms',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'room_number', type: 'character varying', nullable: false },
      { name: 'room_type_id', type: 'uuid', nullable: false },
      { name: 'floor', type: 'integer', nullable: true },
      { name: 'building', type: 'character varying', nullable: true },
      { name: 'status', type: 'character varying', nullable: true },
      { name: 'current_guest_id', type: 'uuid', nullable: true },
      { name: 'notes', type: 'text', nullable: true },
      { name: 'is_active', type: 'boolean', nullable: true },
    ]
  },
  {
    name: 'guests',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'first_name', type: 'character varying', nullable: false },
      { name: 'last_name', type: 'character varying', nullable: false },
      { name: 'email', type: 'character varying', nullable: true },
      { name: 'phone', type: 'character varying', nullable: true },
      { name: 'id_type', type: 'character varying', nullable: true },
      { name: 'id_number', type: 'character varying', nullable: true },
      { name: 'country', type: 'character varying', nullable: true },
      { name: 'address', type: 'text', nullable: true },
      { name: 'loyalty_points', type: 'integer', nullable: true },
      { name: 'is_vip', type: 'boolean', nullable: true },
    ]
  },
  {
    name: 'reservations',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'reservation_number', type: 'character varying', nullable: false },
      { name: 'guest_id', type: 'uuid', nullable: false },
      { name: 'room_id', type: 'uuid', nullable: true },
      { name: 'room_type_id', type: 'uuid', nullable: false },
      { name: 'check_in_date', type: 'date', nullable: false },
      { name: 'check_out_date', type: 'date', nullable: false },
      { name: 'number_of_guests', type: 'integer', nullable: false },
      { name: 'status', type: 'character varying', nullable: true },
      { name: 'total_price', type: 'numeric', nullable: true },
      { name: 'paid_amount', type: 'numeric', nullable: true },
      { name: 'special_requests', type: 'text', nullable: true },
      { name: 'source', type: 'character varying', nullable: true },
      { name: 'promo_code', type: 'character varying', nullable: true },
      { name: 'discount_percent', type: 'numeric', nullable: true },
    ]
  },
  {
    name: 'housekeeping_tasks',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'room_id', type: 'uuid', nullable: false },
      { name: 'task_type', type: 'character varying', nullable: false },
      { name: 'status', type: 'character varying', nullable: true },
      { name: 'assigned_to', type: 'uuid', nullable: true },
      { name: 'priority', type: 'character varying', nullable: true },
      { name: 'notes', type: 'text', nullable: true },
      { name: 'completed_at', type: 'timestamp with time zone', nullable: true },
    ]
  },
  {
    name: 'maintenance_tickets',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'ticket_number', type: 'character varying', nullable: false },
      { name: 'room_id', type: 'uuid', nullable: true },
      { name: 'issue_description', type: 'text', nullable: false },
      { name: 'severity', type: 'character varying', nullable: true },
      { name: 'status', type: 'character varying', nullable: true },
      { name: 'assigned_to', type: 'uuid', nullable: true },
      { name: 'notes', type: 'text', nullable: true },
      { name: 'completed_at', type: 'timestamp with time zone', nullable: true },
    ]
  },
  {
    name: 'guest_folios',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'reservation_id', type: 'uuid', nullable: false },
      { name: 'room_charge', type: 'numeric', nullable: false },
      { name: 'service_charges', type: 'numeric', nullable: true },
      { name: 'food_charges', type: 'numeric', nullable: true },
      { name: 'other_charges', type: 'numeric', nullable: true },
      { name: 'total_charges', type: 'numeric', nullable: false },
      { name: 'paid_amount', type: 'numeric', nullable: true },
      { name: 'balance', type: 'numeric', nullable: false },
    ]
  },
  {
    name: 'complaints',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'submitted_by', type: 'uuid', nullable: false },
      { name: 'department', type: 'character varying', nullable: false },
      { name: 'subject_type', type: 'character varying', nullable: false },
      { name: 'subject_user_id', type: 'uuid', nullable: true },
      { name: 'title', type: 'character varying', nullable: false },
      { name: 'description', type: 'text', nullable: false },
      { name: 'priority', type: 'character varying', nullable: false },
      { name: 'status', type: 'character varying', nullable: false },
      { name: 'assigned_to', type: 'uuid', nullable: true },
      { name: 'parent_complaint_id', type: 'uuid', nullable: true },
      { name: 'confidentiality', type: 'character varying', nullable: false },
      { name: 'reservation_id', type: 'uuid', nullable: true },
      { name: 'folio_id', type: 'uuid', nullable: true },
      { name: 'order_id', type: 'character varying', nullable: true },
      { name: 'receipt_id', type: 'uuid', nullable: true },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false },
      { name: 'acknowledged_at', type: 'timestamp with time zone', nullable: true },
      { name: 'resolved_at', type: 'timestamp with time zone', nullable: true },
      { name: 'closed_at', type: 'timestamp with time zone', nullable: true },
    ]
  },
  {
    name: 'complaint_messages',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'complaint_id', type: 'uuid', nullable: false },
      { name: 'author_id', type: 'uuid', nullable: false },
      { name: 'message', type: 'text', nullable: false },
      { name: 'is_internal', type: 'boolean', nullable: false },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false },
    ]
  },
  {
    name: 'hotel_receipts',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'reservation_id', type: 'uuid', nullable: false },
      { name: 'folio_id', type: 'uuid', nullable: true },
      { name: 'order_id', type: 'character varying', nullable: false },
      { name: 'order_number', type: 'character varying', nullable: false },
      { name: 'receipt_type', type: 'character varying', nullable: false },
      { name: 'version', type: 'integer', nullable: false },
      { name: 'snapshot', type: 'jsonb', nullable: false },
      { name: 'download_pathname', type: 'text', nullable: true },
      { name: 'print_status', type: 'character varying', nullable: false },
      { name: 'print_error', type: 'text', nullable: true },
      { name: 'created_by', type: 'uuid', nullable: true },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false },
    ]
  },
  {
    name: 'guest_folio_items',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, isPrimary: true },
      { name: 'reservation_id', type: 'uuid', nullable: false },
      { name: 'folio_id', type: 'uuid', nullable: false },
      { name: 'category', type: 'character varying', nullable: false },
      { name: 'description', type: 'text', nullable: false },
      { name: 'quantity', type: 'numeric', nullable: false },
      { name: 'unit_amount', type: 'numeric', nullable: false },
      { name: 'total_amount', type: 'numeric', nullable: false },
      { name: 'source_type', type: 'character varying', nullable: false },
      { name: 'source_id', type: 'character varying', nullable: true },
      { name: 'created_by', type: 'uuid', nullable: true },
      { name: 'created_at', type: 'timestamp with time zone', nullable: false },
    ]
  }
];
