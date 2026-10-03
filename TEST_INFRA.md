# E2E Test Infra: Campus Canteen Express

## Test Philosophy
- Opaque-box, requirement-driven. Derived from `ORIGINAL_REQUEST.md` and user-facing specifications with zero reliance on implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Simulation + Adversarial Stress Testing.
- Strict pass/fail semantics: zero tolerated regressions, 100% test pass rate required.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | User Auth & Registration | ORIGINAL_REQUEST §R1, Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 2 | Authorization & Role Guards | ORIGINAL_REQUEST §R1, §R2 | 5 | 5 | ✓ | ✓ |
| 3 | Menu Catalog & Filtering | ORIGINAL_REQUEST §R1, §R3 | 5 | 5 | ✓ | ✓ |
| 4 | Menu Availability & Admin Updates | ORIGINAL_REQUEST §R1, §R3 | 5 | 5 | ✓ | ✓ |
| 5 | Pickup Slots & Capacity Rules | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 6 | Order Calculation & Pricing Snapshots | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 7 | Order Placement & Transactional Locks | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 8 | Order State Machine Transitions | ORIGINAL_REQUEST §R1, Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 9 | Order Cancellation Window | ORIGINAL_REQUEST §R1, Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 10 | Pickup Token Generation & Verification | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 11 | Payment Flow & Mock Verification | ORIGINAL_REQUEST §R2, §R4 | 5 | 5 | ✓ | ✓ |
| 12 | Admin Analytics & Reporting | ORIGINAL_REQUEST §R1, Acceptance Criteria | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Framework: Jest with Supertest & Axios for HTTP integration testing.
- Scripted E2E Smoke Runner: `tests/e2e/smoke.test.js` exercising the complete Student -> Browse -> Order -> Slot Booking -> Payment -> Token -> Admin Verification -> State Transition -> Collection lifecycle.
- Concurrency & Stress Harness: `tests/stress/concurrency.test.js` testing race conditions on slot capacity and token uniqueness.
- Directory Layout:
  ```
  tests/
  ├── helpers/
  │   ├── appHelper.js
  │   ├── authHelper.js
  │   └── dbHelper.js
  ├── tier1-features/
  │   ├── auth.test.js
  │   ├── menu.test.js
  │   ├── slots.test.js
  │   ├── orders.test.js
  │   ├── stateMachine.test.js
  │   ├── tokenVerification.test.js
  │   └── payments.test.js
  ├── tier2-boundaries/
  │   ├── authBounds.test.js
  │   ├── cartBounds.test.js
  │   ├── slotBounds.test.js
  │   └── orderBounds.test.js
  ├── tier3-interactions/
  │   ├── slotCapacityCancellation.test.js
  │   ├── menuUpdateOrderSnapshot.test.js
  │   └── availabilityOrderRejection.test.js
  ├── tier4-workloads/
  │   ├── peakLunchRush.test.js
  │   └── fullDayLifecycle.test.js
  ├── tier5-adversarial/
  │   ├── raceConditionOverbooking.test.js
  │   ├── priceTampering.test.js
  │   ├── stateBypass.test.js
  │   └── tokenBruteforce.test.js
  └── e2e/
      └── smokeFlow.test.js
  ```

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Peak Lunch Rush Simulation | 20 concurrent students order across 4 slots; capacity saturation enforced cleanly | High |
| 2 | Kitchen State Progression | Batch orders move from PLACED -> ACCEPTED -> PREPARING -> READY -> COLLECTED | Medium |
| 3 | Express Counter Rush | Staff enters tokens rapidly; validates instant verification & prevents double collection | High |
| 4 | Mid-Service Menu & Price Update | Admin disables sold-out items and updates prices; active/historical orders untouched | Medium |
| 5 | Student Cancellation & Capacity Restoration | Student cancels before PREPARING; slot count decrements and becomes available | Medium |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (12 features × 5 = ≥60 test cases)
- Tier 2: ≥5 test cases per boundary domain (≥30 test cases)
- Tier 3: Pairwise interaction test cases (≥15 test cases)
- Tier 4: ≥5 realistic workload scenario suites
- Tier 5: Adversarial attack and concurrency race suites (≥5 suites)
- Total planned test cases: ≥110 automated tests
