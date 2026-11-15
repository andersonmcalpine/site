// Raster helper for tools/og.py: draws an SVG layer, then sets text on top, and writes a PNG.
// Reads one JSON job on stdin:
//   {"out": "x.png", "width": 1200, "height": 630, "opaque": true, "svg": "<svg ...>",
//    "texts": [{"text": "...", "x": 72, "top": 300, "width": 800, "size": 84, "minSize": 64,
//               "maxLines": 3, "leading": 1.06, "tracking": -0.02, "color": "#F2E9E4"}]}
// "top" is where the capitals of the first line start, so text lines up the same at any size.
// With "measure": true it draws nothing and prints, for each box, the fitted size, line count and cap height.
import AppKit

struct TextBox: Decodable {
    let text: String
    let x, top, width, size: Double
    var minSize: Double?
    var maxLines: Int?
    var leading: Double?
    var tracking: Double?
    let color: String
}

struct Job: Decodable {
    let out: String
    let width, height: Int
    var opaque: Bool?
    var measure: Bool?
    let svg: String
    var texts: [TextBox]?
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write("og: \(message)\n".data(using: .utf8)!)
    exit(1)
}

func color(_ hex: String) -> CGColor {
    let v = UInt32(hex.dropFirst(), radix: 16) ?? 0
    return CGColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255,
                   blue: CGFloat(v & 255) / 255, alpha: 1)
}

/// Break text into lines no wider than `width`.
func lines(_ text: String, font: NSFont, tracking: Double, color: CGColor, width: Double) -> [CTLine] {
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .kern: tracking * font.pointSize, .foregroundColor: color]
    let typesetter = CTTypesetterCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
    var out: [CTLine] = [], start = 0
    while start < text.utf16.count {
        let n = CTTypesetterSuggestLineBreak(typesetter, start, width)
        out.append(CTTypesetterCreateLine(typesetter, CFRange(location: start, length: n)))
        start += n
    }
    return out
}

/// Fit a text box: shrink it in 2 px steps until it takes no more than maxLines.
func fit(_ box: TextBox) -> (NSFont, [CTLine]) {
    var size = box.size
    while true {
        let font = NSFont.systemFont(ofSize: size, weight: .medium)
        let set = lines(box.text, font: font, tracking: box.tracking ?? 0, color: color(box.color), width: box.width)
        if set.count <= box.maxLines ?? 1 { return (font, set) }
        size -= 2
        if size < box.minSize ?? box.size {
            fail("\"\(box.text)\" does not fit in \(box.maxLines ?? 1) line(s); shorten it")
        }
    }
}

func draw(_ box: TextBox, in ctx: CGContext, height: Double) {
    let (font, set) = fit(box)
    let step = font.pointSize * (box.leading ?? 1.1)
    for (i, line) in set.enumerated() {
        // CoreGraphics counts y from the bottom; the job counts it from the top.
        ctx.textPosition = CGPoint(x: box.x, y: height - (box.top + font.capHeight + Double(i) * step))
        CTLineDraw(line, ctx)
    }
}

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let job = try? JSONDecoder().decode(Job.self, from: data) else { fail("cannot read the job JSON") }
if job.measure ?? false {
    let fitted = (job.texts ?? []).map { box -> [String: Double] in
        let (font, set) = fit(box)
        return ["size": font.pointSize, "lines": Double(set.count), "cap": font.capHeight]
    }
    print(String(data: try! JSONSerialization.data(withJSONObject: fitted), encoding: .utf8)!)
    exit(0)
}
guard let art = NSImage(data: job.svg.data(using: .utf8)!) else { fail("cannot read the SVG layer") }

// An opaque canvas (the default) writes a PNG with no alpha channel.
let alpha: CGImageAlphaInfo = job.opaque ?? true ? .noneSkipLast : .premultipliedLast
guard let ctx = CGContext(data: nil, width: job.width, height: job.height, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: alpha.rawValue)
else { fail("cannot make a \(job.width)x\(job.height) canvas") }

NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
art.draw(in: NSRect(x: 0, y: 0, width: job.width, height: job.height))
for box in job.texts ?? [] { draw(box, in: ctx, height: Double(job.height)) }

let url = URL(fileURLWithPath: job.out) as CFURL
guard let image = ctx.makeImage(), let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil)
else { fail("cannot write \(job.out)") }
CGImageDestinationAddImage(dest, image, nil)
if !CGImageDestinationFinalize(dest) { fail("cannot write \(job.out)") }
