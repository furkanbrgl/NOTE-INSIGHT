# Testing Checklist for Phase 2 (AVAudioEngine-only Recording)

## ✅ Build Verification
- [x] Project compiles without errors
- [x] No warnings that indicate logical errors

## 🔍 Code Review - Critical Paths

### 1. Recording Flow
- [ ] **Start Recording**
  - WAV writer is created successfully
  - AVAudioEngine starts
  - Input tap is installed
  - Circular buffer is initialized
  - Partial timer starts

- [ ] **During Recording**
  - Audio buffers are captured
  - Conversion to 16kHz mono Int16 works
  - Samples are appended to WAV writer
  - Samples are appended to circular buffer
  - Partial transcription runs every 900ms (if enough samples)
  - `onAsrPartial` events are emitted
  - Live captions appear on RecordScreen

- [ ] **Stop Recording**
  - Partial timer stops
  - AVAudioEngine stops
  - Input tap is removed
  - `waitForAudioProcessingQueue()` blocks until all writes finish
  - WAV file is finalized (header patched correctly)
  - WAV file path is returned
  - Final transcription starts

### 2. WAV File Writing
- [ ] **File Creation**
  - WAV file is created at `Documents/Audio/<noteId>.wav`
  - File is created with correct format (16kHz, mono, 16-bit)
  - Header is written correctly (placeholder initially)

- [ ] **Data Writing**
  - PCM samples are appended continuously
  - No data loss during recording
  - File size matches expected (duration × 32000 bytes/second)

- [ ] **File Finalization**
  - Header is patched with correct sizes on `finish()`
  - File is valid WAV (can be played back)
  - File is NOT deleted after transcription (needed for playback)

### 3. Final Transcription
- [ ] **Transcription Runs**
  - Whisper runs on finalized WAV file
  - Language mode is respected (tr/en/auto)
  - Transcription completes successfully
  - Segments are created correctly
  - `onAsrFinal` event is emitted
  - Segments are persisted to SQLite

### 4. Live Captions (Partials)
- [ ] **Partial Transcription**
  - Runs every ~900ms while recording
  - Uses last 6 seconds of audio (rolling window)
  - Language lock is respected (doesn't bounce between languages)
  - Events are emitted only when text changes by >= 3 chars
  - Temp WAV files are cleaned up after each run
  - Inference doesn't run concurrently (flag prevents it)

- [ ] **UI Updates**
  - Live captions appear on RecordScreen while recording
  - Shows "Listening…" if no partials yet
  - Partials are cleared when recording stops
  - Partials are NOT persisted to database

### 5. Error Handling
- [ ] **Permission Denied**
  - Recording doesn't start
  - Error is logged
  - State is reset correctly

- [ ] **WAV Writer Failure**
  - Error is logged
  - Recording stops gracefully
  - State is reset correctly

- [ ] **Conversion Errors**
  - Errors are logged
  - Recording continues (errors don't crash)

- [ ] **Transcription Errors**
  - Errors are logged
  - `onAsrFinal` is NOT emitted
  - Error event is emitted (if implemented)

### 6. Language Locking
- [ ] **Manual Lock (tr/en)**
  - Forced language is used for partials
  - Forced language is used for final transcription
  - No auto-detection runs

- [ ] **Auto Mode**
  - Auto-detection runs for partials
  - Language locks when confidence >= 0.80
  - Locked language (auto_tr/auto_en) is used for subsequent partials
  - Final transcription uses locked language

### 7. Cleanup & State Management
- [ ] **Stop Recording Cleanup**
  - All timers are stopped
  - All audio resources are released
  - State variables are reset
  - No memory leaks

- [ ] **Error Cleanup**
  - Resources are released on errors
  - State is reset correctly
  - No orphaned files

## 🧪 Manual Testing Steps

### Test 1: Basic Recording (EN)
1. Start recording with language "en"
2. Speak for ~10 seconds in English
3. Stop recording
4. **Verify:**
   - Live captions appeared during recording
   - WAV file exists at expected path
   - Final transcription completes
   - Segments are saved to DB
   - Audio playback works in TranscriptTab

### Test 2: Basic Recording (TR)
1. Start recording with language "tr"
2. Speak for ~10 seconds in Turkish
3. Stop recording
4. **Verify:** Same as Test 1

### Test 3: Auto Mode with High Confidence
1. Start recording with language "auto"
2. Speak clearly in English for ~15 seconds
3. Watch logs for language lock (should lock to "auto_en" if p >= 0.80)
4. Stop recording
5. **Verify:**
   - Language locked during recording
   - Final transcription uses locked language
   - Segments are correct

### Test 4: Live Captions During Recording
1. Start recording
2. Speak continuously for 20 seconds
3. **Verify:**
   - Live captions update every ~900ms
   - Text changes are visible
   - No spam (only emits when text changes by >= 3 chars)
   - Captions clear when recording stops

### Test 5: Short Recording (< 1 second)
1. Start recording
2. Speak for < 1 second
3. Stop immediately
4. **Verify:**
   - No partial transcription runs (not enough samples)
   - Final transcription still works
   - WAV file is valid (even if small)

### Test 6: Error Handling
1. Deny microphone permission
2. Try to start recording
3. **Verify:**
   - Recording doesn't start
   - Error is logged
   - State is reset

### Test 7: Playback
1. Record a note
2. Wait for transcription to complete
3. Open note detail
4. Play audio in TranscriptTab
5. **Verify:**
   - Audio plays correctly (WAV file is valid)
   - Playback position matches transcript segments

## 📊 Log Verification

### Expected Logs During Recording
```
[TranscriptionSession] Microphone permission: granted
[TranscriptionSession] Audio session configured successfully
[TranscriptionSession] Recording will start to path: .../Audio/<noteId>.wav
[TranscriptionSession] WAV file writer created
[TranscriptionSession] Input format: 48000.0Hz, 1 channels
[TranscriptionSession] AVAudioEngine started for live captions
[TranscriptionSession] Started recording: <noteId>, model: base_q5_1
[TranscriptionSession] Started partial timer (DispatchSource, 900ms)
[Partial] tick - samplesInBuffer=...
[TranscriptionNative] onAsrPartial received
[TranscriptionSession] AVAudioEngine stopped
[TranscriptionSession] Stopped recording, duration: ...ms, path: .../Audio/<noteId>.wav
[TranscriptionSession] WAV file finalized: .../Audio/<noteId>.wav, size: ... bytes
[TranscriptionSession] Running whisper transcription on: .../Audio/<noteId>.wav
[TranscriptionSession] Emitted onAsrFinal with N segments
```

### Red Flags (Should NOT see)
- ❌ "Failed to create WAV writer"
- ❌ "Conversion error" (repeated errors)
- ❌ "Failed to write temp WAV" (repeated errors)
- ❌ WAV file deleted after transcription
- ❌ Concurrent inference errors
- ❌ Memory leaks or crashes

## 🎯 Success Criteria

✅ **All tests pass**
✅ **No crashes or memory leaks**
✅ **WAV files are valid and playable**
✅ **Live captions work during recording**
✅ **Final transcription works correctly**
✅ **Language locking works as expected**
✅ **No partial segments in database (only finals)**

