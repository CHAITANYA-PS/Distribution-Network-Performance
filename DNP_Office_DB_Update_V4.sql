-- =====================================================================================================
-- DNP - V4 : enterprise features (security & audit, stock ledger, product-code verification, delivery
-- receipts, expired-stock returns, tickets SLA, recovery milestones, health-score history, settings).
--
-- * Run once on PostgreSQL (schema dsphere). Every statement is safe to run again:
--   CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- * The application also runs this file at start-up (spring.sql.init), after V3.
-- * No existing table, column or row is dropped or changed; only new tables and new columns are added.
-- * Each statement is on its own and ends with ";" (no DO-blocks), so it also runs from DBeaver / pgAdmin / psql.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- PART A. NEW COLUMNS ON EXISTING TABLES
-- -----------------------------------------------------------------------------------------------------

-- Product: 13-digit EAN-13 product code (printed on the pack, typed or pasted by the warehouse user) and unit cost
ALTER TABLE dsphere.product ADD COLUMN IF NOT EXISTS product_code VARCHAR(13);
ALTER TABLE dsphere.product ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,2) CHECK (unit_cost >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_product_code ON dsphere.product(product_code);

-- Warehouse stock: the quantity ledger (never negative), sellable flag, date received, pre-sell / stock-sell
ALTER TABLE dsphere.warehouse_stock ADD COLUMN IF NOT EXISTS quantity NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0);
ALTER TABLE dsphere.warehouse_stock ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE dsphere.warehouse_stock ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE dsphere.warehouse_stock ADD COLUMN IF NOT EXISTS stock_type VARCHAR(10) NOT NULL DEFAULT 'STOCK_SELL' CHECK (stock_type IN ('PRE_SELL','STOCK_SELL'));

-- Shipment: handover code given to the distributor at dispatch, and who dispatched it
ALTER TABLE dsphere.shipment ADD COLUMN IF NOT EXISTS handover_code VARCHAR(10);
ALTER TABLE dsphere.shipment ADD COLUMN IF NOT EXISTS dispatched_by BIGINT;

-- Shipment item: which batch is packed, and the verification result before dispatch
ALTER TABLE dsphere.shipment_item ADD COLUMN IF NOT EXISTS product_batch_id BIGINT REFERENCES dsphere.product_batch(product_batch_id);
ALTER TABLE dsphere.shipment_item ADD COLUMN IF NOT EXISTS verified_quantity NUMERIC(14,2) CHECK (verified_quantity >= 0);
ALTER TABLE dsphere.shipment_item ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','MISMATCH'));

-- Exchange request: request number, the stock it is taken from, destination warehouse and the decision
ALTER TABLE dsphere.exchange_request ADD COLUMN IF NOT EXISTS request_number VARCHAR(30);
ALTER TABLE dsphere.exchange_request ADD COLUMN IF NOT EXISTS source_warehouse_stock_id BIGINT REFERENCES dsphere.warehouse_stock(warehouse_stock_id);
ALTER TABLE dsphere.exchange_request ADD COLUMN IF NOT EXISTS destination_warehouse_id BIGINT REFERENCES dsphere.warehouse(warehouse_id);
ALTER TABLE dsphere.exchange_request ADD COLUMN IF NOT EXISTS decided_by BIGINT;
ALTER TABLE dsphere.exchange_request ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE dsphere.exchange_request ADD COLUMN IF NOT EXISTS decision_remarks VARCHAR(500);
CREATE UNIQUE INDEX IF NOT EXISTS ux_exchange_request_number ON dsphere.exchange_request(request_number);

-- Ticket: reference number, assignee, SLA due time, resolution details, reopen and escalation counters
ALTER TABLE dsphere.ticket ADD COLUMN IF NOT EXISTS reference_number VARCHAR(30);
ALTER TABLE dsphere.ticket ADD COLUMN IF NOT EXISTS assigned_to BIGINT;
ALTER TABLE dsphere.ticket ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;
ALTER TABLE dsphere.ticket ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE dsphere.ticket ADD COLUMN IF NOT EXISTS findings VARCHAR(2000);
ALTER TABLE dsphere.ticket ADD COLUMN IF NOT EXISTS corrective_action VARCHAR(2000);
ALTER TABLE dsphere.ticket ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0 CHECK (reopen_count >= 0);
ALTER TABLE dsphere.ticket ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0 CHECK (escalation_level >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_reference_number ON dsphere.ticket(reference_number);

-- Recovery plan: recovery mode flag, amount recovered so far, final outcome
ALTER TABLE dsphere.recovery_plan ADD COLUMN IF NOT EXISTS recovery_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dsphere.recovery_plan ADD COLUMN IF NOT EXISTS recovered_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (recovered_amount >= 0);
ALTER TABLE dsphere.recovery_plan ADD COLUMN IF NOT EXISTS outcome VARCHAR(30) CHECK (outcome IN ('RECOVERED','PARTIALLY_RECOVERED','NOT_RECOVERED','CANCELLED'));
ALTER TABLE dsphere.recovery_plan ADD COLUMN IF NOT EXISTS outcome_remarks VARCHAR(1000);
ALTER TABLE dsphere.recovery_plan ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Commitment: approval details
ALTER TABLE dsphere.commitment ADD COLUMN IF NOT EXISTS approved_by BIGINT;
ALTER TABLE dsphere.commitment ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE dsphere.commitment ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(500);

-- Transportation activity: calculated emission (distance x factor)
ALTER TABLE dsphere.transportation_activity ADD COLUMN IF NOT EXISTS emission_kg NUMERIC(14,3) CHECK (emission_kg >= 0);

-- -----------------------------------------------------------------------------------------------------
-- PART B. NEW TABLES
-- -----------------------------------------------------------------------------------------------------

-- 1. Audit log: written automatically by the application for every create / update / delete / login. Read-only API.
CREATE TABLE IF NOT EXISTS dsphere.audit_log (
    audit_id      BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id       BIGINT,
    action        VARCHAR(30)  NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE','LOGIN','LOGIN_FAILED','LOGOUT',
                                  'PASSWORD_CHANGE','PASSWORD_RESET','EXPORT','RUN_JOB','APPROVE','REJECT','STATUS_CHANGE')),
    entity_name   VARCHAR(100),
    entity_id     BIGINT,
    old_value     TEXT,
    new_value     TEXT,
    ip_address    VARCHAR(45),
    request_id    VARCHAR(64),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_log_entity ON dsphere.audit_log(entity_name, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_user ON dsphere.audit_log(user_id, created_at);

-- 2. System settings (thresholds that the business can change without a new release)
CREATE TABLE IF NOT EXISTS dsphere.system_config (
    config_id     BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    config_key    VARCHAR(100) NOT NULL UNIQUE,
    config_value  VARCHAR(500) NOT NULL,
    description   VARCHAR(500),
    version       BIGINT NOT NULL DEFAULT 0
);

-- 3. Background job runs (expiry check, SLA escalation, recovery mode, reminders ...)
CREATE TABLE IF NOT EXISTS dsphere.job_run_log (
    job_run_id    BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    job_name      VARCHAR(100) NOT NULL,
    started_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    status        VARCHAR(20)  NOT NULL CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
    triggered_by  BIGINT,
    summary       VARCHAR(2000),
    version       BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_job_run_log_name ON dsphere.job_run_log(job_name, started_at);

-- 4. Shipment status history (every status change of a shipment)
CREATE TABLE IF NOT EXISTS dsphere.shipment_status_history (
    shipment_status_history_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    shipment_id         BIGINT NOT NULL REFERENCES dsphere.shipment(shipment_id),
    shipment_status_id  BIGINT NOT NULL REFERENCES dsphere.shipment_status(shipment_status_id),
    changed_by          BIGINT,
    remarks             VARCHAR(500),
    changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_shipment_status_history_shipment ON dsphere.shipment_status_history(shipment_id);

-- 5. Product verification before dispatch (product code + batch + quantity typed/pasted by the packer)
CREATE TABLE IF NOT EXISTS dsphere.product_verification (
    verification_id     BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    shipment_item_id    BIGINT NOT NULL REFERENCES dsphere.shipment_item(shipment_item_id),
    entered_code        VARCHAR(13) NOT NULL,
    entered_batch_number VARCHAR(100),
    entered_quantity    NUMERIC(14,2) NOT NULL CHECK (entered_quantity > 0),
    result              VARCHAR(20) NOT NULL CHECK (result IN ('MATCH','MISMATCH')),
    message             VARCHAR(500),
    verified_by         BIGINT,
    verified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_product_verification_item ON dsphere.product_verification(shipment_item_id);

-- 6. Delivery receipt (distributor confirms the delivery with the handover code)
CREATE TABLE IF NOT EXISTS dsphere.delivery_receipt (
    delivery_receipt_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    shipment_id         BIGINT NOT NULL UNIQUE REFERENCES dsphere.shipment(shipment_id),
    distributor_id      BIGINT REFERENCES dsphere.distributor(distributor_id),
    status              VARCHAR(30) NOT NULL CHECK (status IN ('CONFIRMED','CONFIRMED_WITH_DISCREPANCY')),
    received_by         BIGINT,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    remarks             VARCHAR(1000),
    version             BIGINT NOT NULL DEFAULT 0
);

-- 7. Delivery receipt lines (expected vs received vs damaged per shipment item)
CREATE TABLE IF NOT EXISTS dsphere.delivery_receipt_item (
    delivery_receipt_item_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    delivery_receipt_id BIGINT NOT NULL REFERENCES dsphere.delivery_receipt(delivery_receipt_id),
    shipment_item_id    BIGINT NOT NULL REFERENCES dsphere.shipment_item(shipment_item_id),
    expected_quantity   NUMERIC(14,2) NOT NULL CHECK (expected_quantity >= 0),
    received_quantity   NUMERIC(14,2) NOT NULL CHECK (received_quantity >= 0),
    damaged_quantity    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_delivery_receipt_item_receipt ON dsphere.delivery_receipt_item(delivery_receipt_id);

-- 8. Delivery discrepancies (shortage / excess / damaged / wrong product); each opens a ticket
CREATE TABLE IF NOT EXISTS dsphere.delivery_discrepancy (
    discrepancy_id      BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    delivery_receipt_id BIGINT NOT NULL REFERENCES dsphere.delivery_receipt(delivery_receipt_id),
    shipment_item_id    BIGINT REFERENCES dsphere.shipment_item(shipment_item_id),
    discrepancy_type    VARCHAR(20) NOT NULL CHECK (discrepancy_type IN ('SHORTAGE','EXCESS','DAMAGED','WRONG_PRODUCT')),
    quantity            NUMERIC(14,2) NOT NULL CHECK (quantity >= 0),
    ticket_id           BIGINT REFERENCES dsphere.ticket(ticket_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);

-- 9. Return categories R1 - R4
CREATE TABLE IF NOT EXISTS dsphere.return_category (
    return_category_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    category_code       VARCHAR(5)   NOT NULL UNIQUE,
    category_name       VARCHAR(100) NOT NULL,
    description         VARCHAR(500),
    version             BIGINT NOT NULL DEFAULT 0
);

-- 10. Product returns (expired / near-expiry / damaged stock going back to the manufacturer's warehouse)
CREATE TABLE IF NOT EXISTS dsphere.product_return (
    product_return_id   BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    return_number       VARCHAR(30) UNIQUE,
    warehouse_stock_id  BIGINT NOT NULL REFERENCES dsphere.warehouse_stock(warehouse_stock_id),
    product_batch_id    BIGINT REFERENCES dsphere.product_batch(product_batch_id),
    distributor_id      BIGINT REFERENCES dsphere.distributor(distributor_id),
    return_category_id  BIGINT NOT NULL REFERENCES dsphere.return_category(return_category_id),
    target_warehouse_id BIGINT REFERENCES dsphere.warehouse(warehouse_id),
    quantity            NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','IN_TRANSIT','RECEIVED','REJECTED')),
    reason              VARCHAR(500),
    requested_by        BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    warehouse_received_at TIMESTAMPTZ,
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_product_return_stock ON dsphere.product_return(warehouse_stock_id, status);

-- 11. Stock write-offs (stock that cannot be sold or returned)
CREATE TABLE IF NOT EXISTS dsphere.stock_write_off (
    write_off_id        BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    warehouse_stock_id  BIGINT NOT NULL REFERENCES dsphere.warehouse_stock(warehouse_stock_id),
    quantity            NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
    write_off_value     NUMERIC(14,2) CHECK (write_off_value >= 0),
    reason              VARCHAR(500) NOT NULL,
    written_off_by      BIGINT,
    written_off_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);

-- 12. Ticket assignment history (assign / reassign)
CREATE TABLE IF NOT EXISTS dsphere.ticket_assignment_history (
    assignment_id       BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ticket_id           BIGINT NOT NULL REFERENCES dsphere.ticket(ticket_id),
    assigned_to         BIGINT NOT NULL,
    assigned_by         BIGINT,
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    remarks             VARCHAR(500),
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_ticket_assignment_ticket ON dsphere.ticket_assignment_history(ticket_id);

-- 13. Ticket status history (open, in progress, resolved, closed, reopened ...)
CREATE TABLE IF NOT EXISTS dsphere.ticket_status_history (
    ticket_status_history_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ticket_id           BIGINT NOT NULL REFERENCES dsphere.ticket(ticket_id),
    from_status_id      BIGINT REFERENCES dsphere.ticket_status(ticket_status_id),
    to_status_id        BIGINT NOT NULL REFERENCES dsphere.ticket_status(ticket_status_id),
    changed_by          BIGINT,
    remarks             VARCHAR(500),
    changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_ticket_status_history_ticket ON dsphere.ticket_status_history(ticket_id);

-- 14. Ticket evidence files (photos, PDFs); the file itself is stored on disk (dnp.upload-dir)
CREATE TABLE IF NOT EXISTS dsphere.ticket_attachment (
    attachment_id       BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ticket_id           BIGINT NOT NULL REFERENCES dsphere.ticket(ticket_id),
    file_name           VARCHAR(255) NOT NULL,
    content_type        VARCHAR(100),
    size_bytes          BIGINT NOT NULL CHECK (size_bytes >= 0),
    storage_path        VARCHAR(500) NOT NULL,
    uploaded_by         BIGINT,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);

-- 15. SLA per ticket priority (hours to resolve)
CREATE TABLE IF NOT EXISTS dsphere.sla_policy (
    sla_policy_id       BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ticket_priority_id  BIGINT NOT NULL UNIQUE REFERENCES dsphere.ticket_priority(ticket_priority_id),
    response_hours      INTEGER NOT NULL CHECK (response_hours > 0),
    resolution_hours    INTEGER NOT NULL CHECK (resolution_hours > 0),
    version             BIGINT NOT NULL DEFAULT 0
);

-- 16. Recovery plan milestones
CREATE TABLE IF NOT EXISTS dsphere.recovery_milestone (
    milestone_id        BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    recovery_plan_id    BIGINT NOT NULL REFERENCES dsphere.recovery_plan(recovery_plan_id),
    title               VARCHAR(200) NOT NULL,
    target_amount       NUMERIC(14,2) CHECK (target_amount >= 0),
    achieved_amount     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (achieved_amount >= 0),
    due_date            DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','MISSED')),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_recovery_milestone_plan ON dsphere.recovery_milestone(recovery_plan_id);

-- 17. Health score history (one row per distributor per calculation; breakdown kept as JSON text)
CREATE TABLE IF NOT EXISTS dsphere.health_score_history (
    health_score_history_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    distributor_id      BIGINT NOT NULL REFERENCES dsphere.distributor(distributor_id),
    reporting_period_id BIGINT REFERENCES dsphere.reporting_period(reporting_period_id),
    total_score         NUMERIC(6,2) NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
    risk_band_id        BIGINT REFERENCES dsphere.risk_band(risk_band_id),
    breakdown           TEXT,
    calculated_by       BIGINT,
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_health_score_history_distributor ON dsphere.health_score_history(distributor_id, calculated_at);

-- -----------------------------------------------------------------------------------------------------
-- PART C. STARTER DATA (only inserted when missing)
-- -----------------------------------------------------------------------------------------------------
INSERT INTO dsphere.return_category (category_code, category_name, description) VALUES
 ('R1', 'Expired', 'Batch is past its expiry date: blocked from sale and returned to the manufacturer warehouse'),
 ('R2', 'Near expiry', 'Batch expires within the configured number of days (expiry.near.days)'),
 ('R3', 'Damaged', 'Damaged in transit or storage'),
 ('R4', 'Quality recall', 'Recalled by the manufacturer for a quality issue')
ON CONFLICT (category_code) DO NOTHING;

INSERT INTO dsphere.system_config (config_key, config_value, description) VALUES
 ('expiry.near.days', '30', 'Days before expiry when a batch counts as near expiry (R2)'),
 ('inventory.aging.buckets', '30,60,90', 'Stock aging buckets in days'),
 ('inventory.slow.moving.days', '60', 'Stock with no outward movement for this many days is slow moving'),
 ('inventory.holding.cost.rate.percent', '18', 'Yearly holding cost as % of stock value'),
 ('recovery.threshold.percent', '60', 'Performance % below which a distributor goes into Recovery Mode'),
 ('health.alert.threshold', '50', 'Health score below which an alert is raised'),
 ('continuity.inactive.days', '30', 'Days without activity after which a distributor is at risk'),
 ('commitment.reminder.days', '7', 'Days before the due date when a commitment reminder is sent'),
 ('emission.alert.kg', '1000', 'Emission of one transport activity above which an alert is raised'),
 ('emission.monthly.target.kg', '50000', 'Monthly emission target'),
 ('exchange.max.quantity', '10000', 'Largest quantity allowed in one exchange request'),
 ('ticket.default.sla.hours', '72', 'Resolution SLA used when the priority has no SLA policy')
ON CONFLICT (config_key) DO NOTHING;
