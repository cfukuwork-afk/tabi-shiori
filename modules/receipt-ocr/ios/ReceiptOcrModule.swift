import ExpoModulesCore
import UIKit
import Vision

// レシートの写真から文字を読み取る（iPhone の中だけで処理。通信・費用なし）
public class ReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
      guard let data = try? Data(contentsOf: url),
            let image = UIImage(data: data),
            let cgImage = image.cgImage else {
        promise.reject("E_IMAGE", "Could not load the image")
        return
      }

      let request = VNRecognizeTextRequest { req, error in
        if let error = error {
          promise.reject("E_OCR", error.localizedDescription)
          return
        }
        let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
        var lines: [[String: Any]] = []
        for o in observations {
          guard let c = o.topCandidates(1).first else { continue }
          let b = o.boundingBox // 左下が原点・0〜1
          lines.append([
            "text": c.string,
            "x": Double(b.minX),
            "y": Double(1 - b.maxY),
            "w": Double(b.width),
            "h": Double(b.height),
          ])
        }
        promise.resolve(lines)
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      if #available(iOS 16.0, *) {
        request.automaticallyDetectsLanguage = true
      }
      let wanted = ["ja-JP", "en-US", "en-GB", "ko-KR", "zh-Hans", "zh-Hant", "fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR"]
      let supported = (try? request.supportedRecognitionLanguages()) ?? []
      let langs = wanted.filter { supported.contains($0) }
      if !langs.isEmpty {
        request.recognitionLanguages = langs
      }

      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: ReceiptOcrModule.orientation(image.imageOrientation), options: [:])
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try handler.perform([request])
        } catch {
          promise.reject("E_OCR", error.localizedDescription)
        }
      }
    }
  }

  static func orientation(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch o {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
