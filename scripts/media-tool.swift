import Foundation
import AVFoundation
import AppKit
import ImageIO
import UniformTypeIdentifiers

// Native metadata and poster extraction for prepare-media.mjs. No network or UI.
@main
struct MediaTool {
    static func fourCC(_ value: FourCharCode) -> String {
        let bytes = [UInt8((value >> 24) & 255), UInt8((value >> 16) & 255), UInt8((value >> 8) & 255), UInt8(value & 255)]
        return String(bytes: bytes, encoding: .ascii) ?? String(value)
    }

    static func main() async throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        guard arguments.count >= 2 else {
            throw NSError(domain: "MediaTool", code: 1, userInfo: [NSLocalizedDescriptionKey: "Usage: media-tool inspect <file>... | image|poster <input> <output>"])
        }
        if arguments[0] == "inspect" {
            var result: [String: Any] = [:]
            for path in arguments.dropFirst() {
                let asset = AVURLAsset(url: URL(fileURLWithPath: path))
                let duration = try await asset.load(.duration).seconds
                let videoTracks = try await asset.loadTracks(withMediaType: .video)
                let audioTracks = try await asset.loadTracks(withMediaType: .audio)
                guard let track = videoTracks.first else {
                    throw NSError(domain: "MediaTool", code: 2, userInfo: [NSLocalizedDescriptionKey: "Missing video track"])
                }
                let naturalSize = try await track.load(.naturalSize)
                let transform = try await track.load(.preferredTransform)
                let bounds = CGRect(origin: .zero, size: naturalSize).applying(transform)
                let formats = try await track.load(.formatDescriptions)
                var info: [String: Any] = [
                    "width": Int(abs(bounds.width).rounded()),
                    "height": Int(abs(bounds.height).rounded()),
                    "duration": duration,
                    "codec": formats.map { fourCC(CMFormatDescriptionGetMediaSubType($0)) }.joined(separator: ","),
                    "audioTracks": audioTracks.count
                ]
                if let audio = audioTracks.first {
                    let audioFormats = try await audio.load(.formatDescriptions)
                    info["audioCodec"] = audioFormats.map { fourCC(CMFormatDescriptionGetMediaSubType($0)) }.joined(separator: ",")
                }
                result[path] = info
            }
            let json = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            print(String(decoding: json, as: UTF8.self))
        } else if arguments[0] == "image", arguments.count == 3 {
            guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: arguments[1]) as CFURL, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 1400,
                    kCGImageSourceShouldCacheImmediately: true
                  ] as CFDictionary),
                  let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: arguments[2]) as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
                throw NSError(domain: "MediaTool", code: 5, userInfo: [NSLocalizedDescriptionKey: "Could not open image"])
            }
            // Re-encoding pixels without source properties strips location and camera metadata.
            CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.88] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else {
                throw NSError(domain: "MediaTool", code: 6, userInfo: [NSLocalizedDescriptionKey: "Could not encode image"])
            }
            print("{\"width\":\(image.width),\"height\":\(image.height)}")
        } else if arguments[0] == "poster", arguments.count == 3 {
            let asset = AVURLAsset(url: URL(fileURLWithPath: arguments[1]))
            let duration = try await asset.load(.duration).seconds
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 900, height: 900)
            let time = CMTime(seconds: min(0.25, duration / 4), preferredTimescale: 600)
            let (image, _) = try await generator.image(at: time)
            let bitmap = NSBitmapImageRep(cgImage: image)
            guard let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.84]) else {
                throw NSError(domain: "MediaTool", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not encode poster"])
            }
            try data.write(to: URL(fileURLWithPath: arguments[2]), options: .atomic)
            print("{\"width\":\(image.width),\"height\":\(image.height)}")
        } else {
            throw NSError(domain: "MediaTool", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid arguments"])
        }
    }
}
