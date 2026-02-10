/**
 * Shared Zod schema for therapeutic_protocol_supplement_rules.when_json DSL.
 * Structure-only validation; no business logic or hardcoded keys.
 * Root must be an object (all/any/not); arrays at root are invalid.
 */

import { z } from 'zod';

const FIELD_OP = z.enum(['eq', 'neq', 'gte', 'lte', 'in']);
const OVERRIDE_OP = z.enum(['eq', 'neq', 'gte', 'lte', 'in', 'exists']);
const PROFILE_FIELD = z.enum([
  'sex',
  'ageYears',
  'heightCm',
  'weightKg',
  'dietKey',
  'protocolKey',
  'protocolVersion',
]);

const fieldConditionSchema = z.object({
  field: PROFILE_FIELD,
  op: FIELD_OP,
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});

const overrideConditionSchema = z.object({
  field: z.literal('override'),
  key: z.string(),
  op: OVERRIDE_OP,
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()])),
    ])
    .optional(),
});

export const conditionSchema = z.discriminatedUnion('field', [
  fieldConditionSchema,
  overrideConditionSchema,
]);

/** Root must be object (all/any/not). Arrays at root are invalid. */
export const whenJsonSchema = z.object({
  all: z.array(conditionSchema).optional(),
  any: z.array(conditionSchema).optional(),
  not: conditionSchema.optional(),
});

export type WhenJson = z.infer<typeof whenJsonSchema>;
export type Condition = z.infer<typeof conditionSchema>;
