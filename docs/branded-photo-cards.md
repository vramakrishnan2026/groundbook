# Branded photo cards: every ground photo looks like the ground page header

Status: agreed as the look, not built yet. Saved 9 Nov 2026.

Assumption to confirm before building: "all images like this" means every place a
ground's photo is shown or shared outside the owner's own settings gets the same
treatment as the ground page header (see the reference below).

## The look (reference: the LLAB TOOF ground page header)

- The ground photo full-bleed, cropped to fill (cover), never stretched.
- A dark gradient from the bottom (about the lower 45%) so white text reads on any photo.
- **Ground name** bottom-left: Plus Jakarta Sans ExtraBold, white.
- **Area** under it with the map-pin icon, white at about 85%.
- **GoArena pill** top-right: the flaming-ball wordmark (`/brand/wordmark-on-dark.webp`) on a
  dark translucent pill (`rgba(3,20,12,.55)`, rounded, light blur). About 27% of the image
  width on a phone-sized card; scale with the image, with a sensible minimum.
- Slider dots only where it is a swipeable slider (the live page), never on still images.
- Already built on the ground page slider (`customerHome` in `public/app.js`,
  `.hero .hero-brand` in `public/styles.css`). Everything below reuses that look.

## Principle (agreed)

Stored photos stay clean. The branding is added on top when GoArena shows or shares a
photo, never baked into the owner's originals. Downloads from Settings stay clean.

## Where to apply

1. **Ground page slider**: done.
2. **Link previews (WhatsApp, Instagram, Google)**. Today a shared
   `book.goarena.in/<ground>` link shows only the address. It should show a 1200 × 630
   branded card of the ground's first photo, with the ground name as the title.
   - The Worker serves `index.html` for every page today. For a ground path it would add
     `og:title`, `og:description`, `og:image` and `twitter:card` tags, plus a ground-specific
     `<title>`, before returning the page.
   - The card image comes from `GET /api/files/og/<slug>` (see "Making the images").
3. **"Share photo" in owner Settings → Photos**: each photo gets a Share button that makes
   branded versions sized for WhatsApp status (1080 × 1920), Instagram post (1080 × 1350)
   and square (1080 × 1080), using the share sheet on phones and a download on PCs.
4. **Future city directory** (see the aggregation discussion): each ground's card uses the
   same look at small size.
5. **QR posters** already carry GoArena in their own designs, so no change.

## Making the images

- Workers cannot draw images, so branded images are drawn **in the owner's browser**
  (canvas) and uploaded, the same way photos are compressed today.
- Draw: photo (cover crop) → bottom gradient → name and area → GoArena pill. Wait for fonts
  first (`document.fonts.load`), as the poster maker does.
- The link-preview card is made when:
  - the owner uploads, deletes or reorders photos (the first photo is the card), or
  - the owner changes the ground name or area.
  It is stored as a new file kind `og` in the `files` table: one per ground, replaced each
  time. If none exists yet, the Worker falls back to `/brand/icon-512.png`.
- Share-photo versions are made on demand and never stored.
- Keep link-preview cards under 300 KB (JPEG, quality about 0.85). WhatsApp ignores
  large preview images.

## Work list

- [ ] `public/brand/photo-card.js`: `drawPhotoCard(canvas, { photoUrl, name, area, width, height })`,
      shared by the share button and the link-preview card.
- [ ] Settings → Photos: Share button per photo (sizes above), using `navigator.share` with
      files where supported, otherwise a download.
- [ ] Settings: regenerate and upload the `og` card after photo or name/area changes.
- [ ] Worker: `GET /api/files/og/:slug`; `PUT /api/owner/og-card` (owner only, image type
      and size checked like photos).
- [ ] Worker: add the meta tags for ground paths before returning `index.html`. Text must
      be HTML-escaped, and reserved paths (`/owner`, `/login`…) must be left untouched.
- [ ] Tests: the meta tags for a ground path, the fallback image, escaping of a ground name
      containing quotes or `<`, an owner-only upload, and a browser check that the card
      draws with the right text.
- [ ] After deploy: check a shared link in WhatsApp (it caches previews, so test with a
      fresh link, e.g. `?v=2`).

## Effort

Roughly a day of build and checking. The Worker meta tags and the card drawing are the
two main pieces. Nothing changes for customers' booking flow.

## Open questions

- Should the link-preview card also show "From ₹700 / hour" or the opening hours?
- Is the Share-photo button wanted for helpers too, or owners only?
