import Cocoa
import CoreGraphics
import ImageIO

let brandingDir = "/Users/davidemartini/.gemini/antigravity/scratch/crete-wind-dashboard/public/branding"

func makeTransparent(filePath: String, isLight: Bool) {
    guard let image = NSImage(contentsOfFile: filePath),
          let tiffData = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiffData),
          let cgImage = bitmap.cgImage else {
        print("Failed to load \(filePath)")
        return
    }
    
    let width = cgImage.width
    let height = cgImage.height
    
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bytesPerPixel = 4
    let bytesPerRow = bytesPerPixel * width
    let bitsPerComponent = 8
    
    var rawData = [UInt8](repeating: 0, count: bytesPerRow * height)
    
    guard let context = CGContext(
        data: &rawData,
        width: width,
        height: height,
        bitsPerComponent: bitsPerComponent,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        print("Failed to create context")
        return
    }
    
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    
    // Process pixels to remove background
    // For light theme: remove outer near-white pixels (R > 235, G > 235, B > 235)
    // For dark theme: remove outer near-dark pixels (R < 25, G < 30, B < 40)
    
    // Simple flood fill / outer boundary detection or color threshold
    for y in 0..<height {
        for x in 0..<width {
            let offset = (y * width + x) * 4
            let r = Double(rawData[offset])
            let g = Double(rawData[offset + 1])
            let b = Double(rawData[offset + 2])
            
            if isLight {
                // If pixel is near white
                if r > 230 && g > 230 && b > 230 {
                    // Calculate transparency feathering
                    let minVal = min(r, min(g, b))
                    if minVal >= 250 {
                        rawData[offset + 3] = 0 // completely transparent
                    } else {
                        let alpha = 1.0 - (minVal - 230.0) / 20.0
                        rawData[offset + 3] = UInt8(max(0, min(255, alpha * 255.0)))
                    }
                }
            } else {
                // If pixel is near dark background #000d1a / #0a0f1d
                if r < 25 && g < 32 && b < 45 {
                    let maxVal = max(r, max(g, b))
                    if maxVal <= 20 {
                        rawData[offset + 3] = 0
                    } else {
                        let alpha = (maxVal - 20.0) / 25.0
                        rawData[offset + 3] = UInt8(max(0, min(255, alpha * 255.0)))
                    }
                }
            }
        }
    }
    
    guard let newCgImage = context.makeImage() else {
        print("Failed to create new image")
        return
    }
    
    let destURL = URL(fileURLWithPath: filePath) as CFURL
    guard let destination = CGImageDestinationCreateWithURL(destURL, kUTTypePNG, 1, nil) else {
        print("Failed to create destination")
        return
    }
    
    CGImageDestinationAddImage(destination, newCgImage, nil)
    CGImageDestinationFinalize(destination)
    print("Made transparent: \(filePath)")
}

makeTransparent(filePath: "\(brandingDir)/spotpilot-mark-light.png", isLight: true)
makeTransparent(filePath: "\(brandingDir)/spotpilot-light.png", isLight: true)
makeTransparent(filePath: "\(brandingDir)/spotpilot-brand-light.png", isLight: true)

makeTransparent(filePath: "\(brandingDir)/spotpilot-mark-dark.png", isLight: false)
makeTransparent(filePath: "\(brandingDir)/spotpilot-dark.png", isLight: false)
makeTransparent(filePath: "\(brandingDir)/spotpilot-brand-dark.png", isLight: false)

print("Transparency processing complete!")
