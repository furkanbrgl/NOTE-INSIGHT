#import "WhisperEngine.h"
#include <whisper/whisper.h>
#include <vector>
#include <string>

@implementation WhisperTranscriptionResult
@end

@interface WhisperEngine () {
    struct whisper_context *_ctx;
    NSString *_loadedModelPath;
}
@end

@implementation WhisperEngine

+ (instancetype)shared {
    static WhisperEngine *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[WhisperEngine alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _ctx = NULL;
        _loadedModelPath = nil;
    }
    return self;
}

- (void)dealloc {
    [self unloadModel];
}

- (BOOL)loadModel:(NSString *)modelPath {
    NSLog(@"[WhisperEngine] Loading model from: %@", modelPath);
    
    // Check if already loaded
    if (_ctx != NULL && [_loadedModelPath isEqualToString:modelPath]) {
        NSLog(@"[WhisperEngine] Model already loaded");
        return YES;
    }
    
    // Unload existing model
    [self unloadModel];
    
    // Check file exists
    if (![[NSFileManager defaultManager] fileExistsAtPath:modelPath]) {
        NSLog(@"[WhisperEngine] Model file not found at path: %@", modelPath);
        return NO;
    }
    
    // Load model
    struct whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = true;  // Use Metal/GPU if available
    
    _ctx = whisper_init_from_file_with_params([modelPath UTF8String], cparams);
    
    if (_ctx == NULL) {
        NSLog(@"[WhisperEngine] Failed to initialize whisper context");
        return NO;
    }
    
    _loadedModelPath = modelPath;
    NSLog(@"[WhisperEngine] Model loaded successfully");
    return YES;
}

- (BOOL)isModelLoaded {
    return _ctx != NULL;
}

- (void)unloadModel {
    if (_ctx != NULL) {
        NSLog(@"[WhisperEngine] Unloading model");
        whisper_free(_ctx);
        _ctx = NULL;
        _loadedModelPath = nil;
    }
}

- (WhisperTranscriptionResult *)transcribe:(NSString *)wavPath language:(NSString *)language {
    WhisperTranscriptionResult *result = [[WhisperTranscriptionResult alloc] init];
    result.text = @"";
    result.durationMs = 0;
    result.detectedLanguage = nil;
    result.detectedProbability = 0.0f;
    result.error = nil;
    
    NSLog(@"[WhisperEngine] Transcribing: %@", wavPath);
    
    // Check model loaded
    if (_ctx == NULL) {
        NSLog(@"[WhisperEngine] No model loaded");
        result.error = [NSError errorWithDomain:@"WhisperEngine"
                                           code:1
                                       userInfo:@{NSLocalizedDescriptionKey: @"No model loaded"}];
        return result;
    }
    
    // Read WAV file
    std::vector<float> pcmf32;
    if (![self readWavFile:wavPath intoPCM:pcmf32]) {
        NSLog(@"[WhisperEngine] Failed to read WAV file");
        result.error = [NSError errorWithDomain:@"WhisperEngine"
                                           code:2
                                       userInfo:@{NSLocalizedDescriptionKey: @"Failed to read WAV file"}];
        return result;
    }
    
    if (pcmf32.empty()) {
        NSLog(@"[WhisperEngine] WAV file is empty");
        result.error = [NSError errorWithDomain:@"WhisperEngine"
                                           code:3
                                       userInfo:@{NSLocalizedDescriptionKey: @"WAV file is empty"}];
        return result;
    }
    
    // Calculate duration
    int durationMs = (int)((pcmf32.size() / 16000.0f) * 1000);
    result.durationMs = durationMs;
    NSLog(@"[WhisperEngine] Audio duration: %d ms, samples: %zu", durationMs, pcmf32.size());
    
    // Check audio amplitude to verify it's not silent
    float maxAmplitude = 0.0f;
    float sumAmplitude = 0.0f;
    for (size_t i = 0; i < pcmf32.size(); i++) {
        float absVal = fabsf(pcmf32[i]);
        if (absVal > maxAmplitude) maxAmplitude = absVal;
        sumAmplitude += absVal;
    }
    float avgAmplitude = pcmf32.size() > 0 ? sumAmplitude / pcmf32.size() : 0.0f;
    NSLog(@"[WhisperEngine] Audio amplitude - max: %.6f, avg: %.6f", maxAmplitude, avgAmplitude);
    
    if (maxAmplitude < 0.001f) {
        NSLog(@"[WhisperEngine] WARNING: Audio appears to be silent!");
    }
    
    // Setup whisper parameters
    struct whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    
    wparams.print_realtime   = false;
    wparams.print_progress   = false;
    wparams.print_timestamps = false;
    wparams.print_special    = false;
    wparams.translate        = false;
    wparams.single_segment   = false;
    wparams.max_tokens       = 0;  // unlimited
    wparams.n_threads        = 4;
    
    // For auto mode, detect language with probability BEFORE whisper_full
    if ([language isEqualToString:@"auto"]) {
        // First compute mel spectrograms (required for language detection)
        NSLog(@"[WhisperEngine] Computing mel spectrograms for language detection...");
        int melRet = whisper_pcm_to_mel(_ctx, pcmf32.data(), (int)pcmf32.size(), wparams.n_threads);
        
        if (melRet == 0) {
            // Now run language detection on the computed mel spectrograms
            int maxLangId = whisper_lang_max_id();
            std::vector<float> probs(maxLangId + 1, 0.0f);
            
            // offset_ms=0 means start from beginning, n_threads for parallel processing
            int detectedId = whisper_lang_auto_detect(_ctx, 0, wparams.n_threads, probs.data());
            
            if (detectedId >= 0 && detectedId <= maxLangId) {
                result.detectedLanguage = [NSString stringWithUTF8String:whisper_lang_str(detectedId)];
                result.detectedProbability = probs[detectedId];
                NSLog(@"[WhisperEngine] Auto-detected language: %@ (p = %.6f)", result.detectedLanguage, result.detectedProbability);
            } else {
                NSLog(@"[WhisperEngine] Language detection returned invalid id: %d", detectedId);
            }
        } else {
            NSLog(@"[WhisperEngine] Failed to compute mel spectrograms: %d", melRet);
        }
        
        wparams.language = "auto";
        wparams.detect_language = true;
    } else {
        wparams.language = [language UTF8String];
        wparams.detect_language = false;
    }
    
    NSLog(@"[WhisperEngine] Running inference with language: %@", language);
    
    // Run inference
    int ret = whisper_full(_ctx, wparams, pcmf32.data(), (int)pcmf32.size());
    
    if (ret != 0) {
        NSLog(@"[WhisperEngine] Inference failed with code: %d", ret);
        result.error = [NSError errorWithDomain:@"WhisperEngine"
                                           code:4
                                       userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"Inference failed with code %d", ret]}];
        return result;
    }
    
    // Get detected language
    int langId = whisper_full_lang_id(_ctx);
    if (langId >= 0) {
        const char *langStr = whisper_lang_str(langId);
        result.detectedLanguage = [NSString stringWithUTF8String:langStr];
        NSLog(@"[WhisperEngine] Detected language: %@", result.detectedLanguage);
    }
    
    // Collect all text segments
    NSMutableString *fullText = [NSMutableString string];
    int numSegments = whisper_full_n_segments(_ctx);
    NSLog(@"[WhisperEngine] Number of segments: %d", numSegments);
    
    if (numSegments == 0) {
        NSLog(@"[WhisperEngine] WARNING: No segments returned! This often happens when:");
        NSLog(@"[WhisperEngine]   - Language auto-detection is confused");
        NSLog(@"[WhisperEngine]   - Audio contains only silence/noise");
        NSLog(@"[WhisperEngine]   - Try forcing a specific language instead of 'auto'");
    }
    
    for (int i = 0; i < numSegments; i++) {
        const char *segmentText = whisper_full_get_segment_text(_ctx, i);
        if (segmentText != NULL) {
            NSString *segText = [NSString stringWithUTF8String:segmentText];
            NSLog(@"[WhisperEngine] Segment %d: %@", i, segText);
            [fullText appendString:segText];
        }
    }
    
    // Trim whitespace
    result.text = [fullText stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    
    NSLog(@"[WhisperEngine] Transcription complete: %@", result.text);
    
    return result;
}

#pragma mark - WAV Reading

- (BOOL)readWavFile:(NSString *)path intoPCM:(std::vector<float> &)pcmf32 {
    FILE *file = fopen([path UTF8String], "rb");
    if (!file) {
        NSLog(@"[WhisperEngine] Cannot open WAV file");
        return NO;
    }
    
    // Read WAV header
    char riff[4];
    uint32_t chunkSize;
    char wave[4];
    
    fread(riff, 1, 4, file);
    fread(&chunkSize, 4, 1, file);
    fread(wave, 1, 4, file);
    
    if (strncmp(riff, "RIFF", 4) != 0 || strncmp(wave, "WAVE", 4) != 0) {
        NSLog(@"[WhisperEngine] Invalid WAV header");
        fclose(file);
        return NO;
    }
    
    // Find fmt and data chunks
    uint16_t audioFormat = 0;
    uint16_t numChannels = 0;
    uint32_t sampleRate = 0;
    uint16_t bitsPerSample = 0;
    uint32_t dataSize = 0;
    
    while (!feof(file)) {
        char subchunkId[4];
        uint32_t subchunkSize;
        
        if (fread(subchunkId, 1, 4, file) != 4) break;
        if (fread(&subchunkSize, 4, 1, file) != 1) break;
        
        if (strncmp(subchunkId, "fmt ", 4) == 0) {
            fread(&audioFormat, 2, 1, file);
            fread(&numChannels, 2, 1, file);
            fread(&sampleRate, 4, 1, file);
            fseek(file, 6, SEEK_CUR);  // Skip byte rate and block align
            fread(&bitsPerSample, 2, 1, file);
            
            // Skip any extra fmt bytes
            if (subchunkSize > 16) {
                fseek(file, subchunkSize - 16, SEEK_CUR);
            }
        } else if (strncmp(subchunkId, "data", 4) == 0) {
            dataSize = subchunkSize;
            break;
        } else {
            fseek(file, subchunkSize, SEEK_CUR);
        }
    }
    
    NSLog(@"[WhisperEngine] WAV format: %d Hz, %d channels, %d bits", sampleRate, numChannels, bitsPerSample);
    
    // Validate format
    if (audioFormat != 1) {  // PCM
        NSLog(@"[WhisperEngine] Unsupported audio format: %d (expected PCM=1)", audioFormat);
        fclose(file);
        return NO;
    }
    
    if (sampleRate != 16000) {
        NSLog(@"[WhisperEngine] Unsupported sample rate: %d (expected 16000)", sampleRate);
        fclose(file);
        return NO;
    }
    
    if (bitsPerSample != 16) {
        NSLog(@"[WhisperEngine] Unsupported bits per sample: %d (expected 16)", bitsPerSample);
        fclose(file);
        return NO;
    }
    
    // Read PCM data
    uint32_t numSamples = dataSize / (numChannels * (bitsPerSample / 8));
    std::vector<int16_t> pcm16(numSamples * numChannels);
    
    fread(pcm16.data(), sizeof(int16_t), pcm16.size(), file);
    fclose(file);
    
    // Convert to mono float
    pcmf32.resize(numSamples);
    
    if (numChannels == 1) {
        for (uint32_t i = 0; i < numSamples; i++) {
            pcmf32[i] = pcm16[i] / 32768.0f;
        }
    } else {
        // Mix to mono
        for (uint32_t i = 0; i < numSamples; i++) {
            float sum = 0.0f;
            for (uint16_t c = 0; c < numChannels; c++) {
                sum += pcm16[i * numChannels + c];
            }
            pcmf32[i] = (sum / numChannels) / 32768.0f;
        }
    }
    
    return YES;
}

@end

