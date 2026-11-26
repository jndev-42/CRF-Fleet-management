# Graph Report - CRF-Fleet-management  (2026-11-26)

## Corpus Check
- Large corpus: 977 files · ~705,210 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 5904 nodes · 17982 edges · 203 communities (197 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 289 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Uniforms Catalog & Loans
- Roles & Authorization
- Auth & DB Core
- Vehicle Detail Types & Header
- Vehicle API & UL Scoping
- Inventory Page & Modals
- Fleet Dossiers & Tasks UI
- Daily Alerts Detection
- Fleet Tracking API Routes
- Integration Test Setup
- DT Vehicle Filters
- Fleet Tasks Store
- Image Compression & Photos
- Inventory API & Error Helpers
- Reservation Eligibility
- Stats API & Exports
- User & License Test Seeds
- Fleet Attachments
- Vehicle QR Page
- R2 Storage Client
- Fleet Controls
- Fleet Dossiers & Tasks UI (2)
- Fleet Tracking Panel Tabs
- Audit Log & Reservations
- Check-in Tests
- Admin User-UL Management
- Fleet Contacts
- Maintenance Events Tests
- Vehicles List Page
- Add/Edit Vehicle Modals
- Borrow Eligibility
- Mission Report Tests
- Fleet Tracking API Routes (2)
- Referentiel Chat & PDF Reader
- Vehicle Detail Modals
- Mileage Anomaly & Check-in
- Fleet Task Forms & Hooks
- Integration Test Setup (2)
- Expense PDF Signature Layout
- Mission Wizard Steps
- Maintenance Utilities
- Control Appointments Store
- QR Stock Page
- Dashboard Quick Return
- Media Refs & File Route
- Document Scanner Camera
- Checkout & Push Tests
- Fleet Tracking API Routes (3)
- QR Stock Tests
- Migration Script Tests
- Mission Wizard & Drafts
- Fleet Dossiers & Tasks UI (3)
- Expense PDF Sealing
- Root Layout & Banners
- License Lifecycle Tests
- Quad Tracker
- MCP Tokens Admin UI
- Inventory Stock Tests
- MCP Tokens
- QR Uniforms Page
- Fleet Tracking Schema
- Document Detection
- MCP Server Tools
- Web Push Client
- Uniform Management UI
- Mission Detail & Supplies
- Missions List & Edits
- Uniforms History Cursor
- Demo DB Cloning
- Vehicle Brand Connection
- Bug Report Logger
- Vehicle Detail Modals (2)
- Signed Mission Report Step
- Inventory Adjust Tests
- Demo Refresh
- Mission Access & Incident Alerts
- Quad Scoring
- Media R2 Relocation
- Expense Workflow Roles
- Trips API
- Vehicle Photo Tests
- Navbar & Menu Visibility
- Notification Bell
- Uniform Laundry & My Loans
- Vehicle Calendar Views
- Demo Read-Only Guard
- Expense R2 Relocation
- Mission Report Updates
- Scanner Detection Tests
- Renault Connect Client
- Calendar Events
- Expense Sealing Chain Tests
- Demo Shared DB Tests
- Incremental PDF Signing
- Stats Page & Export
- Admin ULs Tab
- MCP Server Tools (2)
- Media Upload API
- Incident Dossier Tests
- Users Admin Page
- Audit Log Tab
- Referentiel Import Tab
- MCP Server Tools (3)
- Expense Attachments
- Vehicle Documents Tests
- Expenses Page & Table
- Seasonal Theme Context
- Inventory Adjustments
- Mission Report Creation
- Scanner PDF Output
- Vehicle API & UL Scoping (2)
- Mission Detail & Supplies (2)
- Scanner Geometry
- Help Page & Demo Toggle
- Fleet Task Attachment Tests
- Expenses Page & Table (2)
- Demo Context & Fetch Interceptor
- Expense Sealing Chain Tests (2)
- Expense Detail API
- Vehicle Connection Data
- Reservation Slot Picker
- Credentials Crypto
- Line Quads
- Mission Report PDF
- Referentiel Tests
- UL QR Token Tests
- Auth Callback Tests
- Mission Interventions
- License Status
- Vehicle Documents & Guide
- Themes Admin Tab
- Signed Report Mode Tests
- Menu Settings Schema
- Expense Budget Stats
- Vehicles List & Maintenance API
- Inventory Types
- Login & Env
- Banners Admin Tab
- Expense Budgets Modal
- Maintenance History Modal
- Scanner Pick-Best Tests
- Referentiel PDF Extraction
- Media Access Control
- Check-out Form
- Fun Factor Stats
- Vehicle Calendar Tests
- Inventory CSV Import
- Vehicle Connection Tests
- Fleet Task Forms & Hooks (2)
- MCP Tokens (2)
- Vehicle API & UL Scoping (3)
- Stats Charts
- Expense Stats PDF
- Fun Factor Tests
- Guided Tour
- Incident PDF Document
- Referentiel PDF Extraction (2)
- Mission Wizard Tests
- __tests__/components
- Inventory Stock Tests (2)
- Stats PDF Document
- Referentiel PDF Extraction (3)
- Vehicle Photo
- Check-in Modal Tests
- Trip Zod Schemas
- Mission Edit Page
- Menu Settings Admin
- Step2 Vehicle Tests
- Multi-Select Dropdown
- Calendar Day Span
- Edit Maintenance Event Modal
- Expense Form & Signature
- Incident Dossier Tests (2)
- Unit Test Setup
- PDF Content Streams
- Uniforms Page & Tabs
- Uniform QR Modal
- Vehicle Detail Modals (3)
- Expense Budgets Seed
- Incident Dossier Creation
- Add Vehicle Modal Tests
- Navbar Tests
- Demo Shared DB Tests (2)
- Maintenance Status
- Referentiel FTS Query
- Dashboard Quick Return (2)
- Migration Script Tests (2)
- Mission Report PDF (2)
- Menu Settings Tests
- Stats Charts (2)
- Route Proxy
- Demo Banner
- Calendar View Switcher
- Notification Bell (2)
- Demo DB Routing
- Expense Stats PDF (2)
- Navbar & Menu Visibility (2)
- Marine Approved Overlay
- DT Filters Hook Tests
- Route Proxy (2)
- Media R2 Relocation (2)
- NextAuth Route Handler
- Auth Exports

## God Nodes (most connected - your core abstractions)
1. `auth` - 415 edges
2. `unauthorizedResponse()` - 282 edges
3. `forbiddenResponse()` - 277 edges
4. `getErrorMessage()` - 208 edges
5. `db` - 141 edges
6. `withAudit()` - 108 edges
7. `useEscapeKey()` - 96 edges
8. `canManageVehicles` - 96 edges
9. `db` - 91 edges
10. `isSuperAdmin` - 85 edges

## Surprising Connections (you probably didn't know these)
- `renderForm()` --calls--> `ExpenseForm()`  [EXTRACTED]
  src/__tests__/components/ExpenseForm.test.tsx → src/components/expenses/ExpenseForm.tsx
- `get()` --calls--> `GET()`  [EXTRACTED]
  src/__tests__/integration/audit-logs.test.ts → src/app/api/audit-logs/route.ts
- `seedCredential()` --calls--> `encryptSecret()`  [EXTRACTED]
  src/__tests__/integration/cron-daily-mileage-check.test.ts → src/lib/crypto.ts
- `postReservation()` --calls--> `POST`  [EXTRACTED]
  src/__tests__/integration/demo-shared-db.test.ts → src/app/api/vehicles/[id]/reservations/route.ts
- `availability()` --calls--> `GET()`  [EXTRACTED]
  src/__tests__/integration/demo-status.test.ts → src/app/api/demo/status/route.ts

## Import Cycles
- 2-file cycle: `src/lib/documentScanner/documentDetection.ts -> src/lib/documentScanner/opencv.ts -> src/lib/documentScanner/documentDetection.ts`

## Communities (203 total, 6 thin omitted)

### Community 0 - "Uniforms Catalog & Loans"
Cohesion: 0.03
Nodes (129): Context, maxDuration, runtime, GET(), maxDuration, runtime, GET(), POST (+121 more)

### Community 1 - "Roles & Authorization"
Cohesion: 0.04
Nodes (140): GET(), deleteHandler(), patchHandler(), updateBannerSchema, bannerSchema, ensureBannerColumns(), GET(), postHandler() (+132 more)

### Community 2 - "Auth & DB Core"
Cohesion: 0.05
Nodes (61): AideLayout(), runtime, orderedSchema, ALLOWED_ROLES, GET(), maxDuration, runtime, runtime (+53 more)

### Community 3 - "Vehicle Detail Types & Header"
Cohesion: 0.05
Nodes (67): ActiveTripBanner(), ActiveTripBannerProps, MaintenanceBanner(), MaintenanceBannerProps, VehicleDetailPage(), VehicleDetailPageContent(), handleEndMaintenance(), showToast() (+59 more)

### Community 4 - "Vehicle API & UL Scoping"
Cohesion: 0.04
Nodes (70): DELETE, GET(), PATCH, patchHandler(), POST, DELETE, PATCH, PUT (+62 more)

### Community 5 - "Inventory Page & Modals"
Cohesion: 0.03
Nodes (50): InventoryPage(), InvItem, Pagination, AddItemModal(), AddItemModalProps, CATEGORY_OPTIONS, DEFAULT_FORM, CATEGORY_OPTIONS (+42 more)

### Community 6 - "Fleet Dossiers & Tasks UI"
Cohesion: 0.05
Nodes (66): DossierListItem(), Props, DossierModal(), Props, sameIds(), DossierSelect(), Props, DossiersTab() (+58 more)

### Community 7 - "Daily Alerts Detection"
Cohesion: 0.05
Nodes (64): GET(), releaseQuietly(), dayString, PUT, putHandler(), putSchema, RouteContext, GET() (+56 more)

### Community 8 - "Fleet Tracking API Routes"
Cohesion: 0.05
Nodes (67): Context, DELETE, deleteHandler(), ITEM_NOT_FOUND(), PATCH, patchHandler(), Context, POST (+59 more)

### Community 9 - "Integration Test Setup"
Cohesion: 0.03
Nodes (45): DELETE, PATCH, PATCH, DELETE, DELETE, SCHEDULED_ALERT_DDL, SCHEDULED_ALERT_TABLE, AUDIT_LOG_DDL (+37 more)

### Community 10 - "DT Vehicle Filters"
Cohesion: 0.05
Nodes (64): attachDtAvailability(), DtFilterPanel(), onEndChange(), onRadioKeyDown(), onStartChange(), selectMode(), DtFilterPanelProps, MODES (+56 more)

### Community 11 - "Fleet Tasks Store"
Cohesion: 0.06
Nodes (64): GET(), GET(), postHandler(), Context, DELETE, deleteHandler(), GET(), loadOwnedTask() (+56 more)

### Community 12 - "Image Compression & Photos"
Cohesion: 0.05
Nodes (47): isVehicleConnected(), MissionPhotosModal(), fetchPhotos(), MissionPhotosModalProps, PhotoEntry, DrivePhoto, PhotoViewer(), fetchPhotos() (+39 more)

### Community 13 - "Inventory API & Error Helpers"
Cohesion: 0.06
Nodes (54): adjustSchema, POST, adjustBatchSchema, deleteHandler(), patchHandler(), DELETE, deleteHandler(), GET() (+46 more)

### Community 14 - "Reservation Eligibility"
Cohesion: 0.05
Nodes (44): patchHandler(), putHandler(), QuickReservationCta(), QuickReservationCtaProps, QuickReservationSection(), useReservationEligibility(), UserCombobox(), UserComboboxProps (+36 more)

### Community 15 - "Stats API & Exports"
Cohesion: 0.05
Nodes (48): deleteHandler(), loadScopedBudget(), patchHandler(), renameBudgetSchema, createBudgetSchema, GET(), postHandler(), resolveUlId() (+40 more)

### Community 16 - "User & License Test Seeds"
Cohesion: 0.06
Nodes (48): DELETE, PATCH, POST, DELETE, POST, PATCH, mockedAuth, seedDriverRole() (+40 more)

### Community 17 - "Fleet Attachments"
Cohesion: 0.05
Nodes (58): Context, DELETE, deleteHandler(), GET(), loadOwnedAttachment(), maxDuration, NOT_FOUND(), runtime (+50 more)

### Community 18 - "Vehicle QR Page"
Cohesion: 0.06
Nodes (30): CheckOutForm(), handleSubmit(), postCheckout(), QRVehiclePage(), QRActions(), ActiveTrip, formatDate(), QRVehicle (+22 more)

### Community 19 - "R2 Storage Client"
Cohesion: 0.07
Nodes (57): r2Source(), KeyMove, KIND_LABELS, legacyKeyOf(), planMoves(), relocatedStagingKey(), relocatedVehicleKey(), RelocationJournalEntry (+49 more)

### Community 20 - "Fleet Controls"
Cohesion: 0.07
Nodes (47): AppointmentModal(), AppointmentSaved, Props, ControlsTab(), EMPTY_MESSAGES, Props, toFilter(), appointmentText() (+39 more)

### Community 21 - "Fleet Dossiers & Tasks UI (2)"
Cohesion: 0.08
Nodes (44): AssigneePicker(), normalize(), Props, NextActionRow(), Props, NextActions(), Props, LINK_ICONS (+36 more)

### Community 22 - "Fleet Tracking Panel Tabs"
Cohesion: 0.07
Nodes (46): ContactsTab(), FleetTrackingPanel(), plural(), Props, Card, CARDS, CounterKey, OverviewCounters() (+38 more)

### Community 23 - "Audit Log & Reservations"
Cohesion: 0.05
Nodes (42): querySchema, POST, reportSchema, GET(), runDailyChecks(), activate(), deleteObjectQuietly(), markFailed() (+34 more)

### Community 24 - "Check-in Tests"
Cohesion: 0.05
Nodes (34): POST, adminSession, checkIn(), driverSession, makeRequest(), mockedAuth, otherUserSession, secondDriverSession (+26 more)

### Community 25 - "Admin User-UL Management"
Cohesion: 0.06
Nodes (28): AddUserModal(), AddUserModalProps, DeleteUserModal(), DeleteUserModalProps, ManageUserULsModal(), toggleRoleInRow(), updateRow(), ManageUserULsModalProps (+20 more)

### Community 26 - "Fleet Contacts"
Cohesion: 0.07
Nodes (39): RFC-2426, ContactCard(), formatDate(), Props, ContactFormModal(), Props, Editing, Props (+31 more)

### Community 27 - "Maintenance Events Tests"
Cohesion: 0.04
Nodes (31): POST, PATCH, GET(), POST, PATCH, PATCH, GET(), admin (+23 more)

### Community 28 - "Vehicles List Page"
Cohesion: 0.07
Nodes (32): DT_STATUS_META, formatDtDay(), DtVehicleResults(), FleetStatsRow(), FleetStatsRowProps, FleetViewToggle(), Props, VehiclesPage() (+24 more)

### Community 29 - "Add/Edit Vehicle Modals"
Cohesion: 0.08
Nodes (35): BannerItem, CommunicationBanner(), matchesPath(), AddVehicleModal(), handleSubmit(), AddVehicleModalProps, EditVehicleModal(), handleSubmit() (+27 more)

### Community 30 - "Borrow Eligibility"
Cohesion: 0.07
Nodes (35): canBorrow(), VehicleDetailHeader(), QuickBorrowCta(), QuickBorrowCtaProps, QuickBorrowSection(), CalendarReservation, useBorrowEligibility(), fetchReservedByOtherIds() (+27 more)

### Community 31 - "Mission Report Tests"
Cohesion: 0.04
Nodes (32): DELETE, PATCH, POST, POST, ADMIN_18, ADMIN_4, asUser(), AUTHOR (+24 more)

### Community 32 - "Fleet Tracking API Routes (2)"
Cohesion: 0.08
Nodes (37): Context, DELETE, deleteHandler(), NOT_FOUND(), NOT_OWNER(), PATCH, patchHandler(), GET() (+29 more)

### Community 33 - "Referentiel Chat & PDF Reader"
Cohesion: 0.06
Nodes (29): ReferentielChatButton(), Exchange, ReaderTarget, REFERENTIEL_DISCLAIMER, ReferentielChatPanel(), ReferentielChatPanelProps, SearchResult, PdfReader() (+21 more)

### Community 34 - "Vehicle Detail Modals"
Cohesion: 0.05
Nodes (20): ElectronicSignatureModalProps, ENCRE, ULQRCodeModalProps, UniformQRCodeModalProps, ChecklistItemsProps, ChecklistItemType, ChecklistManager(), ChecklistManagerProps (+12 more)

### Community 35 - "Mileage Anomaly & Check-in"
Cohesion: 0.11
Nodes (33): checkInSchema, postHandler(), patchHandler(), CheckInForm(), doSubmit(), handleSubmit(), MileageAnomalyModal(), MileageAnomalyModalProps (+25 more)

### Community 36 - "Fleet Task Forms & Hooks"
Cohesion: 0.09
Nodes (35): Props, DossierTasks(), Open, OverviewModal, OverviewModals(), Props, TaskColumn(), TaskDefaults (+27 more)

### Community 37 - "Integration Test Setup (2)"
Cohesion: 0.05
Nodes (29): DELETE, PATCH, POST, DELETE, PATCH, POST, POST, POST (+21 more)

### Community 38 - "Expense PDF Signature Layout"
Cohesion: 0.09
Nodes (28): COL, ExpensePdfDocument(), ExpensePdfReportProps, ParsedSignature, styles, ExpenseNotFoundError, generateExpensePdf(), GenerateOptions (+20 more)

### Community 39 - "Mission Wizard Steps"
Cohesion: 0.09
Nodes (28): INITIAL_FORM, MissionFormData, MissionWizardProps, WizardDraft, Step0Props, Step0ULSelection(), ULOption, Step1General() (+20 more)

### Community 40 - "Maintenance Utilities"
Cohesion: 0.10
Nodes (31): DtVehicleResultsProps, MaintenanceRecord, getFuelClass(), VehicleDetailGrid(), VehicleDetailGridProps, DetailCard(), DetailCardProps, ctColor() (+23 more)

### Community 41 - "Control Appointments Store"
Cohesion: 0.09
Nodes (32): badRequest(), createLinkedTask(), PUT, putHandler(), GET(), APPOINTMENT_TASK_ERROR, AppointmentInput, CONTROL_TYPES (+24 more)

### Community 42 - "QR Stock Page"
Cohesion: 0.08
Nodes (23): BatchPicker(), formatDate(), Props, CartSummary(), describe(), Props, QRStockPage(), handlePick() (+15 more)

### Community 43 - "Dashboard Quick Return"
Cohesion: 0.10
Nodes (24): QuickBorrowSectionProps, QuickReservationSectionProps, QuickReturnCta(), QuickReturnCtaProps, QuickReturnSectionProps, DashboardVehicle, VehiclePickerModal(), VehiclePickerModalProps (+16 more)

### Community 44 - "Media Refs & File Route"
Cohesion: 0.13
Nodes (36): badRequest(), fieldsSchema, optionalField(), PDF_ALLOWED, postHandler(), runtime, TripContext, UploadMediaParams (+28 more)

### Community 45 - "Document Scanner Camera"
Cohesion: 0.08
Nodes (26): canvasUrl(), CornerAdjuster(), DocumentScanner(), handleCapture(), DocumentScannerProps, MODES, nextFrame(), Phase (+18 more)

### Community 46 - "Checkout & Push Tests"
Cohesion: 0.07
Nodes (22): resolveClient(), hasDemoHeader(), isDemoRequest(), deliverWebPush(), insertNotifications(), notifyUsers(), PushPayload, sendPushNotification() (+14 more)

### Community 47 - "Fleet Tracking API Routes (3)"
Cohesion: 0.09
Nodes (24): GET(), GET(), GET(), CONTROL_SOON_DAYS, listDossiers(), buildOverview(), compareDue(), compareNextActions() (+16 more)

### Community 48 - "QR Stock Tests"
Cohesion: 0.06
Nodes (22): DELETE, POST, POST, ADMIN_A, ADMIN_B, CHVL_A, INACTIF_A, INACTIF_ADMIN_A (+14 more)

### Community 49 - "Migration Script Tests"
Cohesion: 0.09
Nodes (18): migrate(), run, SCRIPT, migrate(), run, SCRIPT, migrate(), run (+10 more)

### Community 50 - "Mission Wizard & Drafts"
Cohesion: 0.10
Nodes (26): NewMissionPage(), QRUnitLocale, QRUnitLocalePage(), initialFormFor(), MissionWizard(), breakdownTotal(), handleDiscardDraft(), handleNext() (+18 more)

### Community 51 - "Fleet Dossiers & Tasks UI (3)"
Cohesion: 0.13
Nodes (28): DossierDetail(), DossierHeader(), Props, DossierItemRow(), Props, DossierItems(), Props, withItems() (+20 more)

### Community 52 - "Expense PDF Sealing"
Cohesion: 0.15
Nodes (34): countItems(), assertRevisionCount(), assertSinglePage(), composePresidentAppearance(), loadReport(), loadSealedBase(), loadStamp(), parseRevisions() (+26 more)

### Community 53 - "Root Layout & Banners"
Cohesion: 0.08
Nodes (17): anton, creepster, inter, metadata, playfair, RootLayout(), viewport, ImpersonationBanner() (+9 more)

### Community 54 - "License Lifecycle Tests"
Cohesion: 0.07
Nodes (22): DELETE, PATCH, PATCH, PUT, POST, CLEARED, GRACE_TODAY, json() (+14 more)

### Community 55 - "Quad Tracker"
Cohesion: 0.10
Nodes (25): CORNER_LABELS, CornerAdjusterProps, CameraStatus, Capture, Options, useScannerCamera(), Quad, STABLE_TOLERANCE (+17 more)

### Community 56 - "MCP Tokens Admin UI"
Cohesion: 0.11
Nodes (24): McpClientConfig(), noop(), McpTokenCreateForm(), McpTokenCreateFormProps, VALIDITY_OPTIONS, McpTokenReveal(), McpTokenRevealProps, McpTokensTab() (+16 more)

### Community 57 - "Inventory Stock Tests"
Cohesion: 0.06
Nodes (15): POST, DELETE, POST, GET(), CalendarTrip, mockedAuth, ADMIN, mockedAuth (+7 more)

### Community 58 - "MCP Tokens"
Cohesion: 0.12
Nodes (26): createSchema, NO_STORE, createMcpToken(), DEFAULT_MCP_TOKEN_VALIDITY_DAYS, generateRawToken(), getMcpToken(), hashToken(), isWellFormedToken() (+18 more)

### Community 59 - "QR Uniforms Page"
Cohesion: 0.10
Nodes (20): QRUniformsPage(), UniformsPage(), LaundryList(), Props, UniformMyLoansCard(), LABELS, Props, UniformTab (+12 more)

### Community 60 - "Fleet Tracking Schema"
Cohesion: 0.06
Nodes (31): FLEET_ATTACHMENT_DDL, FLEET_ATTACHMENT_TABLE, FLEET_CONTACT_DDL, FLEET_CONTACT_INDEXES, FLEET_CONTACT_TABLE, FLEET_CONTROL_APPOINTMENT_DDL, FLEET_CONTROL_APPOINTMENT_TABLE, FLEET_CONTROL_INDEXES (+23 more)

### Community 61 - "Document Detection"
Cohesion: 0.12
Nodes (28): cannyThresholds(), centroid(), clamp(), classSeparation(), EXACT_EPSILONS, findDocumentQuad(), insideConvex(), isStrongNested() (+20 more)

### Community 62 - "MCP Server Tools"
Cohesion: 0.13
Nodes (22): authExtra(), McpAuthExtra, mcpHandler, unauthenticated, verifyToken(), McpPrincipal, apiRequest(), apiRequestInput (+14 more)

### Community 63 - "Web Push Client"
Cohesion: 0.16
Nodes (25): failureMessage(), isSnoozed(), optOutKey(), PushContext, PushContextValue, PushProvider(), PushStatus, readStorage() (+17 more)

### Community 64 - "Uniform Management UI"
Cohesion: 0.14
Nodes (20): sendJson(), Props, UniformItemEditor(), handleAddSize(), handleArchive(), handleRename(), run(), Props (+12 more)

### Community 65 - "Mission Detail & Supplies"
Cohesion: 0.10
Nodes (17): boolLabel(), DetailTab, InterventionCard(), MissionDetail, MissionDetailPage(), SIGNED_REPORT_MODE_LABELS, SupplyEntry, DATE_TIME (+9 more)

### Community 66 - "Missions List & Edits"
Cohesion: 0.10
Nodes (15): AttachmentTag(), hasIncidents(), MissionReport, MissionsTable(), MissionsTableProps, MissionsPage(), Scope, ULQRCodeModal() (+7 more)

### Community 67 - "Uniforms History Cursor"
Cohesion: 0.11
Nodes (23): formatDateTime(), EventLine(), FILTERS, pieceLabels(), UniformHistory(), HISTORY_PAGE_SIZE, Cursor, decodeCursor() (+15 more)

### Community 68 - "Demo DB Cloning"
Cohesion: 0.12
Nodes (21): cloneDatabase(), CloneOptions, CloneSummary, DEMO_META_TABLE, DEMO_SCHEMA_ONLY_TABLES, DemoState, demoStateStatement(), dependencyOrder() (+13 more)

### Community 69 - "Vehicle Brand Connection"
Cohesion: 0.12
Nodes (24): authorize(), ConnectInput, ConnectSchema, connectVehicle(), CredentialResolution, CryptoConfigError, deleteHandler(), Guard (+16 more)

### Community 70 - "Bug Report Logger"
Cohesion: 0.16
Nodes (19): BugReportButton(), handleOpen(), BugReportModal(), BugReportModalProps, ConsoleLogEntry, consoleLogs, getConsoleLogs(), getNetworkLogs() (+11 more)

### Community 71 - "Vehicle Detail Modals (2)"
Cohesion: 0.09
Nodes (12): BRAND_FORMS, ConnectVehicleModal(), ConnectVehicleModalProps, VehicleConnectionState, DeleteMaintenanceEventModal(), DeleteMaintenanceEventModalProps, PutInMaintenanceModal(), PutInMaintenanceModalProps (+4 more)

### Community 72 - "Signed Mission Report Step"
Cohesion: 0.12
Nodes (18): SignatureData, formatDate(), ReportSignatures, SignedCard(), SignedReportAppPanel(), SignedReportAppPanelProps, Signer, SignedReportPhotoPanel() (+10 more)

### Community 73 - "Inventory Adjust Tests"
Cohesion: 0.09
Nodes (10): MissingR2BucketError, requireExplicitR2Bucket(), renderedProps, ADMIN, CHVL, mockedAuth, mockedAuth, mockedGetRenaultVehicleData (+2 more)

### Community 74 - "Demo Refresh"
Cohesion: 0.09
Nodes (16): maxDuration, maxDuration, POST, demoDb, DEMO_REFRESH_LOCK_TABLE, acquireLock(), cloneAndPurge(), DEMO_REFRESH_LEASE_MS (+8 more)

### Community 75 - "Mission Access & Incident Alerts"
Cohesion: 0.18
Nodes (21): GET(), patchHandler(), RouteContext, canEditMissionReport(), canReadMissionReport(), managerUlOf(), reportUlOf(), resolveAuthorHomeUlId() (+13 more)

### Community 76 - "Quad Scoring"
Cohesion: 0.13
Nodes (18): Point, angleAt(), angleFactor(), clamp01(), MIN_CONTRAST, MIN_CONTRAST_WELL_SUPPORTED, MIN_EDGE_MEAN, MIN_EDGE_SIDE (+10 more)

### Community 77 - "Media R2 Relocation"
Cohesion: 0.14
Nodes (17): cleanup(), contentTypeOfBody(), deleteLegacyLeftovers(), isReferenced(), readOrphanGuides(), readRelocationRows(), relocateRow(), RelocationDb (+9 more)

### Community 78 - "Expense Workflow Roles"
Cohesion: 0.19
Nodes (22): checkSigningRights(), maxDuration, notifyRequester(), patchHandler(), runtime, sealFailure(), signatureImage(), signatureString() (+14 more)

### Community 79 - "Trips API"
Cohesion: 0.18
Nodes (20): checkOutSchema, postHandler(), postHandler(), applyCheckoutCorrection(), CHECKOUT_INCIDENT_CONDITIONS, CheckoutAlertsInput, CheckoutCorrectionInput, CheckoutCorrectionResult (+12 more)

### Community 80 - "Vehicle Photo Tests"
Cohesion: 0.11
Nodes (19): DELETE, POST, ADMIN, ADMIN_OTHER_UL, arrange(), asSession(), bucket, DT_OTHER_UL (+11 more)

### Community 81 - "Navbar & Menu Visibility"
Cohesion: 0.22
Nodes (19): buildActiveSteps(), TOUR_STEPS, TourStep, Navbar(), NavbarProps, MenuSetting, MenuSettingsContext, MenuSettingsContextValue (+11 more)

### Community 82 - "Notification Bell"
Cohesion: 0.12
Nodes (18): NotificationBell(), NotificationBellContent(), subscribeToViewport(), useIsMobile(), usePush(), AppNotification, Loaded, useNotifications() (+10 more)

### Community 83 - "Uniform Laundry & My Loans"
Cohesion: 0.14
Nodes (15): notifyUniformsChanged(), UNIFORMS_CHANGED_EVENT, markWashed(), Props, ReturnUniformModal(), handleSubmit(), Props, UniformCatalog() (+7 more)

### Community 84 - "Vehicle Calendar Views"
Cohesion: 0.15
Nodes (21): CalendarDayView(), CalendarDayViewProps, CalendarEventCard(), CalendarEventCardProps, CalendarWeekView(), CalendarWeekViewProps, SHORT_DAYS, CalendarDay (+13 more)

### Community 85 - "Demo Read-Only Guard"
Cohesion: 0.20
Nodes (21): DEMO_EXTERNAL_WRITE_ROUTES, DEMO_READ_ONLY_ERROR, DEMO_REQUEST_HEADER, EXEMPT_API_PATHS, EXEMPT_API_PREFIXES, isApiPath(), isDemoBlockedRequest(), isDemoDbConfigured() (+13 more)

### Community 86 - "Expense R2 Relocation"
Cohesion: 0.13
Nodes (15): isRecord(), parseRevisions(), relocatedRevisionKey(), relocateReport(), RelocationDeps, RelocationMove, RelocationOptions, RelocationResult (+7 more)

### Community 87 - "Mission Report Updates"
Cohesion: 0.12
Nodes (24): accidentDetailsToStore(), UpdateMissionReportInput, diffMissionReport(), diffQuantities(), DPS_KEYS, dpsFieldsForUpdate(), DpsKey, Executor (+16 more)

### Community 88 - "Scanner Detection Tests"
Cohesion: 0.13
Nodes (20): backgroundLevel(), backgroundRgba(), clutteredWood(), DARK_DESK, Decorator, DIAGONAL, fadeTopEdge(), fillRect() (+12 more)

### Community 89 - "Renault Connect Client"
Cohesion: 0.14
Nodes (17): authenticateBrand(), BrandSession, BrandTransientError, __clearSessionCache(), ConnectionContext, fetchRenaultVehicleData(), isFresh(), postJson() (+9 more)

### Community 90 - "Calendar Events"
Cohesion: 0.16
Nodes (20): CALENDAR_VIEW_STORAGE_KEY, useCalendarView(), CalendarData, CalendarMaintenance, calendarRangeLabel(), CalendarReservation, CalendarVehicle, dedupeById() (+12 more)

### Community 91 - "Expense Sealing Chain Tests"
Cohesion: 0.13
Nodes (15): ConcurrentTransitionError, PersistOptions, persistSealed(), PersistSealError, appendRevision(), CURRENT_WORKFLOW_VERSION, SealResult, LEGACY_SIGNATURE_FIELDS (+7 more)

### Community 92 - "Demo Shared DB Tests"
Cohesion: 0.09
Nodes (8): API_DIR, EXEMPT, MUTATING, routeFiles(), routes, FakeClient, Listener, source

### Community 93 - "Incremental PDF Signing"
Cohesion: 0.16
Nodes (19): addPlaceholderToField(), assertIncrementalAppend(), buildAppearance(), buildXrefTable(), IncrementalUpdateError, IndirectObject, lastRevisionOf(), outerDict() (+11 more)

### Community 94 - "Stats Page & Export"
Cohesion: 0.13
Nodes (16): diffDays(), DriverOption, getDefaultDates(), StatsPage(), extractFilename(), handleExportCSV(), handleExportPDF(), VehicleOption (+8 more)

### Community 95 - "Admin ULs Tab"
Cohesion: 0.11
Nodes (12): PhoneNum, UL, ULsTab(), fetchULs(), handleDelete(), handleStampUpload(), handleSubmit(), showToast() (+4 more)

### Community 96 - "MCP Server Tools (2)"
Cohesion: 0.14
Nodes (18): MCP_ASSERTION_HEADER, MCP_ASSERTION_TTL_SECONDS, McpAssertionClaims, McpAssertionPayload, McpReadOnlyError, secret(), sign(), signMcpAssertion() (+10 more)

### Community 97 - "Media Upload API"
Cohesion: 0.17
Nodes (19): generateIncidentPdf(), IncidentPdfDocument(), isR2Ref(), assertRefBindable(), deleteMediaFile(), deleteMediaFolder(), deleteMediaRefIfUnshared(), isMediaRefReferenced() (+11 more)

### Community 98 - "Incident Dossier Tests"
Cohesion: 0.10
Nodes (10): POST, POST, DELETE, adminSession, afterTasks, mockedAuth, checkout(), getDrivers() (+2 more)

### Community 99 - "Users Admin Page"
Cohesion: 0.12
Nodes (13): AdminPage(), AdminPageContent(), impersonateUser(), showToast(), validatePapers(), canSeeTab(), isTabId(), TAB_IDS (+5 more)

### Community 100 - "Audit Log Tab"
Cohesion: 0.15
Nodes (15): AuditLogEntry, AuditLogTab(), AuditLogTabProps, formatDate(), mcpTokenName(), resourceLabel(), summary(), AUDIT_PAGE_SIZE (+7 more)

### Community 101 - "Referentiel Import Tab"
Cohesion: 0.11
Nodes (13): Phase, ProcessResponse, putWithProgress(), ReferentielStatus, ReferentielTab(), handleFile(), handleResume(), runIndexing() (+5 more)

### Community 102 - "MCP Server Tools (3)"
Cohesion: 0.20
Nodes (18): buildCatalog(), CATALOG_FILE, exportedMethods(), renderCatalogSource(), routeFiles(), urlPath(), MCP_API_CATALOG, CatalogRoute (+10 more)

### Community 103 - "Expense Attachments"
Cohesion: 0.15
Nodes (12): appendJustificatifs(), AttachmentError, collectGarbage(), compressJustificatifImage(), FT_NAME, JustificatifFile, SIG_NAME, stripForeignSignatures() (+4 more)

### Community 104 - "Vehicle Documents Tests"
Cohesion: 0.11
Nodes (15): DELETE, POST, ADMIN, ADMIN_OTHER_UL, asSession(), bucket, INACTIVE, mockedAuth (+7 more)

### Community 105 - "Expenses Page & Table"
Cohesion: 0.24
Nodes (13): ExpenseDetailSidebar(), ExpenseDetailSidebarProps, ExpensesTable(), ExpensesTableProps, SortField, SortOrder, ExpenseReport, formatDate() (+5 more)

### Community 106 - "Seasonal Theme Context"
Cohesion: 0.15
Nodes (14): FALLBACK, SeasonalThemeToggle(), THEME_ICONS, ActiveTheme, readHidden(), SeasonalThemeContext, SeasonalThemeContextValue, SeasonalThemeProvider() (+6 more)

### Community 107 - "Inventory Adjustments"
Cohesion: 0.14
Nodes (13): compareFefo(), FEFO_ORDER_BY, ItemBatchState, planStockMovement(), PlanStockMovementResult, RESYNC_ITEM_QUANTITY_SQL, runStatements(), SqlExecutor (+5 more)

### Community 108 - "Mission Report Creation"
Cohesion: 0.12
Nodes (20): CreateMissionReportInput, dpsFieldsToStore(), effectiveSignedReportMode(), hasDuplicateCategory(), InsertMissionReportResult, interventionModeEntrySchema, interventionNatureEntrySchema, isDpsOrPaps() (+12 more)

### Community 109 - "Scanner PDF Output"
Cohesion: 0.18
Nodes (14): buildPdf(), COMPRESSION_STEPS, encodeCanvasToJpeg(), EncodedPage, MAX_SCAN_BYTES, MAX_SCAN_PAGES, PageEncoder, pagesToPdfFile() (+6 more)

### Community 110 - "Vehicle API & UL Scoping (2)"
Cohesion: 0.14
Nodes (16): DELETE, PATCH, patchItemSchema, GET(), createItemSchema, GET(), isVehicleHidden(), POST (+8 more)

### Community 111 - "Mission Detail & Supplies (2)"
Cohesion: 0.15
Nodes (13): STEP3_CATEGORIES, Step3Props, Step3Supplies(), Step4Oxygen(), Step4Props, EXTERNAL_VEHICLES, MISSION_TYPE_LABELS, SUPPLIES_BY_CATEGORY (+5 more)

### Community 112 - "Scanner Geometry"
Cohesion: 0.18
Nodes (16): blendQuads(), clamp(), cross(), dot(), estimateAspectRatio(), fullFrameQuad(), isConvexQuad(), isStable() (+8 more)

### Community 113 - "Help Page & Demo Toggle"
Cohesion: 0.15
Nodes (9): AidePage(), PhoneNum, UL, DemoRefreshButton(), RefreshResponse, successMessage(), useDemoMode(), demo (+1 more)

### Community 114 - "Fleet Task Attachment Tests"
Cohesion: 0.12
Nodes (15): POST, ADMIN_A, ADMIN_B, bucket, CHVL_A, EXE, mockedAuth, mockedDelete (+7 more)

### Community 115 - "Expenses Page & Table (2)"
Cohesion: 0.19
Nodes (13): ExpensesFilters(), ExpensesFiltersProps, ExpensesHeader(), ExpensesHeaderProps, ExpensesPage(), useExpenseReports(), canCreateExpense(), ElectronicSignatureModal() (+5 more)

### Community 116 - "Demo Context & Fetch Interceptor"
Cohesion: 0.19
Nodes (15): DemoContext, DemoContextType, DemoProvider(), DemoStatus, purgeLegacyDemoDb(), readDemoStatus(), setDemoCookie(), pathnameOf() (+7 more)

### Community 117 - "Expense Sealing Chain Tests (2)"
Cohesion: 0.16
Nodes (9): allMatches(), countPages(), derLength(), extractSignatures(), readPdfString(), realPageCount(), SignatureInfo, VerifyReport (+1 more)

### Community 118 - "Expense Detail API"
Cohesion: 0.19
Nodes (13): POST, isStagingIdSignedFor(), issueStagingId(), normalizeReceiptKeys(), parseStoredReceiptKeys(), receiptKeysError(), secret(), signature() (+5 more)

### Community 119 - "Vehicle Connection Data"
Cohesion: 0.18
Nodes (13): maxDuration, PATCH, patchHandler(), BrandAuthError, ACTIVE_STATUSES, FetchOptions, getRenaultVehicleData(), isConnectedInDb() (+5 more)

### Community 120 - "Reservation Slot Picker"
Cohesion: 0.15
Nodes (11): CalendarMaintenance, CalendarReservation, CalendarTrip, daysBetween(), monthKeyOf(), ReservationSlotPicker(), ReservationSlotPickerProps, toDayKey() (+3 more)

### Community 121 - "Credentials Crypto"
Cohesion: 0.21
Nodes (14): AAD, decryptSecret(), decryptWith(), encryptSecret(), keyFingerprint(), needsRewrap(), ParsedPayload, parsePayload() (+6 more)

### Community 122 - "Line Quads"
Cohesion: 0.23
Nodes (16): distance(), angleGap(), clusterLines(), distanceToLine(), dominantAngle(), intersect(), Line, pairs() (+8 more)

### Community 123 - "Mission Report PDF"
Cohesion: 0.19
Nodes (17): CELLS, decodePngDataUrl(), drawCell(), DrawContext, drawParagraph(), drawSignature(), fillMissionReportPdf(), fitLine() (+9 more)

### Community 124 - "Referentiel Tests"
Cohesion: 0.16
Nodes (14): POST, POST, ADMIN, asSession(), attempts, extraction, head, importReferentiel() (+6 more)

### Community 125 - "UL QR Token Tests"
Cohesion: 0.12
Nodes (10): DELETE, POST, ADMIN, CHVL, mockedAuth, ADMIN, CADRE, CHVL (+2 more)

### Community 126 - "Auth Callback Tests"
Cohesion: 0.14
Nodes (12): authCallbacks, computeSessionRoles(), parseRolesCsv(), resolveSessionRoles(), SessionRolesExecutor, UserUlRoleRow, JwtArgs, mockExecute (+4 more)

### Community 127 - "Mission Interventions"
Cohesion: 0.17
Nodes (13): BreakdownGroup(), StepInterventionBreakdown(), StepInterventionBreakdownProps, INTERVENTION_LABELS, INTERVENTION_MODE_CATEGORIES, INTERVENTION_MODE_LABELS, INTERVENTION_NATURE_CATEGORIES, INTERVENTION_NATURE_LABELS (+5 more)

### Community 128 - "License Status"
Cohesion: 0.23
Nodes (11): GET(), applyDriverRoleTransition(), holdsDriverRole(), SqlExecutor, getLicenseStatus(), INVALIDATION_GRACE_DAYS, LicenseRow, LicenseStatus (+3 more)

### Community 129 - "Vehicle Documents & Guide"
Cohesion: 0.27
Nodes (13): maxDuration, runtime, handleFiles(), formatGuideSize(), GUIDE_NOT_PDF_ERROR, GUIDE_TOO_LARGE_ERROR, guideContentDisposition(), hasPdfSignature() (+5 more)

### Community 130 - "Themes Admin Tab"
Cohesion: 0.15
Nodes (9): Draft, scopeSummary(), STATUS_LABELS, ThemeConfig, ThemesTab(), toDraft(), ULOption, THEME (+1 more)

### Community 131 - "Signed Report Mode Tests"
Cohesion: 0.13
Nodes (12): ADMIN, APP_REPORT, appPayload, base, dpsFields, GUEST, mockedAuth, mockedPut (+4 more)

### Community 132 - "Menu Settings Schema"
Cohesion: 0.20
Nodes (9): resetDemoClientForTests(), CHECK_VALUES, menuSettingNeedsRebuild(), menuSettingTableDdl(), rebuildMenuSettingTable(), availability(), dir, mockedAuth (+1 more)

### Community 133 - "Expense Budget Stats"
Cohesion: 0.25
Nodes (8): COLORS, ExpenseStatsBudgetBlock(), ExpenseStatsBudgetBlockProps, ExpenseStatsSection(), ExpenseStatsSectionProps, ExpenseStatsDataResult, byBudget, mockData

### Community 134 - "Vehicles List & Maintenance API"
Cohesion: 0.19
Nodes (11): deleteHandler(), dynamic, MaintenanceEventRow, patchHandler(), ResolveResult, updateMaintenanceEventSchema, createVehicleSchema, dynamic (+3 more)

### Community 135 - "Inventory Types"
Cohesion: 0.14
Nodes (14): InvBagTemplate, InvBagTemplateDetail, InvBagTemplateEntry, InventoryItem, InventoryKPIs, InventoryLot, InventoryTransferPayload, InvGroupe (+6 more)

### Community 136 - "Login & Env"
Cohesion: 0.20
Nodes (8): DEV_ROLES, LoginPage(), resolveCallbackUrl(), isDev, isPreview, isProd, PREVIEW_ACCOUNTS, PreviewAccountKey

### Community 137 - "Banners Admin Tab"
Cohesion: 0.17
Nodes (8): Banner, BannersTab(), fetchBanners(), handleSubmit(), UL, baseBanner, defaultFetchHandler(), getUrl()

### Community 138 - "Expense Budgets Modal"
Cohesion: 0.19
Nodes (11): Budget, ExpenseBudgetsModal(), handleArchive(), handleCreate(), handleRename(), readError(), ExpenseBudgetsModalProps, BUDGETS (+3 more)

### Community 139 - "Maintenance History Modal"
Cohesion: 0.16
Nodes (10): defaultForm, formatDate(), MaintenanceHistoryModal(), MaintenanceHistoryModalProps, TYPE_LABELS, defaultFetchHandler(), getUrl(), mockVehicle (+2 more)

### Community 140 - "Scanner Pick-Best Tests"
Cohesion: 0.15
Nodes (7): Scored, QuadScore, BELOW_HEADER, MAT, SHEET, fillRect(), strokeRect()

### Community 141 - "Referentiel PDF Extraction"
Cohesion: 0.20
Nodes (9): ExtractedPage, ExtractOptions, extractPages(), isTextItem(), openDocument(), OpenedDocument, PdfSource, TextItem (+1 more)

### Community 142 - "Media Access Control"
Cohesion: 0.26
Nodes (12): GET(), runtime, canAccessFolder(), canAccessMediaKey(), canAccessSignedReport(), canReadAnyMissionReport(), FolderOwner, resolveFolderOwner() (+4 more)

### Community 143 - "Check-out Form"
Cohesion: 0.26
Nodes (10): missionLeadNameSchema, missionTypeSchema, EditCheckOutModal(), DESINFECTION_MISSION_TYPE, isMissionType(), isVpspVehicleType(), MISSION_TYPES, MissionType (+2 more)

### Community 144 - "Fun Factor Stats"
Cohesion: 0.19
Nodes (11): DominanceItem, FunFactor(), FunFactorProps, getFirstName(), getMessage(), pickByHash(), TIER_65, TIER_75 (+3 more)

### Community 145 - "Vehicle Calendar Tests"
Cohesion: 0.15
Nodes (7): calendarPayload(), mockCalendarData, mockFetch(), { mockUseSession }, now, reservationDay, reservationDayEnd

### Community 146 - "Inventory CSV Import"
Cohesion: 0.19
Nodes (9): CSV_COLUMNS, CsvLineError, isRealIsoDate(), MAX_DATA_ROWS, ParsedRow, parseStockCsv(), ParseStockCsvResult, rowSchema (+1 more)

### Community 147 - "Vehicle Connection Tests"
Cohesion: 0.15
Nodes (8): DELETE, PATCH, POST, ADMIN, ADMIN_OTHER_UL, CHVL, mockedAuth, mockedFetch

### Community 148 - "Fleet Task Forms & Hooks (2)"
Cohesion: 0.24
Nodes (11): dossierLinkedObjects(), DossierLinks(), Props, GROUP_LABELS, hrefOf(), ICONS, LinkPicker(), Props (+3 more)

### Community 149 - "MCP Tokens (2)"
Cohesion: 0.21
Nodes (9): handler, MAX_RESPONSE_CHARS, afterTasks, callTool(), currentHeaders, fetchSpy, Handler, rpc() (+1 more)

### Community 150 - "Vehicle API & UL Scoping (3)"
Cohesion: 0.29
Nodes (9): DELETE, deleteHandler(), GET(), getOrCreateToken(), isVehicleHidden(), POST, postHandler(), canSuperviseVehicles (+1 more)

### Community 151 - "Stats Charts"
Cohesion: 0.30
Nodes (6): DriverBreakdown(), DriverBreakdownProps, KPICardsProps, StatsData, VehicleBreakdownProps, byDriver

### Community 152 - "Expense Stats PDF"
Cohesion: 0.24
Nodes (8): aggregateByBudget(), BUDGET_LABEL_NA, BUDGET_LABEL_UNKNOWN, ExpenseItemForBudget, ExpenseStatsFilters, parseExpenseItemsForBudget(), executeMock, SqlStatement

### Community 153 - "Fun Factor Tests"
Cohesion: 0.21
Nodes (10): computeDominanceItems(), DominanceItem, DriverEntry, getFirstName(), getMessage(), pickByHash(), TIER_65, TIER_75 (+2 more)

### Community 154 - "Guided Tour"
Cohesion: 0.24
Nodes (8): closeBurgerMenu(), GuidedTour(), finish(), next(), isElementVisible(), openBurgerMenu(), collectTitles(), mockVisibility

### Community 155 - "Incident PDF Document"
Cohesion: 0.18
Nodes (10): AccidentDetails, Actions, Context, Damages, FlashDetails, IncidentReport, PdfVehicleSVG(), pdfZones (+2 more)

### Community 156 - "Referentiel PDF Extraction (2)"
Cohesion: 0.18
Nodes (4): countPages(), destroy, getDocument, PDFDataRangeTransport

### Community 157 - "Mission Wizard Tests"
Cohesion: 0.27
Nodes (9): chooseAttachment(), fillStep1(), getUrl(), goToLastStep(), goToSignedReportStep(), mockedUpload, mockFetch(), mockPush (+1 more)

### Community 158 - "__tests__/components"
Cohesion: 0.24
Nodes (7): advance(), ctx, fetchMock, hideTab(), mountBell(), setVisibility(), showTab()

### Community 159 - "Inventory Stock Tests (2)"
Cohesion: 0.20
Nodes (3): POST, ADMIN, mockedAuth

### Community 160 - "Stats PDF Document"
Cohesion: 0.33
Nodes (9): fmtDate(), fmtDateShort(), Footer(), SectionTitle(), StatsPdfDocument(), StatsPdfProps, styles, TableHeaderRow() (+1 more)

### Community 161 - "Referentiel PDF Extraction (3)"
Cohesion: 0.42
Nodes (8): applyFicheNames(), coverTitle(), ficheCodeOf(), normalizeFicheCode(), pageTitle(), SplitPage, splitPageHeader(), titleOfHeaderLine()

### Community 162 - "Vehicle Photo"
Cohesion: 0.27
Nodes (6): hasAcceptedPhotoSignature(), MAX_PHOTO_SIZE, PHOTO_ACCEPT, PHOTO_INVALID_ERROR, PHOTO_TOO_LARGE_ERROR, startsWith()

### Community 163 - "Check-in Modal Tests"
Cohesion: 0.24
Nodes (6): defaultFetchHandler(), getUrl(), mockTrip, mockVehicle, patchBody(), patchCalls()

### Community 164 - "Trip Zod Schemas"
Cohesion: 0.31
Nodes (7): updateIncidentSchema, incidentSchema, checkInSchema, checkOutSchema, isAcceptableMediaRef(), validCheckIn, validCheckOut

### Community 165 - "Mission Edit Page"
Cohesion: 0.33
Nodes (6): EditMissionPage(), LOAD_ERRORS, LoadError, ReportForEditPage, MissionReportForEdit, reportToWizardState()

### Community 166 - "Menu Settings Admin"
Cohesion: 0.25
Nodes (5): MENU_CONFIGS, MenuConfig, MenusTab(), VISIBILITY_OPTIONS, mockUseMenuSettings

### Community 167 - "Step2 Vehicle Tests"
Cohesion: 0.22
Nodes (5): Step2Vehicle(), baseData, drivers, sessionMock, vehicles

### Community 168 - "Multi-Select Dropdown"
Cohesion: 0.25
Nodes (4): MultiSelectDropdown(), Option, Props, options

### Community 169 - "Calendar Day Span"
Cohesion: 0.36
Nodes (4): formatHour(), getDaySpanLabel(), isSameLocalDay(), overlapsDay()

### Community 170 - "Edit Maintenance Event Modal"
Cohesion: 0.33
Nodes (6): EditMaintenanceEventModal(), EditMaintenanceEventModalProps, pad(), splitLocal(), baseEvent, renderModal()

### Community 171 - "Expense Form & Signature"
Cohesion: 0.28
Nodes (7): BUDGETS, chooseBudget(), fillItem(), FormProps, getUrl(), mockFetch(), renderForm()

### Community 172 - "Incident Dossier Tests (2)"
Cohesion: 0.31
Nodes (7): declare(), dossiers(), DRIVER, json(), mockedAuth, newDossier(), RESP

### Community 173 - "Unit Test Setup"
Cohesion: 0.33
Nodes (4): db, seedTrip(), seedUser(), seedVehicle()

### Community 174 - "PDF Content Streams"
Cohesion: 0.36
Nodes (6): appliquer(), composer(), contentStreams(), filledRect(), IDENTITE, Matrice

### Community 175 - "Uniforms Page & Tabs"
Cohesion: 0.39
Nodes (5): UniformLoansTable(), UL_LOANS_LIMIT, UlLoanRow, BASE, OPEN

### Community 176 - "Uniform QR Modal"
Cohesion: 0.32
Nodes (4): UniformQRCodeModal(), defaultFetchHandler(), getUrl(), renderModal()

### Community 177 - "Vehicle Detail Modals (3)"
Cohesion: 0.32
Nodes (5): DesinfPreCheckinModal(), DesinfPreCheckinModalProps, getUrl(), mockFetch(), usersResponse

### Community 178 - "Expense Budgets Seed"
Cohesion: 0.29
Nodes (5): BudgetExecutor, BudgetReader, DEFAULT_EXPENSE_BUDGETS, ExpenseBudget, seedDefaultBudgets()

### Community 179 - "Incident Dossier Creation"
Cohesion: 0.36
Nodes (7): createIncidentDossier(), formatOccurredAt(), INCIDENT_SOURCE_TYPE, INCIDENT_TYPE_TITLES, incidentDossierDescription(), IncidentDossierSource, incidentDossierTitle()

### Community 180 - "Add Vehicle Modal Tests"
Cohesion: 0.36
Nodes (6): choosePhoto(), defaultFetchHandler(), fieldInput(), fieldSelect(), fillRequiredFields(), getUrl()

### Community 181 - "Navbar Tests"
Cohesion: 0.25
Nodes (7): mockDetachDevice, mockGetVisibility, mockSeasonal, mockSignOut, mockSwitchUL, mockUL, Visibility

### Community 182 - "Demo Shared DB Tests (2)"
Cohesion: 0.25
Nodes (4): cookieState, demoDir, mockedAuth, postReservation()

### Community 183 - "Maintenance Status"
Cohesion: 0.43
Nodes (5): isMaintenanceClosed(), isMaintenanceEditable(), cases, futureISO, pastISO

### Community 184 - "Referentiel FTS Query"
Cohesion: 0.43
Nodes (5): buildFtsQuery(), fold(), quote(), STOP_WORDS, SYNONYM_GROUPS

### Community 185 - "Dashboard Quick Return (2)"
Cohesion: 0.43
Nodes (4): getReturnEligibility(), isSameUser(), ReturnDenialReason, ReturnEligibilityInput

### Community 186 - "Migration Script Tests (2)"
Cohesion: 0.33
Nodes (5): client(), ROOT, SCRIPT, seedVehicles(), tmpDir

### Community 187 - "Mission Report PDF (2)"
Cohesion: 0.33
Nodes (3): MissionReportPdfData, DATA, SIGNATURES

### Community 188 - "Menu Settings Tests"
Cohesion: 0.47
Nodes (5): PATCH, callPatch(), makePatchRequest(), mockedAuth, seedMenuSettings()

### Community 189 - "Stats Charts (2)"
Cohesion: 0.40
Nodes (5): ChartsSection, ChartsSection(), ChartsSectionProps, getFirstName(), PIE_COLORS

### Community 191 - "Demo Banner"
Cohesion: 0.47
Nodes (3): DemoBanner(), DEMO_SIMULATED_EVENT, demo

### Community 192 - "Calendar View Switcher"
Cohesion: 0.40
Nodes (5): CalendarViewSwitcher(), CalendarViewSwitcherProps, VIEWS, CALENDAR_VIEW_LABELS, CalendarViewMode

### Community 193 - "Notification Bell (2)"
Cohesion: 0.40
Nodes (4): client, Probe(), renderProvider(), sessionState

### Community 194 - "Demo DB Routing"
Cohesion: 0.33
Nodes (5): cookieState, created, failing, FakeClient, loadDb()

### Community 195 - "Expense Stats PDF (2)"
Cohesion: 0.50
Nodes (4): ExpenseStatsPdfDocument(), ExpenseStatsPdfProps, formatDateFr(), styles

### Community 196 - "Navbar & Menu Visibility (2)"
Cohesion: 0.50
Nodes (3): ThemeToggle(), mockSetTheme, mockUseTheme

### Community 198 - "DT Filters Hook Tests"
Cohesion: 0.50
Nodes (4): applyLastUrl(), lastUrl(), nav, NOW

## Knowledge Gaps
- **5 isolated node(s):** `RFC-5987`, `RFC-2426`, `RFC-5987`, `{ GET, POST }`, `{ handlers, signIn, signOut }`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 2181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `auth` connect `Roles & Authorization` to `License Status`, `Uniforms Catalog & Loans`, `Auth & DB Core`, `Vehicle Documents & Guide`, `Vehicle API & UL Scoping`, `Menu Settings Schema`, `Vehicles List & Maintenance API`, `Daily Alerts Detection`, `Login & Env`, `Fleet Tracking API Routes`, `Integration Test Setup`, `Fleet Tasks Store`, `Signed Report Mode Tests`, `Inventory API & Error Helpers`, `Media Access Control`, `Stats API & Exports`, `Reservation Eligibility`, `User & License Test Seeds`, `Fleet Attachments`, `Vehicle Connection Tests`, `Vehicle API & UL Scoping (3)`, `Audit Log & Reservations`, `Check-in Tests`, `Maintenance Events Tests`, `Inventory Stock Tests (2)`, `Fleet Tracking API Routes (2)`, `Mission Report Tests`, `Mileage Anomaly & Check-in`, `Integration Test Setup (2)`, `Control Appointments Store`, `Media Refs & File Route`, `Incident Dossier Tests (2)`, `Checkout & Push Tests`, `Fleet Tracking API Routes (3)`, `QR Stock Tests`, `Root Layout & Banners`, `Demo Shared DB Tests (2)`, `License Lifecycle Tests`, `Inventory Stock Tests`, `MCP Tokens`, `Menu Settings Tests`, `Vehicle Brand Connection`, `Inventory Adjust Tests`, `Demo Refresh`, `Mission Access & Incident Alerts`, `Expense Workflow Roles`, `Trips API`, `Vehicle Photo Tests`, `MCP Server Tools (2)`, `Media Upload API`, `Incident Dossier Tests`, `Vehicle Documents Tests`, `Vehicle API & UL Scoping (2)`, `Fleet Task Attachment Tests`, `Expense Detail API`, `Vehicle Connection Data`, `Referentiel Tests`, `UL QR Token Tests`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `RFC-5987`, `RFC-2426`, `RFC-5987` to the rest of the system?**
  _5 weakly-connected nodes found - possible missing edges._
- **Should `Uniforms Catalog & Loans` be split into smaller, more focused modules?**
  _Cohesion score 0.030465051517683098 - nodes in this community are weakly interconnected._
- **Why does `getErrorMessage()` connect `Uniforms Catalog & Loans` to `Roles & Authorization`, `Auth & DB Core`, `Vehicle Documents & Guide`, `Daily Alerts Detection`, `Fleet Tracking API Routes`, `Fleet Tasks Store`, `Inventory API & Error Helpers`, `Media Access Control`, `Fleet Attachments`, `Audit Log & Reservations`, `Fleet Tracking API Routes (2)`, `Control Appointments Store`, `Media Refs & File Route`, `Checkout & Push Tests`, `Fleet Tracking API Routes (3)`, `MCP Tokens`, `Web Push Client`, `Vehicle Brand Connection`, `Demo Refresh`, `Mission Access & Incident Alerts`, `Renault Connect Client`, `Media Upload API`, `Vehicle Connection Data`, `Credentials Crypto`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Should `Roles & Authorization` be split into smaller, more focused modules?**
  _Cohesion score 0.042812222849310654 - nodes in this community are weakly interconnected._
- **Why does `db` connect `Auth & DB Core` to `License Status`, `Roles & Authorization`, `Uniforms Catalog & Loans`, `Vehicle Documents & Guide`, `Vehicle API & UL Scoping`, `Vehicles List & Maintenance API`, `Daily Alerts Detection`, `Fleet Tracking API Routes`, `Fleet Tasks Store`, `Inventory API & Error Helpers`, `Media Access Control`, `Stats API & Exports`, `Vehicle API & UL Scoping (3)`, `Audit Log & Reservations`, `Expense Stats PDF`, `Check-in Tests`, `Fleet Tracking API Routes (2)`, `Mileage Anomaly & Check-in`, `Expense PDF Signature Layout`, `Control Appointments Store`, `Media Refs & File Route`, `Checkout & Push Tests`, `Fleet Tracking API Routes (3)`, `Incident Dossier Creation`, `Expense PDF Sealing`, `MCP Tokens`, `Uniforms History Cursor`, `Vehicle Brand Connection`, `Mission Access & Incident Alerts`, `Expense Workflow Roles`, `Trips API`, `Mission Report Updates`, `Renault Connect Client`, `Expense Sealing Chain Tests`, `Media Upload API`, `Mission Report Creation`, `Vehicle API & UL Scoping (2)`, `Vehicle Connection Data`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Should `Auth & DB Core` be split into smaller, more focused modules?**
  _Cohesion score 0.05192761605035405 - nodes in this community are weakly interconnected._