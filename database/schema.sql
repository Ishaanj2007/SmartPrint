-- =====================================================================
-- Print Shop Automation System - PostgreSQL Database Schema
-- Architecture: Customer -> Backend -> Admin Approval -> Python Agent -> Windows Spooler
-- =====================================================================

-- 1. Create Enums for Order and Job Statuses
CREATE TYPE order_status AS ENUM (
    'PENDING',    -- Customer submitted, waiting for shopkeeper approval
    'APPROVED',   -- Shopkeeper approved, ready for Python Print Agent to poll
    'CLAIMED',    -- Python Print Agent has atomically claimed the job
    'PRINTING',   -- Print Agent sent job to Windows Print Spooler
    'COMPLETED',  -- Windows printer spooled/printed successfully
    'REJECTED',   -- Shopkeeper rejected (e.g., corrupt file, out of stock)
    'FAILED',     -- Agent encountered print/spooler error
    'CANCELLED'   -- Customer or admin cancelled order
);

CREATE TYPE paper_size_enum AS ENUM ('A4', 'A3', 'LETTER', 'LEGAL');
CREATE TYPE color_mode_enum AS ENUM ('BW', 'COLOR');
CREATE TYPE print_sides_enum AS ENUM ('SINGLE', 'DOUBLE');

-- 2. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_order_id VARCHAR(32) NOT NULL UNIQUE, -- e.g. PS-20260926-001
    status order_status NOT NULL DEFAULT 'PENDING',
    customer_name VARCHAR(120),
    customer_phone VARCHAR(30),
    customer_notes TEXT,
    rejection_reason TEXT,
    failure_reason TEXT,
    total_files INT NOT NULL DEFAULT 1,
    claimed_by_agent VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Print Files Table
CREATE TABLE IF NOT EXISTS print_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    storage_filename VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    page_count INT DEFAULT 1,
    
    -- Print settings per file (or inherited from order)
    paper_size paper_size_enum NOT NULL DEFAULT 'A4',
    color_mode color_mode_enum NOT NULL DEFAULT 'BW',
    sides print_sides_enum NOT NULL DEFAULT 'SINGLE',
    copies INT NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 50),
    page_range VARCHAR(50) DEFAULT 'ALL', -- e.g. "ALL" or "1-5, 8"
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Print Agents Table (Stores registered Windows Print PCs)
CREATE TABLE IF NOT EXISTS print_agents (
    id VARCHAR(64) PRIMARY KEY, -- e.g. SHOP_001
    name VARCHAR(120) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    configured_printer VARCHAR(255) DEFAULT 'DEFAULT',
    is_active BOOLEAN DEFAULT TRUE,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE,
    current_status VARCHAR(50) DEFAULT 'OFFLINE', -- 'IDLE', 'PRINTING', 'ERROR', 'OFFLINE'
    system_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Audit Log Table (Tracking state transitions for debugging & verification)
CREATE TABLE IF NOT EXISTS order_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status order_status,
    new_status order_status NOT NULL,
    actor_type VARCHAR(30) NOT NULL, -- 'CUSTOMER', 'ADMIN', 'PRINT_AGENT', 'SYSTEM'
    actor_id VARCHAR(100),
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Indexes for High Performance Polling & Lookup
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_public_id ON orders(public_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_files_order_id ON print_files(order_id);
CREATE INDEX IF NOT EXISTS idx_agents_heartbeat ON print_agents(last_heartbeat_at);

-- 7. Atomic Job Claiming Function
-- Guarantees that only ONE agent can claim an approved job simultaneously.
-- Prevents duplicate printing at the database row level.
CREATE OR REPLACE FUNCTION claim_approved_order(
    p_order_id UUID,
    p_agent_id VARCHAR(64)
) RETURNS BOOLEAN AS $$
DECLARE
    v_updated_rows INT;
BEGIN
    UPDATE orders
    SET status = 'CLAIMED',
        claimed_by_agent = p_agent_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_order_id 
      AND status = 'APPROVED';
      
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    
    IF v_updated_rows = 1 THEN
        INSERT INTO order_audit_logs (order_id, previous_status, new_status, actor_type, actor_id, message)
        VALUES (p_order_id, 'APPROVED', 'CLAIMED', 'PRINT_AGENT', p_agent_id, 'Order claimed for printing');
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 8. Retention Cleanup Query (Files older than 24 hours that are completed or rejected)
-- DELETE FROM print_files WHERE order_id IN (
--    SELECT id FROM orders WHERE status IN ('COMPLETED', 'REJECTED') AND updated_at < NOW() - INTERVAL '24 hours'
-- );
