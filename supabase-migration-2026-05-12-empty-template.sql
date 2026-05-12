-- Run this in Supabase → SQL Editor → New query → Run
-- Adds 'empty' to the allowed values of demos.template.

alter table public.demos drop constraint if exists demos_template_check;
alter table public.demos add  constraint demos_template_check
  check (template in ('news','magazine','landing','empty'));
