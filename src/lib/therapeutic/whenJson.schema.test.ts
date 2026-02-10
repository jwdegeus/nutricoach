/**
 * Therapeutic when_json schema – unit tests.
 * Regressie: valid DSL parse ok; invalid shape fail; evaluator applicable/invalid/matched max 6.
 *
 * Run: node --test whenJson.schema.test.ts  (of tsx)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { whenJsonSchema } from './whenJson.schema';
import {
  filterSupplementRulesForUser,
  type UserRuleContext,
  type ProtocolSupplementRuleRow,
} from './therapeuticProfile.service';

describe('whenJsonSchema', () => {
  it('accepts valid DSL with all', () => {
    const w = { all: [{ field: 'protocolKey', op: 'eq', value: 'ms_v1' }] };
    const r = whenJsonSchema.safeParse(w);
    assert.strictEqual(r.success, true);
  });

  it('accepts valid DSL with any', () => {
    const w = {
      any: [
        { field: 'sex', op: 'eq', value: 'female' },
        { field: 'ageYears', op: 'gte', value: 18 },
      ],
    };
    const r = whenJsonSchema.safeParse(w);
    assert.strictEqual(r.success, true);
  });

  it('accepts valid DSL with override exists', () => {
    const w = { all: [{ field: 'override', key: 'custom_foo', op: 'exists' }] };
    const r = whenJsonSchema.safeParse(w);
    assert.strictEqual(r.success, true);
  });

  it('rejects invalid DSL shape (array at root)', () => {
    const r = whenJsonSchema.safeParse([
      { field: 'sex', op: 'eq', value: 'male' },
    ]);
    assert.strictEqual(r.success, false);
  });

  it('rejects invalid DSL shape (all not array)', () => {
    const r = whenJsonSchema.safeParse({ all: 'not-an-array' });
    assert.strictEqual(r.success, false);
  });

  it('rejects invalid condition (wrong op)', () => {
    const w = { all: [{ field: 'protocolKey', op: 'gt', value: 'x' }] };
    const r = whenJsonSchema.safeParse(w);
    assert.strictEqual(r.success, false);
  });
});

function rule(id: string, whenJson: unknown): ProtocolSupplementRuleRow {
  return {
    id,
    protocol_id: 'p1',
    supplement_key: 'sup',
    rule_key: 'r1',
    kind: 'info',
    severity: 'info',
    when_json: whenJson,
    message_nl: 'Test',
    is_active: true,
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('filterSupplementRulesForUser (when_json evaluator)', () => {
  it('valid DSL => rule applicable true', () => {
    const ctx: UserRuleContext = { protocolKey: 'ms_v1' };
    const rules: ProtocolSupplementRuleRow[] = [
      rule('r1', { all: [{ field: 'protocolKey', op: 'eq', value: 'ms_v1' }] }),
    ];
    const { applicableRules, meta } = filterSupplementRulesForUser(rules, ctx);
    assert.strictEqual(applicableRules.length, 1);
    assert.strictEqual(meta.applicable, 1);
    assert.strictEqual(meta.invalidWhenJson, 0);
  });

  it('invalid DSL shape => fail-closed (applicable false, invalid true)', () => {
    const ctx: UserRuleContext = { protocolKey: 'ms_v1' };
    const rules: ProtocolSupplementRuleRow[] = [
      rule('r1', { all: [{ field: 'protocolKey', op: 'gt', value: 'x' }] }),
    ];
    const { applicableRules, meta } = filterSupplementRulesForUser(rules, ctx);
    assert.strictEqual(applicableRules.length, 0);
    assert.strictEqual(meta.applicable, 0);
    assert.strictEqual(meta.invalidWhenJson, 1);
  });

  it('override exists + gte number => matched conditions filled (max 6)', () => {
    const ctx: UserRuleContext = {
      overrides: { dose_mg: 100 },
    };
    const rules: ProtocolSupplementRuleRow[] = [
      rule('r1', {
        all: [
          { field: 'override', key: 'dose_mg', op: 'exists' },
          { field: 'override', key: 'dose_mg', op: 'gte', value: 50 },
        ],
      }),
    ];
    const { applicableRules, meta, ruleMetaById } =
      filterSupplementRulesForUser(rules, ctx);
    assert.strictEqual(applicableRules.length, 1);
    assert.strictEqual(meta.invalidWhenJson, 0);
    const matched = ruleMetaById['r1']?.matched;
    assert(matched != null, 'matched should be present');
    assert(matched.length >= 1 && matched.length <= 6);
    assert(matched.some((m) => m.type === 'override' && m.op === 'exists'));
    assert(matched.some((m) => m.type === 'override' && m.op === 'gte'));
  });

  it('null when_json => rule applicable (no evaluation)', () => {
    const rules: ProtocolSupplementRuleRow[] = [rule('r1', null)];
    const { applicableRules, meta } = filterSupplementRulesForUser(rules, {});
    assert.strictEqual(applicableRules.length, 1);
    assert.strictEqual(meta.invalidWhenJson, 0);
  });
});
