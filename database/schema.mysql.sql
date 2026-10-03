-- ===================================================================
-- Campus Canteen Express - MySQL Production Relational Schema
-- Database: campus_canteen
-- Character Set: utf8mb4, Collation: utf8mb4_unicode_ci, Engine: InnoDB
-- ===================================================================

CREATE DATABASE IF NOT EXISTS campus_canteen
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE campus_canteen;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('STUDENT', 'ADMIN', 'CANTEEN_STAFF') NOT NULL DEFAULT 'STUDENT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. MENU ITEMS TABLE
CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    category ENUM('Sandwiches', 'Snacks', 'Meals', 'Rolls', 'Drinks', 'Desserts') NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    prep_time_minutes INT NOT NULL DEFAULT 5,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    image_url VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_menu_items_category (category),
    INDEX idx_menu_items_available (is_available),
    CONSTRAINT chk_menu_base_price CHECK (base_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. MENU ITEM VARIANTS TABLE
CREATE TABLE IF NOT EXISTS menu_item_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    menu_item_id INT NOT NULL,
    variant_name VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_menu_variant (menu_item_id, variant_name),
    INDEX idx_menu_item_variants_item_id (menu_item_id),
    CONSTRAINT fk_variant_menu_item FOREIGN KEY (menu_item_id)
        REFERENCES menu_items(id) ON DELETE CASCADE,
    CONSTRAINT chk_variant_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. PICKUP SLOTS TABLE
CREATE TABLE IF NOT EXISTS pickup_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slot_date DATE NOT NULL,
    start_time VARCHAR(10) NOT NULL,
    end_time VARCHAR(10) NOT NULL,
    max_capacity INT NOT NULL DEFAULT 15,
    current_orders INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_slot_date_window (slot_date, start_time, end_time),
    INDEX idx_pickup_slots_date (slot_date),
    INDEX idx_pickup_slots_active (is_active),
    INDEX idx_pickup_slots_lookup (slot_date, is_active),
    CONSTRAINT chk_slot_capacity CHECK (current_orders <= max_capacity AND current_orders >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(20) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    pickup_slot_id INT NOT NULL,
    pickup_token VARCHAR(10) NOT NULL,
    token_hash VARCHAR(64) NOT NULL DEFAULT '',
    order_type ENUM('TODAY', 'TOMORROW') NOT NULL DEFAULT 'TODAY',
    pickup_date DATE,
    subtotal DECIMAL(10, 2) NOT NULL,
    express_fee DECIMAL(10, 2) NOT NULL DEFAULT 3.00,
    total_amount DECIMAL(10, 2) NOT NULL,
    status ENUM('INITIATED', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED') NOT NULL DEFAULT 'PLACED',
    cancellation_reason VARCHAR(255),
    ready_at DATETIME,
    collected_at DATETIME,
    cancelled_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_orders_user_id (user_id),
    INDEX idx_orders_pickup_slot_id (pickup_slot_id),
    INDEX idx_orders_pickup_token (pickup_token),
    INDEX idx_orders_token_hash (token_hash),
    INDEX idx_orders_status (status),
    INDEX idx_orders_created_at (created_at),
    INDEX idx_orders_pickup_date (pickup_date),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_slot FOREIGN KEY (pickup_slot_id)
        REFERENCES pickup_slots(id) ON DELETE RESTRICT,
    CONSTRAINT chk_orders_subtotal CHECK (subtotal >= 0),
    CONSTRAINT chk_orders_express_fee CHECK (express_fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. ORDER ITEMS TABLE (Historical Snapshotting)
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    variant_id INT,
    item_name_snapshot VARCHAR(150) NOT NULL,
    variant_name_snapshot VARCHAR(50),
    unit_price_snapshot DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_items_order_id (order_id),
    INDEX idx_order_items_menu_item_id (menu_item_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
        REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_menu_item FOREIGN KEY (menu_item_id)
        REFERENCES menu_items(id) ON DELETE RESTRICT,
    CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id)
        REFERENCES menu_item_variants(id) ON DELETE SET NULL,
    CONSTRAINT chk_order_items_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL UNIQUE,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    payment_method ENUM('MOCK', 'RAZORPAY', 'UPI', 'CARD', 'NETBANKING') NOT NULL DEFAULT 'MOCK',
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    status ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payments_order_id (order_id),
    INDEX idx_payments_razorpay_order (razorpay_order_id),
    INDEX idx_payments_status (status),
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id)
        REFERENCES orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payments_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
