-- Seed: magician_validator_overrides met waarden uit diet-validator.ts
-- Migreert SUBSTRING_FALSE_POSITIVE_IF_CONTAINS + zoete aardappel-uitzondering

INSERT INTO public.magician_validator_overrides (forbidden_term, exclude_if_contains, description, display_order) VALUES
  ('bloem', '["zonnebloem","bloemkoolrijst","bloemkool","kool bloem","bloem kool"]'::jsonb, 'Bloemkool en zonnebloem zijn geen tarwe', 1),
  ('ei', '["romeinse","romaine","rijpe","rijp","avocado","kleine","wortel","weinig"]'::jsonb, '"ei" in romeinse/kleine wortel = geen eieren', 2),
  ('ijs', '["radijs","ijsblokjes","ijsblokje"]'::jsonb, 'Radijs en ijsblokjes zijn geen zuivel', 3),
  ('oca', '["avocado"]'::jsonb, 'Avocado bevat oca maar is geen oca-knollen', 4),
  ('rijst', '["bloemkoolrijst","bloemkool","rijstazijn"]'::jsonb, 'Bloemkoolrijst en rijstazijn zijn geen graan', 5),
  ('kool', '["bloemkoolrijst","bloemkool"]'::jsonb, 'Bloemkool is geen gewone kool', 6),
  ('yoghurt', '["kokosyoghurt","kokos yoghurt","amandelyoghurt","amandel yoghurt","haveryoghurt","haver yoghurt","sojayoghurt","soja yoghurt","plantaardige yoghurt","plantyoghurt","oatyoghurt","oat yoghurt"]'::jsonb, 'Plantaardige yoghurtalternatieven', 7),
  ('melk', '["kokosmelk","kokos melk","amandelmelk","amandel melk","havermelk","haver melk","rijstmelk","rijst melk","sojamelk","soja melk","oatmelk","oat melk","plantaardige melk"]'::jsonb, 'Plantaardige melkalternatieven', 8),
  ('pasta', '["notenpasta","noten pasta","amandelpasta","amandel pasta","gember-knoflookpasta","gemberpasta","knoflookpasta","tomatenpasta","sesampasta","pindapasta","olijvenpasta","chilipasta","currypasta","kruidenpasta","pastasaus","tahin","tahini"]'::jsonb, 'Pasta als spread (notenpasta, tahini) ≠ glutenpasta', 9),
  ('aardappel', '["zoete aardappel","zoet aardappel","aardappel zoete","zoete_aardappel","aardappel_zoete","aardappel zoete gekookt","zoete aardappel gekookt","zoet aardappel gekookt","sweet potato","sweet_potato","batata doce","bataat","yam"]'::jsonb, 'Zoete aardappel is geen nachtschade (Convolvulaceae)', 10),
  ('potato', '["sweet potato","zoete aardappel","zoet aardappel","aardappel zoete","aardappel zoete gekookt","zoete aardappel gekookt","zoet aardappel gekookt","batata doce","bataat","yam"]'::jsonb, 'Zoete aardappel en yam zijn geen nachtschade', 11),
  ('peper', '["zwarte peper","witte peper","black pepper","white pepper","peperkorrel","gemalen peper","ground pepper","zeezout en peper","zout en peper"]'::jsonb, 'Zwarte/witte peper (kruid) ≠ paprika/chili (nachtschade)', 12),
  ('pepper', '["black pepper","white pepper","zwarte peper","witte peper","peperkorrel","ground pepper","gemalen peper"]'::jsonb, 'Spice pepper ≠ bell pepper (nachtschade)', 13),
  ('gluten', '["glutenvrij","glutenvrije","gluten-free"]'::jsonb, 'Glutenvrije producten zijn toegestaan', 14)
ON CONFLICT (forbidden_term) DO UPDATE SET
  exclude_if_contains = EXCLUDED.exclude_if_contains,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  updated_at = now();
