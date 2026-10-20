-- The pricing page promises 200 AI receptionist minutes a month; the default was 150.
-- Raise the default and lift organizations still on the old default (custom limits are kept).
ALTER TABLE public.organizations ALTER COLUMN monthly_voice_minutes_limit SET DEFAULT 200;
UPDATE public.organizations SET monthly_voice_minutes_limit = 200 WHERE monthly_voice_minutes_limit = 150;
