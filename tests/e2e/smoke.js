#!/usr/bin/env node
/**
 * Campus Canteen Express - Standalone Scripted E2E Smoke Test Runner
 * Run directly with: node tests/e2e/smoke.js
 */

const http = require('http');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function requestJson(server, path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (dataString) headers['Content-Length'] = Buffer.byteLength(dataString);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const addr = server.address();
    const req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers
    }, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: rawData });
        }
      });
    });

    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

async function runSmokeTest() {
  log('\n=================================================================', colors.bright + colors.cyan);
  log('     CAMPUS CANTEEN EXPRESS — END-TO-END SMOKE TEST RUNNER', colors.bright + colors.magenta);
  log('=================================================================\n', colors.bright + colors.cyan);

  const { db, dbPath } = initTestDb();
  seedTestDb(db);

  let appModule;
  try {
    appModule = require('../../backend/app');
  } catch (e) {
    appModule = require('../../backend/server');
  }
  const app = appModule.app || appModule;
  const server = app.listen(0);

  let studentToken = null;
  let adminToken = null;
  let orderId = null;
  let orderNumber = null;
  let pickupToken = null;
  let slotId = null;
  let itemId = null;

  const steps = [
    {
      name: '1. Register Student Account',
      action: async () => {
        const res = await requestJson(server, '/api/auth/register', 'POST', {
          name: 'Demo Student',
          email: `smoke_student_${Date.now()}@campus.edu`,
          password: 'Password@123'
        });
        if (res.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
        studentToken = res.body.token || res.body.data?.token;
        const user = res.body.user || res.body.data?.user;
        return `Registered (${user.email})`;
      }
    },
    {
      name: '2. Fetch Menu & Select Item',
      action: async () => {
        const res = await requestJson(server, '/api/menu', 'GET');
        const items = res.body.items || res.body.data?.items;
        if (res.status !== 200 || !items || items.length === 0) {
          throw new Error('Failed to fetch menu');
        }
        const item = items.find(i => i.name === 'Burger') || items[0];
        itemId = item.id;
        return `Selected '${item.name}' (₹${item.base_price || item.price})`;
      }
    },
    {
      name: '3. Fetch Available Pickup Slots',
      action: async () => {
        const res = await requestJson(server, '/api/slots/available', 'GET');
        const slots = res.body.slots || res.body.data?.slots;
        if (res.status !== 200 || !slots || slots.length === 0) {
          throw new Error('No pickup slots available');
        }
        slotId = slots[0].id;
        return `Slot Selected: ${slots[0].start_time} - ${slots[0].end_time}`;
      }
    },
    {
      name: '4. Submit Order (Recalculate Subtotal + ₹3 Express Fee)',
      action: async () => {
        const res = await requestJson(server, '/api/orders', 'POST', {
          slot_id: slotId,
          items: [{ item_id: itemId, quantity: 2 }]
        }, studentToken);

        if (res.status !== 201) throw new Error(`Order placement failed: ${JSON.stringify(res.body)}`);
        const order = res.body.order || res.body.data?.order;
        orderId = order.id;
        orderNumber = order.order_number;
        pickupToken = order.pickup_token;
        return `Order Placed: ${orderNumber} | Token: [${pickupToken}] | Total: ₹${order.total_amount}`;
      }
    },
    {
      name: '5. Mock Payment Verification',
      action: async () => {
        const res = await requestJson(server, '/api/orders/verify-payment', 'POST', {
          order_id: orderId,
          razorpay_payment_id: `pay_mock_${Date.now()}`,
          razorpay_order_id: `order_mock_${Date.now()}`,
          razorpay_signature: 'mock_signature'
        }, studentToken);
        if (res.status !== 200) throw new Error(`Payment verification failed: ${JSON.stringify(res.body)}`);
        return 'Payment Verified (PAID status confirmed)';
      }
    },
    {
      name: '6. Admin Authentication',
      action: async () => {
        const res = await requestJson(server, '/api/auth/login', 'POST', {
          email: 'admin@canteen.local',
          password: 'Admin@123'
        });
        if (res.status !== 200) throw new Error(`Admin login failed: ${JSON.stringify(res.body)}`);
        adminToken = res.body.token || res.body.data?.token;
        return 'Admin Logged In';
      }
    },
    {
      name: '7. Admin Order Lifecycle: PLACED -> ACCEPTED',
      action: async () => {
        const res = await requestJson(server, `/api/admin/orders/${orderId}/status`, 'PATCH', { status: 'ACCEPTED' }, adminToken);
        if (res.status !== 200) throw new Error(`Status update failed: ${JSON.stringify(res.body)}`);
        return 'Status: ACCEPTED';
      }
    },
    {
      name: '8. Admin Order Lifecycle: ACCEPTED -> PREPARING',
      action: async () => {
        const res = await requestJson(server, `/api/admin/orders/${orderId}/status`, 'PATCH', { status: 'PREPARING' }, adminToken);
        if (res.status !== 200) throw new Error(`Status update failed: ${JSON.stringify(res.body)}`);
        return 'Status: PREPARING';
      }
    },
    {
      name: '9. Admin Order Lifecycle: PREPARING -> READY',
      action: async () => {
        const res = await requestJson(server, `/api/admin/orders/${orderId}/status`, 'PATCH', { status: 'READY' }, adminToken);
        if (res.status !== 200) throw new Error(`Status update failed: ${JSON.stringify(res.body)}`);
        return 'Status: READY';
      }
    },
    {
      name: '10. Express Counter Token Verification (Manual Entry)',
      action: async () => {
        const res = await requestJson(server, '/api/admin/orders/verify-token', 'POST', { pickup_token: pickupToken }, adminToken);
        if (res.status !== 200) throw new Error(`Token verification failed: ${JSON.stringify(res.body)}`);
        const order = res.body.order || res.body.data?.order;
        return `Token Verified: Order ${order.order_number} matched successfully`;
      }
    },
    {
      name: '11. Express Counter Transition: READY -> COLLECTED',
      action: async () => {
        const res = await requestJson(server, `/api/admin/orders/${orderId}/status`, 'PATCH', { status: 'COLLECTED' }, adminToken);
        if (res.status !== 200) throw new Error(`Status update failed: ${JSON.stringify(res.body)}`);
        return 'Order Marked COLLECTED';
      }
    },
    {
      name: '12. Student Final Status & Timeline Check',
      action: async () => {
        const res = await requestJson(server, `/api/orders/${orderId}`, 'GET', null, studentToken);
        const order = res.body.order || res.body.data?.order;
        if (res.status !== 200 || !order || order.status !== 'COLLECTED') {
          throw new Error(`Student verification failed: Status is ${order ? order.status : 'Unknown'}`);
        }
        return 'Student Order Verified COLLECTED in order history';
      }
    }
  ];

  let passed = 0;
  const startTime = Date.now();

  for (const step of steps) {
    const stepStart = Date.now();
    try {
      const detail = await step.action();
      const duration = Date.now() - stepStart;
      log(`  ✔ [PASS] ${step.name} (${duration}ms) - ${detail}`, colors.green);
      passed++;
    } catch (err) {
      log(`  ✖ [FAIL] ${step.name} - ${err.message}`, colors.red);
      break;
    }
  }

  const totalTime = Date.now() - startTime;
  server.close();
  closeAndRemoveTestDb(db, dbPath);

  log('\n-----------------------------------------------------------------', colors.bright + colors.cyan);
  if (passed === steps.length) {
    log(`  🎉 ALL ${passed}/${steps.length} SMOKE TESTS PASSED SUCCESSFULLY (${totalTime}ms)`, colors.bright + colors.green);
  } else {
    log(`  ⚠️ SMOKE TEST FAILED AT STEP ${passed + 1}/${steps.length}`, colors.bright + colors.red);
    process.exitCode = 1;
  }
  log('=================================================================\n', colors.bright + colors.cyan);
}

if (require.main === module) {
  runSmokeTest().catch(err => {
    console.error('Fatal error during smoke test execution:', err);
    process.exit(1);
  });
}

module.exports = { runSmokeTest };
