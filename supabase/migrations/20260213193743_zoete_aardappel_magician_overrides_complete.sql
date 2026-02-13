-- Migration: Complete zoete aardappel false-positive patterns
-- Description: Zorg dat "Aardappel zoete gekookt" en alle varianten (zoete/zoet + aardappel)
--   correct worden uitgesloten van nachtschade-match. Zoete aardappel = Convolvulaceae, geen nachtschade.

UPDATE public.magician_validator_overrides
SET exclude_if_contains = '["zoete aardappel","zoet aardappel","aardappel zoete","zoete_aardappel","aardappel_zoete","aardappel zoete gekookt","zoete aardappel gekookt","zoet aardappel gekookt","sweet potato","sweet_potato","batata doce","bataat","yam"]'::jsonb,
    description = 'Zoete aardappel is geen nachtschade (Convolvulaceae)',
    updated_at = now()
WHERE forbidden_term = 'aardappel' AND is_active = true;

UPDATE public.magician_validator_overrides
SET exclude_if_contains = '["sweet potato","zoete aardappel","zoet aardappel","aardappel zoete","aardappel zoete gekookt","zoete aardappel gekookt","zoet aardappel gekookt","batata doce","bataat","yam"]'::jsonb,
    description = 'Zoete aardappel en yam zijn geen nachtschade',
    updated_at = now()
WHERE forbidden_term = 'potato' AND is_active = true;
