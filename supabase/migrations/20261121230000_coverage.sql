-- Coverage readers: read-queue.mjs marks each content_queue item it has read. Re-runnable.
alter table public.content_queue add column if not exists read_on date;
create index if not exists content_queue_unread on public.content_queue (published_on desc) where read_on is null;
