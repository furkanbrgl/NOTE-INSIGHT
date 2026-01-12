import Foundation
import React

@objc(TranscriptionModule)
class TranscriptionModule: RCTEventEmitter, TranscriptionSessionDelegate {
    
    private var session: TranscriptionSession?
    private var hasListeners: Bool = false
    
    override init() {
        super.init()
        print("[TranscriptionModule] *** INITIALIZED ***")
        session = TranscriptionSession()
        session?.delegate = self
    }
    
    @objc override static func moduleName() -> String! {
        return "TranscriptionModule"
    }
    
    @objc override static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    override func supportedEvents() -> [String]! {
        return ["onAsrPartial", "onAsrFinal", "onAsrState"]
    }
    
    override func startObserving() {
        hasListeners = true
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    // MARK: - Exported Methods
    
    @objc func startRecording(_ params: NSDictionary,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let noteId = params["noteId"] as? String else {
            reject("E_INVALID_PARAMS", "noteId is required", nil)
            return
        }
        
        guard let sessionId = params["sessionId"] as? String else {
            reject("E_INVALID_PARAMS", "sessionId is required", nil)
            return
        }
        
        let languageMode = params["languageMode"] as? String ?? "auto"
        let asrModel = params["asrModel"] as? String ?? "base_q5_1"
        
        if session?.currentStatus == "recording" {
            reject("E_ALREADY_RECORDING", "Already recording", nil)
            return
        }
        
        session?.startRecording(noteId: noteId, sessionId: sessionId, languageMode: languageMode, asrModel: asrModel)
        
        print("[TranscriptionModule] startRecording called: \(noteId), sessionId: \(sessionId)")
        resolve(nil)
    }
    
    @objc func stopRecording(_ params: NSDictionary,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let noteId = params["noteId"] as? String else {
            reject("E_INVALID_PARAMS", "noteId is required", nil)
            return
        }
        
        guard let sessionId = params["sessionId"] as? String else {
            reject("E_INVALID_PARAMS", "sessionId is required", nil)
            return
        }
        
        guard session?.currentNoteId == noteId else {
            reject("E_NOT_RECORDING", "Not recording this note", nil)
            return
        }
        
        let languageLock = params["languageLock"] as? String ?? "auto"
        
        // Debug log to confirm bridge is receiving correct values
        print("[TranscriptionModule] stopRecording received - noteId: \(noteId), sessionId: \(sessionId), languageLock: \(languageLock)")
        
        let result = session?.stopRecording(languageLock: languageLock) ?? [
            "audioPath": "",
            "durationMs": 0,
            "languageLock": languageLock
        ]
        
        print("[TranscriptionModule] stopRecording result: \(result)")
        resolve(result)
    }
    
    @objc func setLanguage(_ noteId: String,
                           mode: String,
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard session?.currentNoteId == noteId else {
            reject("E_NOT_RECORDING", "Not recording this note", nil)
            return
        }
        
        session?.setLanguage(mode: mode)
        
        print("[TranscriptionModule] setLanguage called: \(mode)")
        resolve(nil)
    }
    
    @objc func getState(_ noteId: String,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        let state = session?.getState() ?? [
            "status": "idle",
            "languageMode": "auto"
        ]
        
        resolve(state)
    }
    
    // MARK: - TranscriptionSessionDelegate
    
    func onAsrPartial(_ event: [String: Any]) {
        guard hasListeners else { return }
        sendEvent(withName: "onAsrPartial", body: event)
    }
    
    func onAsrFinal(_ event: [String: Any]) {
        guard hasListeners else { return }
        sendEvent(withName: "onAsrFinal", body: event)
    }
    
    func onAsrState(_ event: [String: Any]) {
        guard hasListeners else { return }
        sendEvent(withName: "onAsrState", body: event)
    }
}
