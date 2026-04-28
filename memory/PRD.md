# PRD: Mobile Action — Offline Voice Command App

## Overview
Fully offline voice command app. No AI, no cloud, no server. Gallery-style Material Design.

## Voice Recognition
- `expo-speech-recognition` wraps Android's native `SpeechRecognizer` (Google's on-device engine)
- Works on all Android devices with Google Play Services
- For Chinese OEMs (Oppo, Vivo, Xiaomi): may need Auto-Start permission for background listening
- Offline mode: `requiresOnDeviceRecognition: true`

## UI Design
- Light white Material Design, green accent (#1B8C3D)
- No back arrow on home (it's the main screen)
- Actions list centered
- "Hold to talk" button at bottom
- Settings: expandable accordion sections (Voice, How to Use, Custom Commands, About)
- No statistics dashboard, no version numbers — minimal

## Wake Words
"hey mobile", "hi mobile", "hello mobile", "ok mobile", "yo mobile", "mobile"
