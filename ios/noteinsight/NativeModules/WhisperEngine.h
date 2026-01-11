#ifndef WhisperEngine_h
#define WhisperEngine_h

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface WhisperTranscriptionResult : NSObject
@property (nonatomic, strong) NSString *text;
@property (nonatomic, assign) int durationMs;
@property (nonatomic, strong, nullable) NSString *detectedLanguage;
@property (nonatomic, assign) float detectedProbability;  // Language detection confidence (0.0 - 1.0)
@property (nonatomic, strong, nullable) NSError *error;
@end

@interface WhisperEngine : NSObject

/// Shared singleton instance
+ (instancetype)shared;

/// Load the whisper model from the given path
/// @param modelPath Full path to the .bin model file
/// @return YES if loaded successfully, NO otherwise
- (BOOL)loadModel:(NSString *)modelPath;

/// Check if a model is currently loaded
- (BOOL)isModelLoaded;

/// Unload the current model to free memory
- (void)unloadModel;

/// Transcribe a 16kHz mono PCM WAV file
/// @param wavPath Full path to the WAV file
/// @param language Language code (e.g., "tr", "en") or "auto" for detection
/// @return TranscriptionResult containing text or error
- (WhisperTranscriptionResult *)transcribe:(NSString *)wavPath language:(NSString *)language;

@end

NS_ASSUME_NONNULL_END

#endif /* WhisperEngine_h */

