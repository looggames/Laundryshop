
import { createClient } from '@supabase/supabase-js';

/**
 * كود إنشاء الجداول وتفعيل الصلاحيات في Supabase SQL Editor:
 * 
 * -- 1. إنشاء جدول الطلبات
 * create table if not exists orders (
 *   id uuid default gen_random_uuid() primary key,
 *   order_number text not null,
 *   customer_name text not null,
 *   customer_phone text not null,
 *   order_type text default 'Normal',
 *   items jsonb default '[]'::jsonb,
 *   subtotal float8 default 0,
 *   tax float8 default 0,
 *   total float8 default 0,
 *   custom_adjustment float8 default 0,
 *   is_paid boolean default false,
 *   payment_method text default 'Cash',
 *   status text default 'Received',
 *   notified_1h boolean default false,
 *   notified_24h boolean default false,
 *   notified_48h boolean default false,
 *   created_at timestamp with time zone default now(),
 *   updated_at timestamp with time zone default now()
 * );
 * 
 * -- 2. إنشاء جدول الإعدادات
 * create table if not exists settings (
 *   id uuid default gen_random_uuid() primary key,
 *   key text unique not null,
 *   value jsonb not null,
 *   updated_at timestamp with time zone default now()
 * );
 * 
 * -- 3. إنشاء جدول المخزون
 * create table if not exists inventory (
 *   id uuid default gen_random_uuid() primary key,
 *   name text not null,
 *   stock float8 default 0,
 *   unit text default 'كجم',
 *   threshold float8 default 1
 * );
 * 
 * -- *********************************************************
 * -- حل مشكلة Row-Level Security (RLS) - قم بتشغيل هذه الأوامر:
 * -- *********************************************************
 * 
 * -- تعطيل الحماية أو السماح بالوصول العام للجداول (للتجربة السريعة):
 * alter table orders disable row level security;
 * alter table settings disable row level security;
 * alter table inventory disable row level security;
 * 
 * -- أو بدلاً من ذلك، يمكنك تفعيل السياسات للسماح بالوصول:
 * -- alter table orders enable row level security;
 * -- create policy "Enable all for everyone" on orders for all using (true) with check (true);
 * -- create policy "Enable all for everyone" on settings for all using (true) with check (true);
 * -- create policy "Enable all for everyone" on inventory for all using (true) with check (true);
 */

const supabaseUrl = 'https://hoeealjgmfjbojjyodql.supabase.co';
const supabaseKey = 'sb_publishable_Vq7v3naqK8moAXa-L8EwOw_Rpjc55mw';

export const supabase = createClient(supabaseUrl, supabaseKey);
