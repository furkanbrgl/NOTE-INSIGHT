//
// TranscriptionSession.swift
// Handles audio recording and Whisper transcription
//

import Foundation
import AVFoundation

@objc protocol TranscriptionSessionDelegate: AnyObject {
    func onAsrPartial(_ event: [String: Any])
    func onAsrFinal(_ event: [String: Any])
    func onAsrState(_ event: [String: Any])
}

@objc class TranscriptionSession: NSObject {
    weak var delegate: TranscriptionSessionDelegate?
    
    // Current session state
    private var noteId: String?
    private var sessionId: String?
    private var languageMode: String = "auto"
    private var languageLock: String?
    private var asrModel: String = "base_q5_1"
    private var isRecording: Bool = false
    
    // Audio components (Phase 2: AVAudioEngine only)
    private var audioEngine: AVAudioEngine?
    private var resampleMixer: AVAudioMixerNode?
    private var wavWriter: WavFileWriter?
    private var audioFilePath: URL?
    private let audioProcessingQueue = DispatchQueue(label: "com.noteinsight.audio.processing", qos: .userInitiated)
    private var totalFramesWritten: Int64 = 0 // Track total frames at 16kHz for duration calculation
    
    // Partial transcription
    private var pcmBuffer: CircularBuffer?
    private var partialTimer: DispatchSourceTimer?
    private var lastEmittedPartialText: String = ""
    private var isPartialInferenceRunning: Bool = false
    
    // Configuration
    private let partialIntervalMs: Int = 900
    private let rollingWindowSec: Int = 6
    private let minPartialChars: Int = 3
    private let maxPartialSegments: Int = 10
    
    // Whisper
    private var isWhisperModelLoaded: Bool = false
    
    override init() {
        super.init()
        print("[TranscriptionSession] *** INITIALIZED ***")
        loadWhisperModel()
    }
    
    // MARK: - Public Properties
    
    @objc var currentStatus: String {
        return isRecording ? "recording" : "idle"
    }
    
    @objc var currentNoteId: String? {
        return noteId
    }
    
    @objc var currentLanguageMode: String {
        return languageMode
    }
    
    @objc var currentLanguageLock: String? {
        return languageLock
    }
    
    // MARK: - Whisper Model Loading
    
    private func loadWhisperModel() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let modelName = "ggml-base-q5_1.bin"
            guard let modelPath = Bundle.main.path(forResource: "ggml-base-q5_1", ofType: "bin") else {
                print("[TranscriptionSession] Model file not found in bundle")
                return
            }
            
            print("[TranscriptionSession] Using whisper model: \(modelName)")
            print("[TranscriptionSession] Loading from: \(modelPath)")
            
            let success = WhisperEngine.shared().loadModel(modelPath)
            self.isWhisperModelLoaded = success
            print("[TranscriptionSession] Whisper model loaded: \(success)")
        }
    }
    
    // MARK: - Audio Directory
    
    private func getAudioDirectory() -> URL? {
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        let audioURL = documentsURL.appendingPathComponent("Audio", isDirectory: true)
        
        if !FileManager.default.fileExists(atPath: audioURL.path) {
            try? FileManager.default.createDirectory(at: audioURL, withIntermediateDirectories: true, attributes: nil)
        }
        
        return audioURL
    }
    
    private func getAudioFilePath(noteId: String) -> URL? {
        guard let audioDir = getAudioDirectory() else { return nil }
        return audioDir.appendingPathComponent("\(noteId).wav")
    }
    
    // MARK: - Audio Session Setup
    
    private func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted:
            completion(true)
        case .denied:
            completion(false)
        case .undetermined:
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                completion(granted)
            }
        @unknown default:
            completion(false)
        }
    }
    
    private func setupAudioSession() -> Bool {
        do {
            let session = AVAudioSession.sharedInstance()
            // Use .playAndRecord with .default mode (not .spokenAudio) to avoid affecting playback volume
            // Output is muted via mainMixerNode.outputVolume = 0.0
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth])
            try session.setActive(true)
            print("[TranscriptionSession] Audio session configured successfully")
            return true
        } catch {
            print("[TranscriptionSession] Failed to configure audio session: \(error)")
            return false
        }
    }
    
    private func resetAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            // Simply deactivate to let expo-av configure it fresh for playback
            // Don't change category - let expo-av handle it
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            print("[TranscriptionSession] Audio session deactivated for playback")
        } catch {
            print("[TranscriptionSession] Failed to deactivate audio session: \(error)")
        }
    }
    
    // MARK: - Recording Control
    
    @objc func startRecording(noteId: String, sessionId: String, languageMode: String, asrModel: String) {
        guard !isRecording else {
            print("[TranscriptionSession] Already recording")
            return
        }
        
        self.noteId = noteId
        self.sessionId = sessionId
        self.languageMode = languageMode
        self.asrModel = asrModel
        self.languageLock = nil
        self.isRecording = true
        
        requestMicrophonePermission { [weak self] granted in
            guard let self = self, granted else {
                print("[TranscriptionSession] Microphone permission denied")
                self?.isRecording = false
                return
            }
            
            print("[TranscriptionSession] Microphone permission: granted")
            
            guard self.setupAudioSession() else {
                self.isRecording = false
                return
            }
            
            guard let wavURL = self.getAudioFilePath(noteId: noteId) else {
                print("[TranscriptionSession] Failed to get audio file path")
                self.isRecording = false
                return
            }
            
            self.audioFilePath = wavURL
            print("[TranscriptionSession] Recording will start to path: \(wavURL.path)")
            
            // Create WAV writer
            self.wavWriter = WavFileWriter(url: wavURL, sampleRate: 16000, channels: 1, bitsPerSample: 16)
            if self.wavWriter == nil {
                print("[TranscriptionSession] Failed to create WAV writer")
                self.isRecording = false
                return
            }
            print("[TranscriptionSession] WAV file writer created")
            
            // Setup audio engine
            self.setupAudioEngine()
        }
    }
    
    private func setupAudioEngine() {
        guard let wavWriter = wavWriter else { return }
        
        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        
        print("[TranscriptionSession] Input format: \(inputFormat.sampleRate)Hz, \(inputFormat.channelCount) channels")
        
        // Create circular buffer for partials (6 seconds at 16kHz = 96000 samples)
        let bufferCapacity = 16000 * rollingWindowSec
        pcmBuffer = CircularBuffer(capacity: bufferCapacity)
        lastEmittedPartialText = ""
        totalFramesWritten = 0 // Reset frame counter
        
        // Create resample mixer node
        let mixer = AVAudioMixerNode()
        engine.attach(mixer)
        self.resampleMixer = mixer
        
        // Connect inputNode -> resampleMixer (same format)
        engine.connect(inputNode, to: mixer, format: inputFormat)
        
        // Create 16kHz mono Float32 output format
        guard let outputFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false) else {
            print("[TranscriptionSession] Failed to create output format")
            isRecording = false
            return
        }
        
        // Connect resampleMixer -> mainMixerNode (16kHz format - engine will resample)
        // Note: This connection is needed for the engine to run, but we'll mute output to prevent feedback
        engine.connect(mixer, to: engine.mainMixerNode, format: outputFormat)
        
        // Mute mainMixerNode output to prevent feedback loop
        engine.mainMixerNode.outputVolume = 0.0
        
        print("[TranscriptionSession] Output format: \(outputFormat.sampleRate)Hz, \(outputFormat.channelCount) channels, Float32")
        
        // Install tap on resampleMixer with 16kHz format
        let bufferSize: AVAudioFrameCount = 4096
        mixer.installTap(onBus: 0, bufferSize: bufferSize, format: outputFormat) { [weak self] (buffer, time) in
            guard let self = self, self.isRecording else { return }
            
            let frameCount = Int(buffer.frameLength)
            guard frameCount > 0 else { return }
            
            // Convert Float32 → Int16
            guard let floatChannelData = buffer.floatChannelData else { return }
            let floatData = floatChannelData[0] // First (and only) channel
            var int16Samples = [Int16](repeating: 0, count: frameCount)
            for i in 0..<frameCount {
                let floatValue = floatData[i]
                let clamped = max(-1.0, min(1.0, floatValue))
                int16Samples[i] = Int16(clamped * 32767.0)
            }
            
            // Append to circular buffer (thread-safe, can do on tap thread)
            self.pcmBuffer?.append(contentsOf: int16Samples)
            
            // Write to WAV on serial queue (track frames for duration calculation)
            self.audioProcessingQueue.async {
                guard self.isRecording else { return }
                wavWriter.append(samples: int16Samples)
                self.totalFramesWritten += Int64(frameCount)
            }
        }
        
        // Start engine
        do {
            try engine.start()
            self.audioEngine = engine
            print("[TranscriptionSession] AVAudioEngine started for live captions")
        } catch {
            print("[TranscriptionSession] Failed to start audio engine: \(error)")
            isRecording = false
            return
        }
        
        // Start partial timer
        startPartialTimer()
        
        print("[TranscriptionSession] Started recording: \(noteId), model: base_q5_1")
        emitState()
    }
    
    private func startPartialTimer() {
        stopPartialTimer()
        
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .userInitiated))
        timer.schedule(deadline: .now() + .milliseconds(partialIntervalMs),
                       repeating: .milliseconds(partialIntervalMs))
        
        timer.setEventHandler { [weak self] in
            self?.processPartialBuffer()
        }
        
        timer.resume()
        self.partialTimer = timer
        print("[TranscriptionSession] Started partial timer (DispatchSource, \(partialIntervalMs)ms)")
    }
    
    private func stopPartialTimer() {
        partialTimer?.cancel()
        partialTimer = nil
        print("[TranscriptionSession] Stopped partial timer")
    }
    
    private func processPartialBuffer() {
        guard isRecording, !isPartialInferenceRunning else { return }
        guard let buffer = pcmBuffer else { return }
        
        let sampleCount = buffer.getCount()
        let minSamples = 16000 // 1 second at 16kHz
        
        guard sampleCount >= minSamples else {
            return
        }
        
        // Skip if inference already running
        isPartialInferenceRunning = true
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            defer { self?.isPartialInferenceRunning = false }
            guard let self = self, self.isRecording else { return }
            
            // Get snapshot (last rollingWindowSec seconds)
            let maxSamples = 16000 * self.rollingWindowSec
            let samples = buffer.getSnapshot(maxSamples: maxSamples)
            
            guard samples.count >= minSamples else { return }
            
            // Create temp WAV file
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("tmp_partial_\(self.noteId ?? "unknown").wav")
            
            // Remove existing temp file
            try? FileManager.default.removeItem(at: tempURL)
            
            // Write WAV header + samples
            let dataSize = UInt32(samples.count * 2)
            let header = createWavHeaderForPartial(dataSize: dataSize, sampleRate: 16000, channels: 1, bitsPerSample: 16)
            
            var wavData = Data()
            wavData.append(header)
            let sampleData = samples.withUnsafeBufferPointer { ptr in
                Data(buffer: ptr)
            }
            wavData.append(sampleData)
            
            do {
                try wavData.write(to: tempURL)
            } catch {
                print("[TranscriptionSession] Failed to write temp WAV: \(error)")
                return
            }
            
            // Run Whisper
            let languageToUse = self.getLanguageForPartial()
            var result = WhisperEngine.shared().transcribe(tempURL.path, language: languageToUse)
            var finalText = result.text
            var finalLang = languageToUse
            
            // Smart Auto Fallback for partials: If auto returns empty, try forcing detected language
            if languageMode == "auto" && finalText.isEmpty && result.error == nil {
                let detectedLang = result.detectedLanguage
                let detectedProb = result.detectedProbability
                
                // If detected tr/en with confidence >= 0.45, force that language
                if let lang = detectedLang, (lang == "tr" || lang == "en"), detectedProb >= 0.45 {
                    print("[TranscriptionSession] [Partial] Auto empty, forcing \(lang) (p=\(String(format: "%.4f", detectedProb)))")
                    let forcedResult = WhisperEngine.shared().transcribe(tempURL.path, language: lang)
                    if forcedResult.error == nil && !forcedResult.text.isEmpty {
                        result = forcedResult
                        finalText = forcedResult.text
                        finalLang = lang
                        // Lock language if confidence is high
                        if detectedProb >= 0.80 {
                            self.languageLock = "auto_\(lang)"
                            print("[TranscriptionSession] [Partial] Locked to auto_\(lang)")
                        }
                    }
                }
            }
            
            // Cleanup temp file
            try? FileManager.default.removeItem(at: tempURL)
            
            guard result.error == nil, !finalText.isEmpty else { return }
            
            // Build segments
            let segments = self.buildSegmentsFromText(finalText, durationMs: self.rollingWindowSec * 1000, lang: self.normalizeSegmentLang(finalLang == "auto" ? (self.languageLock ?? "en") : finalLang))
            let limitedSegments = Array(segments.prefix(self.maxPartialSegments))
            
            // Check if text changed enough
            let joinedText = limitedSegments.map { $0["text"] as? String ?? "" }.joined(separator: " ").trimmingCharacters(in: .whitespaces)
            let diff = abs(joinedText.count - self.lastEmittedPartialText.count)
            
            if diff >= self.minPartialChars || !joinedText.hasPrefix(self.lastEmittedPartialText) {
                self.lastEmittedPartialText = joinedText
                
                // Determine language lock for event (use locked language if available)
                let eventLanguageLock: String
                if let lock = self.languageLock {
                    eventLanguageLock = lock
                } else if self.languageMode == "auto", let detectedLang = result.detectedLanguage, (detectedLang == "tr" || detectedLang == "en") {
                    // If not locked yet but we have a detection, use auto_<lang>
                    eventLanguageLock = "auto_\(detectedLang)"
                } else {
                    eventLanguageLock = self.languageMode
                }
                
                // Emit partial
                let event: [String: Any] = [
                    "noteId": self.noteId ?? "",
                    "sessionId": self.sessionId ?? "",
                    "segments": limitedSegments,
                    "languageLock": eventLanguageLock
                ]
                
                DispatchQueue.main.async {
                    self.delegate?.onAsrPartial(event)
                }
            }
        }
    }
    
    private func getLanguageForPartial() -> String {
        if let lock = languageLock {
            if lock == "auto_tr" { return "tr" }
            if lock == "auto_en" { return "en" }
            if lock == "tr" || lock == "en" { return lock }
        }
        return languageMode == "auto" ? "auto" : languageMode
    }
    
    private func waitForAudioProcessingQueue() {
        audioProcessingQueue.sync {
            // All pending writes are flushed
        }
    }
    
    private func waitForPartialInferenceToComplete(timeoutMs: Int = 5000) {
        let timeout = Date().addingTimeInterval(TimeInterval(timeoutMs) / 1000.0)
        while isPartialInferenceRunning && Date() < timeout {
            Thread.sleep(forTimeInterval: 0.05) // 50ms
        }
        if isPartialInferenceRunning {
            print("[TranscriptionSession] Warning: Partial inference did not complete within timeout")
        }
    }
    
    @objc func stopRecording(languageLock: String) -> [String: Any] {
        guard isRecording, let currentNoteId = noteId else {
            return ["audioPath": "", "durationMs": 0, "languageLock": languageLock]
        }
        
        isRecording = false
        stopPartialTimer()
        
        // Wait for any ongoing partial inference to complete
        waitForPartialInferenceToComplete()
        
        // Stop audio engine
        resampleMixer?.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
        resampleMixer = nil
        print("[TranscriptionSession] AVAudioEngine stopped")
        
        // Wait for all pending audio processing
        waitForAudioProcessingQueue()
        
        // Reset audio session for playback
        resetAudioSession()
        
        // Finalize WAV file
        guard let wavWriter = wavWriter, let filePath = audioFilePath else {
            print("[TranscriptionSession] No WAV writer or file path")
            return ["audioPath": "", "durationMs": 0, "languageLock": languageLock]
        }
        
        let finalizedURL = wavWriter.finish()
        self.wavWriter = nil
        
        // Calculate duration from total frames written (more accurate than Date)
        let durationSec = Double(totalFramesWritten) / 16000.0
        let durationMs = Int(durationSec * 1000.0)
        
        print("[TranscriptionSession] Stopped recording, duration: \(durationMs)ms, path: \(filePath.path)")
        print("[TranscriptionSession] Language lock for transcription: \(languageLock)")
        
        self.languageLock = languageLock
        emitState()
        
        // Run full transcription
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            self.runTranscription(noteId: currentNoteId, audioPath: finalizedURL.path, durationMs: durationMs, languageMode: languageLock)
        }
        
        return [
            "audioPath": finalizedURL.path,
            "durationMs": durationMs,
            "languageLock": languageLock
        ]
    }
    
    private func stopAudioEngine() {
        resampleMixer?.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
        resampleMixer = nil
        wavWriter = nil
        audioFilePath = nil
        pcmBuffer = nil
        isPartialInferenceRunning = false
    }
    
    // MARK: - Transcription
    
    private func runTranscription(noteId: String, audioPath: String, durationMs: Int, languageMode: String) {
        guard !noteId.isEmpty, !audioPath.isEmpty, durationMs > 0 else {
            print("[TranscriptionSession] Invalid transcription parameters")
            return
        }
        
        guard isWhisperModelLoaded else {
            print("[TranscriptionSession] Whisper model not loaded")
            emitTranscriptionError(noteId: noteId, durationMs: durationMs, error: "Whisper model not loaded")
            return
        }
        
        print("[TranscriptionSession] Running whisper transcription on: \(audioPath)")
        print("[TranscriptionSession] Language lock: \(languageMode)")
        
        let languageToUse: String
        if languageMode == "auto" {
            languageToUse = "auto"
        } else if languageMode == "auto_tr" {
            languageToUse = "tr"
        } else if languageMode == "auto_en" {
            languageToUse = "en"
        } else {
            languageToUse = languageMode
        }
        
        print("[TranscriptionSession] Using forced language: \(languageToUse)")
        
        let result = WhisperEngine.shared().transcribe(audioPath, language: languageToUse)
        
        if let error = result.error {
            print("[TranscriptionSession] Transcription error: \(error.localizedDescription)")
            emitTranscriptionError(noteId: noteId, durationMs: durationMs, error: error.localizedDescription)
            return
        }
        
        var text = result.text
        var finalLanguageLock = languageMode
        
        // Smart Auto Fallback: If auto returns 0 segments OR empty text
        if languageMode == "auto" {
            let detectedLang = result.detectedLanguage
            let detectedProb = result.detectedProbability
            
            print("[TranscriptionSession] Auto detection: lang=\(detectedLang ?? "nil"), p=\(String(format: "%.4f", detectedProb))")
            
            // If high confidence (>= 0.45) and detected in {en,tr}, force that language directly
            if let lang = detectedLang, (lang == "tr" || lang == "en"), detectedProb >= 0.45 {
                if text.isEmpty {
                    // Even with high confidence, if empty, try forced language
                    print("[TranscriptionSession] Auto detected \(lang) with p=\(String(format: "%.4f", detectedProb)), but text empty. Forcing \(lang)...")
                    let forcedResult = WhisperEngine.shared().transcribe(audioPath, language: lang)
                    if forcedResult.error == nil && !forcedResult.text.isEmpty {
                        text = forcedResult.text
                        finalLanguageLock = "auto_\(lang)"
                        print("[TranscriptionSession] Forced \(lang) transcription successful")
                    } else {
                        // Fallback: run both tr and en
                        print("[TranscriptionSession] Forced \(lang) also failed, running both tr and en...")
                        let (chosenText, chosenLang) = runAutoFallback(audioPath: audioPath, detectedLang: lang, detectedProb: detectedProb)
                        text = chosenText
                        finalLanguageLock = chosenLang
                    }
                } else {
                    // Text is not empty, use it
                    if detectedProb >= 0.80 {
                        finalLanguageLock = "auto_\(lang)"
                        print("[TranscriptionSession] Forcing \(lang) due to high confidence (p >= 0.80)")
                    } else {
                        finalLanguageLock = "auto_\(lang)"
                    }
                }
            } else if text.isEmpty {
                // Auto returned empty text, run both tr and en
                print("[TranscriptionSession] Auto returned empty text, running both tr and en...")
                let (chosenText, chosenLang) = runAutoFallback(audioPath: audioPath, detectedLang: detectedLang, detectedProb: detectedProb)
                text = chosenText
                finalLanguageLock = chosenLang
            } else {
                // Auto returned text, use it
                if let lang = detectedLang, (lang == "tr" || lang == "en"), detectedProb >= 0.45 {
                    finalLanguageLock = "auto_\(lang)"
                }
            }
        }
        
        guard !text.isEmpty else {
            print("[TranscriptionSession] Transcription returned empty text after fallback")
            emitTranscriptionError(noteId: noteId, durationMs: durationMs, error: "Empty transcription")
            return
        }
        
        print("[TranscriptionSession] Direct transcription complete, text: \(text)")
        
        print("[TranscriptionSession] Final transcription: \(text)")
        print("[TranscriptionSession] Final language lock: \(finalLanguageLock)")
        
        // Split into sentences and create segments
        let sentences = splitIntoSentences(text)
        let segments = createSegmentsWithTimestamps(sentences: sentences, durationMs: durationMs, lang: normalizeSegmentLang(finalLanguageLock))
        
        print("[TranscriptionSession] Split into \(segments.count) segments")
        
        // Emit final
        let event: [String: Any] = [
            "noteId": noteId,
            "sessionId": self.sessionId ?? "",
            "segments": segments,
            "languageLock": finalLanguageLock
        ]
        
        DispatchQueue.main.async {
            print("[TranscriptionSession] Emitted onAsrFinal with \(segments.count) segments, languageLock: \(finalLanguageLock)")
            self.delegate?.onAsrFinal(event)
        }
    }
    
    private func emitTranscriptionError(noteId: String, durationMs: Int, error: String) {
        let event: [String: Any] = [
            "noteId": noteId,
            "sessionId": self.sessionId ?? "",
            "durationMs": durationMs,
            "error": error,
            "segments": [] as [[String: Any]] // Include empty segments array to prevent JS TypeError
        ]
        
        DispatchQueue.main.async {
            self.delegate?.onAsrFinal(event)
        }
    }
    
    // MARK: - Smart Auto Fallback
    
    private func runAutoFallback(audioPath: String, detectedLang: String?, detectedProb: Float) -> (text: String, languageLock: String) {
        print("[TranscriptionSession] Running auto fallback: running both tr and en...")
        
        // Run both tr and en
        let trResult = WhisperEngine.shared().transcribe(audioPath, language: "tr")
        let enResult = WhisperEngine.shared().transcribe(audioPath, language: "en")
        
        let trText = trResult.error == nil ? trResult.text : ""
        let enText = enResult.error == nil ? enResult.text : ""
        
        print("[TranscriptionSession] TR transcript: \(trText.isEmpty ? "(empty)" : String(trText.prefix(50)))")
        print("[TranscriptionSession] EN transcript: \(enText.isEmpty ? "(empty)" : String(enText.prefix(50)))")
        
        // If one is empty, choose the other
        if trText.isEmpty && !enText.isEmpty {
            print("[TranscriptionSession] TR empty, choosing EN")
            return (enText, "auto_en")
        }
        if enText.isEmpty && !trText.isEmpty {
            print("[TranscriptionSession] EN empty, choosing TR")
            return (trText, "auto_tr")
        }
        if trText.isEmpty && enText.isEmpty {
            print("[TranscriptionSession] Both empty, returning EN as fallback")
            return ("", "auto_en")
        }
        
        // Score both transcripts
        let trScore = computeQualityScore(text: trText, languageHint: "tr")
        let enScore = computeQualityScore(text: enText, languageHint: "en")
        
        print("[TranscriptionSession] TR score: \(trScore), EN score: \(enScore)")
        
        if trScore > enScore {
            print("[TranscriptionSession] Chose TR (score: \(trScore) > \(enScore))")
            return (trText, "auto_tr")
        } else {
            print("[TranscriptionSession] Chose EN (score: \(enScore) >= \(trScore))")
            return (enText, "auto_en")
        }
    }
    
    private func computeQualityScore(text: String, languageHint: String) -> Double {
        let words = text.lowercased().components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        let wordCount = words.count
        guard wordCount > 0 else { return 0.0 }
        
        // Unique word ratio
        let uniqueWords = Set(words)
        let uniqueWordRatio = Double(uniqueWords.count) / Double(wordCount)
        
        // Max sentence repeat (check for repeated short tokens)
        var maxRepeat = 0
        var currentRepeat = 1
        for i in 1..<words.count {
            if words[i] == words[i-1] {
                currentRepeat += 1
                maxRepeat = max(maxRepeat, currentRepeat)
            } else {
                currentRepeat = 1
            }
        }
        let repeatPenalty = Double(maxRepeat > 2 ? maxRepeat * 5 : 0)
        
        // Nonsense penalty (very short words repeated)
        var nonsenseCount = 0
        for word in words {
            if word.count <= 2 && words.filter({ $0 == word }).count > 3 {
                nonsenseCount += 1
            }
        }
        let nonsensePenalty = Double(nonsenseCount * 3)
        
        // Language hint bonus
        var languageHintBonus = 0.0
        if languageHint == "tr" {
            let turkishLetters = Set("çğışöü")
            let turkishWords = Set(["ve", "bir", "bu", "ben", "sen", "için", "değil", "şimdi", "var", "yok", "ile", "olan", "gibi", "kadar", "daha", "çok", "az", "en", "da", "de", "ki", "mi", "mı", "mu", "mü"])
            let turkishLetterCount = text.lowercased().filter { turkishLetters.contains($0) }.count
            let turkishWordCount = words.filter { turkishWords.contains($0) }.count
            languageHintBonus = Double(turkishLetterCount * 4 + turkishWordCount * 3)
        } else if languageHint == "en" {
            let englishWords = Set(["the", "and", "is", "are", "to", "of", "in", "for", "with", "i", "you", "we", "they", "this", "that", "have", "has", "had", "was", "were", "been", "be", "do", "does", "did", "will", "would", "can", "could", "should", "may", "might"])
            let englishWordCount = words.filter { englishWords.contains($0) }.count
            languageHintBonus = Double(englishWordCount * 1)
        }
        
        // Final score
        let score = min(Double(wordCount), 80.0) + languageHintBonus - repeatPenalty - nonsensePenalty
        
        return score
    }
    
    // MARK: - Helper Methods
    
    private func splitIntoSentences(_ text: String) -> [String] {
        let pattern = #"[.!?]+\s+"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return [text]
        }
        
        let nsString = text as NSString
        let matches = regex.matches(in: text, options: [], range: NSRange(location: 0, length: nsString.length))
        
        var sentences: [String] = []
        var lastIndex = text.startIndex
        
        for match in matches {
            let range = Range(match.range, in: text)!
            let sentence = String(text[lastIndex..<range.upperBound]).trimmingCharacters(in: .whitespaces)
            if !sentence.isEmpty {
                sentences.append(sentence)
            }
            lastIndex = range.upperBound
        }
        
        // Add remaining text
        if lastIndex < text.endIndex {
            let remaining = String(text[lastIndex...]).trimmingCharacters(in: .whitespaces)
            if !remaining.isEmpty {
                sentences.append(remaining)
            }
        }
        
        return sentences.isEmpty ? [text] : sentences
    }
    
    private func createSegmentsWithTimestamps(sentences: [String], durationMs: Int, lang: String) -> [[String: Any]] {
        guard !sentences.isEmpty else { return [] }
        
        let totalChars = sentences.reduce(0) { $0 + $1.count }
        guard totalChars > 0 else { return [] }
        
        var segments: [[String: Any]] = []
        var currentMs: Int = 0
        
        for sentence in sentences {
            let charRatio = Double(sentence.count) / Double(totalChars)
            let segmentDuration = Int(Double(durationMs) * charRatio)
            let segmentEndMs = min(currentMs + segmentDuration, durationMs)
            
            segments.append([
                "startMs": currentMs,
                "endMs": segmentEndMs,
                "text": sentence,
                "lang": lang
            ])
            
            currentMs = segmentEndMs
        }
        
        return segments
    }
    
    private func buildSegmentsFromText(_ text: String, durationMs: Int, lang: String) -> [[String: Any]] {
        let sentences = splitIntoSentences(text)
        return createSegmentsWithTimestamps(sentences: sentences, durationMs: durationMs, lang: lang)
    }
    
    private func normalizeSegmentLang(_ lang: String) -> String {
        if lang == "auto_tr" { return "tr" }
        if lang == "auto_en" { return "en" }
        if lang == "tr" || lang == "en" { return lang }
        return "en" // default
    }
    
    private func createWavHeaderForPartial(dataSize: UInt32, sampleRate: UInt32, channels: UInt16, bitsPerSample: UInt16) -> Data {
        var header = Data()
        
        let byteRate = sampleRate * UInt32(channels) * UInt32(bitsPerSample / 8)
        let blockAlign = channels * (bitsPerSample / 8)
        let chunkSize = 36 + dataSize
        
        // RIFF header
        header.append(contentsOf: "RIFF".utf8)
        header.append(contentsOf: withUnsafeBytes(of: chunkSize.littleEndian) { Array($0) })
        header.append(contentsOf: "WAVE".utf8)
        
        // fmt subchunk
        header.append(contentsOf: "fmt ".utf8)
        header.append(contentsOf: withUnsafeBytes(of: UInt32(16).littleEndian) { Array($0) })  // Subchunk1Size
        header.append(contentsOf: withUnsafeBytes(of: UInt16(1).littleEndian) { Array($0) })   // AudioFormat (PCM)
        header.append(contentsOf: withUnsafeBytes(of: channels.littleEndian) { Array($0) })
        header.append(contentsOf: withUnsafeBytes(of: sampleRate.littleEndian) { Array($0) })
        header.append(contentsOf: withUnsafeBytes(of: byteRate.littleEndian) { Array($0) })
        header.append(contentsOf: withUnsafeBytes(of: blockAlign.littleEndian) { Array($0) })
        header.append(contentsOf: withUnsafeBytes(of: bitsPerSample.littleEndian) { Array($0) })
        
        // data subchunk
        header.append(contentsOf: "data".utf8)
        header.append(contentsOf: withUnsafeBytes(of: dataSize.littleEndian) { Array($0) })
        
        return header
    }
    
    // MARK: - Other Methods
    
    @objc func setLanguage(mode: String) {
        self.languageMode = mode
    }
    
    @objc func getState() -> [String: Any] {
        return [
            "status": currentStatus,
            "languageMode": languageMode
        ]
    }
    
    private func emitState() {
        var event: [String: Any] = [
            "status": currentStatus,
            "noteId": noteId ?? NSNull(),
            "languageMode": languageMode,
            "languageLock": languageLock ?? NSNull()
        ]
        if let sessionId = sessionId {
            event["sessionId"] = sessionId
        }
        delegate?.onAsrState(event)
    }
}

