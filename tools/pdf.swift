// Render an HTML file to a one-page US Letter PDF with WebKit, then set the PDF's metadata.
//
//     pdf IN.html OUT.pdf META.json
//
// META.json holds "title", "author", "subject" and "keywords" (a list). The page is laid out
// 8.5 in wide (816 CSS px) and scaled to 612 pt, so CSS inches and points come out true.
// Fails if the content runs past one page. Text stays text, so screening software can read it.
import AppKit
import PDFKit
import WebKit

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count == 4 else { fail("usage: pdf IN.html OUT.pdf META.json") }
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
guard let metaData = try? Data(contentsOf: URL(fileURLWithPath: args[3])),
      let meta = try? JSONSerialization.jsonObject(with: metaData) as? [String: Any] else { fail("pdf: cannot read \(args[3])") }

let pageWidth: CGFloat = 612, pageHeight: CGFloat = 792, zoom: CGFloat = 0.75

final class Renderer: NSObject, WKNavigationDelegate {
    let meta: [String: Any], output: URL
    init(meta: [String: Any], output: URL) { self.meta = meta; self.output = output }

    func webView(_ view: WKWebView, didFinish navigation: WKNavigation!) {
        // Wait for fonts, then make sure the sheet fits one page before printing it.
        view.callAsyncJavaScript("await document.fonts.ready; return document.documentElement.scrollHeight;",
                                 arguments: [:], in: nil, in: .page) { result in
            guard case .success(let value) = result, let height = value as? Double else { fail("pdf: cannot measure the page") }
            let limit = Double(pageHeight / zoom)
            if height > limit + 1 { fail("pdf: the resume runs past one page (\(Int(height)) of \(Int(limit)) px); shorten it") }
            let config = WKPDFConfiguration()
            config.rect = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
            view.createPDF(configuration: config) { made in
                guard case .success(let data) = made, let doc = PDFDocument(data: data) else { fail("pdf: WebKit could not make the PDF") }
                var attrs: [PDFDocumentAttribute: Any] = [:]
                if let v = self.meta["title"] as? String { attrs[.titleAttribute] = v }
                if let v = self.meta["author"] as? String { attrs[.authorAttribute] = v; attrs[.creatorAttribute] = v; attrs[.producerAttribute] = v }
                if let v = self.meta["subject"] as? String { attrs[.subjectAttribute] = v }
                if let v = self.meta["keywords"] as? [String] { attrs[.keywordsAttribute] = v }
                doc.documentAttributes = attrs
                guard doc.write(to: self.output) else { fail("pdf: cannot write \(self.output.path)") }
                exit(0)
            }
        }
    }

    func webView(_ view: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail("pdf: \(error.localizedDescription)") }
    func webView(_ view: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail("pdf: \(error.localizedDescription)") }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let view = WKWebView(frame: NSRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
view.pageZoom = zoom
let renderer = Renderer(meta: meta, output: output)
view.navigationDelegate = renderer
view.loadFileURL(input, allowingReadAccessTo: input.deletingLastPathComponent())
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { fail("pdf: timed out") }
app.run()
