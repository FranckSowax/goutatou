alter publication supabase_realtime add table message_logs;
create index message_logs_resto_created_idx on message_logs (restaurant_id, created_at desc);
