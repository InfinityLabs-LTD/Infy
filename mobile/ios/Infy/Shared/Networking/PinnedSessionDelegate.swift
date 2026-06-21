import Foundation
import CryptoKit
import Security

final class PinnedSessionDelegate: NSObject, URLSessionDelegate, @unchecked Sendable {
    private let allowedPins: Set<String>

    init(allowedPins: Set<String>) {
        self.allowedPins = allowedPins
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust
        else {
            return (.performDefaultHandling, nil)
        }

        guard !allowedPins.isEmpty else {
            return (.performDefaultHandling, nil)
        }

        guard SecTrustEvaluateWithError(trust, nil) else {
            return (.cancelAuthenticationChallenge, nil)
        }

        let certificateCount = SecTrustGetCertificateCount(trust)
        for index in 0..<certificateCount {
            guard let certificate = SecTrustGetCertificateAtIndex(trust, index),
                  let publicKey = SecCertificateCopyKey(certificate),
                  let keyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?
            else {
                continue
            }

            let hash = SHA256.hash(data: keyData)
            let pin = Data(hash).base64EncodedString()
            if allowedPins.contains(pin) {
                return (.useCredential, URLCredential(trust: trust))
            }
        }

        return (.cancelAuthenticationChallenge, nil)
    }
}

