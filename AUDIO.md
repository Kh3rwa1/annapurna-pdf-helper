# Assist Audio Prompts

Assist Mode first looks for pre-recorded Bengali audio at `frontend/public/audio/bn/<key>.mp3`.
If a file is missing, it falls back to browser Bengali speech synthesis.

Record these files when ready:

- `assist.card.scan.aadhaar.mp3`
- `assist.card.scan.pan.mp3`
- `assist.card.scan.epic.mp3`
- `assist.card.scan.ration.mp3`
- `assist.card.scan.bank.mp3`
- `assist.card.offer.pan.mp3`
- `assist.card.offer.epic.mp3`
- `assist.card.offer.ration.mp3`
- `assist.card.offer.bank.mp3`
- `assist.card.confirm.title.mp3`
- `assist.name.mp3`
- `assist.dob.mp3`
- `assist.gender.mp3`
- `assist.aadhaar.mp3`
- `assist.mobile.mp3`
- `assist.address.mp3`
- `assist.employment.mp3`
- `assist.education.mp3`
- `assist.scheme.mp3`
- `assist.member.add.mp3`
- `assist.member.name.mp3`
- `assist.member.relation.mp3`
- `assist.member.gender.mp3`
- `assist.member.dob.mp3`
- `assist.member.aadhaar.mp3`
- `assist.member.mobile.mp3`
- `assist.member.address.mp3`
- `assist.member.more.mp3`
- `assist.field.pan.mp3`
- `assist.field.epic.mp3`
- `assist.field.ration.mp3`
- `assist.field.bankName.mp3`
- `assist.field.bankAccount.mp3`
- `assist.field.bankIfsc.mp3`
- `assist.review.title.mp3`
- `assist.preview.title.mp3`
- `assist.download.title.mp3`

The canonical list lives in `frontend/src/lib/audioManifest.ts`.
