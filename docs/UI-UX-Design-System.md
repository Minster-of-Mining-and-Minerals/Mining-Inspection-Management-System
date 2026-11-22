# Enterprise UI/UX Design System — Master Prompt

*Template taken from the Mining Inspection Management System (Ministry of Mines). Copy this file into a new project, fill in the Project Brief, and give it to the developer or AI assistant before any UI work.*

Act as a Senior Product Designer, Enterprise UX Architect, and Frontend Design System Engineer.

Design and build a professional, modern enterprise web application with **Next.js (App Router) + shadcn/ui + Tailwind CSS + Lucide icons**. Every page, form, table, dashboard, dialog and menu must look and behave the same way.

The application usually has **two kinds of users**:

- **Office users** (administrators, supervisors, directors): desktop first, data-dense screens, tables, filters, dashboards.
- **Field users** (inspectors, officers): phone first, large touch targets, one task at a time, works with poor internet.

Design each screen for the user who will really use it, but with the same visual language.

---

## 0. Before Writing Any UI

1. Read the Project Brief below.
2. Look at the existing codebase first and reuse its components, tokens and patterns (Section 14 lists them).
3. Use only values from the design tokens (Section 2). If a value is missing, add it to the token file first, then use it.
4. Do not hardcode colors, font sizes, spacing, radii or shadows inside components. Exception: one-off values in charts and maps, kept in one constant at the top of the file.
5. When modifying an existing app, keep its patterns. Make no unrelated visual or functional changes.

### Project Brief (fill in per project)

| Item | This template project (example) | New project |
|---|---|---|
| Product name | Mining Inspection Management System | |
| What it does | Plans, assigns and records field inspections of mining licenses; supervisors review and analyse the results. | |
| Users & environment | Office staff at desks; inspectors outdoors on phones, often with weak signal | |
| Platforms | Desktop web (admin) + mobile web (field) | |
| Density | Default 36–40px on desktop; touch 44–48px on phone | |
| Brand primary color | Navy `#073A55` with gold accent `#E8C468` | |
| Languages & scripts | English UI; Amharic content → Noto Sans + Noto Sans Ethiopic | |
| Date & number format | "Nov 20, 2026"; Gregorian; time zone Africa/Addis_Ababa | |
| Offline needed | Partly: autosave, resumable uploads, retry when back online | |
| Dark mode in v1 | No | |
| User roles & permissions | Role-based permissions `resource:action` (e.g. `inspections:review`); data limited by sector | |
| Special needs | Photos/videos up to 1 GB, GPS at submit, signatures, maps (Leaflet), coordinates, exports (CSV/JSON) | |

The brief overrides a rule below only where it says so explicitly.

---

## 1. Typography

- **Font:** Noto Sans (Latin) with Noto Sans Ethiopic as fallback for Amharic. Load both with `next/font/google` as CSS variables, and set Tailwind `fontFamily.sans` to `var(--font-latin), var(--font-script), ui-sans-serif, system-ui, sans-serif`. If no second script is needed, Noto Sans or Inter alone.
- **Body text:** 14px (`text-sm`) on desktop.
- **Inputs on phones:** 16px (`text-base`) below 768px, so iOS does not zoom on focus; 14px from `md:`.
- **Sizes:**

  | Use | Size | Weight |
  |---|---|---|
  | Page title | 20px phone / 24px desktop (`text-xl sm:text-2xl`) | 700 for the page title only, otherwise 600 |
  | Section heading | 16–18px | 600 |
  | Card heading | 15–16px | 600 |
  | Body, labels, table cells, buttons | 14px | 400 / 500 |
  | Helper, error, table header | 12–13px | 400 / 500 |
  | Badges, captions, tags | 11–12px | 500 / 600 |

- Numbers in tables, counters and KPIs use `tabular-nums`.
- Line height 1.5 for body text and 1.3 for headings.
- No ALL CAPS, except small group labels (`text-xs uppercase tracking-wide`) in menus.
- **Language rule:** menus, buttons and lists in English. Content entered or read by field users (questions, answers, section titles) can be in the local language. Never mix two languages in one label.

---

## 2. Colors and Design Tokens

The token file (`globals.css` + `tailwind.config.ts`) is the single source of truth. Components use **role tokens** (`bg-primary`, `text-foreground`, `border-border`, `ring-ring`), never brand hex values.

shadcn stores colors as HSL triplets (`--primary: 201 85% 18%`) that Tailwind reads with `hsl(var(--primary))`. Keep that format.

### Brand (change per project)

```css
:root {
  /* Main color: navy — header, sidebar, primary buttons, links, active tab text */
  --primary: 201 85% 18%;            /* #073A55 */
  --primary-foreground: 0 0% 100%;   /* white on navy: 12:1 */

  /* Accent: gold — focus ring, active-tab underline, header bottom line, highlights */
  --ring: 45 80% 40%;                /* #B88F14 */
  --golden-bright: 43 74% 66%;       /* #E8C468  on navy only (sidebar, header line, tab underline) */
  --golden-deep: 44 82% 30%;         /* #8B6A0E  gold button with white text: 5:1 */

  /* Sidebar = navy, with gold for the active item */
  --sidebar-background: 201 85% 18%;
  --sidebar-foreground: 210 40% 92%;
  --sidebar-primary: 43 74% 66%;
  --sidebar-primary-foreground: 201 85% 18%;
  --sidebar-accent: 201 60% 25%;
  --sidebar-accent-foreground: 0 0% 100%;
  --sidebar-border: 201 50% 26%;
  --sidebar-ring: 43 74% 66%;

  --radius: 0.625rem;                /* 10px; md = 8px, sm = 6px */
}
```

Brand rules:

- Text on the primary color must reach 4.5:1. A light gold is used **on navy only**; on white, use the deep gold.
- If the brand color is red, green or amber, use navy/dark neutral for buttons and keep the brand color for the logo and accents, so it is never confused with a status.

### Neutrals (Tailwind slate, same in every project)

| Role | Class | Use |
|---|---|---|
| Page background | `bg-slate-50` / `bg-[#F1F4F6]` | behind cards |
| Surface | `bg-white` | cards, tables, dialogs |
| Hover / subtle | `bg-slate-50`, `bg-slate-100` | row hover, secondary buttons |
| Border | `border-slate-200` | cards, dividers |
| Input border | `border-input` / `border-slate-300` | inputs, outline buttons |
| Text | `text-slate-900` | main text |
| Secondary text | `text-slate-600` | descriptions |
| Muted text | `text-slate-500` | hints, dates (only on white or slate-50) |

### Status colors (same in every project — do not change)

Every status is shown as **text or icon + color**, never color alone.

| Status | Badge (bg / text) | Solid (charts, dots, banners) |
|---|---|---|
| Done / success / submitted | `bg-green-100 text-green-800` | `#1B7A3E` |
| In progress / info | `bg-sky-100 text-sky-800` | `#E0A23A` in charts |
| Warning / late / needs action | `bg-amber-100 text-amber-800` (or `-900`) | `#E0A23A` |
| Error / overdue / problem | `bg-red-100 text-red-700` | `#B42318` |
| Returned / sent back | `bg-violet-100 text-violet-800` | violet-600 |
| Not started / neutral / pending | `bg-slate-100 text-slate-700` | `#94A3B8` |

- Chart colors: Completed `#1B7A3E`, In progress `#E0A23A`, Pending `#94A3B8`, Problem `#B42318`, Main series navy `#0B3B5C` / blue `#2A78D6`.
- Toasts: success = green, error = red (sonner `richColors`).
- Read-only answers (a submitted form seen by a supervisor): soft blue box `#EAF2FA` with border `#C9DDF0` and a ✓. An empty answer is a white empty box with `aria-label="Not answered"`, not the text "Not answered".

---

## 3. Spacing

4px scale only: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px (Tailwind 1, 2, 3, 4, 5, 6, 8, 10, 12, 16).

| Place | Value |
|---|---|
| Label → input | 4–8px |
| Input → helper/error | 4px |
| Between form fields | 16px |
| Card padding | 16px desktop (`p-4`), 12px phone (`p-3`) |
| Between page blocks | 16px (`space-y-4`) |
| Page padding | 24px desktop, 12–16px phone |
| Button icon gap | 6–8px |
| Table cell horizontal padding | 12–16px |

---

## 4. Inputs and Forms

- **Height:** 36px desktop (`h-9`), 40px for main forms, **44–48px on phones** for field users.
- **Radius:** 8px. 1px border (`border-input`).
- **Focus:** visible ring in the accent (`focus-visible:ring-ring/50 ring-[3px]`).
- **Labels:** always above the input, linked with `htmlFor`. A placeholder is an example, never the label.
- **Required:** red `*` after the label.
- **Errors:** directly under the field, with `role="alert"`, in plain words ("Choose a status.", "Add at least one photo.").
- **Validation:** check on submit; jump to and focus the first problem; show a count ("3 answer(s) need attention.").
- **Saving:** long forms **autosave** (every few seconds and when moving between steps), show "Saving… / All changes saved / Not saved — check your internet", and warn before leaving with unsaved changes.
- **Concurrent edits:** if a teammate saved after you loaded, refuse the save, explain who saved, and offer **Reload**. Never overwrite silently.
- **Long field forms:** a stepper — one question (phone) or one section (desktop) at a time, a sections menu, a progress count, and "continue where you stopped".
- **Selects:** native `<select>` styled like inputs for short lists; a searchable select for long lists (companies, users).
- **Dates:** native date input. Show dates as "Nov 20, 2026"; a "due date" means the end of that day in the local time zone.
- **Files:**
  - photos, documents and videos per question, with an accepted type, max size and max count;
  - thumbnails with progress ("120 MB of 800 MB") and **Cancel**;
  - large files go up in resumable pieces;
  - iPhone HEIC photos are converted to JPEG for preview.

---

## 5. Buttons

| Variant | Look | Use |
|---|---|---|
| `default` | navy, white text | the one main action of a view |
| `accent` | deep gold, white text | a highlighted secondary action (rare) |
| `outline` | white, slate-300 border, navy text | most secondary actions |
| `secondary` | slate-100, navy text | low-emphasis actions |
| `ghost` | text only | toolbars, "Cancel" inside panels |
| `destructive` | red-600 | delete, remove, close for everyone — always confirmed |
| `link` | navy underline | inline links |

- **Sizes:**
  - `sm` 32px, for toolbars and table rows;
  - `default` 36px;
  - `lg` 40px;
  - **48–56px full-width on phone** for the main field action (Submit, Allow location).
  - Icon buttons 36px, and 40px minimum on phones.
- Icons: 16px, label next to them. Icon-only buttons need `aria-label`.
- One primary button per view.
- Labels say what happens: "Open for update", "Return to team", "Done updating" — not "OK" (except to dismiss information).
- While working: spinner + changed label ("Submitting…"), button disabled so it can't be pressed twice.
- Destructive or far-reaching actions: confirm first, in a dialog or an inline "Are you sure?" row that names the item and the result ("Close it for everyone? Saved changes are kept.").

---

## 6. Cards and Containers

- Cards: `rounded-xl` (12px), `border border-slate-200`, `bg-white`, **no shadow**. A shadow is allowed only on hover for clickable cards (`hover:shadow-md`).
- Shadows only on floating surfaces: dropdowns, popovers, dialogs, bottom sheets.
- No cards inside cards; use dividers (`divide-y`) or a light inner tile (`bg-slate-50`).
- **Banners** (messages at the top of a page): `rounded-xl border px-4 py-3 text-sm` in the status color, with an icon, a bold first line, and at most two buttons.
  - Red: conflict.
  - Violet: returned for correction.
  - Amber: open to update / warning.
  - Sky: information.
- **KPI tiles:** label (12px, slate-500), big number (24–28px, 700, tabular-nums), a short note ("3 overdue"), and the whole tile links to the filtered list.

---

## 7. Tables and Lists

### Desktop table (office users)

- **Header:** navy (`bg-primary text-white`), 13px, weight 500–600.
- **Rows:** striped (`odd:bg-white even:bg-slate-50`), hover `bg-slate-100`, about 48px high.
- **Widths:** fixed with a `<colgroup>` in %, so the table never grows wider than the page; long text is truncated with `title` showing the full value.
- **Alignment:** text left, numbers right with `tabular-nums`.
- **Status column:** a small dot + text (`TaskStatusBadge dot`).
- **Sorting:** the most useful order by default (e.g. newest submissions first), stated in the header.
- **Paging:** 20 per page (10 / 20 / 50 / 100).
- **Row actions:** always the last column; more than two → "⋯" menu.
- **Wide tables:** scroll inside their container (`overflow-x-auto`), never the page.

### Phone

- **Card list instead of the table:** name (2 lines max) + status chip at the top right, one meta line (license · type · area), one date line ("Due Nov 25 · 5 days left"; red when urgent), and a thin progress bar if relevant.
- **Status tabs** above lists as pills: All, Submitted, In progress, Not started, Overdue, Returned, with counts. Urgent tabs are red when they have items; tabs with nothing to do can be hidden.
- **Grouping:** by a meaningful key (checklist, company, due date, region) with collapsible headers.

### Every list has

loading skeleton, empty state, "no results" with **Clear filters**, error with **Retry** (Section 13).

---

## 8. Navigation and Layout

- **Header:**
  - sticky, navy (`bg-primary text-white`), 56px phone / 64px desktop;
  - a **3px gold bottom line** (`border-b-[3px] border-golden-bright`);
  - menu button on the left, notifications bell and user menu on the right.
- **Sidebar:**
  - navy, collapsible to icons (shadcn `Sidebar collapsible="icon"`);
  - logo on a white circle at the top;
  - the active item is gold text/indicator on a lighter navy;
  - below 1024px it becomes a drawer.
- **Menus by permission:** a user sees only what their permissions allow. Field users get a short menu (My Tasks, My Companies, My Team).
- **Breadcrumbs:**
  - on every page under the header;
  - detail pages show the real name ("ABC Mining · MOM/LSML/462/2015"), never an id;
  - on phones, a single "‹ Parent" link.
- **Page header:**
  - Back button (icon), title, a status badge next to the title, one meta line under it;
  - actions on the right (desktop) or full width below (phone).
- **Tabs inside a page:** underline tabs (`border-b-2`, active = gold underline + navy text), e.g. Site · Questions · History (count).
- **Width:** forms about 720px max; data pages full width; dialogs 400 / 560 / 720px.
- **Filters:**
  - Desktop: one sticky **filter bar** (selects in a row, a "Dates" toggle, "Clear all").
  - Phone: one **"Filters" button** showing a summary ("Region, Team"), opening a **bottom sheet** with grouped fields (When / Where & who / What) and Apply / Clear.
  - Filters live in the URL query, so a filtered view can be shared and reloaded.
- **Maps:**
  - Leaflet inside `isolation: isolate; z-index: 0`, so map layers never cover the header or dialogs;
  - a **maximize** button;
  - on phones, a sticky map on top with a scrollable list below.

---

## 9. Dialogs, Sheets and Notifications

- **Dialog (shadcn):**
  - title + one-line description saying what will happen;
  - body in numbered parts when there are several choices ("1. Which…", "2. Which sections", "3. Until", "4. Why");
  - footer: a short summary of the result on the left, **Cancel** then the **primary action** on the right;
  - phones: full width, `max-h-[90vh] overflow-y-auto`.
- **Full-screen steps on phones** for important field moments (e.g. "Share your location to submit"): back arrow, illustration, a big title, 2–3 numbered steps, one big button at the bottom.
- **Bottom sheets** on phones for filters and secondary content.
- **Confirmations:** for delete, remove, close, return: name the item and the result.
- **Toasts** (sonner): top-right. One per action, short, specific ("Section 1 opened for 30 inspections."). Never for form validation.
- **Notifications:**
  - in-app only (bell + notifications page), grouped by category;
  - each notification links to the page it is about (one item → its page; many items → the list).
  - No email unless the brief asks.

---

## 10. Accessibility (WCAG 2.2 AA)

- Contrast 4.5:1 for text, 3:1 for icons and input borders.
- Visible focus on every control; everything reachable with Tab; Escape closes dialogs.
- Semantic HTML: `button`, `a`, `nav`, `table`, `label`, `fieldset/legend`. No clickable `div`s.
- Read-only sections use `<fieldset disabled>`, but links to attachments stay **`<a>` elements**, so they still open.
- `role="tablist"/"tab"` + `aria-selected` for tabs; `role="progressbar"` with values for progress bars; `aria-live` for counts that change.
- Touch targets 44px on phones.
- Respect `prefers-reduced-motion`.
- Usable at 200% zoom and at **375px width** without horizontal scroll.

---

## 11. Responsive Design

| Screen | Width | Approach |
|---|---|---|
| Phone | < 640px | cards, bottom sheets, full-width buttons, one column |
| Tablet | 640–1023px | two columns where short fields belong together |
| Desktop | ≥ 1024px | sidebar, tables, filter bar |
| Large | ≥ 1440px | more columns in grids, never stretched forms |

Check every screen at 375px. Field screens are designed for the phone first; office screens for desktop first, then made to work on phones.

---

## 12. Icons, Borders and Motion

- Lucide only, stroke 2, 16px inline / 20px standalone.
- Common meanings (keep the same everywhere):
  - `ArrowLeft` back;
  - `Save` save;
  - `CheckCircle2` done;
  - `Lock` read-only;
  - `Unlock` opened for change;
  - `RotateCcw` returned;
  - `AlertTriangle` warning;
  - `MapPin` location;
  - `Smartphone` device;
  - `History` history;
  - `Loader2 animate-spin` working;
  - `X` close/cancel.
- 1px borders. Radius: 6px badges, 8px inputs/buttons, 12px cards/dialogs, full for pills and avatars.
- Motion 150–200ms, only for state changes and opening menus. No decorative gradients or glows.

---

## 13. Loading, Empty and Error States

Every data screen supports:

- **Loading:** skeletons shaped like the content; a spinner only inside buttons.
- **Empty:** icon + one sentence + the next action ("No tasks yet. New tasks appear when a schedule comes round.").
- **No results:** "No tasks match." + **Clear filters**.
- **Network error:** what failed + **Retry**. For saves: "Not saved — check your internet", and keep the user's input.
- **Validation:** inline messages + a count; jump to the first one.
- **Success:** a toast, or show the saved item (e.g. a green "Submitted" banner).
- **Permission denied:** say why and who to ask; hide actions the user can never do.
- **Device problems** (location, camera): say exactly what to change on **this** device and browser. For example, on iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using the App.
- **Live views:** when someone watches a record another person is filling, poll every few seconds and show a "Live" indicator.

"Something went wrong" alone is never allowed.

---

## 14. Reusable Components (build once, reuse)

Start a new project by copying these from the template project:

| Component | Purpose |
|---|---|
| `components/ui/*` (shadcn) | button (with `accent` variant), input, select, dialog, sheet, tabs, tooltip, popover, sidebar |
| `components/layout/header`, `app-sidebar`, `nav-user`, `NotificationDropdown` | navy header with gold line, collapsible sidebar, user menu, bell |
| `HeaderBreadcrumb` + `useBreadcrumbTitleEffect` | breadcrumbs with real names |
| `TableLayout`, `FilterDrawer` | list pages: table on desktop, cards on phone |
| `FilterBar` + `FilterSheetButton` + `ExportMenu` | filters: bar on desktop, bottom sheet on phone, CSV/JSON export |
| `TaskStatusBadge` (`dot` option) | status chip / dot + text |
| `MediaViewer`, `FormFiles`, `useHeicPreview` | photo/video lightbox, uploads with progress and cancel |
| `MapMaximizeButton`, map components | maps that fit the layout and can be maximized |
| `SectorFilter` | data scope switch (organization units) |
| `utils/date.ts`, `utils/device.ts`, `utils/logout.ts` | dates in one time zone, phone/computer detection, safe sign-out |

Same prop names everywhere: `variant`, `size`, `disabled`, `loading`, `onClose`, `onDone`.

---

## 15. Product Rules Learned in the Template Project

These are not only visual, but they shape the UI:

1. **Plain words.** Write what the user does and what will happen. Avoid technical terms, ids and jargon in the UI.
2. **One clear status per record.** Statuses use the same names everywhere (tabs, badges, dashboards, exports).
3. **Every number links to its list.** Dashboard tiles and chart legends open the filtered list behind them.
4. **History for everything important.** Started, submitted, returned, reassigned, opened for update, done — with who and when, on a History tab.
5. **Corrections, not silent edits.** Changing submitted data goes through an explicit flow (return for correction, or open chosen sections until a deadline), and changed answers are tagged "Updated after submitting · date".
6. **Field actions that need proof are phone-only.** Example: submitting with GPS. Office work (fixing sections, reviewing) works on any device. Explain the rule kindly.
7. **No surprises with data.** Show counts before bulk actions ("This will open 30 inspections"), confirm far-reaching actions, and keep what was already saved when something closes.
8. **Show only what helps.** Remove filters, columns and badges that nobody uses; don't show scores or metrics the organization hasn't agreed on.

---

## 16. Working Agreement (how the UI is designed and changed)

1. **Plan first** for anything larger than a small fix: say what will change, where, and whether data is affected.
2. **Design options before building:** for a new screen or a redesign, make 2–3 options (A, B, C) side by side on a design canvas, then build the chosen one exactly.
3. **Data safety:**
   - database changes are additive migrations only, and existing data is never changed or deleted unless explicitly agreed;
   - every change answers the question **"Will I lose data?"**;
   - take a backup before deploying;
   - never delete Docker volumes;
   - development seed passwords stay off on servers.
4. **Test without touching real data:** test locally; anything created for a test is removed afterwards.
5. **Never commit, push or deploy unless asked.** Give the exact deploy commands when asked.
6. **Write a short user manual section** for each new field-user feature, with screenshots where possible, and a one-page PDF quick guide when asked.

---

## 17. Quality Checklist

Before calling a screen done:

- [ ] Uses role tokens / the classes in this guide; no new hex values except in charts and maps
- [ ] Noto Sans (+ script font) only; weights 400/500/600 (700 only for page titles and KPI numbers)
- [ ] Buttons and inputs use the standard sizes and radii; 44px+ on phones
- [ ] Every input has a visible, linked label; required fields marked
- [ ] Loading, empty, no-results and error states exist
- [ ] Works at 375px with no page-wide horizontal scroll; tables become cards
- [ ] Filters: bar on desktop, one button + bottom sheet on phone, kept in the URL
- [ ] Breadcrumb shows a real name
- [ ] Keyboard: Tab reaches everything, focus is visible, Escape closes dialogs
- [ ] Contrast 4.5:1 text, 3:1 icons and borders; status never by color alone
- [ ] Destructive and bulk actions are confirmed and say what will happen
- [ ] Main buttons can't be pressed twice while working
- [ ] Autosave and "unsaved changes" warning on long forms
- [ ] Shared components reused; no unrelated changes
- [ ] Data impact stated; migrations additive; backup before deploy

---

## Final Instruction

Apply this design system to the whole application. Do not create pages with their own fonts, colors, spacing, button sizes or input styles. Choose clarity, usability and accessibility over decoration. When working on an existing application, keep its established patterns before adding new ones.
