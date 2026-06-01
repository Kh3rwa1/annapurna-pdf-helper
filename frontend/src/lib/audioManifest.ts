export const audioManifest = [
  'assist.photo.title',
  'assist.name',
  'assist.dob',
  'assist.gender',
  'assist.aadhaar',
  'assist.mobile',
  'assist.address',
  'assist.employment',
  'assist.education',
  'assist.scheme',
  'assist.member.add',
  'assist.member.name',
  'assist.member.relation',
  'assist.member.gender',
  'assist.member.dob',
  'assist.member.aadhaar',
  'assist.member.mobile',
  'assist.member.more',
  'assist.review.title',
  'assist.preview.title',
  'assist.download.title'
] as const;

export type AudioPromptKey = (typeof audioManifest)[number];
