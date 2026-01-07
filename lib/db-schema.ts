
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
  }
];
