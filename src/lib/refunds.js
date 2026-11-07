// Cancelling a paid booking and returning the money.
//  - Paid through Razorpay → refund through the ground's Razorpay account.
//  - Paid by UPI screenshot → nothing to refund through; flag it so the owner returns it by hand.
import { closeBooking } from './bookings.js';
import { groundKeys, refundPayment } from './razorpay.js';
import { logError } from './tracking.js';
import { HttpError, bad } from './util.js';

// When does the slot start, in ms since epoch? (dates and hours are local to the ground)
export function slotStartMs(b, tzOffsetMin = 330) {
  const [y, m, d] = b.date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, b.start_hour, 0) - tzOffsetMin * 60000;
}

export function customerCanCancel(b, g, now = Date.now()) {
  if (b.status !== 'CONFIRMED' || b.kind !== 'customer') return false;
  if (b.paid_via !== 'razorpay' || !b.rzp_payment_id) return false;
  if (!g.cancel_hours) return false;
  return slotStartMs(b, g.tz_offset_min) - now >= g.cancel_hours * 3600000;
}

// refund: 'full' | 'none' | number of rupees
export async function cancelWithRefund(env, b, g, { refund = 'full', by = null, note }) {
  const db = env.DB;
  const paid = b.status === 'CONFIRMED' && b.kind === 'customer' && b.amount > 0;
  let amount = 0;
  if (paid && refund !== 'none') {
    amount = refund === 'full' ? b.amount : Math.round(Number(refund));
    if (!Number.isFinite(amount) || amount < 0 || amount > b.amount) throw bad(`Refund must be between ₹0 and ₹${b.amount}`, 'refund');
  }
  const changed = await closeBooking(db, b.id, 'CANCELLED', ['CONFIRMED', 'PENDING', 'HOLD'], { by, note });
  if (!changed) throw new HttpError(409, 'This booking can no longer be cancelled.', 'cannot_cancel');
  if (!amount) return { refund: null };

  if (b.paid_via === 'razorpay' && b.rzp_payment_id) {
    try {
      const keys = await groundKeys(env, { ...g, rzp_enabled: 1 });
      if (!keys) throw new HttpError(400, 'Razorpay is no longer connected for this ground', 'rzp_off');
      const r = await refundPayment(env, keys, b.rzp_payment_id, amount, { booking: b.ref, reason: note || 'Cancelled' });
      await db.prepare('UPDATE bookings SET refund_amount = ?, rzp_refund_id = ?, refund_status = ?, refunded_at = ?, refund_needed = 0 WHERE id = ?')
        .bind(amount, r.id, r.status === 'processed' ? 'processed' : 'pending', Date.now(), b.id).run();
      return { refund: { amount, status: r.status, auto: true } };
    } catch (e) {
      // Booking stays cancelled; the owner finishes the refund by hand.
      await db.prepare(`UPDATE bookings SET refund_amount = ?, refund_status = 'failed', refund_needed = 1 WHERE id = ?`).bind(amount, b.id).run();
      await logError(db, { groundId: g.id, source: 'razorpay', path: `refund ${b.ref}`, code: e.code || 'rzp_refund', message: e.message || String(e) });
      return { refund: { amount, status: 'failed', auto: false, error: e.message } };
    }
  }
  await db.prepare(`UPDATE bookings SET refund_amount = ?, refund_status = 'manual', refund_needed = 1 WHERE id = ?`).bind(amount, b.id).run();
  return { refund: { amount, status: 'manual', auto: false } };
}
