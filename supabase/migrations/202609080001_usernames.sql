begin;
create table public.account_usernames (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z0-9_]{3,30}$')
);
alter table public.account_usernames enable row level security;
revoke all on public.account_usernames from anon, authenticated;
grant select, insert, update on public.account_usernames to authenticated;
grant all on public.account_usernames to service_role;
create policy own_select on public.account_usernames for select to authenticated using (user_id = auth.uid());
create policy own_insert on public.account_usernames for insert to authenticated with check (user_id = auth.uid());
create policy own_update on public.account_usernames for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create function public.create_account_username() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.raw_user_meta_data ->> 'username' is null then
   raise exception 'A username is required';
 end if;
 insert into public.account_usernames(user_id, username)
 values (new.id, lower(trim(new.raw_user_meta_data ->> 'username')));
 return new;
end;
$$;
revoke all on function public.create_account_username() from public, anon, authenticated;
create trigger create_account_username after insert on auth.users
for each row execute function public.create_account_username();
insert into public.account_usernames(user_id, username)
select id, 'tognpa' from auth.users where lower(email) = 'patrik.tognina1999@gmail.com';
commit;

