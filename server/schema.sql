create extension ulid;

-- A simple table to track rate limiting
create table rate_limit_state (
  key text not null primary key,
  last_reset timestamptz not null,
  count int not null
);

create table openai_embedding_req_log (
  id ulid primary key default gen_ulid(),
  logged_at timestamptz not null default now(),
  ip text not null,
  input text not null,
  success boolean not null,
  error_msg text default null
);
