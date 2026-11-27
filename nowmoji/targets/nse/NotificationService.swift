// 通知（友だちが気分を送った）が届いたら、ウィジェットが読む保存データを直接書き換えて、ウィジェットを再描画する。
// アプリ本体が起動していなくても、見える通知が届けば iOS が毎回このコードを動かす。
import UserNotifications
import WidgetKit
import Foundation

final class NotificationService: UNNotificationServiceExtension {
  private let group = "group.com.fukuda.nowmoji"
  private let server = "https://tripfold.net/nowmoji"
  private let legacy = "https://nowmoji.160-251-171-249.sslip.io"
  private var handler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    handler = contentHandler
    content = (request.content.mutableCopy() as? UNMutableNotificationContent)
    let info = request.content.userInfo
    // Expo のプッシュは data を "body" に入れて届ける（JSON 文字列のこともある）
    var data: [String: Any] = [:]
    if let b = info["body"] as? [String: Any] { data = b }
    else if let s = info["body"] as? String, let d = s.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { data = j }
    else if let b = info["data"] as? [String: Any] { data = b }
    guard let w = data["w"] as? [String: Any] else { return finish() }
    update(w) { [weak self] in self?.finish() }
  }

  override func serviceExtensionTimeWillExpire() { finish() }

  private func finish() {
    if let h = handler, let c = content { handler = nil; h(c) }
  }

  private func dir() -> URL? {
    guard let c = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    let d = c.appendingPathComponent("ExpoWidgets", isDirectory: true)
    try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
    return d
  }

  // 画像（落書き・スタンプ）を共有フォルダへ。tripfold.net → 予備の順
  private func download(_ path: String, _ done: @escaping (String) -> Void) {
    guard let d = dir() else { return done("") }
    let name = "r_" + (path.split(separator: "/").last.map(String.init) ?? UUID().uuidString)
    let dest = d.appendingPathComponent(name)
    if FileManager.default.fileExists(atPath: dest.path) { return done(dest.absoluteString) }
    func get(_ bases: [String]) {
      guard let b = bases.first, let u = URL(string: b + path) else { return done("") }
      var req = URLRequest(url: u); req.timeoutInterval = 12
      URLSession.shared.downloadTask(with: req) { tmp, resp, err in
        if let tmp, err == nil, (resp as? HTTPURLResponse)?.statusCode == 200 {
          try? FileManager.default.moveItem(at: tmp, to: dest)
          done(dest.absoluteString)
        } else { get(Array(bases.dropFirst())) }
      }.resume()
    }
    get([server, legacy])
  }

  private func update(_ w: [String: Any], _ done: @escaping () -> Void) {
    guard let g = w["g"] as? String, let uid = w["u"] as? String else { return done() }
    let k = (w["k"] as? String) ?? ""
    let word = (w["w"] as? String) ?? ""
    let at = (w["at"] as? Double) ?? Date().timeIntervalSince1970 * 1000
    let mood = w["m"] as? String
    let imgPath = w["img"] as? String
    let fmt = DateFormatter(); fmt.dateFormat = "HH:mm"
    let t = fmt.string(from: Date(timeIntervalSince1970: at / 1000))
    let apply: (String) -> Void = { img in
      self.patch(widget: "GroupMoods") { props in
        guard var groups = props["groups"] as? [String: Any], var gr = groups[g] as? [String: Any], var people = gr["people"] as? [[String: Any]] else { return nil }
        guard let i = people.firstIndex(where: { ($0["id"] as? String) == uid }) else { return nil }
        var p = people.remove(at: i)
        p["k"] = k; p["img"] = img; p["t"] = t; p["w"] = word; p["np"] = false
        people.insert(p, at: 0)
        gr["people"] = people; groups[g] = gr
        var out = props; out["groups"] = groups
        return out
      }
      self.patch(widget: "FriendMood") { props in
        let key = "\(g)_\(uid)"
        guard var people = props["people"] as? [String: Any], var p = people[key] as? [String: Any] else { return nil }
        p["k"] = k; p["img"] = img; p["t"] = t; p["w"] = word; p["np"] = false
        people[key] = p
        var out = props; out["people"] = people
        if var order = props["order"] as? [String], let i = order.firstIndex(of: key) { order.remove(at: i); order.insert(key, at: 0); out["order"] = order }
        return out
      }
      WidgetCenter.shared.reloadAllTimelines()
      done()
    }
    if let m = mood, imgPath == nil, let d = dir() {
      apply(d.appendingPathComponent("m_\(m).png").absoluteString)
    } else if let p = imgPath, !p.isEmpty {
      download(p) { apply($0) }
    } else {
      apply("")
    }
  }

  // ウィジェットの保存データ（expo-widgets の形式：__expo_widgets_<名前>_timeline）を読み、書き換えて戻す
  private func patch(widget: String, _ f: ([String: Any]) -> [String: Any]?) {
    guard let ud = UserDefaults(suiteName: group) else { return }
    let key = "__expo_widgets_\(widget)_timeline"
    guard var tl = ud.array(forKey: key) as? [[String: Any]], let last = tl.last, let props = last["props"] as? [String: Any], let np = f(props) else { return }
    var e = last
    e["props"] = np
    e["timestamp"] = Int(Date().timeIntervalSince1970 * 1000)
    tl = [e]
    ud.set(tl, forKey: key)
  }
}
