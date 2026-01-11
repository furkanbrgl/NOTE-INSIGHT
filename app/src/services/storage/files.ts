import * as FileSystem from 'expo-file-system/legacy';

/**
 * Get the audio directory path
 */
function getAudioDirectory(): string {
  return `${FileSystem.documentDirectory}Audio/`;
}

/**
 * Delete audio files for a note (both .m4a and .wav)
 * Handles each file separately and never throws - logs errors but allows deletion to continue
 */
export async function deleteAudioFiles(noteId: string): Promise<void> {
  const audioDir = getAudioDirectory();
  const m4aPath = `${audioDir}${noteId}.m4a`;
  const wavPath = `${audioDir}${noteId}.wav`;

  // Delete .m4a file
  try {
    const m4aInfo = await FileSystem.getInfoAsync(m4aPath);
    if (m4aInfo.exists) {
      await FileSystem.deleteAsync(m4aPath, { idempotent: true });
      console.log('[files] Deleted audio file:', m4aPath);
    } else {
      console.log('[files] Audio file does not exist, skipping:', m4aPath);
    }
  } catch (error) {
    console.error('[files] Error deleting .m4a file for note:', noteId, error);
    // Don't throw - continue with other file
  }

  // Delete .wav file
  try {
    const wavInfo = await FileSystem.getInfoAsync(wavPath);
    if (wavInfo.exists) {
      await FileSystem.deleteAsync(wavPath, { idempotent: true });
      console.log('[files] Deleted WAV file:', wavPath);
    } else {
      console.log('[files] WAV file does not exist, skipping:', wavPath);
    }
  } catch (error) {
    console.error('[files] Error deleting .wav file for note:', noteId, error);
    // Don't throw - file deletion failures shouldn't block note deletion
  }
}

