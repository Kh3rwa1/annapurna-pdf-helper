# Assist Audio Prompts

Assist Mode first looks for pre-recorded Bengali audio at `frontend/public/audio/bn/<key>.mp3`.
If a file is missing, it falls back to browser Bengali speech synthesis.

Record these files when ready:

- `assist.photo.title.mp3`
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
- `assist.member.more.mp3`
- `assist.review.title.mp3`
- `assist.preview.title.mp3`
- `assist.download.title.mp3`

The canonical list lives in `frontend/src/lib/audioManifest.ts`.
