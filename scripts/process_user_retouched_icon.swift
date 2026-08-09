import Cocoa
import CoreGraphics
import ImageIO

let userUploadedIconPath = "/Users/davidemartini/.gemini/antigravity/brain/a0523f81-f617-41e9-93d6-5c20b1dcaf39/.user_uploaded/media_1786292110945.png"
guard let sourceImage = NSImage(contentsOfFile: userUploadedIconPath),
      let tiffData = sourceImage.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage else {
    print("Failed to load user uploaded icon")
    exit(1)
}

let cropRect = CGRect(x: 30, y: 115, width: 645, height: 775)
guard let croppedPin = cgImage.cropping(to: cropRect) else {
    print("Failed to crop pin")
    exit(1)
}

func savePNG(image: CGImage, toPath: String) {
    let destURL = URL(fileURLWithPath: toPath) as CFURL
    guard let destination = CGImageDestinationCreateWithURL(destURL, kUTTypePNG, 1, nil) else {
        print("Failed to create destination for \(toPath)")
        return
    }
    CGImageDestinationAddImage(destination, image, nil)
    if CGImageDestinationFinalize(destination) {
        print("Saved: \(toPath) (\(image.width)x\(image.height))")
    } else {
        print("Failed to save \(toPath)")
    }
}

func createSquarePWAIcon(pin: CGImage, size: Int, toPath: String) {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
    
    guard let context = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: bitmapInfo
    ) else {
        print("Failed to create context")
        return
    }
    
    // Fill background with Dark Deep Surf Navy (#0a0f1d)
    context.setFillColor(red: 10/255.0, green: 15/255.0, blue: 29/255.0, alpha: 1.0)
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    
    // Proportional draw with ~8% margin
    let margin = CGFloat(size) * 0.08
    let availableW = CGFloat(size) - 2 * margin
    let availableH = CGFloat(size) - 2 * margin
    
    let pinAspect = CGFloat(pin.width) / CGFloat(pin.height)
    var drawW = availableW
    var drawH = drawW / pinAspect
    
    if drawH > availableH {
        drawH = availableH
        drawW = drawH * pinAspect
    }
    
    let drawX = (CGFloat(size) - drawW) / 2.0
    let drawY = (CGFloat(size) - drawH) / 2.0
    
    context.draw(pin, in: CGRect(x: drawX, y: drawY, width: drawW, height: drawH))
    
    guard let iconImage = context.makeImage() else {
        print("Failed to make icon image")
        return
    }
    
    savePNG(image: iconImage, toPath: toPath)
}

let brandingDir = "/Users/davidemartini/.gemini/antigravity/scratch/crete-wind-dashboard/public/branding"
let publicDir = "/Users/davidemartini/.gemini/antigravity/scratch/crete-wind-dashboard/public"

// 1. Save dark mark directly from user high-res retouched icon
savePNG(image: croppedPin, toPath: "\(brandingDir)/spotpilot-mark-dark.png")

// 2. Generate crisp PWA square icons
createSquarePWAIcon(pin: croppedPin, size: 512, toPath: "\(publicDir)/icon-512.png")
createSquarePWAIcon(pin: croppedPin, size: 192, toPath: "\(publicDir)/icon-192.png")
createSquarePWAIcon(pin: croppedPin, size: 180, toPath: "\(publicDir)/apple-touch-icon.png")
createSquarePWAIcon(pin: croppedPin, size: 480, toPath: "\(brandingDir)/mark-square-dark.png")

print("All dark theme assets processed successfully from uploaded image!")
