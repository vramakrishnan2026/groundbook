/* ---------- pictures: real GoArena screens in phone frames ----------
   S holds screenshots of the real app (sample ground "Green Field Turf"), packed into this file. */
const dev = (name, cls = '', style = '') => `<div class="dev ${cls}" style="${style}"><img src="${S[name]}" alt="GoArena screen"></div>`;
const lbl = (t, cls = '') => `<div class="lbl ${cls}">${t}</div>`;
const fig = (inner, label) => `<div class="fig">${inner}${label ? lbl(label) : ''}</div>`;

function PICS(T) {
  return [
  /* 1 title */ `<div class="pic one">${fig(dev('c1-ground', 'tilt'))}</div>`,
  /* 2 commission */ `<div class="pic"><div class="vs">
      <div class="glass vs-card">
        <div class="vs-k">${T('Booking marketplaces')}</div>
        <div class="vs-big bad">10–15%</div>
        <div class="vs-s">${T('commission + GST on every booking')}</div>
        <ul><li>${T('Paid the following week')}</li><li>${T('Public bad reviews')}</li><li>${T('They keep your customers')}</li></ul>
      </div>
      <div class="glass vs-card good">
        <div class="vs-k">GoArena</div>
        <div class="vs-big">₹0</div>
        <div class="vs-s">${T('commission, ever')}</div>
        <ul><li>${T('Money straight to your bank')}</li><li>${T('No public reviews')}</li><li>${T('Your customer list')}</li></ul>
      </div></div></div>`,
  /* 3 one link */ `<div class="pic duo">
      ${fig(dev('c1-ground'), T('What customers see'))}
      ${fig(dev('o5-settings-top', 'low'), T('Your link and QR, ready to share'))}</div>`,
  /* 4 three people */ `<div class="pic trio">
      ${fig(dev('c1-ground'), T('Customer'))}
      ${fig(dev('o1-today', 'mid'), T('You, the owner'))}
      ${fig(dev('h1-helper'), T('Helper'))}</div>`,
  /* 5 scan the poster */ `<div class="pic duo">
      <div class="fig"><div class="poster-wrap">${poster()}</div>${lbl(T('Poster at your gate'))}</div>
      ${fig(dev('c1-ground', 'low'), T('Opens your page'))}</div>`,
  /* 6 sees ground */ `<div class="pic duo">
      ${fig(dev('c1-ground'), T('Photos'))}
      ${fig(dev('c2-ground-details', 'low'), T('Facilities and prices'))}</div>`,
  /* 7 pick slot */ `<div class="pic one">${fig(dev('c3-slots'), T('Free slots update live'))}</div>`,
  /* 8 double booking */ `<div class="pic duo">
      <div class="fig rules">
        <div class="glass rule"><div class="rule-h">${T('Full ground booked')}</div>${pitch({ full: 'taken', lf: T('BOOKED'), fs: 14, w: 300 })}<div class="rule-s">✕ ${T('Both halves closed')}</div></div>
        <div class="glass rule"><div class="rule-h">${T('One half booked')}</div>${pitch({ a: 'taken', b: 'free', dash: 1, la: T('BOOKED'), lb: T('FREE'), fs: 14, w: 300 })}<div class="rule-s">✓ ${T('Other half open')} · ✕ ${T('full ground closed')}</div></div>
      </div>
      ${fig(dev('o3-calendar', 'low'), T('Your calendar'))}</div>`,
  /* 9 details */ `<div class="pic one">${fig(dev('c4-details'), T('Name and phone. No login.'))}</div>`,
  /* 10 two ways to pay */ `<div class="pic duo">
      ${fig(dev('c5-pay'), '⚡ ' + T('Automatic'))}
      ${fig(dev('c6-pay-upi', 'low'), T('UPI + screenshot'))}</div>`,
  /* 11 approve */ `<div class="pic duo">
      ${fig(dev('o1-today'), T('Payment to check'))}
      ${fig(dev('o2-review', 'low'), T('Screenshot, then Approve'))}</div>`,
  /* 12 confirmed */ `<div class="pic duo">
      ${fig(dev('c7-confirmed'), T('Customer'))}
      ${fig(dev('o3-calendar', 'low'), T('Your calendar'))}</div>`,
  /* 13 refunds */ `<div class="pic duo">
      ${fig(dev('c8-confirmed-cancel'), T('Customer cancels'))}
      ${fig(dev('o4-refund-sheet', 'low'), T('You cancel'))}</div>`,
  /* 14 helper */ `<div class="pic one">${fig(dev('h1-helper'), T('Names, times, one tap to call'))}</div>`,
  /* 15 settings */ `<div class="pic duo">
      ${fig(dev('o6-settings-prices'), T('Prices'))}
      ${fig(dev('o7-settings-razorpay', 'low'), T('Automatic payments'))}</div>`,
  /* 16 posters */ `<div class="pic posters">
      <div class="fig"><div class="poster-wrap a4">${poster()}</div>${lbl(T('A4 poster'))}</div>
      <div class="fig"><div class="poster-wrap story">${poster(true)}</div>${lbl(T('WhatsApp status'))}</div>
      <div class="fig"><div class="poster-wrap qr"><div class="qrbox">${qr()}</div></div>${lbl(T('Plain QR'))}</div></div>`,
  /* 17 support */ `<div class="pic"><div class="help">
      ${[['key', T('Forgot your PIN?'), T('We reset it and send it on WhatsApp.')],
         ['card', T('A payment looks stuck?'), T('We check it with Razorpay and fix the booking.')],
         ['tool', T('Need a hand with setup?'), T('We update prices or photos for you.')]]
        .map(([ic, h, s]) => `<div class="glass help-row"><div class="help-ic">${ICON[ic]}</div><div><div class="help-h">${h}</div><div class="help-s">${s}</div></div></div>`).join('')}
    </div></div>`,
  /* 18 get started */ `<div class="pic duo">
      ${fig(dev('l2-signup'), 'book.goarena.in/signup')}
      <div class="fig"><div class="glass todo">
        ${[T('UPI ID'), T('Ground photos'), T('Your prices'), T("Helper's number"), T('Map location'), T('Razorpay (optional)')].map((t) => `<div class="todo-r"><span>✓</span>${t}</div>`).join('')}
      </div>${lbl(T('Then print your poster'))}</div></div>`,
  ];
}

const ICON = {
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M16 7l3 3M18.5 4.5l2 2"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
};
