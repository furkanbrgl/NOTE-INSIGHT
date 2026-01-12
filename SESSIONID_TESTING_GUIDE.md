# SessionId Gating Testing Guide

This guide helps you verify that sessionId gating is working correctly to prevent stale events from corrupting the UI or database.

## Prerequisites

- App is built and running on iOS device/simulator
- Console logs are visible (Xcode console or Metro bundler)
- You can trigger recordings and stop them

## Test Scenarios

### Test 1: Basic Functionality (Recording Still Works)

**Goal**: Verify that sessionId doesn't break existing functionality.

**Steps**:
1. Start a recording
2. Speak for 5-10 seconds
3. Stop the recording
4. Verify transcript appears in NoteDetail

**Expected Logs** (look for sessionId in logs):
```
[RecordScreen] Recording started: <noteId>, sessionId: <sessionId>
[TranscriptionModule] startRecording called: <noteId>, sessionId: <sessionId>
[TranscriptionNative] onAsrPartial received
[TranscriptionCoordinator] handleFinal for noteId: <noteId>, sessionId: <sessionId>
```

**Success Criteria**:
- ✅ Recording starts and stops successfully
- ✅ Live captions appear during recording
- ✅ Final transcript is saved to database
- ✅ All logs include sessionId values

---

### Test 2: SessionId Propagation (Verify sessionId is included in all events)

**Goal**: Verify that sessionId is included in all emitted events.

**Steps**:
1. Start a recording
2. Watch console logs for partial events
3. Stop recording
4. Watch console logs for final event

**Expected Logs**:

**During Recording (Partial Events)**:
```
[TranscriptionNative] onAsrPartial received
[TranscriptionSession] Emitted onAsrPartial with X segments, languageLock: ...
```
Note: Check that `onAsrPartial` events include sessionId in the payload (not logged explicitly, but verified by gating logic)

**After Stop (Final Event)**:
```
[TranscriptionCoordinator] handleFinal for noteId: <noteId>, sessionId: <sessionId>
[TranscriptionCoordinator] Inserted X final segment(s) for noteId: <noteId>
```

**Success Criteria**:
- ✅ No "Ignoring stale" logs during normal recording
- ✅ Final event includes sessionId in log
- ✅ Transcript segments are inserted into database

---

### Test 3: Stale Event Gating (Events After Stop Are Ignored) ⚠️ IMPORTANT

**Goal**: Verify that stale events (from a previous session) are rejected when sessionId doesn't match.

**Note**: This test is challenging because final transcription is usually fast. Try multiple rapid stop/start sequences to increase chances of triggering.

**Steps**:
1. Start recording #1 (note sessionId1 from logs: `sessionId: ...`)
2. Speak for 2-3 seconds (keep it short)
3. **Stop recording #1**
4. **Immediately start recording #2** (within 1-2 seconds, note sessionId2 from logs)
5. **Speak briefly in recording #2** (1-2 seconds)
6. Watch logs carefully - if final event from recording #1 arrives after recording #2 started, it should be rejected

**Expected Logs** (if stale event arrives):
```
[TranscriptionCoordinator] Ignoring stale final event - sessionId mismatch (store: <sessionId2>, event: <sessionId1>)
```

**Success Criteria**:
- ✅ If a stale final event arrives from recording #1 AFTER recording #2 started, it's logged as "Ignoring stale"
- ✅ Stale events do NOT update the UI (partialSegments remain empty/from new recording)
- ✅ Stale events do NOT insert segments into database
- ✅ Recording #2 continues normally with its own sessionId
- ✅ Only recording #2's segments appear in database (not recording #1's if it was rejected)

**Why this matters**: This is the core protection mechanism - without this, stale events from previous recordings could corrupt the current recording's state or database.

---

### Test 4: Multiple Sequential Recordings

**Goal**: Verify that each recording gets its own unique sessionId.

**Steps**:
1. Start recording #1 → note sessionId1
2. Stop recording #1 → wait for final transcription
3. Start recording #2 → note sessionId2
4. Stop recording #2 → wait for final transcription

**Expected Logs**:
```
[RecordScreen] Recording started: <noteId1>, sessionId: <sessionId1>
[TranscriptionCoordinator] handleFinal for noteId: <noteId1>, sessionId: <sessionId1>
...
[RecordScreen] Recording started: <noteId2>, sessionId: <sessionId2>
[TranscriptionCoordinator] handleFinal for noteId: <noteId2>, sessionId: <sessionId2>
```

**Success Criteria**:
- ✅ Each recording has a unique sessionId
- ✅ sessionId1 ≠ sessionId2
- ✅ Each final event matches its corresponding recording's sessionId
- ✅ No "Ignoring stale" logs

---

### Test 5: Store Reset After Stop

**Goal**: Verify that store.sessionId is reset after recording stops.

**Steps**:
1. Start recording → verify sessionId in store
2. Stop recording → verify store resets (sessionId = null)
3. If a late final event arrives, it should be ignored

**Expected Behavior**:
- After `reset()` is called in RecordScreen, `store.sessionId` should be `null`
- If a late final event arrives with sessionId1, it should be ignored because `store.sessionId` is null

**Expected Logs** (if late event arrives):
```
[TranscriptionCoordinator] Ignoring stale final event - sessionId mismatch (store: null, event: <sessionId1>)
```

**Success Criteria**:
- ✅ Store resets properly (sessionId = null)
- ✅ Late events are ignored if store.sessionId is null
- ✅ No database corruption from stale events

---

### Test 6: Partial Events During Recording

**Goal**: Verify that partial events are gated correctly during recording.

**Steps**:
1. Start recording #1
2. Speak continuously for 10+ seconds (multiple partial events)
3. Watch for partial events in console
4. Verify all partial events have matching sessionId

**Expected Logs**:
```
[TranscriptionNative] onAsrPartial received
[TranscriptionNative] onAsrPartial received
[TranscriptionNative] onAsrPartial received
```
No "Ignoring stale partial" logs during normal recording.

**Success Criteria**:
- ✅ Partial events are received and displayed in UI (live captions)
- ✅ No "Ignoring stale partial" logs during normal recording
- ✅ All partial events match the current recording's sessionId

---

## Additional Test Cases to Consider

### Test 7: Very Short Recordings
**Goal**: Verify sessionId works for very brief recordings (< 3 seconds).

**Steps**:
1. Start recording → speak for 1-2 seconds only
2. Stop recording
3. Verify sessionId was generated and final event processed

**Success Criteria**:
- ✅ SessionId is generated even for short recordings
- ✅ Final event includes correct sessionId
- ✅ Segments are inserted successfully

### Test 8: Rapid Stop/Start Sequences
**Goal**: Maximize chance of triggering stale event rejection.

**Steps**:
1. Record #1 (3 seconds) → Stop → **Immediately** start recording #2 (< 1 second gap)
2. Record #2 (3 seconds) → Stop → **Immediately** start recording #3
3. Repeat 3-4 times rapidly
4. Check logs for any "Ignoring stale" messages
5. Verify database has correct segments for each noteId

**Success Criteria**:
- ✅ Each recording gets unique sessionId
- ✅ No corruption (wrong segments in wrong notes)
- ✅ If stale events occur, they're logged and rejected

### Test 9: Partial Events During Active Recording
**Goal**: Verify partial events are NOT rejected when sessionId matches.

**Steps**:
1. Start recording
2. Speak continuously for 10+ seconds
3. Watch for partial events in logs

**Expected**: Multiple `[TranscriptionNative] onAsrPartial received` logs, NO "Ignoring stale partial" logs

**Success Criteria**:
- ✅ Partial events are received and displayed in UI
- ✅ No "Ignoring stale partial" logs during active recording
- ✅ All partial events have matching sessionId

---

## Manual Verification Checklist

### Console Log Verification
- [ ] `[RecordScreen] Recording started: <noteId>, sessionId: <sessionId>` appears on start
- [ ] `[TranscriptionModule] startRecording called: <noteId>, sessionId: <sessionId>` appears on start
- [ ] `[TranscriptionCoordinator] handleFinal for noteId: <noteId>, sessionId: <sessionId>` appears on final event
- [ ] No "Ignoring stale" logs during normal recording flow
- [ ] Each new recording gets a unique sessionId
- [ ] Final events show `(store reset, allowing final event)` when store.sessionId is null

### Functional Verification
- [ ] Recording starts successfully
- [ ] Live captions appear during recording
- [ ] Recording stops successfully
- [ ] Final transcript appears in database
- [ ] No duplicate segments in database
- [ ] UI doesn't show stale partial segments after stop
- [ ] Segments match their corresponding noteId (no cross-contamination)

### Edge Case Verification
- [ ] Stale final events (if any) are logged as "Ignoring stale"
- [ ] Store.sessionId resets properly after stop
- [ ] Multiple sequential recordings each get unique sessionIds
- [ ] Very short recordings (< 3 seconds) work correctly
- [ ] Rapid stop/start doesn't cause corruption

---

## Debugging Tips

### If you see "Ignoring stale" logs during normal recording:
- **Problem**: sessionId mismatch between store and event
- **Check**: Verify sessionId is set in store before events arrive
- **Check**: Verify events include correct sessionId from native side

### If final events aren't being inserted:
- **Check**: Verify sessionId matches in logs: `handleFinal for noteId: X, sessionId: Y`
- **Check**: Verify store.sessionId matches event.sessionId
- **Check**: Verify noteId matches

### If partial events aren't showing in UI:
- **Check**: Verify no "Ignoring stale partial" logs
- **Check**: Verify store.sessionId is set during recording
- **Check**: Verify events include sessionId in payload

---

## Expected Console Output Example

**Successful Recording Flow**:
```
[RecordScreen] Created note with languageLock: tr
[RecordScreen] Recording started: abc-123-def, sessionId: xyz-789-uvw
[TranscriptionModule] startRecording called: abc-123-def, sessionId: xyz-789-uvw
[TranscriptionNative] onAsrState received: recording
[TranscriptionNative] onAsrPartial received
[TranscriptionNative] onAsrPartial received
[RecordScreen] Stopping recording with languageLock: tr
[TranscriptionNative] stopRecording called: abc-123-def, languageLock: tr
[TranscriptionNative] onAsrState received: idle
[TranscriptionNative] onAsrFinal received
[TranscriptionCoordinator] handleFinal for noteId: abc-123-def, sessionId: xyz-789-uvw
[TranscriptionCoordinator] Inserted 3 final segment(s) for noteId: abc-123-def
```

**Stale Event Example** (should NOT happen in normal flow):
```
[TranscriptionCoordinator] Ignoring stale final event - sessionId mismatch (store: xyz-789-uvw, event: old-session-id-123)
```

---

## Quick Test Script

Run this sequence to quickly verify sessionId gating:

1. **Start recording** → Note sessionId from log
2. **Speak 5 seconds**
3. **Stop recording**
4. **Quickly start new recording** → Note new sessionId
5. **Check logs**: If old final event arrives, should see "Ignoring stale"
6. **Verify**: Only new recording's segments are in database

---

## Notes

- sessionId is a UUID generated on each recording start
- sessionId is stored in Zustand store and passed to native
- All events (partial, final, error, state) include sessionId
- TranscriptionCoordinator gates on sessionId before processing events
- Stale events are logged but ignored (no UI update, no DB insert)

