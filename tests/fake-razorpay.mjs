// A tiny in-memory stand-in for the Razorpay API, used by the tests.
import { createHmac } from 'node:crypto';

export const KEY_ID = 'rzp_test_AbC123xyz', KEY_SECRET = 'S3cretKeyValue0123';

export function fakeRazorpay() {
  const orders = {}, payments = {};
  let n = 0;
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchFn = async (url, init) => {
    const auth = (init.headers.authorization || '').replace('Basic ', '');
    if (atob(auth) !== `${KEY_ID}:${KEY_SECRET}`) return reply(401, { error: { description: 'Authentication failed' } });
    const path = new URL(url).pathname.replace('/v1', '');
    let m;
    if (init.method === 'GET' && path === '/payments') return reply(200, { items: Object.values(payments).reverse() });
    if (init.method === 'POST' && path === '/orders') {
      const b = JSON.parse(init.body);
      const id = `order_${++n}`;
      orders[id] = { id, amount: b.amount, currency: b.currency, receipt: b.receipt };
      return reply(200, orders[id]);
    }
    if ((m = path.match(/^\/orders\/([^/]+)\/payments$/))) return reply(200, { items: Object.values(payments).filter((p) => p.order_id === m[1]) });
    if ((m = path.match(/^\/payments\/([^/]+)\/capture$/))) { payments[m[1]].status = 'captured'; return reply(200, payments[m[1]]); }
    if ((m = path.match(/^\/payments\/([^/]+)$/))) return payments[m[1]] ? reply(200, payments[m[1]]) : reply(404, { error: { description: 'not found' } });
    return reply(404, { error: { description: 'unknown ' + path } });
  };
  // Simulates the customer paying in Razorpay Checkout.
  const pay = (orderId, status = 'authorized', amount) => {
    const id = `pay_${++n}`;
    payments[id] = { id, order_id: orderId, amount: amount ?? orders[orderId].amount, currency: 'INR', status, method: 'upi', created_at: Math.floor(Date.now() / 1000),
      ...(status === 'failed' ? { error_code: 'BAD_REQUEST_ERROR', error_description: 'Payment failed because the UPI app declined it', error_reason: 'payment_declined' } : {}) };
    const signature = createHmac('sha256', KEY_SECRET).update(`${orderId}|${id}`).digest('hex');
    return { razorpay_order_id: orderId, razorpay_payment_id: id, razorpay_signature: signature };
  };
  return { fetchFn, pay, payments };
}

