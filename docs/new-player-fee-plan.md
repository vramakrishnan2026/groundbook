# GoArena: new-player fee plan

Status: agreed in discussion, not built yet. Saved 9 Nov 2026.
Source doc: https://claude.ai/artifact/Hi4hfX63kBC1JGCsetm15f

## Principle

Keep pricing simple and checkable. Owners in India distrust anything they can't verify, so no commission, no percentages, and no fee that depends on how GoArena classifies a booking behind the scenes.

## The plan

- **Subscription stays the main income.** Flat monthly fee per ground, zero commission.
- **New-player fee:** a player pays a one-time convenience fee of about ₹10–20 (₹15 used as the example) on their **first booking at a given ground**. Later bookings at that ground are free of the fee.
- **Tracking:** by the player's phone number per ground. Bookings already store this.
- **Fully disclosed:** written into the owner agreement, mentioned in ads and the intro slides, and shown at checkout as its own line, e.g. "First booking at this ground: ₹15", before the player pays.

## How the money flows

- The player pays the owner directly (UPI or the owner's own Razorpay), so the owner collects the fee on GoArena's behalf.
- GoArena does **not** use Razorpay Route or split payments. That would make GoArena the middleman holding everyone's money and needs Razorpay approval, which goes against "money straight to your bank".
- The owner passes the fees on through the **monthly subscription invoice**.

## Invoice format

One monthly invoice per ground:

1. Subscription: flat monthly amount.
2. Separate line: "New-player fees: N × ₹15 = ₹X", with booking IDs, dates and player names available on request.

In months with no new players, the line shows zero.

## Things to keep in mind

- This income **shrinks over time** for each ground, as regulars will all have booked once. Treat it as a bonus; the subscription is the real income.
- Players can dodge it by using a different phone number. Accept this; the amounts are small.
- Let owners see which bookings carried the fee, so nothing feels hidden.

## To build later

- Checkout: detect first booking per phone number per ground and add the fee line.
- Admin: count new-player fees per ground per month and add the line to the subscription invoice automatically, with booking IDs and dates attached.
- Update the owner agreement, the ads and the intro slide wording.
