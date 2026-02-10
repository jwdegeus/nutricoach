# Therapeutic: Wahls supplement seed (v2)

## Protocol

| Veld             | Waarde                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| **protocol_key** | `wahls_mitochondria_v1`                                                                                    |
| **name_nl**      | Wahls – Mitochondria (v1)                                                                                  |
| **Doel**         | Mitochondriale ondersteuning en nutriënt-richtlijnen volgens het Wahls-protocol (voeding en supplementen). |

Seed v2 wordt uitgevoerd in migration `20260231000041_seed_wahls_supplements_and_rules_v2.sql`. (Eerdere v1: `20260231000038_seed_wahls_supplements_and_rules.sql`.) Alles is daarna beheerbaar via de Admin-editor; de seed is alleen het startpunt.

---

## Supplementen (supplement_key + dosage_text)

V2 seed bevat onderstaande supplementen. Bestaande rijen (zelfde protocol_id + supplement_key) worden overgeslagen (ON CONFLICT DO NOTHING).

| supplement_key            | dosage_text                               |
| ------------------------- | ----------------------------------------- |
| vitamin_b1                | Tot 100 mg/dag                            |
| vitamin_b2                | Tot 200 mg/dag                            |
| vitamin_b3                | Tot 500 mg/dag                            |
| vitamin_b12               | Tot 1000 mcg/dag                          |
| folate                    | Tot 800 mcg/dag                           |
| vitamin_d                 | Tot 2000 IU/dag                           |
| magnesium                 | 500 mg elementair                         |
| theanine                  | 500 mg                                    |
| taurine                   | 1–3 g/dag                                 |
| coenzyme_q10              | 200 mg (1200 mg voor Parkinson-patiënten) |
| iodine                    | ¼–1 tl gedroogd zeewier/dag               |
| omega3_fish_oil           | 1–4 g/dag                                 |
| flax_or_hemp_oil          | 1–2 el/dag                                |
| n_acetylcysteine          | 1–2 g/dag                                 |
| resveratrol               | Tot 200 mg/dag                            |
| alpha_lipoic_acid         | 600 mg                                    |
| creatine_monohydrate      | 1 tl/dag                                  |
| trace_minerals            | ¼–1 tl kelp/algen per dag (naar behoefte) |
| l_carnitine               | 500 mg                                    |
| probiotics                | Zie etiket                                |
| multivitamin_multimineral | Volgens aanwijzing                        |

---

## Rules (supplement_key, rule_key, when_json override-keys)

| supplement_key       | rule_key                        | wanneer (override keys / when_json)            |
| -------------------- | ------------------------------- | ---------------------------------------------- |
| vitamin_d            | high_dose_supervision           | `supplements.vitamin_d.intended_amount` ≥ 2000 |
| folate               | too_much_with_b_complex         | `supplements.b_complex.is_active` exists       |
| omega3_fish_oil      | blood_thinning_caution          | `meds.blood_thinner` of `meds.aspirin` exists  |
| iodine               | thyroid_medication_caution      | `conditions.thyroid_medication` exists         |
| iodine               | hyperthyroid_unmasking_risk     | `conditions.hyperthyroid_history` exists       |
| creatine_monohydrate | hydration_kidney_stones_caution | `conditions.kidney_stones_history` exists      |
| probiotics           | label_caution                   | Altijd (when_json = null)                      |
| vitamin_b12          | vegetarian_low_b12_risk         | `diet.vegetarian` exists                       |
| magnesium            | mood_start_low                  | Altijd (when_json = null)                      |
| alpha_lipoic_acid    | gi_build_up                     | Altijd (when_json = null)                      |
| n_acetylcysteine     | med_interactions_risk           | `conditions.med_interactions_risk` exists      |

---

## Override keys (voor when_json-evaluatie)

Deze keys zijn **niet** hardcoded in applicatiecode; ze worden gebruikt in `when_json` en kunnen via user/therapeutic profile overrides worden gezet. Settings UI toont inputs voor deze keys onder “Mijn supplement intenties” (boolean of number, afgeleid uit de regels).

**Prefix-conventie:**

- `supplements.<supplement_key>.<field>` (numbers/booleans, bijv. intended_amount, is_active)
- `meds.<flag>` (booleans)
- `conditions.<flag>` (booleans)
- `diet.<flag>` (booleans)

| Override key                            | Type    | Gebruik                                      |
| --------------------------------------- | ------- | -------------------------------------------- |
| `supplements.vitamin_d.intended_amount` | number  | Regel toont bij ≥ 2000 IU                    |
| `supplements.b_complex.is_active`       | boolean | exists → folate-waarschuwing                 |
| `meds.blood_thinner`                    | boolean | exists → omega3 bloedverdunningswaarschuwing |
| `meds.aspirin`                          | boolean | exists → omega3 bloedverdunningswaarschuwing |
| `conditions.thyroid_medication`         | boolean | exists → jodium/schildklier waarschuwing     |
| `conditions.hyperthyroid_history`       | boolean | exists → jodium hyperthyreoïdie-waarschuwing |
| `conditions.kidney_stones_history`      | boolean | exists → creatine/hydratatie waarschuwing    |
| `diet.vegetarian`                       | boolean | exists → B12/info regel                      |
| `conditions.med_interactions_risk`      | boolean | exists → NAC medicatie-waarschuwing          |

### Voorbeeld override-JSON (flat, zoals Settings UI opslaat)

**Voorbeeld 1 – Gebruiker met aspirine en vitamine D 2000 IU:**

```json
{
  "supplements.vitamin_d.intended_amount": 2000,
  "supplements.b_complex.is_active": false,
  "meds.aspirin": true,
  "meds.blood_thinner": false,
  "conditions.thyroid_medication": false,
  "conditions.hyperthyroid_history": false,
  "conditions.kidney_stones_history": false,
  "diet.vegetarian": false,
  "conditions.med_interactions_risk": false
}
```

**Voorbeeld 2 – Vegetariër, schildkliermedicatie, geen bloedverdunners:**

```json
{
  "supplements.vitamin_d.intended_amount": 1000,
  "supplements.b_complex.is_active": true,
  "meds.aspirin": false,
  "meds.blood_thinner": false,
  "conditions.thyroid_medication": true,
  "conditions.hyperthyroid_history": false,
  "conditions.kidney_stones_history": false,
  "diet.vegetarian": true,
  "conditions.med_interactions_risk": false
}
```

---

## Beheer

- Alle supplementen en rules zijn **DB-gedreven** en beheerbaar via de Admin-editor.
- Seed v2 is **idempotent**: migration opnieuw draaien levert geen dubbele rijen (ON CONFLICT DO NOTHING).
- Geen schema-wijzigingen in de seed; alleen data.

---

## Sprint notes (Stap 38 – v2 seed)

- Nieuwe idempotente migration `20260231000041_seed_wahls_supplements_and_rules_v2.sql`: protocol upsert, 21 supplementen, 11 regels.
- Protocol `wahls_mitochondria_v1` ongewijzigd of toegevoegd (ON CONFLICT DO NOTHING); source_refs in v2-insert: Wahls tables screenshots / seed v2.
- Supplementen: o.a. vitamin_b1/b2/b3/b12, folate, vitamin_d, magnesium, theanine, taurine, coenzyme_q10, iodine, omega3_fish_oil, flax_or_hemp_oil, n_acetylcysteine, resveratrol, alpha_lipoic_acid, creatine_monohydrate, trace_minerals, l_carnitine, probiotics, multivitamin_multimineral.
- Rules: when*json alleen override-keys (supplements.*, meds._, conditions._, diet.\_); snake_case rule_keys; kind/severity consistent; message_nl 5–400 tekens.
- Override keys gedocumenteerd; twee flat-JSON voorbeelden voor Settings UI.
- Doc `therapeutic-wahls-supplement-seed.md` bijgewerkt zodat deze 1:1 aansluit op de v2 seed (supplementenlijst, rules, override keys, voorbeelden).
- Geen hardcoded business rules in code; alles in DB seed. Geen SELECT \*; expliciete kolommen; volledig idempotent.
