-- ============================================================================
-- CAMPUS CANTEEN EXPRESS - DATABASE SCHEMA DDL
-- Compatible with SQLite (local development) & MySQL (production migration)
-- ============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADMIN', 'CANTEEN_STAFF')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. MENU ITEMS TABLE
CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('Sandwiches', 'Snacks', 'Meals', 'Rolls', 'Drinks', 'Desserts')),
    base_price DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
    prep_time_minutes INTEGER NOT NULL DEFAULT 10 CHECK (prep_time_minutes >= 0),
    is_available BOOLEAN NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
    image_url VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available);

-- 3. MENU ITEM VARIANTS TABLE
CREATE TABLE IF NOT EXISTS menu_item_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL,
    variant_name VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item_id ON menu_item_variants(menu_item_id);

-- 4. PICKUP SLOTS TABLE
CREATE TABLE IF NOT EXISTS pickup_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 15 CHECK (max_capacity > 0),
    current_orders INTEGER NOT NULL DEFAULT 0 CHECK (current_orders >= 0),
    is_active BOOLEAN NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_slot_date_window UNIQUE (slot_date, start_time, end_time),
    CONSTRAINT chk_slot_capacity CHECK (current_orders <= max_capacity)
);

CREATE INDEX IF NOT EXISTS idx_pickup_slots_date ON pickup_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_pickup_slots_active ON pickup_slots(is_active);
CREATE INDEX IF NOT EXISTS idx_pickup_slots_lookup ON pickup_slots(slot_date, is_active);

-- 5. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number VARCHAR(20) NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    pickup_slot_id INTEGER NOT NULL,
    pickup_token VARCHAR(10) NOT NULL,
    token_hash VARCHAR(64) NOT NULL DEFAULT '',
    order_type VARCHAR(10) NOT NULL DEFAULT 'TODAY' CHECK (order_type IN ('TODAY', 'TOMORROW')),
    pickup_date DATE,
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    express_fee DECIMAL(10, 2) NOT NULL DEFAULT 3.00 CHECK (express_fee >= 0),
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PLACED' CHECK (status IN ('INITIATED', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED')),
    cancellation_reason VARCHAR(255),
    ready_at DATETIME,
    collected_at DATETIME,
    cancelled_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (pickup_slot_id) REFERENCES pickup_slots(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_slot_id ON orders(pickup_slot_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_token ON orders(pickup_token);
CREATE INDEX IF NOT EXISTS idx_orders_token_hash ON orders(token_hash);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_date ON orders(pickup_date);

-- 6. ORDER ITEMS TABLE (Snapshots historical names & unit prices)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    variant_id INTEGER,
    item_name_snapshot VARCHAR(150) NOT NULL,
    variant_name_snapshot VARCHAR(50),
    unit_price_snapshot DECIMAL(10, 2) NOT NULL CHECK (unit_price_snapshot >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_price DECIMAL(10, 2) NOT NULL CHECK (total_price >= 0),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT,
    FOREIGN KEY (variant_id) REFERENCES menu_item_variants(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

-- 7. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    payment_method VARCHAR(20) NOT NULL DEFAULT 'MOCK' CHECK (payment_method IN ('MOCK', 'RAZORPAY', 'UPI', 'CARD', 'NETBANKING')),
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
