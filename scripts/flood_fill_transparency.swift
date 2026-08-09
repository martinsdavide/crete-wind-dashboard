import Cocoa
import CoreGraphics
import ImageIO

let sourcePath = "/Users/davidemartini/.gemini/antigravity/brain/a0523f81-f617-41e9-93d6-5c20b1dcaf39/.user_uploaded/media_1786288858935.jpg"
guard let sourceImage = NSImage(contentsOfFile: sourcePath),
      let tiffData = sourceImage.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage else {
    print("Failed to load source image")
    exit(1)
}

func cropAndFloodFillTransparent(
    rect: CGRect,
    toPath: String,
    isLight: Bool
) {
    guard let cropped = cgImage.cropping(to: rect) else {
        print("Failed to crop \(toPath)")
        return
    }
    
    let width = cropped.width
    let height = cropped.height
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bytesPerPixel = 4
    let bytesPerRow = bytesPerPixel * width
    
    var rawData = [UInt8](repeating: 0, count: bytesPerRow * height)
    guard let context = CGContext(
        data: &rawData,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        print("Failed to create context")
        return
    }
    
    context.draw(cropped, in: CGRect(x: 0, y: 0, width: width, height: height))
    
    // BFS Flood Fill from all 4 boundaries (x=0, x=w-1, y=0, y=h-1)
    var visited = [Bool](repeating: false, count: width * height)
    var queue = [(Int, Int)]()
    
    func isBackgroundPixel(x: Int, y: Int) -> Bool {
        let offset = (y * width + x) * 4
        let r = Int(rawData[offset])
        let g = Int(rawData[offset + 1])
        let b = Int(rawData[offset + 2])
        
        if isLight {
            // Light theme background is pure white / near-white
            // Outside of the pin is white (r > 215, g > 215, b > 215)
            // Pin border is dark navy (r < 50, g < 70, b < 90) or cyan
            return r > 210 && g > 210 && b > 210
        } else {
            // Dark theme background is deep navy/black #000d1a
            // Outside of the pin is dark (r < 30, g < 35, b < 50)
            return r < 35 && g < 40 && b < 55
        }
    }
    
    // Add boundary pixels to queue
    for x in 0..<width {
        if isBackgroundPixel(x: x, y: 0) {
            queue.append((x, 0))
            visited[0 * width + x] = true
        }
        if isBackgroundPixel(x: x, y: height - 1) {
            queue.append((x, height - 1))
            visited[(height - 1) * width + x] = true
        }
    }
    for y in 0..<height {
        if isBackgroundPixel(x: 0, y: y) {
            queue.append((0, y))
            visited[y * width + 0] = true
        }
        if isBackgroundPixel(x: width - 1, y: y) {
            queue.append((width - 1, y))
            visited[y * width + (width - 1)] = true
        }
    }
    
    // Run BFS
    var head = 0
    let dx = [1, -1, 0, 0, 1, 1, -1, -1]
    let dy = [0, 0, 1, -1, 1, -1, 1, -1]
    
    while head < queue.count {
        let (cx, cy) = queue[head]
        head += 1
        
        // Mark pixel transparent
        let offset = (cy * width + cx) * 4
        rawData[offset + 3] = 0 // Alpha = 0 (100% transparent)
        
        for i in 0..<8 {
            let nx = cx + dx[i]
            let ny = cy + dy[i]
            
            if nx >= 0 && nx < width && ny >= 0 && ny < height {
                let idx = ny * width + nx
                if !visited[idx] && isBackgroundPixel(x: nx, y: ny) {
                    visited[idx] = true
                    queue.append((nx, ny))
                }
            }
        }
    }
    
    // Edge Feathering / Anti-aliasing on outer boundary of logo
    for y in 1..<(height - 1) {
        for x in 1..<(width - 1) {
            let idx = y * width + x
            if !visited[idx] {
                // Check if adjacent to transparent background
                var transparentNeighbors = 0
                for i in 0..<4 {
                    let nx = x + dx[i]
                    let ny = y + dy[i]
                    if visited[ny * width + nx] {
                        transparentNeighbors += 1
                    }
                }
                
                if transparentNeighbors > 0 {
                    let offset = idx * 4
                    let r = Double(rawData[offset])
                    let g = Double(rawData[offset + 1])
                    let b = Double(rawData[offset + 2])
                    
                    if isLight {
                        let avg = (r + g + b) / 3.0
                        if avg > 180 {
                            let alpha = max(0.0, min(1.0, (230.0 - avg) / 50.0))
                            rawData[offset + 3] = UInt8(alpha * 255.0)
                        }
                    }
                }
            }
        }
    }
    
    guard let newCgImage = context.makeImage() else {
        print("Failed to create new image for \(toPath)")
        return
    }
    
    let destURL = URL(fileURLWithPath: toPath) as CFURL
    guard let destination = CGImageDestinationCreateWithURL(destURL, kUTTypePNG, 1, nil) else {
        print("Failed to create destination")
        return
    }
    
    CGImageDestinationAddImage(destination, newCgImage, nil)
    CGImageDestinationFinalize(destination)
    print("Successfully generated transparent asset: \(toPath) (\(width)x\(height))")
}

let brandingDir = "/Users/davidemartini/.gemini/antigravity/scratch/crete-wind-dashboard/public/branding"

// 1. Mark Only
cropAndFloodFillTransparent(
    rect: CGRect(x: 345, y: 22, width: 334, height: 300),
    toPath: "\(brandingDir)/spotpilot-mark-light.png",
    isLight: true
)

cropAndFloodFillTransparent(
    rect: CGRect(x: 345, y: 532, width: 334, height: 300),
    toPath: "\(brandingDir)/spotpilot-mark-dark.png",
    isLight: false
)

// 2. Full Logo (Mark + Wordmark + Tagline)
cropAndFloodFillTransparent(
    rect: CGRect(x: 230, y: 20, width: 564, height: 405),
    toPath: "\(brandingDir)/spotpilot-light.png",
    isLight: true
)

cropAndFloodFillTransparent(
    rect: CGRect(x: 230, y: 530, width: 564, height: 405),
    toPath: "\(brandingDir)/spotpilot-dark.png",
    isLight: false
)

print("Flood fill processing complete!")
