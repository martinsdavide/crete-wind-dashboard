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
    
    // BFS Flood Fill from all 4 boundaries
    var visited = [Bool](repeating: false, count: width * height)
    var queue = [(Int, Int)]()
    
    func isBackgroundPixel(x: Int, y: Int) -> Bool {
        let offset = (y * width + x) * 4
        let r = Int(rawData[offset])
        let g = Int(rawData[offset + 1])
        let b = Int(rawData[offset + 2])
        
        if isLight {
            return r > 200 && g > 200 && b > 200
        } else {
            return r < 35 && g < 40 && b < 55
        }
    }
    
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
    
    var head = 0
    let dx = [1, -1, 0, 0, 1, 1, -1, -1]
    let dy = [0, 0, 1, -1, 1, -1, 1, -1]
    
    while head < queue.count {
        let (cx, cy) = queue[head]
        head += 1
        
        let offset = (cy * width + cx) * 4
        rawData[offset + 3] = 0 // Fully transparent
        
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
    
    // Smooth anti-aliased edge
    for y in 1..<(height - 1) {
        for x in 1..<(width - 1) {
            let idx = y * width + x
            if !visited[idx] {
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
                        if avg > 170 {
                            let alpha = max(0.0, min(1.0, (225.0 - avg) / 55.0))
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
    print("Saved perfect asset: \(toPath) (\(width)x\(height))")
}

let brandingDir = "/Users/davidemartini/.gemini/antigravity/scratch/crete-wind-dashboard/public/branding"

// 1. LIGHT MARK (X: 265, Y: 18, Width: 400, Height: 326)
// This fully covers needle tip at top and pin point at bottom!
cropAndFloodFillTransparent(
    rect: CGRect(x: 265, y: 18, width: 400, height: 326),
    toPath: "\(brandingDir)/spotpilot-mark-light.png",
    isLight: true
)

// 2. DARK MARK (X: 265, Y: 536, Width: 470, Height: 312)
// Starts strictly at Y=536 (below white line) and covers full needle & pin bottom tip!
cropAndFloodFillTransparent(
    rect: CGRect(x: 265, y: 536, width: 470, height: 312),
    toPath: "\(brandingDir)/spotpilot-mark-dark.png",
    isLight: false
)

// 3. FULL LOGOS
cropAndFloodFillTransparent(
    rect: CGRect(x: 230, y: 18, width: 564, height: 412),
    toPath: "\(brandingDir)/spotpilot-light.png",
    isLight: true
)

cropAndFloodFillTransparent(
    rect: CGRect(x: 230, y: 536, width: 564, height: 412),
    toPath: "\(brandingDir)/spotpilot-dark.png",
    isLight: false
)

print("All perfect assets generated successfully!")
