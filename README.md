# CliniPause

This repository holds two things I built for CliniPause, Dr. Ivanah Thomas's menopause and perimenopause practice:

1. **The public website** (clinipausemd.com): the practice's home on the web, the product shop, consultation booking, video consultations and order tracking.
2. **The admin dashboard** (in `admin/`): where the care team and I run the business day to day: consultations, orders, products, messages, and the clinical side shared with the NoPauseMD mobile app.

Both are plain HTML, CSS and JavaScript on the front end, with small serverless functions for anything that needs a secret (payments, email, video). Data lives in Supabase (Postgres). Payments go through Stripe. Video calls run on Twilio. Each part is deployed as its own Vercel project from this one repository.

---

## How the repository is organised

```
/                 Public website pages (index, about, services, programs, shop, book, track-order, consultation)
/css, /js         Website styles and scripts
/assets           Images, logos, icons
/api              Website serverless functions
/admin            Admin dashboard (its own Vercel project)
/admin/js         One script per dashboard page, plus shared auth and data helpers
/admin/api        Admin-only serverless functions
```

Files in `api/` and `admin/api/` that start with an underscore are shared helpers, not public endpoints. The website and the dashboard deploy separately, so the few helpers both of them use (email and video) are kept as identical copies in each folder.

---

## The website

### Shop
Products are never hard-coded. The shop grid, product details and prices all load from the product catalogue, which I manage from the dashboard. When someone checks out, the server looks up every price again from the database before creating the Stripe checkout, so a price can't be changed from the browser. Customers can buy once or subscribe monthly.

When an order is paid, the customer gets a branded confirmation email with their order number (for example `CP-10001`) and a link to track it.

### Order tracking
The **Track Order** page lets a customer enter their order number and the email address they ordered with. Both have to match, so nobody can look up someone else's order by guessing numbers. The page shows an animated delivery progress bar (Confirmed → Packing → Shipped → Out for delivery → Delivered) with the time each step happened, plus the carrier and tracking number once it ships. Every status change the team makes in the dashboard is logged automatically with the time and who made it.

### Booking a consultation
The booking window walks a patient through three steps:

1. **Their details**: name, email, phone and what they'd like to discuss.
2. **Their session**: 30 minutes or 1 hour (each priced from its own product in the dashboard), then a date and time. They see the clinic's time (Eastern) and their own local time.
3. **Confirm and pay**: a secure Stripe checkout. If a session is ever priced at $0.00, the booking is confirmed straight away without a payment step.

All the booking rules are enforced on the server, not just in the browser: weekdays only, the clinic's time slots, a full hour must fit for 1-hour sessions, at least an hour's notice, no booking on days the clinic has closed, and no overlapping bookings even if two people book at the same moment. If someone abandons checkout, their slot is held briefly and then released for others.

### After a booking is confirmed
- The patient gets a confirmation email with the date, time, length, topic, their personal video link and a calendar invite they can add with one tap.
- The care team gets a "new booking" email.
- **20 minutes before the session**, the patient and the care team each get their own reminder. The patient's has their join link and a short checklist. The team's has the patient's details and a "Join as clinician" button.
- If the team reschedules, the patient is emailed the new time and their calendar entry updates itself. If the team cancels, the patient is told, and the entry is removed from their calendar.

### Video consultations
Each paid booking gets its own private video room. The patient's link is a long random code that only works for that one booking. The **waiting room** page shows the session details, counts down to when the room opens (10 minutes before the start), lets the patient test their camera and microphone, and opens the Join button automatically when it's time. The call shows a countdown and ends automatically when the booked time is up. This is enforced by the video service itself, not just the page, so nobody stays connected past their session.

The mobile app has its own separate video calling. This website flow is independent of it.

### Chat assistant
The chat bubble opens an assistant that answers common questions straight away (consultation prices, booking, hours, services, programs, order tracking, video links), using the same information that's on the site. Prices come live from the catalogue. If someone mentions an emergency it points them to 911 or 988. A **Talk to a real person** button is always there: the visitor leaves their name and email, and the conversation lands in the dashboard with the full transcript and a short summary.

### Other website features
Contact form, newsletter sign-up with a welcome email, and speaking engagement requests, all of which land in the dashboard. An announcement bar and switches for booking, shop checkout and chat are controlled from the dashboard without a code change. Every newsletter email has a personal unsubscribe link.

---

## The admin dashboard

### Signing in and roles
Staff sign in once with their NoPauseMD account. The dashboard checks who they are and what they're allowed to do with the app's backend, then quietly gives them access to the website's data as well, so there is only one login for everything. Super-admin pages are only added to the page for super admins. For everyone else they aren't there at all. Sessions sign out automatically after 5 hours of inactivity. There's a full password-reset flow using an emailed code.

### Consultations
The heart of the clinic side. On a computer you see a searchable patient list next to a week calendar. On a phone you switch between List and Calendar. Sessions are colour-coded: confirmed, live now, awaiting payment, completed, ended or no-show. A red line marks the current time. Clicking a patient opens their session panel with:

- the date, time and a live countdown
- a one-click **Join video call** button for the clinician
- copy or re-send the patient's link
- contact details, reason for visit, fee and payment status
- **reschedule** (re-emails the patient) and **cancel** (optionally refunding through Stripe and emailing the patient)
- mark the session **completed** or **no-show**
- private **internal notes** for the team
- an **activity history**: booked, paid, link sent, reminder sent, who joined, rescheduled, cancelled

There's also **Closed days**, for marking holidays or leave so patients can't book them. Headline numbers along the top show today's sessions, the next 7 days, checkouts in progress and this month's consultation revenue.

### Staff accountability
Whenever a staff member joins a call, their name is recorded on that session. Staff actions such as sending links, rescheduling, cancelling, changing notes and outcomes, and closing days are written to an audit log under their account, so the super admin can see who handled what.

### Shop management
- **Products:** a clean table of everything in the catalogue. Clicking a product opens its own edit page (name, price, category, description, image, visible or hidden). Consultation prices are edited here too.
- **Orders:** every paid order with its items, customer and shipping details. The team updates the fulfilment status, carrier and tracking number, which the customer then sees on the Track Order page.

### Overview
One live page for the whole team: what needs attention (chats waiting, orders to ship, new messages, app consultations, safety escalations), 30-day sales, today's consultations with a Join button, and a feed of what each staff member did. Super admins also see a 30-day team performance table.

### Live chat inbox
Chats are sorted into Waiting, Open, Mine and Closed. Every reply is stamped with the staff member's name, the first person to reply owns the chat, and closing a chat requires a short summary that's saved under the closer's name.

### Orders
A fulfilment queue with filters, search and CSV export. Each order opens a side panel with the items, address, Stripe payment details and a timeline of every change and who made it. Updating the status or tracking number can email the customer automatically.

### Users
App members and website customers in one place, with sign-up, activity and safety signals, and a top search bar that works from any page.

### App tools
Treatments, Supplements and Hormones show the clinical library the app uses, with evidence level and review status. The AI review queue lets clinicians check what the AI coach told members and sign off on it. Assessments, Safety, Subscriptions, the clinician schedule and Privacy & Compliance all show live figures from the app. These read through reporting functions that check the user is staff and return only what the screen needs.

### System
Uptime for the website, dashboard, app server and database is checked every 5 minutes. A weekly summary email goes out every Monday morning, newsletter broadcasts are sent from Notifications, and website settings live under Admin Settings.

### Other sections
Contact messages, speaking engagements, super-admin revenue (split by shop, consultations and app subscriptions), team management and audit logs.

---

## How it's kept secure

- **No secrets in the code.** Every key and password lives only in the hosting provider's encrypted environment settings and is only used on the server.
- **The database decides who can see what.** Row-level security means the public website can only do a small set of specific things, such as starting a booking, checking availability or tracking an order with the right details. Customer and booking data is only readable by signed-in staff.
- **Prices and amounts are always calculated on the server** from the catalogue, never taken from the browser.
- **Sensitive server actions** (confirming payments, preparing video rooms, sending reminders) can only be triggered by my own server code. Payment confirmations are cryptographically verified as genuinely coming from Stripe.
- **Admin actions** check that the person is a signed-in staff member before doing anything, and they only accept requests from the dashboard itself.
- **Patient video links** are long random codes tied to a single booking, and they stop working when the session ends or is cancelled.
- **Everything shown on a page that came from a person** (names, messages, reasons for visit) is escaped before display, and emails are built the same way.
- Security headers are set site-wide. Camera and microphone access is only allowed on the video consultation page.

---

## Scheduled jobs

A few small jobs run from the database on a timer. The reminder and cleanup jobs only contact the website when there's actually something to do:

- **Reminders:** sends the 20-minute reminders.
- **Session cleanup:** closes any video room whose booked time has passed.
- **Uptime checks:** every 5 minutes.
- **Weekly summary:** Monday mornings, unless switched off in the dashboard.

---

## Working on it locally

The front end is static, so any local web server works for the pages. Anything that needs a database, payment or email credential runs as a serverless function and needs the matching environment settings in the hosting provider. Those settings are never committed to this repository.
