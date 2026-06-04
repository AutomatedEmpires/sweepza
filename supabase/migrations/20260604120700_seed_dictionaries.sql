-- Seed controlled dictionaries (idempotent). Canonical values from
-- "Controlled Dictionaries & Taxonomy Governance".

insert into category (code, label, display_priority) values
  ('cash', 'Cash', 10),
  ('gift_cards', 'Gift Cards', 20),
  ('travel', 'Travel', 30),
  ('vehicles', 'Vehicles', 40),
  ('electronics', 'Electronics', 50),
  ('outdoor', 'Outdoor', 60),
  ('home', 'Home', 70),
  ('food_beverage', 'Food & Beverage', 80),
  ('fashion_beauty', 'Fashion & Beauty', 90),
  ('family_kids', 'Family & Kids', 100),
  ('experiences', 'Experiences', 110),
  ('seasonal', 'Seasonal', 120),
  ('other', 'Other', 999)
on conflict (code) do nothing;

insert into eligibility (code, label, display_priority) values
  ('us_only', 'US Only', 10),
  ('canada', 'Canada', 20),
  ('state_limited', 'State Limited', 30),
  ('age_18', '18+', 40),
  ('age_21', '21+', 50)
on conflict (code) do nothing;

-- Badge priority mirrors the Trust/Badge spec:
-- Ends Today > Ends Soon > Verified > Entry type > Featured/Boosted > Winner Reported > New.
insert into badge (code, label, badge_group, display_priority) values
  ('ends_today', 'Ends Today', 'urgency', 10),
  ('ends_soon', 'Ends Soon', 'urgency', 20),
  ('verified', 'Verified', 'trust', 30),
  ('daily', 'Daily', 'entry_type', 40),
  ('instant_win', 'Instant Win', 'entry_type', 45),
  ('featured', 'Featured', 'promotion', 50),
  ('boosted', 'Boosted', 'promotion', 55),
  ('winner_reported', 'Winner Reported', 'community_proof', 60),
  ('new', 'New', 'freshness', 70)
on conflict (code) do nothing;

insert into tag (code, label, category_code, display_priority) values
  ('high_value', 'High Value', null, 10),
  ('easy_entry', 'Easy Entry', null, 20),
  ('no_purchase', 'No Purchase', null, 30),
  ('family_friendly', 'Family Friendly', 'family_kids', 40),
  ('local', 'Local', null, 50)
on conflict (code) do nothing;
