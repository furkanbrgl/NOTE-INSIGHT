//
// CircularBuffer.swift
// Simple ring buffer for PCM audio samples (Int16)
//

import Foundation

class CircularBuffer {
    private var buffer: [Int16]
    private var writeIndex: Int = 0
    private var count: Int = 0
    private let capacity: Int
    private let lock = NSLock()
    
    init(capacity: Int) {
        self.capacity = capacity
        self.buffer = Array(repeating: 0, count: capacity)
    }
    
    func append(_ element: Int16) {
        lock.lock()
        defer { lock.unlock() }
        
        buffer[writeIndex] = element
        writeIndex = (writeIndex + 1) % capacity
        count = min(count + 1, capacity)
    }
    
    func append(contentsOf elements: [Int16]) {
        lock.lock()
        defer { lock.unlock() }
        
        for element in elements {
            buffer[writeIndex] = element
            writeIndex = (writeIndex + 1) % capacity
            count = min(count + 1, capacity)
        }
    }
    
    func getSnapshot(maxSamples: Int? = nil) -> [Int16] {
        lock.lock()
        defer { lock.unlock() }
        
        guard count > 0 else { return [] }
        
        let samplesToReturn = maxSamples != nil ? min(maxSamples!, count) : count
        guard samplesToReturn > 0 else { return [] }
        
        var result: [Int16] = []
        result.reserveCapacity(samplesToReturn)
        
        // Always return the most recent samples
        let startIndex = count == capacity ? writeIndex : 0
        let samplesFromStart = count == capacity ? capacity : count
        
        if let max = maxSamples, samplesFromStart > max {
            // Return only the last maxSamples
            let skipCount = samplesFromStart - max
            for i in skipCount..<samplesFromStart {
                let index = (startIndex + i) % capacity
                result.append(buffer[index])
            }
        } else {
            // Return all samples
            for i in 0..<samplesFromStart {
                let index = (startIndex + i) % capacity
                result.append(buffer[index])
            }
        }
        
        return result
    }
    
    func getCount() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }
    
    func clear() {
        lock.lock()
        defer { lock.unlock() }
        writeIndex = 0
        count = 0
    }
}

