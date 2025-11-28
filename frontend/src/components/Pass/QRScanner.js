// QRScanner.js (fixed)
import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { passesAPI } from '../../services/api';
import './QRScanner.css';

const QRScanner = () => {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const scanner = new Html5QrcodeScanner('qr-reader', {
      qrbox: { width: 250, height: 250 },
      fps: 5
    });

    function onScanSuccess(decodedText) {
      if (!mounted) return;
      setScanning(false);
      // stop scanner and clear UI
      scanner.clear().catch(() => {/* ignore clear errors */});
      verifyScannedPass(decodedText);
    }

    function onScanError(err) {
      // handle scan error silently
      console.warn('QR Scan Error:', err);
    }

    scanner.render(onScanSuccess, onScanError);

    return () => {
      mounted = false;
      // ensure we clear scanner when component unmounts
      try {
        scanner.clear().catch(() => {/* ignore */});
      } catch (e) {
        // if scanner wasn't initialized, ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyScannedPass = async (qrData) => {
    try {
      setError(null);
      setResult(null);

      // qrData might be JSON or just a pass number
      let passNumber = null;
      try {
        const parsed = JSON.parse(qrData);
        passNumber = parsed?.passNumber || parsed?.pass?.passNumber || null;
      } catch {
        // not JSON, treat decoded text as pass number directly
        passNumber = qrData;
      }

      if (!passNumber) throw new Error('No pass number found in QR payload');

      const verification = await passesAPI.verify(passNumber);

      // Accept various server shapes
      if (verification?.valid || verification?.success) {
        setResult({
          success: true,
          pass: verification?.pass || verification
        });
      } else {
        const errMsg = verification?.error || verification?.message || 'Pass is invalid';
        setError(errMsg);
      }
    } catch (err) {
      setError(err?.message || 'Invalid QR code or pass');
      console.error('Verification error:', err);
    }
  };

  const resetScannerState = () => {
    setError(null);
    setResult(null);
    setScanning(true);
    // re-rendering scanner requires remounting #qr-reader element in the DOM; for simplicity
    // we reload the page fragment by navigating to this route again which will remount component.
    // Alternatively the parent could conditionally render <QRScanner key={Date.now()} />.
    window.location.reload();
  };

  const handleProceedToCheckIn = () => {
    if (result?.pass) {
      navigate('/checklogs/checkin', {
        state: { passNumber: result.pass.passNumber || result.pass.passNumber }
      });
    }
  };

  return (
    <div className="qr-scanner-container">
      <div className="scanner-card">
        <h2>Scan Visitor Pass QR Code</h2>

        {scanning && (
          <div>
            <div id="qr-reader"></div>
            <p className="scanner-instruction">Position the QR code within the frame to scan</p>
          </div>
        )}

        {result?.success && (
          <div className="scan-result success">
            <h3>✅ Pass Verified Successfully</h3>
            <div className="pass-info">
              <p><strong>Pass Number:</strong> {result.pass.passNumber}</p>
              <p><strong>Visitor:</strong> {result.pass.visitor?.name}</p>
              <p><strong>Company:</strong> {result.pass.visitor?.company || 'N/A'}</p>
              <p><strong>Valid Until:</strong> {result.pass.validUntil ? new Date(result.pass.validUntil).toLocaleString() : 'N/A'}</p>
            </div>
            <button onClick={handleProceedToCheckIn} className="btn-primary">
              Proceed to Check In
            </button>
          </div>
        )}

        {error && (
          <div className="scan-result error">
            <h3>❌ Verification Failed</h3>
            <p>{error}</p>
            <button onClick={resetScannerState} className="btn-secondary">
              Scan Again
            </button>
          </div>
        )}

        <button onClick={() => navigate('/checklogs')} className="btn-secondary mt-2">
          Back to Check Logs
        </button>
      </div>
    </div>
  );
};

export default QRScanner;
