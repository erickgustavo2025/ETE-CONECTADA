import assert from 'node:assert/strict';
import { canonicalCheckDefinition } from './backup-catalog';

const before =
  "CHECK (((course_label)::text = ANY ((ARRAY['ADM'::character varying, 'DS'::character varying, 'ENF'::character varying])::text[])))";
const after =
  "CHECK (((course_label)::text = ANY (ARRAY[('ADM'::character varying)::text, ('DS'::character varying)::text, ('ENF'::character varying)::text])))";
assert.equal(canonicalCheckDefinition(before), after);
assert.equal(canonicalCheckDefinition(after), after);
for (const changed of [
  before.replace("'ADM'", "'ZZZ'"),
  before.replace("'DS'::character varying, ", ''),
  before.replace('= ANY', '<> ANY'),
  before.replace(/::text\[\]/, '::integer[]'),
  before.replace(/character varying/g, 'character varying(2)'),
  before.replace("'ADM'", "'A''DM'"),
  before.replace("'ADM'", "'adm'"),
])
  assert.notEqual(canonicalCheckDefinition(changed), after);
console.log(
  'OK: representação equivalente de array normalizada; valores, tipos, operadores, itens e escapes diferentes continuam distintos.',
);
