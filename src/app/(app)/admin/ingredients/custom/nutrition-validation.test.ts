import { describe, it, expect } from 'vitest';
import {
  correctNutritionValue,
  validateNutritionValue,
  correctAndValidateNutritionValue,
  correctNutritionValues,
  validateNutritionValues,
} from './nutrition-validation';

describe('correctNutritionValue', () => {
  it('laat sodium_mg ongewijzigd (eenheid is mg; keukenzout ≈ 38758 mg)', () => {
    expect(correctNutritionValue('sodium_mg', 38758)).toBe(38758);
    expect(correctNutritionValue('sodium_mg', 38.758)).toBe(38.758);
  });

  it('corrigeert andere _mg >= 10000 door te delen door 1000', () => {
    expect(correctNutritionValue('potassium_mg', 15000)).toBe(15);
  });

  it('laat plausibele waarden ongewijzigd', () => {
    expect(correctNutritionValue('energy_kcal', 230)).toBe(230);
    expect(correctNutritionValue('protein_g', 12.5)).toBe(12.5);
  });
});

describe('validateNutritionValue', () => {
  it('accepteert sodium_mg 38758 (mg per 100g; keukenzout)', () => {
    expect(validateNutritionValue('sodium_mg', 38758)).toEqual({
      valid: true,
    });
  });

  it('weigert sodium_mg boven max (50.000 mg per 100g)', () => {
    const result = validateNutritionValue('sodium_mg', 60_000);
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain('sodium_mg');
  });

  it('weigert negatieve waarden', () => {
    const result = validateNutritionValue('sodium_mg', -1);
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain('negatief');
  });
});

describe('correctAndValidateNutritionValue', () => {
  it('laat sodium_mg 38758 staan en valideert als geldig', () => {
    const { value, validation } = correctAndValidateNutritionValue(
      'sodium_mg',
      38758,
    );
    expect(value).toBe(38758);
    expect(validation).toEqual({ valid: true });
  });
});

describe('correctNutritionValues', () => {
  it('laat sodium_mg in een record ongewijzigd (eenheid is mg)', () => {
    const numericKeys = new Set(['sodium_mg', 'energy_kcal']);
    const data = { sodium_mg: 38758, energy_kcal: 230 };
    const corrected = correctNutritionValues(data, numericKeys);
    expect(corrected.sodium_mg).toBe(38758);
    expect(corrected.energy_kcal).toBe(230);
  });
});

describe('validateNutritionValues', () => {
  it('retourneert valid voor plausibel record (sodium_mg in mg)', () => {
    const numericKeys = new Set(['sodium_mg', 'energy_kcal']);
    const data = { sodium_mg: 38758, energy_kcal: 230 };
    expect(validateNutritionValues(data, numericKeys)).toEqual({
      valid: true,
    });
  });

  it('retourneert eerste fout bij te hoge waarde', () => {
    const numericKeys = new Set(['sodium_mg']);
    const data = { sodium_mg: 60_000 };
    const result = validateNutritionValues(data, numericKeys);
    expect(result.valid).toBe(false);
    expect('error' in result && result.error).toContain('sodium_mg');
  });
});
