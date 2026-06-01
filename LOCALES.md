# Locale Keys

Assist Mode uses `frontend/src/locales/bn.json` first and falls back to `frontend/src/locales/en.json` through `t(key)`.

Keep Bengali strings plain and low-literacy friendly. Avoid developer terms in Assist Mode labels.

## App

- `app.title`
- `mode.agent`
- `mode.assist`
- `mode.loadingAgent`
- `privacy`

## Assist Flow

- `assist.progress`
- `assist.back`
- `assist.next`
- `assist.listen`
- `assist.mute`
- `assist.soundOn`
- `assist.problem`
- `assist.warning`
- `assist.photo.title`
- `assist.photo.help`
- `assist.photo.add`
- `assist.photo.read`
- `assist.photo.preparing`
- `assist.photo.reading`
- `assist.photo.retry`
- `assist.photo.next`
- `assist.photo.empty`
- `assist.whoseCard`
- `assist.card.scan.aadhaar`
- `assist.card.scan.pan`
- `assist.card.scan.epic`
- `assist.card.scan.ration`
- `assist.card.scan.bank`
- `assist.card.offer.pan`
- `assist.card.offer.epic`
- `assist.card.offer.ration`
- `assist.card.offer.bank`
- `assist.card.label.aadhaar`
- `assist.card.label.pan`
- `assist.card.label.epic`
- `assist.card.label.ration`
- `assist.card.label.bank`
- `assist.card.help.aadhaar`
- `assist.card.help.pan`
- `assist.card.help.epic`
- `assist.card.help.ration`
- `assist.card.help.bank`
- `assist.card.have`
- `assist.card.skip`
- `assist.card.uploaded`
- `assist.card.confirm.title`
- `assist.card.confirm.empty`
- `assist.card.confirm.correct`
- `assist.card.ready`
- `assist.card.reading`
- `assist.card.done`
- `assist.card.problem`
- `assist.target.you`
- `assist.target.member1`
- `assist.target.member2`
- `assist.target.member3`
- `assist.target.member4`
- `assist.target.member5`
- `assist.name`
- `assist.dob`
- `assist.gender`
- `assist.aadhaar`
- `assist.mobile`
- `assist.address`
- `assist.employment`
- `assist.education`
- `assist.scheme`
- `assist.member.add`
- `assist.member.name`
- `assist.member.relation`
- `assist.member.gender`
- `assist.member.dob`
- `assist.member.aadhaar`
- `assist.member.mobile`
- `assist.member.address`
- `assist.member.more`
- `assist.field.pan`
- `assist.field.epic`
- `assist.field.ration`
- `assist.field.bankName`
- `assist.field.bankAccount`
- `assist.field.bankIfsc`
- `assist.date.day`
- `assist.date.month`
- `assist.date.year`
- `assist.review.title`
- `assist.review.edit`
- `assist.review.confirm`
- `assist.preview.title`
- `assist.preview.help`
- `assist.preview.wait`
- `assist.download.title`
- `assist.download.button`
- `assist.fill.empty`
- `assist.noMembers`
- `assist.yes`
- `assist.no`

## Choices

- `choice.male`
- `choice.female`
- `choice.otherGender`
- `choice.spouse`
- `choice.child`
- `choice.parent`
- `choice.otherRelation`
- `choice.workDaily`
- `choice.workSelf`
- `choice.workNone`
- `choice.workOther`
- `choice.eduNone`
- `choice.eduPrimary`
- `choice.eduSecondary`
- `choice.eduHigher`
- `choice.schemeFood`
- `choice.schemePension`
- `choice.schemeHealth`
- `choice.schemeOther`

## Summary

- `summary.name`
- `summary.dob`
- `summary.gender`
- `summary.aadhaar`
- `summary.mobile`
- `summary.pan`
- `summary.epic`
- `summary.ration`
- `summary.bankName`
- `summary.bankAccount`
- `summary.bankIfsc`
- `summary.relation`
- `summary.employment`
- `summary.education`
- `summary.scheme`
- `summary.address`
- `summary.members`

## Assist Flow Order

Assist Mode is document-first. For each person, it asks for an Aadhaar photo, confirms what was read, asks by hand only for Aadhaar details that stayed empty, offers optional PAN, voter, ration, and bank passbook scans, then asks only the remaining family/work/education/help choices. The guided path already knows whose card is being scanned, so it does not show the person selector unless Agent Mode is used.
