# Distribution-Network-Performance

I am developing a Java and PostgreSQL project named:

Dsphere Distributor Operations Management Platform

I need you to generate a complete, fully functional Eclipse-compatible Java project based on my strictly normalized PostgreSQL 3NF schema.

Do not provide only explanations or sample snippets. Generate all required source files, compile the project, validate the output, and return downloadable ZIP files.

==================================================
1. TECHNOLOGY AND COMPATIBILITY
==================================================

Use:

- Java 8 compatibility for DAO, JDBC, model, utility, and exception code
- Eclipse IDE
- PostgreSQL 14 or later
- PostgreSQL JDBC driver
- Maven for the JDBC driver dependency
- JDBC with PreparedStatement
- Java Collections
- Java Generics
- Java 8 Streams
- Lambda expressions
- Method references
- Optional
- Predicate
- Function
- BiConsumer
- Supplier
- Consumer where appropriate
- Try-with-resources
- Functional interfaces

Do not use:

- Spring Boot
- Hibernate
- JPA
- In-memory database persistence
- Hardcoded database credentials
- Raw SQL string concatenation with user input
- Plain-text password storage
- Stream.toList(), because it is not compatible with Java 8
- Java records, because they are not compatible with Java 8

Use:

.collect(Collectors.toList())

instead of:

.toList()

==================================================
2. DATABASE CONFIGURATION
==================================================

Use the PostgreSQL schema:

dsphere

Create:

src/main/resources/database.properties

with:

db.url=jdbc:postgresql://localhost:5432/dsphere_db
db.username=postgres
db.password=change_me
db.schema=dsphere

Create these connection classes:

com.dsphere.dao.connection.ConnectionFactory
com.dsphere.dao.connection.PostgreSqlConnectionFactory

ConnectionFactory must be a functional interface:

@FunctionalInterface
public interface ConnectionFactory {
    Connection getConnection() throws SQLException;
}

PostgreSqlConnectionFactory must:

- Load database.properties
- Open a PostgreSQL JDBC connection
- Set the dsphere schema
- Throw a DAO exception if the configuration is missing
- Never hardcode database credentials
- Never expose the password in logs or exceptions

==================================================
3. POSTGRESQL TABLES
==================================================

Create one Java POJO/model class for each of the following PostgreSQL base tables:

app_user
role
user_role
user_activity_log
password_reset
region
category
department
manufacturer
distributor
distributor_category
system_admin
manufacturer_user
distributor_user
sales_manager
finance_manager
recovery_manager
reporting_period
health_parameter
health_parameter_weight
distributor_health_assessment
health_assessment_alert
measurement_unit
commitment_status
commitment
commitment_progress
commitment_history
activity_type
distributor_activity
continuity_status_type
risk_level
continuity_assessment
order_status
product
distributor_order
order_item
order_status_history
sales_target
sales_record
product_batch
warehouse
warehouse_stock
movement_type
inventory_document_type
inventory_document
inventory_movement
inventory_alert
shipment_status
shipment
shipment_item
vehicle_type
emission_factor
transportation_activity
exchange_status
exchange_request
exchange_history
recovery_plan_status
recovery_plan
ticket_category
ticket_status
ticket_priority
ticket
recovery_plan_ticket
ticket_comment
escalation
invoice_status
invoice
payment_method
payment_status
payment
distributor_credit_limit
credit_risk_assessment
risk_band
report
report_filter
report_filter_value
notification_type
notification

Use PascalCase Java names:

app_user → AppUser
user_role → UserRole
distributor_order → DistributorOrder
order_item → OrderItem
credit_risk_assessment → CreditRiskAssessment

Use camelCase fields:

user_id → userId
created_at → createdAt
reporting_period_id → reportingPeriodId

Map PostgreSQL types as follows:

bigint → Long
integer → Integer
numeric → BigDecimal
varchar/text/inet → String
date → LocalDate
timestamptz → OffsetDateTime
boolean → Boolean

Every model class must contain:

- Private fields
- No-argument constructor
- Complete parameterized constructor
- Getters
- Setters
- equals()
- hashCode()
- Safe toString()
- Javadoc containing the mapped PostgreSQL table name

Do not display these sensitive values in toString():

- passwordHash
- token
- sessionToken
- sessionTokenHash

==================================================
4. DATABASE VIEW CLASSES
==================================================

Create read-only Java model classes for these PostgreSQL views:

order_total_view
→ OrderTotalView.java

health_score_view
→ HealthScoreView.java

current_stock_view
→ CurrentStockView.java

transport_emission_view
→ TransportEmissionView.java

sales_performance_view
→ SalesPerformanceView.java

outstanding_payment_view
→ OutstandingPaymentView.java

credit_utilization_view
→ CreditUtilizationView.java

Required fields:

OrderTotalView:
- Long orderId
- BigDecimal calculatedTotal

HealthScoreView:
- Long distributorId
- Long reportingPeriodId
- BigDecimal calculatedOverallScore

CurrentStockView:
- Long warehouseStockId
- BigDecimal calculatedQuantity

TransportEmissionView:
- Long transportationActivityId
- BigDecimal calculatedEmission

SalesPerformanceView:
- Long distributorId
- Long reportingPeriodId
- BigDecimal targetValue
- BigDecimal calculatedActualSales
- BigDecimal calculatedAchievementPercentage

OutstandingPaymentView:
- Long invoiceId
- BigDecimal invoiceAmount
- BigDecimal totalCompletedPayments
- BigDecimal calculatedOutstandingAmount
- Integer calculatedDaysOverdue
- String derivedPaymentState

CreditUtilizationView:
- Long distributorId
- BigDecimal activeCreditLimit
- BigDecimal calculatedCreditUtilized
- BigDecimal availableCredit
- BigDecimal latestRiskScore
- String calculatedRiskCategory

View classes must not have save, update, or delete DAO operations.

==================================================
5. LOGIN AND LOGOUT SESSION TABLE
==================================================

The original schema needs a persistent user_session table.

Create this migration:

CREATE TABLE IF NOT EXISTS dsphere.user_session (
    session_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL,
    session_token_hash varchar(255) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    ip_address inet,

    CONSTRAINT uq_user_session_token
        UNIQUE (session_token_hash),

    CONSTRAINT fk_user_session_user
        FOREIGN KEY (user_id)
        REFERENCES dsphere.app_user(user_id)
        ON DELETE CASCADE,

    CONSTRAINT ck_user_session_expiry
        CHECK (expires_at > created_at),

    CONSTRAINT ck_user_session_revoked
        CHECK (
            revoked_at IS NULL
            OR revoked_at >= created_at
        )
);

Create:

UserSession.java

with:

- Long sessionId
- Long userId
- String sessionTokenHash
- OffsetDateTime createdAt
- OffsetDateTime expiresAt
- OffsetDateTime revokedAt
- String ipAddress

Add:

boolean isActive(OffsetDateTime currentTime)

A session is active only when:

revokedAt == null
and
expiresAt is after currentTime

==================================================
6. GENERALIZATION AND SPECIALIZATION
==================================================

Model AppUser as the common supertype record.

Stakeholder subtype classes are:

SystemAdmin
ManufacturerUser
DistributorUser
SalesManager
FinanceManager
RecoveryManager

Specialization is:

- Overlapping
- Partial

Meaning:

- A user may have zero subtype records.
- A user may have one subtype record.
- A user may have multiple subtype records.
- Every subtype must reference an existing AppUser.
- Each subtype userId is its primary key and foreign key.
- UserRole controls authorization.
- Subtype models store stakeholder-specific information.

Prefer composition rather than Java inheritance from AppUser because specialization is overlapping.

==================================================
7. GENERIC CLASSES
==================================================

Create:

com.dsphere.generic.Identifiable<ID>
com.dsphere.generic.GenericRepository<T, ID>
com.dsphere.generic.InMemoryRepository<T>
com.dsphere.generic.KeyedInMemoryRepository<T>

These generic classes may be retained for Java-generics demonstrations, but JDBC DAOs must use PostgreSQL rather than in-memory storage.

Identifiable:

public interface Identifiable<ID> {
    ID getId();
    void setId(ID id);
}

Generic repository operations:

T save(T entity);

T update(T entity);

Optional<T> findById(ID id);

List<T> findAll();

boolean existsById(ID id);

boolean deleteById(ID id);

long count();

==================================================
8. DAO PACKAGE STRUCTURE
==================================================

DAO interfaces and implementations must be in separate packages.

Use:

com.dsphere.dao.interfaces
com.dsphere.dao.implementation
com.dsphere.dao.connection
com.dsphere.dao.exception
com.dsphere.dao.mapper
com.dsphere.dao.util

Project layout:

src/main/java/
└── com/dsphere/
    ├── model/
    ├── auth/
    ├── generic/
    ├── dao/
    │   ├── interfaces/
    │   ├── implementation/
    │   ├── connection/
    │   ├── exception/
    │   ├── mapper/
    │   └── util/
    └── demo/

==================================================
9. GENERIC JDBC DAO
==================================================

Create:

GenericDao<T, ID>

with:

T save(T entity);

T update(T entity);

Optional<T> findById(ID id);

List<T> findAll();

List<T> filter(Predicate<T> condition);

boolean existsById(ID id);

boolean deleteById(ID id);

long count();

Create:

ReadOnlyDao<T>

with:

List<T> findAll();

List<T> filter(Predicate<T> condition);

Create:

JdbcGenericDao<T>

which implements:

GenericDao<T, Long>

JdbcGenericDao must:

- Receive a ConnectionFactory
- Use PreparedStatement
- Use ResultSet
- Use try-with-resources
- Use actual PostgreSQL tables
- Implement INSERT
- Implement SELECT by ID
- Implement SELECT all
- Implement UPDATE
- Implement DELETE
- Implement EXISTS
- Implement COUNT
- Return generated identity keys
- Map snake_case database columns to camelCase Java fields
- Translate SQL exceptions to DAO exceptions
- Never print stack traces directly
- Never use in-memory persistence
- Never concatenate user-provided values into SQL

Create:

JdbcReadOnlyDao<T>

for PostgreSQL views.

Read-only DAOs must provide:

- findAll()
- filter(Predicate<T>)

They must not provide:

- save()
- update()
- deleteById()

==================================================
10. INDIVIDUAL DAO INTERFACES
==================================================

Create one DAO interface for every base-table model.

Examples:

AppUserDao extends GenericDao<AppUser, Long>
RoleDao extends GenericDao<Role, Long>
UserRoleDao extends GenericDao<UserRole, Long>
DistributorDao extends GenericDao<Distributor, Long>
ProductDao extends GenericDao<Product, Long>
DistributorOrderDao extends GenericDao<DistributorOrder, Long>
OrderItemDao extends GenericDao<OrderItem, Long>
TicketDao extends GenericDao<Ticket, Long>
InvoiceDao extends GenericDao<Invoice, Long>
PaymentDao extends GenericDao<Payment, Long>

Continue for every base-table model and UserSession.

Create read-only interfaces for views:

OrderTotalViewDao extends ReadOnlyDao<OrderTotalView>
HealthScoreViewDao extends ReadOnlyDao<HealthScoreView>
CurrentStockViewDao extends ReadOnlyDao<CurrentStockView>
TransportEmissionViewDao extends ReadOnlyDao<TransportEmissionView>
SalesPerformanceViewDao extends ReadOnlyDao<SalesPerformanceView>
OutstandingPaymentViewDao extends ReadOnlyDao<OutstandingPaymentView>
CreditUtilizationViewDao extends ReadOnlyDao<CreditUtilizationView>

==================================================
11. INDIVIDUAL DAO IMPLEMENTATIONS
==================================================

Create one implementation for every DAO interface.

Examples:

AppUserDaoImpl
RoleDaoImpl
UserRoleDaoImpl
DistributorDaoImpl
ProductDaoImpl
DistributorOrderDaoImpl
OrderItemDaoImpl
TicketDaoImpl
InvoiceDaoImpl
PaymentDaoImpl

Each implementation must:

- Extend JdbcGenericDao<Entity>
- Implement its matching DAO interface
- Supply the correct schema
- Supply the correct table name
- Supply the correct primary-key column
- Use PostgreSQL JDBC operations

Example:

public class ProductDaoImpl
        extends JdbcGenericDao<Product>
        implements ProductDao {

    public ProductDaoImpl(
            ConnectionFactory connectionFactory) {

        super(
            connectionFactory,
            Product.class,
            "dsphere",
            "product",
            "product_id"
        );
    }
}

Create read-only implementations for all seven views using JdbcReadOnlyDao.

==================================================
12. DAO EXCEPTION PACKAGE
==================================================

Create:

DaoException
EntityNotFoundException
DuplicateEntityException
DatabaseConnectionException
DataMappingException

Hierarchy:

RuntimeException
└── DaoException
    ├── EntityNotFoundException
    ├── DuplicateEntityException
    ├── DatabaseConnectionException
    └── DataMappingException

Requirements:

- Translate SQL state 23505 to DuplicateEntityException.
- Translate missing update targets to EntityNotFoundException.
- Wrap connection errors in DatabaseConnectionException.
- Wrap ResultSet mapping failures in DataMappingException.
- Preserve the original exception as the cause.
- Do not include passwords or sensitive tokens in exception messages.

==================================================
13. ENTITY-SPECIFIC DAO METHODS
==================================================

Add useful specialized queries.

AppUserDao:

Optional<AppUser> findByEmail(String email);

List<AppUser> findByStatus(String status);

boolean existsByEmail(String email);

boolean updatePasswordHash(
    Long userId,
    String passwordHash
);

RoleDao:

Optional<Role> findByRoleName(String roleName);

List<Role> findByUserId(Long userId);

UserRoleDao:

boolean assignRole(Long userId, Long roleId);

boolean removeRole(Long userId, Long roleId);

boolean userHasRole(Long userId, String roleName);

UserSessionDao:

Optional<UserSession> findByTokenHash(String tokenHash);

List<UserSession> findActiveByUserId(Long userId);

boolean revokeSession(
    Long sessionId,
    OffsetDateTime revokedAt
);

int revokeAllUserSessions(Long userId);

int deleteExpiredSessions();

DistributorDao:

Optional<Distributor> findByCode(String distributorCode);

Optional<Distributor> findByEmail(String email);

List<Distributor> findByRegionId(Long regionId);

List<Distributor> findByStatus(String status);

ProductDao:

Optional<Product> findBySku(String sku);

List<Product> findByCategoryId(Long categoryId);

List<Product> findByStatus(String status);

DistributorOrderDao:

Optional<DistributorOrder> findByOrderNumber(
    String orderNumber
);

List<DistributorOrder> findByDistributorId(
    Long distributorId
);

List<DistributorOrder> findByStatusId(
    Long orderStatusId
);

OrderItemDao:

List<OrderItem> findByOrderId(Long orderId);

InvoiceDao:

Optional<Invoice> findByInvoiceNumber(
    String invoiceNumber
);

Optional<Invoice> findByOrderId(Long orderId);

PaymentDao:

List<Payment> findByInvoiceId(Long invoiceId);

BigDecimal calculateCompletedPaymentTotal(
    Long invoiceId
);

TicketDao:

List<Ticket> findByDistributorId(Long distributorId);

List<Ticket> findByStatusId(Long ticketStatusId);

List<Ticket> findByPriorityId(Long priorityId);

NotificationDao:

List<Notification> findByUserId(Long userId);

List<Notification> findUnreadByUserId(Long userId);

boolean markAsRead(Long notificationId);

==================================================
14. AUTHENTICATION
==================================================

Create normal Java 8 classes, not records:

LoginRequest
LoginResponse
LogoutRequest

Create:

PasswordHasher
Pbkdf2PasswordHasher
SessionTokenGenerator
SecureSessionTokenGenerator
AuthenticationManager

AuthenticationManager must use JDBC DAO interfaces:

AppUserDao
UserSessionDao
UserActivityLogDao
RoleDao
UserRoleDao

Login process:

1. Validate email and password.
2. Normalize email.
3. Find AppUser by email.
4. Return a generic failure if the user does not exist.
5. Verify that the user status is Active.
6. Verify the password hash.
7. Load assigned roles.
8. Generate a secure random session token.
9. Store only the session token hash.
10. Return the plain token once.
11. Add LOGIN_SUCCESS to UserActivityLog.
12. Add LOGIN_FAILED when authentication fails.
13. Clear password char arrays after use.

Logout process:

1. Receive the session token.
2. Hash the token.
3. Find the session by token hash.
4. Set revokedAt.
5. Record LOGOUT in UserActivityLog.
6. Reject the token after logout.

Session validation:

- Token hash must exist.
- revokedAt must be null.
- expiresAt must be after the current time.
- The associated AppUser status must be Active.

==================================================
15. JAVA 8 FEATURES
==================================================

Use Java 8 features where appropriate:

- Lambda expressions
- Method references
- Stream API
- Collectors.toList()
- Optional
- Predicate
- Function
- BiConsumer
- Supplier
- Consumer
- @FunctionalInterface
- Try-with-resources
- java.time API

Do not use:

- Java records
- var
- Stream.toList()
- Text blocks
- Pattern matching
- Switch expressions

Functional filtering example:

List<Product> activeProducts =
    productDao.filter(
        product ->
            "Active".equalsIgnoreCase(
                product.getStatus()
            )
    );

==================================================
16. ENTITY RELATIONSHIPS
==================================================

Preserve these important relationships in model comments, DAO queries, and documentation:

AppUser 1:M UserRole
Role 1:M UserRole
AppUser 1:M PasswordReset
AppUser 1:M UserActivityLog
AppUser 1:M UserSession

AppUser 1:0..1 SystemAdmin
AppUser 1:0..1 ManufacturerUser
AppUser 1:0..1 DistributorUser
AppUser 1:0..1 SalesManager
AppUser 1:0..1 FinanceManager
AppUser 1:0..1 RecoveryManager

Region 1:M Distributor
Distributor M:M Category through DistributorCategory
Manufacturer 1:M ManufacturerUser

HealthParameter 1:M HealthParameterWeight
Distributor 1:M DistributorHealthAssessment
ReportingPeriod 1:M DistributorHealthAssessment
DistributorHealthAssessment 1:M HealthAssessmentAlert

Distributor 1:M Commitment
Commitment 1:M CommitmentProgress
Commitment 1:M CommitmentHistory

Distributor 1:M DistributorActivity
Distributor 1:M ContinuityAssessment

Distributor 1:M DistributorOrder
DistributorOrder 1:M OrderItem
Product 1:M OrderItem
DistributorOrder 1:0..1 Invoice
Invoice 1:M Payment

Product 1:M ProductBatch
Warehouse 1:M WarehouseStock
ProductBatch 1:M WarehouseStock
WarehouseStock 1:M InventoryMovement
WarehouseStock 1:M InventoryAlert

Shipment 1:M ShipmentItem
OrderItem 1:M ShipmentItem
Shipment 1:M TransportationActivity
VehicleType 1:M EmissionFactor

Distributor 1:M ExchangeRequest
ExchangeRequest 1:M ExchangeHistory

Distributor 1:M RecoveryPlan
Distributor 1:M Ticket
RecoveryPlan M:M Ticket through RecoveryPlanTicket
Ticket 1:M TicketComment
Ticket 1:M Escalation

Distributor 1:M DistributorCreditLimit
Distributor 1:M CreditRiskAssessment
DistributorCreditLimit 1:M CreditRiskAssessment

Report 1:M ReportFilter
ReportFilter 1:M ReportFilterValue
AppUser 1:M Notification
NotificationType 1:M Notification

==================================================
17. CRUD VERIFICATION
==================================================

Create a JdbcDaoDemo class that demonstrates actual PostgreSQL operations:

- Create a region
- Read the region
- Update the region
- Check existsById
- Count regions
- Use functional filtering
- Delete the region
- Confirm deletion

Also demonstrate:

- Create AppUser with a password hash
- Find AppUser by email
- Create a login session
- Validate the session
- Logout by revoking the session
- Confirm the session is inactive

Do not insert plain-text passwords.

==================================================
18. TESTING AND VALIDATION
==================================================

Before returning the ZIP:

1. Verify every PostgreSQL table has a matching model class.
2. Verify every table model has a DAO interface.
3. Verify every DAO interface has an implementation.
4. Verify every implementation points to the correct table and primary key.
5. Verify the seven views have read-only DAOs.
6. Verify all imports compile.
7. Compile using Java 8 source and target compatibility.
8. Verify no Stream.toList() is used.
9. Verify no Java record is used.
10. Verify no in-memory DAO is used for database persistence.
11. Verify all SQL values use PreparedStatement parameters.
12. Verify connections, statements, and result sets use try-with-resources.
13. Verify sensitive values are excluded from toString().
14. Verify generated IDs are returned to saved entities.
15. Verify exceptions are translated appropriately.
16. Include a report listing all generated files and any assumptions.

==================================================
19. REQUIRED ZIP FILES
==================================================

Return these downloadable ZIP files:

1. dsphere-model-auth-generic.zip

Contains:

- All base-table model classes
- Seven view classes
- UserSession
- Generic classes
- Authentication classes
- Demo classes

2. dsphere-jdbc-dao-java8.zip

Contains:

- DAO interfaces
- DAO implementations
- JDBC connection package
- Exception package
- Row mappers/utilities
- database.properties
- PostgreSQL JDBC Maven dependency
- UserSession migration
- JdbcDaoDemo

3. dsphere-entity-relationships.zip

Contains:

- EntityRelationships.txt
- ModuleWiseRelationships.txt
- ForeignKeyDependencies.txt
- TableToClassMapping.txt
- StakeholderWiseRelationships.txt

4. dsphere-complete-eclipse-project.zip

Contains the complete integrated project.

==================================================
20. OUTPUT RULES
==================================================

Do not only describe what should be generated.

Actually:

- Create the Java files.
- Create the Maven file.
- Create the properties file.
- Create the SQL migration.
- Create the relationship documents.
- Compile and validate the source.
- Package everything into downloadable ZIP files.
- Report compilation status.
- Report the number of model classes.
- Report the number of DAO interfaces.
- Report the number of DAO implementations.
- Report the number of view DAOs.
- Clearly identify any missing or unmatched files.

If a required source file is missing, generate it rather than asking me to create it manually.

Use readable formatting and normal Java coding conventions rather than putting entire classes on one line.
