# Note Insight - Comprehensive Project Summary

## 📋 Overview

**Note Insight** is a mobile voice note-taking application built with React Native (Expo) and iOS native modules. The app enables users to record voice notes, automatically transcribe them using Whisper (OpenAI's speech recognition model), and generate AI-powered insights from the transcripts. The application features real-time live captions similar to Otter.ai, multi-language support (English and Turkish), and offline-first architecture.

---

## 🎯 Core Features

### 1. Voice Recording & Transcription
- **High-quality audio recording** using `AVAudioEngine` (iOS native)
- **Real-time live captions** (Otter-like streaming transcription) while recording
- **Offline transcription** using Whisper.cpp (runs entirely on-device)
- **Multi-language support**: English (en), Turkish (tr), and Auto-detect
- **Smart language detection** with automatic fallback for better accuracy
- **WAV audio format** for optimal transcription quality

### 2. AI-Generated Insights
- **Automatic insight generation** from transcripts (Summary, Key Points, Action Items)
- **Offline LLM** - Deterministic rule-based generation (no API calls)
- **Language-aware insights** - Supports English and Turkish
- **Regeneration support** - Users can regenerate insights with confirmation
- **Persistent storage** - Insights are saved to SQLite database

### 3. Note Management
- **List view** of all notes with metadata (duration, language, date)
- **Swipe-to-delete** functionality with confirmation
- **Note detail view** with tabs: Transcript, Insights
- **Audio playback** synchronized with transcript segments
- **Language badges** showing recording language (TR, EN, AUTO)

### 4. User Interface
- **Tab-based navigation** (Record, Notes, Settings)
- **Material top tabs** for note detail (Transcript, Insights)
- **Live captions display** during recording
- **Status indicators** (Recording, Transcribing, Ready)
- **Clean, modern design** with iOS design guidelines

---

## 🏗️ Technical Architecture

### Stack Overview

**Frontend:**
- React Native 0.81.5
- Expo SDK 54
- TypeScript 5.9.2
- React Navigation 7 (Bottom Tabs, Material Top Tabs, Native Stack)
- Zustand 5.0.9 (State Management)
- Expo SQLite (Database)
- Expo AV (Audio Playback)

**Native iOS:**
- Swift & Objective-C++ (Bridge)
- AVAudioEngine (Audio Recording & Processing)
- Whisper.cpp (Speech Recognition)
- Metal GPU Acceleration (Whisper inference)
- Core ML (Optional, for Whisper encoder optimization)

**Backend/Database:**
- SQLite (Embedded database)
- Migration system (Schema versioning)
- CASCADE delete (Referential integrity)

### Architecture Patterns

**1. Native Module Bridge (iOS ↔ React Native)**
- Custom native modules for audio recording and transcription
- Event-based communication (`onAsrState`, `onAsrPartial`, `onAsrFinal`)
- Promise-based API for synchronous operations

**2. Repository Pattern**
- Data access abstraction layer
- Repositories: `notesRepo`, `segmentsRepo`, `insightsRepo`
- Clean separation of concerns

**3. Coordinator Pattern**
- `TranscriptionCoordinator` - Orchestrates transcription workflow
- Handles event routing from native to database
- Manages transcription state

**4. State Management (Zustand)**
- `useRecordingStore` - Recording state (status, language, partial segments)
- `useNotesStore` - Notes list state (if needed)
- Lightweight, performant state management

---

## 📁 Project Structure

```
note-insight/
├── app/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx                    # Root component
│   │   │   ├── navigation/
│   │   │   │   ├── RootNavigator.tsx      # Stack navigator
│   │   │   │   └── MainTabs.tsx           # Tab navigator
│   │   │   └── store/
│   │   │       ├── useRecordingStore.ts   # Recording state
│   │   │       └── useNotesStore.ts       # Notes state
│   │   ├── features/
│   │   │   ├── record/
│   │   │   │   └── RecordScreen.tsx       # Recording interface
│   │   │   ├── notes/
│   │   │   │   └── NotesListScreen.tsx    # Notes list
│   │   │   ├── noteDetail/
│   │   │   │   ├── NoteDetailScreen.tsx   # Note detail container
│   │   │   │   ├── TranscriptTab.tsx      # Transcript view
│   │   │   │   └── InsightsTab.tsx        # Insights view
│   │   │   └── settings/
│   │   │       └── SettingsScreen.tsx     # Settings (placeholder)
│   │   └── services/
│   │       ├── models/
│   │       │   └── types.ts               # TypeScript interfaces
│   │       ├── native/
│   │       │   └── TranscriptionNative.ts # Native module bridge
│   │       ├── storage/
│   │       │   ├── db.ts                  # Database & migrations
│   │       │   ├── notesRepo.ts           # Notes repository
│   │       │   ├── segmentsRepo.ts        # Segments repository
│   │       │   ├── insightsRepo.ts        # Insights repository
│   │       │   └── files.ts               # File operations
│   │       ├── pipeline/
│   │       │   └── TranscriptionCoordinator.ts # Transcription orchestrator
│   │       └── llm/
│   │           └── insightsGenerator.ts   # Offline insights generator
├── ios/
│   └── noteinsight/
│       ├── NativeModules/
│       │   ├── TranscriptionModule.mm     # Objective-C++ bridge
│       │   ├── TranscriptionModule.swift  # Swift bridge wrapper
│       │   ├── TranscriptionSession.swift # Core recording logic
│       │   ├── WhisperEngine.mm           # Whisper.cpp wrapper
│       │   ├── WhisperEngine.h            # Whisper header
│       │   ├── CircularBuffer.swift       # Thread-safe ring buffer
│       │   └── WavFileWriter.swift        # WAV file writer
│       ├── Resources/
│       │   └── ggml-base-q5_1.bin         # Whisper model (base)
│       └── whisper.cpp/                   # Whisper.cpp library
└── [Config Files]
    ├── app.json                           # Expo configuration
    ├── package.json                       # Dependencies
    └── tsconfig.json                      # TypeScript config
```

---

## 🗄️ Database Schema

### Schema Version: 4

**Tables:**

#### 1. `notes`
Primary table storing note metadata.

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,                    -- UUID v4
  createdAt INTEGER NOT NULL,             -- Unix timestamp (ms)
  updatedAt INTEGER NOT NULL,             -- Unix timestamp (ms)
  title TEXT NOT NULL,                    -- Note title
  durationMs INTEGER,                     -- Recording duration (ms)
  languageLock TEXT,                      -- Language: 'tr'|'en'|'auto'|'auto_tr'|'auto_en'
  audioPath TEXT,                         -- Path to WAV file
  asrModel TEXT,                          -- ASR model used (e.g., 'base_q5_1')
  llmModel TEXT,                          -- LLM model (e.g., 'local_fake_v1')
  insightsStatus TEXT                     -- 'pending'|'generated'|null
);
```

**Indexes:**
- Primary key on `id`
- Default sort: `ORDER BY updatedAt DESC`

#### 2. `segments`
Stores transcription segments (sentences/phrases).

```sql
CREATE TABLE segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  noteId TEXT NOT NULL,                   -- FK to notes.id
  startMs INTEGER NOT NULL,               -- Start time (ms)
  endMs INTEGER NOT NULL,                 -- End time (ms)
  text TEXT NOT NULL,                     -- Transcribed text
  isFinal INTEGER NOT NULL DEFAULT 0,     -- 0=partial, 1=final
  lang TEXT,                              -- Language: 'tr'|'en' (normalized)
  FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE,
  UNIQUE(noteId, startMs, endMs)          -- Prevent duplicates
);
```

**Indexes:**
- Primary key on `id`
- Foreign key on `noteId` (CASCADE delete)
- Unique index on `(noteId, startMs, endMs)`
- Index on `(noteId, startMs)` for queries

#### 3. `note_insights`
Stores AI-generated insights for notes.

```sql
CREATE TABLE note_insights (
  noteId TEXT PRIMARY KEY,                -- FK to notes.id
  language TEXT NOT NULL,                 -- Language: 'en'|'tr'
  model TEXT NOT NULL,                    -- Model identifier (e.g., 'local_fake_v1')
  summary TEXT NOT NULL,                  -- Summary text
  keyPointsJson TEXT NOT NULL,            -- JSON array of key points
  actionItemsJson TEXT NOT NULL,          -- JSON array of action items
  createdAt INTEGER NOT NULL,             -- Unix timestamp (ms)
  updatedAt INTEGER NOT NULL,             -- Unix timestamp (ms)
  FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE
);
```

**Indexes:**
- Primary key on `noteId`
- Foreign key on `noteId` (CASCADE delete)
- Index on `noteId` for queries

### Migrations

**v1 → v2:** Added unique constraint on segments (prevent duplicates)
**v2 → v3:** Set default `languageLock = 'auto'` for existing notes
**v3 → v4:** Added `note_insights` table with CASCADE delete
**Repair Function:** Recreates missing tables if schema version >= 4

---

## 🔄 Data Flow & Workflows

### Recording & Transcription Flow

```
1. User taps "Record" on RecordScreen
   ↓
2. RecordScreen creates Note in DB (with languageLock)
   ↓
3. Native: TranscriptionSession.startRecording()
   - Requests microphone permission
   - Configures AVAudioSession
   - Starts AVAudioEngine
   - Creates WavFileWriter
   - Starts partial timer (900ms interval)
   ↓
4. During Recording (Live Captions):
   - Audio buffers captured via AVAudioEngine tap
   - Converted to 16kHz mono Int16 PCM
   - Appended to CircularBuffer (6s rolling window)
   - Appended to WAV file via WavFileWriter
   - Every 900ms: Extract buffer → Temp WAV → Whisper → Emit onAsrPartial
   ↓
5. User taps "Stop"
   ↓
6. Native: TranscriptionSession.stopRecording()
   - Stops partial timer
   - Waits for pending inference
   - Stops AVAudioEngine
   - Finalizes WAV file (patches header)
   - Resets audio session
   - Returns audioPath + durationMs
   ↓
7. Native: runTranscription() (async, background)
   - Runs Whisper on full WAV file
   - Smart auto fallback if needed
   - Splits text into segments
   - Emits onAsrFinal event
   ↓
8. JS: TranscriptionCoordinator.handleFinal()
   - Inserts segments into DB
   - Updates note.updatedAt
   ↓
9. RecordScreen navigates to NoteDetailScreen
```

### Insights Generation Flow

```
1. User opens NoteDetailScreen → InsightsTab
   ↓
2. InsightsTab.loadData()
   - Fetches segments from DB
   - Joins into transcriptText
   - Fetches existing insight (if any)
   ↓
3. User taps "Generate Insights" (or "Regenerate")
   ↓
4. insightsGenerator.generateInsights()
   - Normalizes language (auto_tr → tr, auto_en → en)
   - Generates summary (first 1-2 sentences, ~180 chars)
   - Generates keyPoints (up to 5 sentences)
   - Generates actionItems (3 heuristic items)
   - Returns Insight object
   ↓
5. insightsRepo.upsertInsight()
   - Saves to note_insights table
   - Updates note.insightsStatus
   ↓
6. InsightsTab displays: Summary, Key Points, Action Items
```

---

## 🎤 Audio Pipeline (iOS Native)

### Architecture: AVAudioEngine-Only (Phase 2)

**Key Components:**

1. **AVAudioEngine**
   - Single audio source for both recording and live captions
   - Input node → Resample Mixer → Main Mixer
   - Tap installed on resample mixer (16kHz mono Float32)

2. **Audio Processing Pipeline:**
   ```
   Microphone Input (48kHz)
   → AVAudioMixerNode (resampling to 16kHz)
   → Tap Callback (on audio thread)
   → Convert Float32 → Int16
   → Dispatch to Serial Queue
   → Append to WavFileWriter
   → Append to CircularBuffer (for partials)
   ```

3. **WavFileWriter**
   - Writes continuous PCM data to WAV file
   - Manages WAV header (writes placeholder, patches on finish)
   - Thread-safe file operations

4. **CircularBuffer**
   - Thread-safe ring buffer for rolling audio window
   - Stores last 6 seconds of audio (16kHz mono Int16)
   - Used for partial transcription

### Live Captions (Partial Transcription)

**Configuration:**
- Interval: 900ms
- Window: 6 seconds (rolling)
- Min samples: 1 second (16000 samples)
- Max segments: 10 per partial
- Deduplication: Only emit if text changes by >= 3 chars

**Flow:**
1. Timer fires every 900ms
2. Extract last 6 seconds from CircularBuffer
3. Write temp WAV file
4. Run Whisper inference (with language lock)
5. Build segments from result
6. Emit `onAsrPartial` event (if text changed)
7. Cleanup temp WAV file

**Language Locking:**
- If user selected "en" or "tr": Force that language always
- If user selected "auto":
  - Attempt auto detection
  - If confidence >= 0.80 and detected in {en, tr}: Lock to auto_en/auto_tr
  - Use locked language for subsequent partials

### Smart Auto Fallback

**For Final Transcription (when languageMode == "auto"):**

1. Run Whisper with "auto" mode
2. If returns 0 segments OR empty text:
   - Check detected language and probability
   - If detected in {tr, en} with p >= 0.45: Force that language directly
   - If p >= 0.80: Always force (skip running both)
   - Otherwise: Run both "tr" and "en" transcriptions
3. If running both:
   - Score both transcripts using quality scoring algorithm
   - Choose transcript with higher score
4. Set languageLock: `auto_en` or `auto_tr`
5. Normalize segment.lang to "tr" or "en"

**Quality Scoring Algorithm:**
```javascript
wordCount = min(transcript.split(' ').length, 80)
uniqueWordRatio = uniqueWords / totalWords
maxSentenceRepeat = count of repeated sentences
repeatPenalty = maxSentenceRepeat * 10
nonsensePenalty = count of nonsensical patterns * 5
languageHintBonus = language-specific word/letter count bonuses

finalScore = wordCount + languageHintBonus - repeatPenalty - nonsensePenalty
```

---

## 🤖 Whisper Integration

### Model
- **Model:** `ggml-base-q5_1.bin` (Whisper Base, quantized Q5_1)
- **Size:** ~59 MB
- **Languages:** 99 languages supported (primary: English, Turkish)
- **Performance:** ~1-2x real-time on Apple A17 Pro (Metal GPU)

### Integration Points

**Native iOS (`WhisperEngine.mm`):**
- Wraps Whisper.cpp C API
- Loads model on initialization
- Provides transcription interface:
  ```swift
  transcribe(wavPath: String, language: String) -> WhisperTranscriptionResult
  ```
- Returns: text, segments, detected language, probability

**Features:**
- GPU acceleration (Metal)
- Language auto-detection
- Forced language mode
- Segment-level timestamps
- Confidence scores

---

## 📱 Screens & Navigation

### Navigation Structure

```
RootNavigator (Stack)
├── MainTabs (Tab Navigator)
│   ├── Record Tab → RecordScreen
│   ├── Notes Tab → NotesListScreen
│   └── Settings Tab → SettingsScreen
└── NoteDetail (Stack Screen)
    └── NoteDetailScreen (Material Top Tabs)
        ├── Transcript Tab → TranscriptTab
        └── Insights Tab → InsightsTab
```

### Screen Details

#### RecordScreen
**Purpose:** Main recording interface
**Features:**
- Large record/stop button
- Language selector (Auto, TR, EN)
- Live captions display (while recording)
- Status indicators
- Navigation to NoteDetail after recording

#### NotesListScreen
**Purpose:** List of all recorded notes
**Features:**
- Scrollable list with note metadata
- Language badges (TR, EN, AUTO)
- Duration display
- Swipe-to-delete with confirmation
- Tap to open NoteDetail

#### NoteDetailScreen
**Purpose:** Container for note detail tabs
**Features:**
- Material top tabs (Transcript, Insights)
- Language badge in header
- Back navigation

#### TranscriptTab
**Purpose:** Display transcript and audio playback
**Features:**
- List of transcript segments with timestamps
- Audio playback controls (Play/Pause)
- Status indicators (Loading, Playing, Paused)
- File existence check (handles missing files gracefully)

#### InsightsTab
**Purpose:** Display and generate AI insights
**Features:**
- Generate Insights button (if no insights)
- Regenerate button (if insights exist)
- Loading spinner during generation
- Display: Summary, Key Points, Action Items
- Language-aware content

---

## 🔧 Configuration & Constants

### Recording Configuration
```typescript
// Partial transcription
partialIntervalMs: 900        // Timer interval (ms)
rollingWindowSec: 6           // Audio window size (seconds)
minPartialChars: 3            // Min text change to emit
maxPartialSegments: 10        // Max segments per partial

// Audio format
sampleRate: 16000             // Hz (Whisper requirement)
channels: 1                   // Mono
bitDepth: 16                  // Bits per sample
```

### Language Settings
```typescript
Supported Languages: ['en', 'tr']
Auto-detect Languages: ['en', 'tr']
Language Lock Values: ['tr', 'en', 'auto', 'auto_tr', 'auto_en']
Segment Lang Values: ['tr', 'en'] // Normalized
```

### Smart Auto Fallback Thresholds
```typescript
forceThreshold: 0.45          // Force language if p >= this
lockThreshold: 0.80           // Lock language if p >= this
```

### Database
```typescript
DB_NAME: 'noteinsight.db'
SCHEMA_VERSION: 4
Foreign Keys: Enabled (PRAGMA foreign_keys = ON)
```

---

## 🔐 Permissions & Privacy

### iOS Permissions

**Required:**
- `NSMicrophoneUsageDescription` - For audio recording
- Privacy manifest file (`PrivacyInfo.xcprivacy`)

**No External Services:**
- All processing is on-device
- No network requests (offline-first)
- No user data collection
- Audio files stored locally only

---

## 📦 Dependencies

### Core Dependencies

**React Native & Navigation:**
- `react-native`: 0.81.5
- `react`: 19.1.0
- `@react-navigation/*`: 7.x
- `react-native-gesture-handler`: 2.28.0
- `react-native-screens`: 4.16.0
- `react-native-safe-area-context`: 5.6.0

**Expo:**
- `expo`: ~54.0.31
- `expo-sqlite`: ~16.0.10
- `expo-av`: ~16.0.8
- `expo-dev-client`: ~6.0.20

**State Management:**
- `zustand`: 5.0.9

**Native Libraries:**
- `whisper.cpp` (embedded)
- Metal framework (GPU acceleration)
- AVFoundation (Audio)

---

## 🎨 UI/UX Design

### Design Principles
- **iOS Design Guidelines** - Native feel
- **Clean & Minimal** - Focus on content
- **Accessible** - Clear labels, readable text
- **Responsive** - Works on different screen sizes

### Key UI Components
- Material Design tabs (Material Top Tabs)
- Native iOS tabs (Bottom Tab Navigator)
- Swipeable rows (react-native-gesture-handler)
- Audio player controls
- Status indicators
- Language badges

### Color Scheme
- Primary: `#007AFF` (iOS Blue)
- Text: `#333` (Dark), `#666` (Medium), `#888` (Light)
- Background: `#fff` (White), `#f8f8f8` (Light Gray)
- Border: `#e0e0e0` (Light Gray)

---

## 🚀 Build & Deployment

### Development
```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator/device
```

### iOS Build Requirements
- Xcode 15+
- iOS 13.0+ deployment target
- CocoaPods (for native dependencies)
- Whisper model file (bundled)

### Project Configuration
- **Bundle ID:** `com.furkanbrgl.note-insight`
- **Platform:** iOS (primary), Android (configured but not implemented)
- **Expo SDK:** 54
- **New Architecture:** Enabled

---

## 🧪 Testing Strategy

### Manual Testing
- Recording in different languages
- Live captions accuracy
- Audio playback quality
- Insights generation
- Swipe-to-delete
- File error handling

### Test Scenarios
1. Basic recording (en/tr/auto)
2. Live captions during recording
3. Short recordings (< 1 second)
4. Long recordings (> 1 minute)
5. Language auto-detection
6. Insights generation/regeneration
7. Note deletion (CASCADE)
8. Missing audio file handling
9. Concurrent recording attempts
10. App state transitions (background/foreground)

---

## 🔮 Future Enhancements

### Potential Features
1. **Android Support** - Port native modules to Android
2. **Cloud Sync** - Optional cloud backup
3. **Real LLM Integration** - Replace offline generator with API
4. **Export Functionality** - Export transcripts/insights
5. **Search** - Full-text search in transcripts
6. **Tags/Labels** - Organize notes
7. **Sharing** - Share transcripts/insights
8. **Voice Commands** - Control recording with voice
9. **Noise Reduction** - Audio preprocessing
10. **Multiple Models** - Support different Whisper models

### Technical Improvements
1. **VAD (Voice Activity Detection)** - Skip silent periods in partials
2. **Adaptive Timer Interval** - Adjust based on speech rate
3. **Better Quality Scoring** - ML-based scoring
4. **Audio Compression** - Reduce file sizes
5. **Background Transcription** - Continue after app backgrounded
6. **Batch Processing** - Process multiple notes

---

## 📊 Project Statistics

- **Lines of Code:** ~5,000+ (TypeScript/JavaScript), ~2,000+ (Swift/Objective-C++)
- **Database Tables:** 3
- **Screens:** 5 main screens
- **Native Modules:** 7 Swift/Objective-C++ files
- **Repositories:** 3 (Notes, Segments, Insights)
- **State Stores:** 2 (Recording, Notes)
- **Migration Versions:** 4

---

## 📝 Notes & Considerations

### Architecture Decisions
1. **AVAudioEngine-Only:** Chose single audio source for simplicity and low latency
2. **Offline-First:** All processing on-device for privacy and performance
3. **SQLite:** Lightweight, embedded database suitable for mobile
4. **Zustand:** Simple state management (vs Redux)
5. **Expo:** Faster development, but requires dev client for native modules

### Known Limitations
1. iOS-only (Android not implemented)
2. Offline LLM is heuristic-based (not true AI)
3. Partial window limited to 6 seconds (latency vs accuracy trade-off)
4. Single Whisper model (no model selection)
5. No cloud sync or backup
6. Audio files can grow large over time (no compression)

### Performance Characteristics
- **Transcription Speed:** ~1-2x real-time (A17 Pro, Metal GPU)
- **Memory Usage:** ~150-200 MB (with Whisper model)
- **Storage:** ~1-2 MB per minute of audio (WAV, 16kHz mono)
- **Battery:** Moderate (GPU usage for transcription)

---

## 📚 Documentation Files

- `SESSION_SUMMARY.md` - Detailed summary of recent session work
- `TESTING_CHECKLIST.md` - Comprehensive testing guide
- `PROJECT_SUMMARY.md` - This document (overall project summary)

---

## 🔗 External Resources

- **Whisper.cpp:** https://github.com/ggerganov/whisper.cpp
- **Expo Documentation:** https://docs.expo.dev/
- **React Navigation:** https://reactnavigation.org/
- **Zustand:** https://github.com/pmndrs/zustand

---

## 👥 Development

**Project Name:** Note Insight
**Version:** 1.0.0
**Platform:** iOS (Primary), Android (Configured)
**License:** Private

---

*Last Updated: Current Session*
*Schema Version: 4*

