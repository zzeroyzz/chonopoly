-- The asking price belongs to the house, not to a calculation of it.
--
-- The Add form has always collected a sales price and POST /api/properties has
-- always echoed it back in the response without storing it anywhere, because
-- there was nowhere to put it. Every screen then fell back to the calculator's
-- $350,000 default and presented it as the house's price.
--
-- This is deliberately not `last_sale_price`, which is what the house fetched
-- the last time it changed hands (1980, for Primrose). This is what it is on
-- the market for today.

alter table public.properties
  add column if not exists list_price numeric;

comment on column public.properties.list_price is
  'The asking price as entered on Add or Edit. Null when unknown — never a default standing in for one.';
