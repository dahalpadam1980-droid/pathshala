# Pathshala ERP — User Manual (English)

A practical guide for everyone who uses the system: school admins, office staff, accountants, teachers, students and parents.

---

## 1. Signing in

1. Open the app in a browser (or install it: your browser will offer **Install app** / **Add to Home screen** — it works offline for already-loaded screens).
2. Enter your **username** and **password**, or click a demo chip on the login page to auto-fill.
3. You land on the dashboard for **your role** — students and parents see a personal dashboard; staff see the school dashboard.

**Language & theme** — the **EN** button in the top bar switches English ⇄ नेपाली; the sun/moon button switches light/dark. Your choice is remembered.

**Logging out** — click your name/avatar in the top bar → Sign out. Access expires after 15 minutes of inactivity but refreshes automatically while you work, so you normally never see a login screen mid-session.

---

## 2. The sidebar

| Group | Items | Who sees it |
|---|---|---|
| OVERVIEW | Dashboard | all |
| PEOPLE | Students, Staff, Users | admin / office |
| ACADEMICS | Classes, Subjects, Routines, Events, Attendance, Exams, Grading scales | admin / office / teacher |
| FINANCE | Finance, Payroll, Reports | admin / accountant |
| OPERATIONS | Library, Inventory, Learning, Certificates, Governance, Transport, Hostel, Notices, Website | admin / office |
| INSIGHTS | Reports, AI Assistant | admin / accountant / teacher |
| PLATFORM | Settings | admin |

Items you don't have permission for are hidden — not disabled.

---

## 3. Dashboard

The dashboard shows **live numbers from the database**, not static text:

- Students, teachers, attendance today, fees collected/outstanding
- Students by class, recent notices, today's attendance, finance summary
- Quick links into each module

Students/parents additionally see their own attendance, exam results, assignments and notices.

---

## 4. Common screen patterns

Almost every list screen behaves the same way:

- **Search box** — filters as you type.
- **Dropdown filters** — narrow by class, status, type, etc.
- **Refresh** — reloads from the server.
- **Add / New …** — opens a form modal. Required fields are marked **\***; the form tells you exactly what's missing.
- **Edit (pencil)** — opens the same form pre-filled.
- **Delete (trash)** — asks for confirmation first.
- **Pagination** — "Showing 1–20 of 134 records" with page buttons at the bottom.
- **Export/Download** — where offered, downloads a real Excel/CSV file.

> **Tip:** after creating or deleting a record, the list refreshes automatically — no need to reload the page.

---

## 5. Students (admin / office)

- **Students → Add** — admission form: name (English + नेपाली), DOB (AD or BS), class/section, roll, guardian, contact, address (municipality/ward/district/province), fee concessions.
- **Search** by name, admission number or phone.
- **Promote** — bulk-promote a whole class to the next class at year end.
- **Import/Download template** — fill the Excel template with existing students and re-upload; **Export** downloads the current list.
- Click a row to open the full profile with attendance, fees and results.

---

## 6. Attendance

1. Pick the **date** (shows both AD and BS) and optionally a class/section.
2. Tap **P / A / L / Lv** per student, or use **Mark all present**.
3. The counters at the top update live (Total / Present / Absent / Leave / Unmarked).
4. **Save attendance** — confirms "Attendance saved (n)".
5. **Notify absent** — queues an SMS/in-app message to guardians of absentees (needs an SMS gateway for SMS; in-app always works).
6. **Month Reports** tab — per-student monthly totals with attendance rate badges.

Saved attendance survives reload and feeds the reports.

---

## 7. Exams & grading

### Setting up an exam (admin)

1. **Exams → New exam** — name, type, academic year, date range.
2. Open the exam → **Subjects** — add subjects with theory/practical/internal full marks.
3. **Marks entry** — enter marks per subject; totals and pass/fail compute automatically.
4. Publish results when ready.

### Grading scales

**Grading scales** are fully configurable — NEB GPA 4.0, NEB percentage, or your own scale. Define bands (letter, from–to %, grade point, remark, NG flag). **Nothing about pass marks or grade points is hardcoded**; results use whichever scale you attach to the exam.

### For students & parents

The dashboard **Results** card shows GPA, subject grades and rank once results are published; until then it says "No exams published yet."

---

## 8. Finance (admin / accountant)

The full money cycle, in order:

1. **Fee heads** — define heads (e.g. Admission Fee / भर्ना शुल्क, Monthly Tuition, Exam Fee) with frequency (one_time/monthly/…).
2. **Fee structures** — per class: which heads and how much. Blank amounts are skipped.
3. **Student dues → Generate dues** — pick a fee head, label (e.g. "Admission fee — Mangsir 2083"), class and due date. With a blank amount the system **takes the amount from the class fee structure**. Every active student gets a bill.
4. **Record payment** — student, amount, method (cash/bank/esewa/khalti/fonepay/…), reference; **Auto-allocate to the oldest unpaid dues** settles bills oldest-first and prints a receipt number (`RCP-…`).
5. **Payments** tab — receipt history; **View** opens the printable receipt.
6. **Student dues** — filter by status (unpaid/partial/paid/waived), edit fine/discount/due date, or waive with a reason.
7. **Account heads / Transactions** — the double-entry side: post income/expense transactions against ledger accounts.

**Finance → Reports** (or **Reports → Fees**): cash book, trial balance, outstanding fees, collection analytics — all computed from posted transactions.

---

## 9. Payroll

1. **Salary structures** — one per employee: basic, allowances, deductions, net.
2. **Payroll runs** — generate a run for a month; totals compute automatically.
3. **Salary slips** — view/print per employee.
4. **Bank payment sheet** — downloadable list for bulk transfer.

---

## 10. Library & inventory

- **Library → Books** — add title (English + नेपाली), accession number, category, copies, price, shelf. **Issue register** — issue/return to students or staff; overdue books show in red with fines.
- **Inventory → Assets** — items with cost, warranty, condition (good/damaged/lost) and a full movement history. Reports show stock value by category.

---

## 11. Notices & notifications

- **Notices → New notice** — bilingual title/body, priority (low→urgent), status (draft/published/archived), pin-to-top, and an **audience**: everyone, selected roles, or selected classes. Choosing roles also sends them an in-app notification.
- **Broadcast** — one message, many recipients: choose channels (in-app always works; SMS/email/push need a gateway in Settings) and an audience. Shows "queued n messages · n recipients".
- **Notifications** — the delivery inbox: channel, recipient, status (pending/sent/failed), queued/sent times and any gateway error.

---

## 12. Transport & hostel

- **Transport** — vehicles (plate, capacity, insurance/fitness expiry — expiring documents are counted), routes with stops and fares, student allocations, running expenses.
- **Hostel** — hostels with warden, **Rooms** (room number + bed count), **Allocate student** to a bed (bed no. + from-date), release when they leave. Occupancy counters show beds used/total. **Complaints** tab files and resolves issues (open → in progress → resolved/rejected).

---

## 13. Governance (SMC / PTA)

- **Committees** — create the SMC/PTA, term dates, description.
- Add **members** (name, role, phone).
- **Meetings** — record date, agenda, minutes and decisions; every meeting stays attached to the committee.

---

## 14. Public website

- **Pages** — create Home/About/Admissions/Contact with English + नेपाली title and HTML body; set order and publish/unpublish instantly.
- **Gallery** — add photos/videos (paste the `/uploads/…` path after uploading).
- **Preview** — loads the real public site for any school code and renders pages, gallery and notices exactly as visitors see them.

Your school's public address is `/website/<school-code>` (shown in Settings, e.g. `/website/demo-school`).

---

## 15. Reports & analytics

Six tabs, all computed live:

| Tab | Shows |
|---|---|
| Overview | Students, teachers, staff, classes, academic year, attendance %, fees collected/due/outstanding, published notices, students by class |
| Attendance | Per-student monthly totals: present/absent/late/leave and attendance-rate badges |
| Exams | Marks entered, pass/fail, overall average, by-subject and by-class tables |
| Fees | Billed/collected/outstanding totals and per-class collection for the year |
| Library | Titles, copies, currently issued, overdue list |
| Inventory | Asset types, units, stock value, damaged/lost, by category |

Use **Print** for a paper copy.

---

## 16. AI assistant

Ask questions in plain English:

- "How many students are enrolled?"
- "What is today's attendance?"
- "How much fee is collected this year?"
- "How many books are in the library?"

Answers are **grounded in your live database** — the source badge shows `rules`/`database` and the panel on the right shows the exact numbers behind the answer. Suggestion chips give you one-click examples.

---

## 17. Settings

- **School profile** — name (both languages), slogan, address (municipality, ward, district, province), contact, PAN, affiliation, default grading system, date format (bs/ad/both), language, grace minutes, fee due day, SMS sender, principal/vice-principal/SMC chairman. **Save** stores per-school and flows through dashboards, reports and certificates. The school **code** (public site address) is shown here.
- **Academic years** — create year ranges (AD dates; BS derived) and mark the current one.
- **Date tools** — today in BS with month name/weekday, and a BS ⇄ AD converter.
- **Defaults** — academics, attendance, fees, notifications and localization defaults.
- **Statistics** — live row counts for every entity.

---

## 18. Troubleshooting

| Problem | What to do |
|---|---|
| "Invalid input: expected string…" | A required field was left empty — the form highlights it |
| List says "No records found" | You haven't created any yet — use **Add/New**; filters may be hiding rows |
| Numbers look wrong | Hit **Refresh** — dashboards read the live database |
| Page looks stuck | Reload (Ctrl+R / Cmd+R); the PWA updates itself automatically |
| Forgot password | Ask the school admin to reset it under **Users** |
| SMS says "Gateway not configured" | Set `SMS_API_URL`/`SMS_API_KEY` in the server environment — in-app notifications still work |
