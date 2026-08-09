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

let width = cgImage.width
let height = cgImage.height
print("Source dimensions: \(width)x\(height)")

func saveCrop(rect: CGRect, toPath: String, makeBackgroundTransparent: Bool = false, isDark: Bool = false) {
    guard let cropped = cgImage.cropping(to: rect) else {
        print("Failed to crop \(toPath)")
        return
    }
    
    let destURL = URL(fileURLWithPath: toPath) as CFURL
    guard let destination = CGImageDestinationCreateWithURL(destURL, kUTTypePNG, 1, nil) else {
        print("Failed to create destination for \(toPath)")
        return
    }
    
    CGImageDestinationAddImage(destination, cropped, nil)
    if CGImageDestinationFinalize(destination) {
        print("Saved: \(toPath) (\(cropped.width)x\(cropped.height))")
    } else {
        print("Failed to finalize: \(toPath)")
    }
}

func saveResizedSquare(rect: CGRect, size: Int, toPath: String, bgDark: Bool) {
    guard let cropped = cgImage.cropping(to: rect) else {
        print("Failed to crop for resize \(toPath)")
        return
    }
    
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
    
    guard let context = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: bitmapInfo.rawValue
    ) else {
        print("Failed to create context")
        return
    }
    
    // Fill background
    if bgDark {
        context.setFillColor(red: 10/255.0, green: 15/255.0, blue: 29/255.0, alpha: 1.0) // #0a0f1d
    } else {
        context.setFillColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0)
    }
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    
    // Draw mark centered with padding (e.g. 10% margin)
    let margin = CGFloat(size) * 0.08
    let drawRect = CGRect(x: margin, y: margin, width: CGFloat(size) - 2 * margin, height: CGFloat(size) - 2 * margin)
    context.draw(cropped, in: drawRect)
    
    guard let resizedImage = context.makeImage() else {
        print("Failed to create resized image")
        return
    }
    
    let destURL = URL(fileURLWithPath: toPath) as CFURL
    guard let destination = CGImageDestinationCreateWithURL(destURL, kUTTypePNG, 1, nil) else {
        print("Failed to create destination")
        return
    }
    
    CGImageDestinationAddImage(destination, resizedImage, nil)
    CGImageDestinationFinalize(destination)
    print("Saved square icon: \(toPath) (\(size)x\(size))")
}

let brandingDir = "/Users/davidemartini/.gemini/antigravity/scratch/crete-wind-dashboard/public/branding"
let publicDir = "/Users/davidemartini/.gemini/antigravity/scratch/crete-wind-dashboard/public"

// In CGImage coordinates (0,0 is top-left when cropped in standard CGImage):
// In macOS CGImage cropping:
// Rect coords are (x, y, w, h) from top-left.

// 1. Full Promotional Brand Artworks (with the 4 icons)
// Light brand artwork: Y: 10 to 505, X: 160 to 864
saveCrop(rect: CGRect(x: 160, y: 15, width: 704, height: 490), toPath: "\(brandingDir)/spotpilot-brand-light.png")
// Dark brand artwork: Y: 525 to 1015, X: 160 to 864
saveCrop(rect: CGRect(x: 160, y: 525, width: 704, height: 490), toPath: "\(brandingDir)/spotpilot-brand-dark.png")

// 2. Full Standard Logo (Mark + Wordmark + Tagline, cropped right below "FIND YOUR BEST WINDSURF SESSION")
// Light full logo: Y: 15 to 425, X: 240 to 784
saveCrop(rect: CGRect(x: 230, y: 20, width: 564, height: 405), toPath: "\(brandingDir)/spotpilot-light.png")
// Dark full logo: Y: 525 to 935, X: 240 to 784
saveCrop(rect: CGRect(x: 230, y: 530, width: 564, height: 405), toPath: "\(brandingDir)/spotpilot-dark.png")

// 3. Mark Only (Map Pin + Windsurfer + Red Needle)
// Light mark: X: 345, Y: 20, W: 334, H: 300
saveCrop(rect: CGRect(x: 345, y: 22, width: 334, height: 300), toPath: "\(brandingDir)/spotpilot-mark-light.png")
// Dark mark: X: 345, Y: 532, W: 334, H: 300
saveCrop(rect: CGRect(x: 345, y: 532, width: 334, height: 300), toPath: "\(brandingDir)/spotpilot-mark-dark.png")

// 4. Square App Icons for PWA
let darkMarkRect = CGRect(x: 345, y: 532, width: 334, height: 300)
saveResizedSquare(rect: darkMarkRect, size: 512, toPath: "\(publicDir)/icon-512.png", bgDark: true)
saveResizedSquare(rect: darkMarkRect, size: 192, toPath: "\(publicDir)/icon-192.png", bgDark: true)
saveResizedSquare(rect: darkMarkRect, size: 180, toPath: "\(publicDir)/apple-touch-icon.png", bgDark: true)

// Also create WebP equivalents using sips/cwebp
print("All assets cropped and created!")
