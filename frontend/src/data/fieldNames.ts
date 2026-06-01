const HOF_FIELDS = [
  'hof_name',
  'hof_dob',
  'hof_relation',
  'hof_aadhaar',
  'hof_pan',
  'hof_ration_card',
  'hof_epic',
  'hof_address',
  'hof_mobile',
  'hof_bank_name',
  'hof_bank_account',
  'hof_bank_ifsc',
  'hof_employment_status',
  'hof_education',
  'hof_scheme',
  'gender_m',
  'gender_f',
  'gender_other'
] as const;

const MEMBER_FIELDS = [
  'name',
  'dob',
  'relation',
  'aadhaar',
  'pan',
  'ration_card',
  'epic',
  'address',
  'mobile',
  'bank_name',
  'bank_account',
  'bank_ifsc',
  'employment_status',
  'education',
  'scheme',
  'gender_m',
  'gender_f',
  'gender_other'
] as const;

const memberNames = Array.from({ length: 5 }, (_, index) => {
  const member = `member${index + 1}`;
  return MEMBER_FIELDS.map((field) => `${member}_${field}`);
}).flat();

export const FIELD_NAMES = [...HOF_FIELDS, ...memberNames] as const;

export type FieldName = (typeof FIELD_NAMES)[number];

export type UserData = Record<FieldName, string>;

export const CHECKBOX_FIELDS = new Set<FieldName>(
  FIELD_NAMES.filter((field) => field.includes('gender_'))
);

export const createEmptyUserData = (): UserData =>
  Object.fromEntries(FIELD_NAMES.map((field) => [field, ''])) as UserData;

export const isFieldName = (field: string): field is FieldName =>
  (FIELD_NAMES as readonly string[]).includes(field);
