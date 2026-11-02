// Make the development icon from the approved PNG without changing its alpha channel.
import AppKit

let source = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))!
for y in 0..<source.pixelsHigh {
    for x in 0..<source.pixelsWide {
        let color = source.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
        // A 30% blue tint distinguishes the dev bundle from the release bundle.
        source.setColor(NSColor(deviceRed: color.redComponent * 0.7 + 0.12 * 0.3,
                               green: color.greenComponent * 0.7 + 0.40 * 0.3,
                               blue: color.blueComponent * 0.7 + 1.0 * 0.3,
                               alpha: color.alphaComponent), atX: x, y: y)
    }
}
try source.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
