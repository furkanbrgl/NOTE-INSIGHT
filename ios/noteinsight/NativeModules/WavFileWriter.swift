//
// WavFileWriter.swift
// Writes continuous PCM data to a WAV file with proper header
//

import Foundation

class WavFileWriter {
    private let fileHandle: FileHandle
    private let url: URL
    private let sampleRate: UInt32
    private let channels: UInt16
    private let bitsPerSample: UInt16
    private var dataSize: UInt32 = 0
    private let headerSize: Int = 44
    
    init?(url: URL, sampleRate: UInt32 = 16000, channels: UInt16 = 1, bitsPerSample: UInt16 = 16) {
        self.url = url
        self.sampleRate = sampleRate
        self.channels = channels
        self.bitsPerSample = bitsPerSample
        
        // Remove existing file if it exists
        try? FileManager.default.removeItem(at: url)
        
        // Create file with placeholder header
        FileManager.default.createFile(atPath: url.path, contents: nil, attributes: nil)
        
        guard let handle = FileHandle(forWritingAtPath: url.path) else {
            print("[WavFileWriter] Failed to create file handle for: \(url.path)")
            return nil
        }
        
        self.fileHandle = handle
        
        // Write placeholder header (will be patched on finish)
        let placeholderHeader = Self.createWavHeader(dataSize: 0, sampleRate: sampleRate, channels: channels, bitsPerSample: bitsPerSample)
        fileHandle.write(placeholderHeader)
    }
    
    func append(samples: [Int16]) {
        let data = samples.withUnsafeBufferPointer { ptr in
            Data(buffer: ptr)
        }
        append(data: data)
    }
    
    func append(data: Data) {
        fileHandle.write(data)
        dataSize += UInt32(data.count)
    }
    
    func finish() -> URL {
        // Sync all pending writes
        fileHandle.synchronizeFile()
        
        // Create corrected header
        let correctedHeader = Self.createWavHeader(dataSize: dataSize, sampleRate: sampleRate, channels: channels, bitsPerSample: bitsPerSample)
        
        // Write corrected header at the beginning (overwrite placeholder)
        fileHandle.seek(toFileOffset: 0)
        fileHandle.write(correctedHeader)
        fileHandle.synchronizeFile()
        
        // Close file handle
        if #available(iOS 13.0, *) {
            try? fileHandle.close()
        } else {
            fileHandle.closeFile()
        }
        
        let durationSeconds = Double(dataSize) / Double(sampleRate * UInt32(channels) * UInt32(bitsPerSample / 8))
        print("[WavFileWriter] Finalized WAV file: \(url.path), size: \(dataSize) bytes (\(String(format: "%.2f", durationSeconds))s)")
        
        return url
    }
    
    deinit {
        if #available(iOS 13.0, *) {
            try? fileHandle.close()
        } else {
            fileHandle.closeFile()
        }
    }
    
    private static func createWavHeader(dataSize: UInt32, sampleRate: UInt32, channels: UInt16, bitsPerSample: UInt16) -> Data {
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
}

