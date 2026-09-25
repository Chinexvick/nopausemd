# Bootstrap remaining super admins

As part of the chunk-3 super-admin schema migration, `nopausemd@gmail.com`
already had a Supabase Auth user (and a `store_admins` row) and was wired up
automatically as a super admin.

The other 3 requested emails did **not** exist in `auth.users` at migration
time, so they could not be created safely via SQL (a raw `insert` into
`auth.users` does not produce a working GoTrue-compatible password hash).

## Step 1 — create the missing users in the Supabase Dashboard

For each of the emails below, go to:

Supabase Dashboard → Authentication → Users → **Add User**

and create it with:

- Email: (see list below)
- Password: `SUPERADMIN090@@` (shared temporary password — have each person
  reset it after first login)
- Auto Confirm User: **Yes** (so they don't need to click an email link)

Emails to create:

- `info@clinipausemd.com`
- `lifeqeta@gmail.com`
- `nopauseapp@gmail.com`

## Step 2 — run this SQL (Supabase Dashboard → SQL Editor)

Run this **after** all 3 users above have been created. It only inserts rows
for emails it finds in `auth.users` — it is safe to re-run.

```sql
-- info@clinipausemd.com
insert into public.super_admins (id, full_name)
select id, null from auth.users where email = 'info@clinipausemd.com'
on conflict (id) do nothing;

insert into public.store_admins (id, email, full_name)
select id, email, null from auth.users where email = 'info@clinipausemd.com'
on conflict (id) do nothing;

-- lifeqeta@gmail.com
insert into public.super_admins (id, full_name)
select id, null from auth.users where email = 'lifeqeta@gmail.com'
on conflict (id) do nothing;

insert into public.store_admins (id, email, full_name)
select id, email, null from auth.users where email = 'lifeqeta@gmail.com'
on conflict (id) do nothing;

-- nopauseapp@gmail.com
insert into public.super_admins (id, full_name)
select id, null from auth.users where email = 'nopauseapp@gmail.com'
on conflict (id) do nothing;

insert into public.store_admins (id, email, full_name)
select id, email, null from auth.users where email = 'nopauseapp@gmail.com'
on conflict (id) do nothing;

-- verify
select sa.id, u.email, sa.full_name as super_admin_name
from public.super_admins sa
join auth.users u on u.id = sa.id
order by u.email;
```

## Why not via RPC?

`grant_super_admin(...)` requires the caller to already be a super admin
(privilege-escalation guard), and no one could call it yet for the very first
super admins — that's why this bootstrap step exists. Once at least one of
the 3 pending users is set up this way, any further super admins can be
added by calling `grant_super_admin(p_user_id, p_full_name)` as a signed-in
super admin instead of repeating this manual process.
